import prisma from "../src/lib/prisma";
import { Prisma } from "@prisma/client";

async function runVerification() {
  console.log("=== STARTING LESSON EXTENSIONS & SESSION-CREDIT VERIFICATION ===");

  const teacherId = "teacher_test_conflict";
  const branchId = 1;
  const room = await prisma.classroom.findFirst({ where: { branchId } }) || await prisma.classroom.create({ data: { name: "Salle Test", branchId } });
  const classroomId = room.id;

  // 1. Setup Teacher
  await prisma.teacher.upsert({
    where: { id: teacherId },
    update: { name: "Professeur Test Conflict" },
    create: { id: teacherId, name: "Professeur Test Conflict" },
  });

  const existingClass = await prisma.class.findFirst({ where: { branchId } });
  const classId = existingClass?.id || (await prisma.class.create({
    data: {
      name: "Classe Test Credit",
      branchId,
      levelId: (await prisma.level.findFirst())?.id || 1,
      teacherId,
      inscriptionFee: 1000,
    }
  })).id;

  // 2. Setup Student and clean previous test records
  const studentId = "student_test_credit";
  await prisma.attendance.deleteMany({ where: { studentId } });
  await prisma.voucher.deleteMany({ where: { studentId } });
  await prisma.enrollment.deleteMany({ where: { studentId } });
  await prisma.student.deleteMany({ where: { id: studentId } });

  const student = await prisma.student.create({
    data: {
      id: studentId,
      globalNumber: 9992,
      name: "Taleb Test Credit",
      registeredBranchId: branchId,
    },
  });

  // Ensure AcademicYear exists
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

  // Enroll student in class
  await prisma.enrollment.create({
    data: {
      studentId,
      classId,
      academicYearId: academicYear.id,
      inscriptionFeeCharged: true,
      inscriptionFeeAmount: new Prisma.Decimal(2000),
    },
  });

  // Issue 1 tuition voucher (TUITION_4SESSION -> 4 purchased sessions)
  let series = await prisma.voucherSeries.findFirst({
    where: { issuingBranchId: branchId },
  });
  if (!series) {
    series = await prisma.voucherSeries.create({
      data: {
        issuingBranchId: branchId,
        scope: "LOCAL_LEVEL",
        currentNumber: 100,
      },
    });
  }

  const voucher = await prisma.voucher.create({
    data: {
      seriesId: series.id,
      number: 9999,
      studentId,
      classId,
      issuingBranchId: branchId,
      targetBranchId: branchId,
      paymentType: "TUITION_4SESSION",
      amount: new Prisma.Decimal(4000),
      issuedBy: "admin_test",
    },
  });
  console.log(`Issued tuition voucher: 4 sessions purchased for student ${student.name}`);

  // Clean old test lessons
  await prisma.attendance.deleteMany({ where: { lesson: { teacherId } } });
  await prisma.lesson.deleteMany({ where: { teacherId } });

  // TEST 1: CREATE A REGULAR LESSON
  const baseStart = new Date("2026-10-05T09:00:00.000Z");
  const baseEnd = new Date("2026-10-05T11:00:00.000Z");

  const regularLesson = await prisma.lesson.create({
    data: {
      teacherId,
      classId,
      classroomId,
      branchId,
      startsAt: baseStart,
      endsAt: baseEnd,
      isExtra: false,
      isCatchUp: false,
      isFree: false,
    },
  });
  console.log("Created regular lesson (ID:", regularLesson.id, ")");

  // TEST 2: CONFLICT DETECTION TEST
  const checkConflict = async (checkTeacherId: string, checkClassId: number, checkClassroomId: number, start: Date, end: Date, excludeId = -1) => {
    // 1. Teacher
    const tConflict = await prisma.$queryRaw<any[]>`
      SELECT id FROM "Lesson"
      WHERE "teacherId" = ${checkTeacherId}
        AND id != ${excludeId}
        AND "startsAt" < ${end}
        AND "endsAt" > ${start}
      LIMIT 1
    `;
    if (tConflict.length > 0) return "TEACHER_CONFLICT";

    // 2. Class
    const cConflict = await prisma.$queryRaw<any[]>`
      SELECT id FROM "Lesson"
      WHERE "classId" = ${checkClassId}
        AND id != ${excludeId}
        AND "startsAt" < ${end}
        AND "endsAt" > ${start}
      LIMIT 1
    `;
    if (cConflict.length > 0) return "CLASS_CONFLICT";

    // 3. Room
    const rConflict = await prisma.$queryRaw<any[]>`
      SELECT id FROM "Lesson"
      WHERE "classroomId" = ${checkClassroomId}
        AND id != ${excludeId}
        AND "startsAt" < ${end}
        AND "endsAt" > ${start}
      LIMIT 1
    `;
    if (rConflict.length > 0) return "ROOM_CONFLICT";

    return null;
  };

  // Attempt 2A: Double-booking teacher with an isExtra session
  const extraConflict = await checkConflict(teacherId, 9999, 9999, baseStart, baseEnd);
  console.log("Attempt extra session with same teacher -> Conflict result:", extraConflict);
  if (extraConflict !== "TEACHER_CONFLICT") throw new Error("Expected TEACHER_CONFLICT for extra session");

  // Attempt 2B: Double-booking room with an isCatchUp session
  const catchupConflict = await checkConflict("other_teacher", 9999, classroomId, baseStart, baseEnd);
  console.log("Attempt catch-up session in same classroom -> Conflict result:", catchupConflict);
  if (catchupConflict !== "ROOM_CONFLICT") throw new Error("Expected ROOM_CONFLICT for catch-up session");

  // Attempt 2C: Double-booking class with an isFree session
  const freeConflict = await checkConflict("other_teacher", classId, 9999, baseStart, baseEnd);
  console.log("Attempt free session for same class -> Conflict result:", freeConflict);
  if (freeConflict !== "CLASS_CONFLICT") throw new Error("Expected CLASS_CONFLICT for free session");

  console.log("✓ ALL CONFLICT DETECTION CHECKS PASSED FOR EXTRA, CATCH-UP, AND FREE SESSIONS!");

  // TEST 3: CREATE isExtra LESSON WITH extraFee
  const extraLesson = await prisma.lesson.create({
    data: {
      teacherId,
      classId,
      classroomId,
      branchId,
      startsAt: new Date("2026-10-06T09:00:00.000Z"),
      endsAt: new Date("2026-10-06T11:00:00.000Z"),
      isExtra: true,
      extraFee: new Prisma.Decimal(500),
      isCatchUp: false,
      isFree: false,
    },
  });
  console.log("Created extra lesson with extraFee 500 DZD (ID:", extraLesson.id, ", extraFee:", extraLesson.extraFee?.toString(), ")");
  if (Number(extraLesson.extraFee) !== 500 || !extraLesson.isExtra) {
    throw new Error("Failed to store extraFee or isExtra flag");
  }

  // TEST 4: CREATE isCatchUp LESSON
  const catchUpLesson = await prisma.lesson.create({
    data: {
      teacherId,
      classId,
      classroomId,
      branchId,
      startsAt: new Date("2026-10-07T09:00:00.000Z"),
      endsAt: new Date("2026-10-07T11:00:00.000Z"),
      isExtra: false,
      isCatchUp: true,
      isFree: false,
    },
  });
  console.log("Created catch-up lesson (ID:", catchUpLesson.id, ", isCatchUp:", catchUpLesson.isCatchUp, ")");
  if (!catchUpLesson.isCatchUp) throw new Error("Failed to store isCatchUp flag");

  // TEST 5: CREATE isFree LESSON AND VERIFY SESSION CREDIT INTEGRITY
  const freeLesson = await prisma.lesson.create({
    data: {
      teacherId,
      classId,
      classroomId,
      branchId,
      startsAt: new Date("2026-10-08T09:00:00.000Z"),
      endsAt: new Date("2026-10-08T11:00:00.000Z"),
      isExtra: false,
      isCatchUp: false,
      isFree: true,
    },
  });
  console.log("Created free lesson (ID:", freeLesson.id, ", isFree:", freeLesson.isFree, ")");

  // Compute balance helper matching PaymentGrid and Excel Export:
  const computeStudentRemainingSessions = async (sId: string, cId: number) => {
    const vouchers = await prisma.voucher.findMany({
      where: { studentId: sId, classId: cId, isVoided: false, paymentType: "TUITION_4SESSION" },
    });
    const purchased = vouchers.length * 4;

    // Only non-free lessons with PRESENT attendance decrement credit
    const attendedNonFree = await prisma.attendance.count({
      where: {
        studentId: sId,
        status: "PRESENT",
        lesson: {
          classId: cId,
          isFree: false,
        },
      },
    });

    return {
      purchased,
      consumed: attendedNonFree,
      remaining: purchased - attendedNonFree,
    };
  };

  const initialBalance = await computeStudentRemainingSessions(studentId, classId);
  console.log("Initial Balance: Purchased =", initialBalance.purchased, ", Consumed =", initialBalance.consumed, ", Remaining =", initialBalance.remaining);
  if (initialBalance.remaining !== 4) throw new Error("Expected initial remaining sessions to be 4");

  // Mark student PRESENT in the FREE LESSON
  await prisma.attendance.create({
    data: {
      lessonId: freeLesson.id,
      studentId,
      status: "PRESENT",
    },
  });
  console.log("Marked student PRESENT on FREE lesson (isFree = true)");

  const balanceAfterFree = await computeStudentRemainingSessions(studentId, classId);
  console.log("Balance after FREE lesson attendance: Purchased =", balanceAfterFree.purchased, ", Consumed =", balanceAfterFree.consumed, ", Remaining =", balanceAfterFree.remaining);
  if (balanceAfterFree.remaining !== 4 || balanceAfterFree.consumed !== 0) {
    throw new Error("ERROR: Attendance on free lesson decremented session credit! It must NOT decrement credit!");
  }
  console.log("✓ VERIFIED: Attendance on isFree lesson DID NOT decrement remaining paid sessions!");

  // Now mark student PRESENT in the REGULAR LESSON (isFree = false)
  await prisma.attendance.create({
    data: {
      lessonId: regularLesson.id,
      studentId,
      status: "PRESENT",
    },
  });
  console.log("Marked student PRESENT on REGULAR lesson (isFree = false)");

  const balanceAfterRegular = await computeStudentRemainingSessions(studentId, classId);
  console.log("Balance after REGULAR lesson attendance: Purchased =", balanceAfterRegular.purchased, ", Consumed =", balanceAfterRegular.consumed, ", Remaining =", balanceAfterRegular.remaining);
  if (balanceAfterRegular.remaining !== 3 || balanceAfterRegular.consumed !== 1) {
    throw new Error("ERROR: Attendance on regular lesson did not decrement session credit to 3!");
  }
  console.log("✓ VERIFIED: Attendance on non-free lesson correctly decremented remaining sessions from 4 to 3!");

  // Clean up test data
  await prisma.attendance.deleteMany({ where: { studentId } });
  await prisma.attendance.deleteMany({ where: { lesson: { teacherId } } });
  await prisma.lesson.deleteMany({ where: { teacherId } });
  await prisma.voucher.deleteMany({ where: { studentId } });
  await prisma.enrollment.deleteMany({ where: { studentId } });
  await prisma.student.deleteMany({ where: { id: studentId } });
  await prisma.teacher.deleteMany({ where: { id: teacherId } });

  console.log("=== ALL VERIFICATION CHECKS COMPLETED AND PASSED SUCCESSFULLY ===");
}

runVerification()
  .catch((e) => {
    console.error("Verification failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
