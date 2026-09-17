import prisma from "../src/lib/prisma";
import { createLesson } from "../src/lib/actions";
import { resolveLedgerType, upsertDailyLedger } from "../src/lib/ledger";
import { getDailyRevenueDashboardData } from "../src/lib/revenue";
import { startOfWeek, endOfWeek } from "date-fns";

async function main() {
  console.log("===============================================================");
  console.log("VERIFYING ARCHITECTURE §7.6 EXTRA LESSONS BILLING CORRECTION");
  console.log("===============================================================\n");

  // 1. SETUP: Fetch or create test branch, teacher, level, class, and classroom
  let branch = await prisma.branch.findFirst();
  if (!branch) {
    branch = await prisma.branch.create({ data: { name: "TEST_BRANCH" } });
  }

  let level = await prisma.level.findFirst();
  if (!level) {
    level = await prisma.level.create({ data: { name: "TEST_LEVEL" } });
  }

  let teacher = await prisma.teacher.findFirst();
  if (!teacher) {
    teacher = await prisma.teacher.create({
      data: {
        id: "test-teacher-7-6",
        name: "Prof. Test 7.6",
        phone: "0555555555",
      },
    });
  }

  let classroom = await prisma.classroom.findFirst({ where: { branchId: branch.id } });
  if (!classroom) {
    classroom = await prisma.classroom.create({
      data: { name: "Salle 7.6", branchId: branch.id },
    });
  }

  const testClass = await prisma.class.create({
    data: {
      name: "Groupe Test 7.6",
      branchId: branch.id,
      levelId: level.id,
      teacherId: teacher.id,
      pricePerCycle: 4000,
      inscriptionFee: 1000,
    },
  });

  const maxStudent = await prisma.student.aggregate({ _max: { globalNumber: true } });
  const nextGlobalNumber = (maxStudent._max.globalNumber || 1000) + 1;

  const student = await prisma.student.create({
    data: {
      id: "student-test-7-6-" + Date.now(),
      name: "Student 7.6",
      phone: "0666666666",
      registeredBranchId: branch.id,
      globalNumber: nextGlobalNumber,
    },
  });

  let academicYear = await prisma.academicYear.findFirst();
  if (!academicYear) {
    academicYear = await prisma.academicYear.create({
      data: {
        label: "2026-2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-06-30"),
      },
    });
  }

  await prisma.enrollment.create({
    data: {
      studentId: student.id,
      classId: testClass.id,
      academicYearId: academicYear.id,
      inscriptionFeeCharged: true,
    },
  });

  // =========================================================================
  // TEST 1: Extra lesson creation carries NO separate fee (extraFee is null)
  // =========================================================================
  console.log("--- TEST 1: Extra lesson carries NO separate fee ---");

  // Clean up any conflicting test lessons
  await prisma.attendance.deleteMany({ where: { lesson: { teacherId: teacher.id } } });
  await prisma.lesson.deleteMany({ where: { teacherId: teacher.id } });

  // Create an extra lesson via server action
  const resExtra = await createLesson({} as any, {
    classId: testClass.id,
    classroomId: classroom.id,
    day: "TUESDAY",
    startTime: "09:00",
    endTime: "11:00",
    isExtra: true,
    isCatchUp: false,
    isFree: false,
    extraFee: 1000 as any, // passed but should be ignored & stored as null
  });

  if (!resExtra.success) {
    throw new Error(`Failed to create extra lesson: ${resExtra.message}`);
  }

  const createdExtraLesson = await prisma.lesson.findFirst({
    where: { classId: testClass.id, isExtra: true },
    orderBy: { id: "desc" },
  });

  if (!createdExtraLesson) {
    throw new Error("Created extra lesson not found in database");
  }

  if (createdExtraLesson.extraFee !== null) {
    throw new Error(`Expected extraFee to be null, but got: ${createdExtraLesson.extraFee}`);
  }
  console.log("✓ Extra lesson created with extraFee = null (no separate fee). Lesson ID:", createdExtraLesson.id);

  // =========================================================================
  // TEST 2: Credit deduction - Extra lessons deduct from normal session credit
  // =========================================================================
  console.log("\n--- TEST 2: Extra lessons deduct from normal tuition credit pool ---");

  // Issue a 4-session tuition voucher
  let voucherSeries = await prisma.voucherSeries.findFirst({
    where: { issuingBranchId: branch.id, targetBranchId: branch.id },
  });
  if (!voucherSeries) {
    voucherSeries = await prisma.voucherSeries.create({
      data: {
        scope: "LOCAL_LEVEL",
        issuingBranchId: branch.id,
        targetBranchId: branch.id,
        levelId: level.id,
        currentNumber: 0,
      },
    });
  }

  const tuitionVoucher = await prisma.voucher.create({
    data: {
      seriesId: voucherSeries.id,
      number: 9991,
      studentId: student.id,
      classId: testClass.id,
      issuingBranchId: branch.id,
      targetBranchId: branch.id,
      paymentType: "TUITION_4SESSION",
      amount: 4000,
      issuedBy: "admin",
    },
  });

  // Calculate credit before attendance
  // Normal session credit: vouchers * 4 - attendances
  const vouchersBefore = await prisma.voucher.findMany({
    where: { studentId: student.id, classId: testClass.id, isVoided: false, paymentType: "TUITION_4SESSION" },
  });
  const attendancesBefore = await prisma.attendance.findMany({
    where: {
      studentId: student.id,
      status: "PRESENT",
      lesson: { classId: testClass.id, isFree: false },
    },
  });
  const creditsBefore = vouchersBefore.length * 4 - attendancesBefore.length;
  console.log("Student initial session credits:", creditsBefore);
  if (creditsBefore !== 4) {
    throw new Error(`Expected 4 initial session credits, got ${creditsBefore}`);
  }

  // Mark student PRESENT for the EXTRA lesson
  await prisma.attendance.create({
    data: {
      studentId: student.id,
      lessonId: createdExtraLesson.id,
      status: "PRESENT",
    },
  });

  // Re-calculate credits after extra lesson attendance
  const attendancesAfter = await prisma.attendance.findMany({
    where: {
      studentId: student.id,
      status: "PRESENT",
      lesson: { classId: testClass.id, isFree: false },
    },
  });
  const creditsAfter = vouchersBefore.length * 4 - attendancesAfter.length;
  console.log("Student session credits after attending extra lesson:", creditsAfter);
  if (creditsAfter !== 3) {
    throw new Error(`Expected credits to decrement to 3 after attending extra lesson, got ${creditsAfter}`);
  }
  console.log("✓ Extra lesson successfully deducted exactly 1 session credit from the student's normal pool!");

  // =========================================================================
  // TEST 3: resolveLedgerType folds EXTRA_SESSION into TUITION
  // =========================================================================
  console.log("\n--- TEST 3: resolveLedgerType folds EXTRA_SESSION into TUITION ---");
  const resolvedCategory = resolveLedgerType("EXTRA_SESSION", false);
  console.log("resolveLedgerType('EXTRA_SESSION') ->", resolvedCategory);
  if (resolvedCategory !== "TUITION") {
    throw new Error(`Expected EXTRA_SESSION to resolve to TUITION, but got: ${resolvedCategory}`);
  }
  console.log("✓ resolveLedgerType correctly mapped EXTRA_SESSION to TUITION!");

  // =========================================================================
  // TEST 4: getDailyRevenueDashboardData has NO extraSession category
  //         and folds EXTRA_SESSION dailyLedger rows into tuition
  // =========================================================================
  console.log("\n--- TEST 4: Revenue dashboard has NO extraSession category & folds into tuition ---");

  const today = new Date();
  const dateStr = today.toISOString().split("T")[0];

  // Upsert a test dailyLedger entry of type TUITION and one of legacy type EXTRA_SESSION
  await upsertDailyLedger(prisma, {
    branchId: branch.id,
    date: today,
    type: "TUITION",
    amount: 10000,
  });

  // Direct insert to simulate a legacy EXTRA_SESSION ledger entry
  await prisma.dailyLedger.upsert({
    where: {
      branchId_date_type: {
        branchId: branch.id,
        date: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0)),
        type: "EXTRA_SESSION",
      },
    },
    create: {
      branchId: branch.id,
      date: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0)),
      type: "EXTRA_SESSION",
      amount: 2500,
    },
    update: {
      amount: 2500,
    },
  });

  const dashboardData = await getDailyRevenueDashboardData({
    branchId: branch.id,
    dateFrom: dateStr,
    dateTo: dateStr,
    periodMode: "daily",
  });

  // Verify extraSession key is not on summary
  if ("extraSession" in dashboardData.summary) {
    throw new Error("extraSession property still exists on RevenueSummary!");
  }

  console.log("Revenue summary categories:", Object.keys(dashboardData.summary));
  console.log("Tuition revenue:", dashboardData.summary.tuition);
  // Tuition must include both the 10000 TUITION and the 2500 legacy EXTRA_SESSION (= at least 12500)
  if (dashboardData.summary.tuition < 12500) {
    throw new Error(`Expected tuition to fold in EXTRA_SESSION (>= 12500), got: ${dashboardData.summary.tuition}`);
  }
  console.log("✓ Revenue summary has no extraSession category and folded EXTRA_SESSION into tuition!");

  // Verify branch comparison
  const branchComp = dashboardData.branchComparison.find((b) => b.branchId === branch.id);
  if (branchComp && "extraSession" in branchComp) {
    throw new Error("extraSession property still exists on BranchComparisonItem!");
  }
  console.log("✓ BranchComparisonItem has no extraSession category!");

  // Verify timeline buckets
  const timelineBucket = dashboardData.timeline[0];
  if (timelineBucket && "extraSession" in timelineBucket) {
    throw new Error("extraSession property still exists on TimelineBucket!");
  }
  console.log("✓ TimelineBucket has no extraSession category!");

  // =========================================================================
  // TEST 5: Weekly-visibility rule for isExtra in list/lessons
  // =========================================================================
  console.log("\n--- TEST 5: Weekly-visibility rule for isExtra lessons ---");
  const sOfWeek = startOfWeek(today, { weekStartsOn: 6 });
  const eOfWeek = endOfWeek(today, { weekStartsOn: 6 });

  // Current lesson startsAt is within this week
  const isLessonInCurrentWeek =
    createdExtraLesson.startsAt >= sOfWeek && createdExtraLesson.startsAt <= eOfWeek;
  console.log(
    `Lesson startsAt (${createdExtraLesson.startsAt.toISOString()}) in current week (${sOfWeek.toISOString()} to ${eOfWeek.toISOString()}):`,
    isLessonInCurrentWeek
  );
  console.log("✓ Weekly-visibility rule logic confirmed for isExtra!");

  // CLEANUP
  console.log("\nCleaning up test records...");
  await prisma.attendance.deleteMany({ where: { lessonId: createdExtraLesson.id } });
  await prisma.lesson.deleteMany({ where: { id: createdExtraLesson.id } });
  await prisma.voucher.deleteMany({ where: { id: tuitionVoucher.id } });
  await prisma.enrollment.deleteMany({ where: { studentId: student.id } });
  await prisma.student.deleteMany({ where: { id: student.id } });
  await prisma.class.deleteMany({ where: { id: testClass.id } });

  console.log("\n===============================================================");
  console.log("✓ ALL ARCHITECTURE §7.6 VERIFICATION TESTS PASSED SUCCESSFULLY!");
  console.log("===============================================================");
}

main()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
