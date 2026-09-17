import "dotenv/config";
import prisma from "../src/lib/prisma";
import { Prisma } from "@prisma/client";
import { transferEnrollmentCredit } from "../src/lib/actions";

async function verifyStudentProfile() {
  console.log("=== STARTING STUDENT PROFILE CROSS-BRANCH & SORTING VERIFICATION ===");

  const studentId = "test_student_cb_99";
  const globalNumber = 9988;

  // 1. Ensure Branches 1, 2, and 3 exist
  const b1 = await prisma.branch.upsert({
    where: { id: 1 },
    update: { name: "ECOLE" },
    create: { id: 1, name: "ECOLE", address: "Centre" },
  });
  const b2 = await prisma.branch.upsert({
    where: { id: 2 },
    update: { name: "ANNEX" },
    create: { id: 2, name: "ANNEX", address: "Annex" },
  });
  const b3 = await prisma.branch.upsert({
    where: { id: 3 },
    update: { name: "AMPHI" },
    create: { id: 3, name: "AMPHI", address: "Amphi" },
  });
  console.log(`✓ Branches verified: ${b1.name}, ${b2.name}, ${b3.name}`);

  // 2. Ensure AcademicYear exists
  const academicYear = await prisma.academicYear.upsert({
    where: { id: 991 },
    update: {},
    create: {
      id: 991,
      label: "2026-2027",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2027-06-30T23:59:59.999Z"),
    },
  });

  // 3. Ensure Teacher and Level exist
  const teacher = await prisma.teacher.upsert({
    where: { id: "test_teacher_sp_01" },
    update: {},
    create: { id: "test_teacher_sp_01", name: "أ. عبد القادر مسعودي" },
  });
  const level = await prisma.level.upsert({
    where: { name: "BAC-TEST-SP" },
    update: {},
    create: { name: "BAC-TEST-SP" },
  });

  // 4. Create 3 Classes across 3 Branches
  const class1 = await prisma.class.upsert({
    where: { id: 88101 },
    update: { branchId: 1, name: "فيزياء BAC (ECOLE)", teacherId: teacher.id, levelId: level.id },
    create: {
      id: 88101,
      branchId: 1,
      name: "فيزياء BAC (ECOLE)",
      teacherId: teacher.id,
      levelId: level.id,
      inscriptionFee: new Prisma.Decimal(1000),
      pricePerCycle: new Prisma.Decimal(2400),
    },
  });

  const class2 = await prisma.class.upsert({
    where: { id: 88102 },
    update: { branchId: 2, name: "رياضيات BAC (ANNEX)", teacherId: teacher.id, levelId: level.id },
    create: {
      id: 88102,
      branchId: 2,
      name: "رياضيات BAC (ANNEX)",
      teacherId: teacher.id,
      levelId: level.id,
      inscriptionFee: new Prisma.Decimal(1000),
      pricePerCycle: new Prisma.Decimal(2400),
    },
  });

  const class3 = await prisma.class.upsert({
    where: { id: 88103 },
    update: { branchId: 3, name: "علوم BAC (AMPHI)", teacherId: teacher.id, levelId: level.id },
    create: {
      id: 88103,
      branchId: 3,
      name: "علوم BAC (AMPHI)",
      teacherId: teacher.id,
      levelId: level.id,
      inscriptionFee: new Prisma.Decimal(1000),
      pricePerCycle: new Prisma.Decimal(2400),
    },
  });
  console.log(`✓ Classes created across 3 branches: ${class1.name}, ${class2.name}, ${class3.name}`);

  // 5. Clean up old student data if any
  await prisma.attendance.deleteMany({ where: { studentId } });
  await prisma.voucher.deleteMany({ where: { studentId } });
  await prisma.enrollmentTransfer.deleteMany({
    where: {
      OR: [
        { fromEnrollment: { studentId } },
        { toEnrollment: { studentId } },
      ],
    },
  });
  await prisma.enrollment.deleteMany({ where: { studentId } });
  await prisma.student.deleteMany({ where: { id: studentId } });

  // 6. Create Student registered at Branch 1 (ECOLE)
  const student = await prisma.student.create({
    data: {
      id: studentId,
      globalNumber: globalNumber,
      name: "ياسين بن علي",
      phone: "0551234567",
      registeredBranchId: 1, // Home branch = ECOLE (§1.0)
    },
  });
  console.log(`✓ Student created: ${student.name}, #Global: ${student.globalNumber}, Home: Branch ${student.registeredBranchId}`);

  // 7. Enroll Student in all 3 classes across all 3 branches (§1.0 cross-branch enrollment)
  const enr1 = await prisma.enrollment.create({
    data: {
      studentId,
      classId: class1.id,
      academicYearId: academicYear.id,
      inscriptionFeeCharged: true,
      feeOverriddenByOwner: false,
    },
  });
  const enr2 = await prisma.enrollment.create({
    data: {
      studentId,
      classId: class2.id,
      academicYearId: academicYear.id,
      inscriptionFeeCharged: true,
      feeOverriddenByOwner: false,
    },
  });
  const enr3 = await prisma.enrollment.create({
    data: {
      studentId,
      classId: class3.id,
      academicYearId: academicYear.id,
      inscriptionFeeCharged: true,
      feeOverriddenByOwner: false,
    },
  });
  console.log(`✓ Enrolled student in 3 branches: Enrollment IDs: ${enr1.id}, ${enr2.id}, ${enr3.id}`);

  // 8. Ensure Voucher Series exist
  const series1 = await prisma.voucherSeries.upsert({
    where: { id: 7701 },
    update: {},
    create: {
      id: 7701,
      issuingBranchId: 1,
      scope: "LOCAL_LEVEL",
      levelId: level.id,
      currentNumber: 10,
    },
  });

  // Issue Vouchers:
  // Class 1 (ECOLE): 1 cycle voucher (4 sessions) + 3 attendances => 1 remaining session!
  await prisma.voucher.create({
    data: {
      seriesId: series1.id,
      number: 101,
      studentId,
      classId: class1.id,
      issuingBranchId: 1,
      targetBranchId: 1,
      paymentType: "TUITION_4SESSION",
      amount: new Prisma.Decimal(2400),
      issuedBy: "admin",
    },
  });

  // Class 2 (ANNEX): 1 cycle voucher (4 sessions) + 1 attendance => 3 remaining sessions!
  await prisma.voucher.create({
    data: {
      seriesId: series1.id,
      number: 102,
      studentId,
      classId: class2.id,
      issuingBranchId: 1,
      targetBranchId: 2,
      paymentType: "TUITION_4SESSION",
      amount: new Prisma.Decimal(2400),
      issuedBy: "admin",
    },
  });

  // Class 3 (AMPHI): 0 vouchers => 0 remaining sessions (UNPAID)

  // 9. Schedule Lessons & Attendances
  const classroom1 = await prisma.classroom.upsert({
    where: { id: 6601 },
    update: {},
    create: { id: 6601, name: "قاعة 1 (ECOLE)", branchId: 1 },
  });
  const classroom2 = await prisma.classroom.upsert({
    where: { id: 6602 },
    update: {},
    create: { id: 6602, name: "قاعة 2 (ANNEX)", branchId: 2 },
  });
  const classroom3 = await prisma.classroom.upsert({
    where: { id: 6603 },
    update: {},
    create: { id: 6603, name: "قاعة 3 (AMPHI)", branchId: 3 },
  });

  // Past lessons for attendance consumption
  const pastDate1 = new Date("2026-09-01T10:00:00.000Z");
  const pastDate2 = new Date("2026-09-03T10:00:00.000Z");
  const pastDate3 = new Date("2026-09-05T10:00:00.000Z");

  const lPast1 = await prisma.lesson.create({
    data: {
      classId: class1.id,
      teacherId: teacher.id,
      classroomId: classroom1.id,
      branchId: 1,
      startsAt: pastDate1,
      endsAt: new Date("2026-09-01T12:00:00.000Z"),
    },
  });
  const lPast2 = await prisma.lesson.create({
    data: {
      classId: class1.id,
      teacherId: teacher.id,
      classroomId: classroom1.id,
      branchId: 1,
      startsAt: pastDate2,
      endsAt: new Date("2026-09-03T12:00:00.000Z"),
    },
  });
  const lPast3 = await prisma.lesson.create({
    data: {
      classId: class1.id,
      teacherId: teacher.id,
      classroomId: classroom1.id,
      branchId: 1,
      startsAt: pastDate3,
      endsAt: new Date("2026-09-05T12:00:00.000Z"),
    },
  });
  const lPast4 = await prisma.lesson.create({
    data: {
      classId: class2.id,
      teacherId: teacher.id,
      classroomId: classroom2.id,
      branchId: 2,
      startsAt: pastDate1,
      endsAt: new Date("2026-09-01T12:00:00.000Z"),
    },
  });

  // Record attendances (3 for class1, 1 for class2)
  await prisma.attendance.createMany({
    data: [
      { studentId, lessonId: lPast1.id, status: "PRESENT" },
      { studentId, lessonId: lPast2.id, status: "PRESENT" },
      { studentId, lessonId: lPast3.id, status: "PRESENT" },
      { studentId, lessonId: lPast4.id, status: "PRESENT" },
    ],
  });
  console.log("✓ Recorded past lessons and attendances.");

  // Future lessons across all branches (startsAt >= now)
  const future1 = new Date(Date.now() + 86400000); // tomorrow
  const future2 = new Date(Date.now() + 172800000); // 2 days
  const future3 = new Date(Date.now() + 259200000); // 3 days

  const lFut1 = await prisma.lesson.create({
    data: {
      classId: class1.id,
      teacherId: teacher.id,
      classroomId: classroom1.id,
      branchId: 1,
      startsAt: future1,
      endsAt: new Date(future1.getTime() + 7200000),
    },
  });
  const lFut2 = await prisma.lesson.create({
    data: {
      classId: class2.id,
      teacherId: teacher.id,
      classroomId: classroom2.id,
      branchId: 2,
      startsAt: future2,
      endsAt: new Date(future2.getTime() + 7200000),
      isExtra: true,
      extraFee: new Prisma.Decimal(500),
    },
  });
  const lFut3 = await prisma.lesson.create({
    data: {
      classId: class3.id,
      teacherId: teacher.id,
      classroomId: classroom3.id,
      branchId: 3,
      startsAt: future3,
      endsAt: new Date(future3.getTime() + 7200000),
      isFree: true,
    },
  });
  console.log("✓ Created future lessons across all 3 branches (ECOLE, ANNEX, AMPHI).");

  // 10. VERIFY QUERY & REMAINING SESSIONS COMPUTATION
  const fetchedStudent = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      registeredBranch: true,
      enrollments: {
        include: {
          class: { include: { branch: true, level: true, teacher: true } },
          transfersFrom: true,
          transfersTo: true,
        },
      },
      vouchers: true,
      attendances: {
        include: { lesson: true },
      },
    },
  });

  if (!fetchedStudent) throw new Error("Student not found!");

  // Compute metrics per group
  const groupMetrics = fetchedStudent.enrollments.map((enr) => {
    const c = enr.class;
    const vouchers = fetchedStudent.vouchers.filter(
      (v) => !v.isVoided && v.classId === c.id && v.paymentType === "TUITION_4SESSION"
    );
    const purchased = vouchers.length * 4;
    const transferredOut = enr.transfersFrom.reduce((s, t) => s + t.transferredSessions, 0);
    const transferredIn = enr.transfersTo.reduce((s, t) => s + t.transferredSessions, 0);
    const attended = fetchedStudent.attendances.filter(
      (a) => a.status === "PRESENT" && a.lesson.classId === c.id && !a.lesson.isFree
    ).length;
    const netSessions = (purchased + transferredIn - transferredOut) - attended;

    return {
      classId: c.id,
      className: c.name,
      branchId: c.branchId,
      branchName: c.branch.name,
      netSessions,
    };
  });

  console.log("\n--- Calculated Group Metrics ---");
  groupMetrics.forEach((g) => {
    console.log(`Group: ${g.className} (${g.branchName}) => Remaining Sessions: ${g.netSessions}`);
  });

  const mClass1 = groupMetrics.find((g) => g.classId === class1.id);
  const mClass2 = groupMetrics.find((g) => g.classId === class2.id);
  const mClass3 = groupMetrics.find((g) => g.classId === class3.id);

  if (mClass1?.netSessions !== 1) {
    throw new Error(`Expected Class 1 to have 1 session left, got ${mClass1?.netSessions}`);
  }
  if (mClass2?.netSessions !== 3) {
    throw new Error(`Expected Class 2 to have 3 sessions left, got ${mClass2?.netSessions}`);
  }
  if (mClass3?.netSessions !== 0) {
    throw new Error(`Expected Class 3 to have 0 sessions left, got ${mClass3?.netSessions}`);
  }
  console.log("✓ Session balances match expectations: Class 1 = 1 session, Class 2 = 3 sessions, Class 3 = 0 sessions.");

  // 11. VERIFY SORTING RULE (Rule 4): Groups with 1 session left appear FIRST!
  const sorted = [...groupMetrics].sort((a, b) => {
    const aIsOne = a.netSessions === 1;
    const bIsOne = b.netSessions === 1;
    if (aIsOne && !bIsOne) return -1;
    if (!aIsOne && bIsOne) return 1;
    if (a.netSessions <= 0 && b.netSessions > 1) return -1;
    if (a.netSessions > 1 && b.netSessions <= 0) return 1;
    return a.className.localeCompare(b.className);
  });

  console.log("\n--- Sorted Order (1 Session Left Rule) ---");
  sorted.forEach((g, idx) => {
    console.log(`Position ${idx + 1}: ${g.className} (${g.netSessions} sessions left)`);
  });

  if (sorted[0].classId !== class1.id) {
    throw new Error(`Expected Class 1 (1 session left) to be sorted FIRST, but got ${sorted[0].className}`);
  }
  console.log("✓ Rule 4 Verified: Class 1 (1 session left) is sorted FIRST at the top!");

  // 12. VERIFY UPCOMING LESSONS ACROSS ALL 3 BRANCHES (Rule 2)
  const classIds = fetchedStudent.enrollments.map((e) => e.classId);
  const upcomingLessons = await prisma.lesson.findMany({
    where: {
      classId: { in: classIds },
      startsAt: { gte: new Date() },
    },
    include: { class: true, branch: true, classroom: true, teacher: true },
    orderBy: { startsAt: "asc" },
  });

  console.log(`\n--- Upcoming Lessons across WHOLE school (${upcomingLessons.length} found) ---`);
  const upcomingBranches = new Set(upcomingLessons.map((l) => l.branch.name));
  upcomingLessons.forEach((l) => {
    console.log(`- ${l.class.name} at ${l.branch.name} (${l.classroom.name}) on ${l.startsAt.toISOString()}`);
  });

  if (!upcomingBranches.has("ECOLE") || !upcomingBranches.has("ANNEX") || !upcomingBranches.has("AMPHI")) {
    throw new Error(`Expected upcoming lessons across all 3 branches, got: ${Array.from(upcomingBranches).join(", ")}`);
  }
  console.log("✓ Rule 2 Verified: Upcoming lessons span all 3 branches (ECOLE, ANNEX, AMPHI)!");

  // 13. TEST GROUP CREDIT TRANSFER (§2.6)
  console.log("\n--- Testing Group Credit Transfer (§2.6) ---");
  // Transfer 1 session from Class 2 (ANNEX) to Class 3 (AMPHI)
  const transferRes = await transferEnrollmentCredit(
    { success: false, error: false },
    {
      fromEnrollmentId: enr2.id,
      toClassId: class3.id,
      studentId: studentId,
      transferredSessions: 1,
      notes: "Testing transfer from ANNEX to AMPHI",
    }
  );

  if (!transferRes.success) {
    throw new Error(`Credit transfer failed: ${transferRes.message}`);
  }
  console.log(`✓ Credit transfer successful: ${transferRes.message}`);

  // Re-verify balances after transfer
  const updatedStudent = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      enrollments: {
        include: {
          class: true,
          transfersFrom: true,
          transfersTo: true,
        },
      },
      vouchers: true,
      attendances: { include: { lesson: true } },
    },
  });

  const updatedEnr2 = updatedStudent?.enrollments.find((e) => e.classId === class2.id);
  const updatedEnr3 = updatedStudent?.enrollments.find((e) => e.classId === class3.id);

  const transferredOut2 = updatedEnr2?.transfersFrom.reduce((s, t) => s + t.transferredSessions, 0) || 0;
  const transferredIn3 = updatedEnr3?.transfersTo.reduce((s, t) => s + t.transferredSessions, 0) || 0;

  console.log(`Post-transfer: Class 2 transferred out = ${transferredOut2}, Class 3 transferred in = ${transferredIn3}`);
  if (transferredOut2 !== 1 || transferredIn3 !== 1) {
    throw new Error("Transferred sessions counts do not match 1!");
  }
  console.log("✓ Group credit transfer properly recorded in EnrollmentTransfer and updated balances.");

  console.log("\n🎉 ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!");
}

verifyStudentProfile()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
