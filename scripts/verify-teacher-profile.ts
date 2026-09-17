import "dotenv/config";
import prisma from "../src/lib/prisma";
import { calculateTeacherPayroll } from "../src/lib/payroll";
import { Prisma } from "@prisma/client";

async function verify() {
  console.log("=== STARTING TEACHER PROFILE & §2.9 PAYROLL VERIFICATION ===");

  const teacherId = "test_teacher_prof_01";
  const teacherName = "Pr. Ahmed Mansouri";
  const branchId = 1; // ECOLE

  // 1. Ensure Teacher exists
  const teacher = await prisma.teacher.upsert({
    where: { id: teacherId },
    update: { name: teacherName, photocopyRatePerPage: new Prisma.Decimal(5) },
    create: { id: teacherId, name: teacherName, photocopyRatePerPage: new Prisma.Decimal(5) },
  });
  console.log(`✓ Teacher verified: ${teacher.name} (${teacher.id})`);

  // Ensure TeacherBranch link
  await prisma.teacherBranch.upsert({
    where: { teacherId_branchId: { teacherId, branchId } },
    update: { payRate: null }, // no flat override, so percentage applies
    create: { teacherId, branchId, payRate: null },
  });

  // 2. Set initial percentage to 40% (TeacherPayRate.percentageOfSessionFee)
  const periodStart = new Date("2026-09-01T00:00:00.000Z");
  const periodEnd = new Date("2026-09-30T23:59:59.999Z");

  await prisma.teacherPayRate.deleteMany({ where: { teacherId } });
  await prisma.teacherPayRate.create({
    data: {
      teacherId,
      percentageOfSessionFee: new Prisma.Decimal(40), // 40%
      effectiveFrom: periodStart,
    },
  });
  console.log("✓ Initial pay rate created: 40% of session fee");

  // 3. Ensure a Level exists
  const level = await prisma.level.upsert({
    where: { name: "BAC-MATH" },
    update: {},
    create: { name: "BAC-MATH" },
  });

  // 4. Create a Class with pricePerCycle = 2000 DZD (500 DZD / session)
  const testClass = await prisma.class.upsert({
    where: { id: 99881 },
    update: {
      name: "Math BAC - Groupe 1",
      branchId,
      teacherId,
      levelId: level.id,
      pricePerCycle: new Prisma.Decimal(2000), // 2000 / 4 = 500 DZD per student session
      inscriptionFee: new Prisma.Decimal(1000),
    },
    create: {
      id: 99881,
      name: "Math BAC - Groupe 1",
      branchId,
      teacherId,
      levelId: level.id,
      pricePerCycle: new Prisma.Decimal(2000),
      inscriptionFee: new Prisma.Decimal(1000),
    },
  });
  console.log(`✓ Class created: ${testClass.name}, pricePerCycle = 2,000 DZD (session fee = 500 DZD)`);

  // 5. Create 3 test students
  const student1 = await prisma.student.upsert({
    where: { id: "std_test_p1" },
    update: {},
    create: { id: "std_test_p1", globalNumber: 8881, name: "Student 1", registeredBranchId: branchId },
  });
  const student2 = await prisma.student.upsert({
    where: { id: "std_test_p2" },
    update: {},
    create: { id: "std_test_p2", globalNumber: 8882, name: "Student 2", registeredBranchId: branchId },
  });
  const student3 = await prisma.student.upsert({
    where: { id: "std_test_p3" },
    update: {},
    create: { id: "std_test_p3", globalNumber: 8883, name: "Student 3", registeredBranchId: branchId },
  });

  // Ensure classroom
  const classroom = await prisma.classroom.findFirst({ where: { branchId } }) ||
    await prisma.classroom.create({ data: { name: "Salle Test", branchId } });

  // Clean old test lessons for this teacher
  const existingLessons = await prisma.lesson.findMany({
    where: { teacherId, startsAt: { gte: periodStart, lte: periodEnd } },
  });
  for (const l of existingLessons) {
    await prisma.attendance.deleteMany({ where: { lessonId: l.id } });
    await prisma.lesson.delete({ where: { id: l.id } });
  }

  // 6. Create Lesson 1: Normal lesson
  // Attendance: Student 1 & 2 PRESENT, Student 3 ABSENT
  // Expected per-student fee: 500 DZD
  // Teacher 40% cut = 200 DZD per present student
  // Lesson 1 earning: 2 * 200 = 400 DZD (Student 3 absent is NOT paid!)
  const l1 = await prisma.lesson.create({
    data: {
      teacherId,
      branchId,
      classId: testClass.id,
      classroomId: classroom.id,
      startsAt: new Date("2026-09-08T10:00:00.000Z"),
      endsAt: new Date("2026-09-08T12:00:00.000Z"),
      isFree: false,
    },
  });
  await prisma.attendance.createMany({
    data: [
      { lessonId: l1.id, studentId: student1.id, status: "PRESENT" },
      { lessonId: l1.id, studentId: student2.id, status: "PRESENT" },
      { lessonId: l1.id, studentId: student3.id, status: "ABSENT" },
    ],
  });

  // 7. Create Lesson 2: Free lesson (§2.2 - teacher still paid for worked sessions!)
  // Attendance: Student 1 PRESENT
  // Lesson 2 earning: 1 * 200 = 200 DZD
  const l2 = await prisma.lesson.create({
    data: {
      teacherId,
      branchId,
      classId: testClass.id,
      classroomId: classroom.id,
      startsAt: new Date("2026-09-10T10:00:00.000Z"),
      endsAt: new Date("2026-09-10T12:00:00.000Z"),
      isFree: true,
    },
  });
  await prisma.attendance.createMany({
    data: [
      { lessonId: l2.id, studentId: student1.id, status: "PRESENT" },
    ],
  });

  // 8. Create PhotocopyCharge with classId and branchId
  await prisma.photocopyCharge.deleteMany({ where: { teacherId } });
  const photocopy = await prisma.photocopyCharge.create({
    data: {
      teacherId,
      branchId,
      classId: testClass.id, // Linked to group!
      pages: 20,
      costAmount: new Prisma.Decimal(100), // 20 * 5 DZD = 100 DZD
      date: new Date("2026-09-09T14:00:00.000Z"),
      recordedBy: "admin_test",
    },
  });
  console.log(`✓ PhotocopyCharge created with classId=${photocopy.classId}, pages=${photocopy.pages}, cost=${photocopy.costAmount} DZD`);

  // 9. Create SalaryAdvance
  await prisma.salaryAdvance.deleteMany({ where: { personId: teacherId } });
  await prisma.salaryAdvance.create({
    data: {
      personId: teacherId,
      amount: new Prisma.Decimal(150),
      date: new Date("2026-09-05T12:00:00.000Z"),
    },
  });
  console.log("✓ SalaryAdvance created: 150 DZD");

  // 10. Calculate Payroll with 40%
  // Gross expected = 400 (L1) + 200 (L2) = 600 DZD
  // Total present attendances = 3
  // Deductions: 100 (photocopies) + 150 (advances) = 250 DZD
  // Net expected = 600 - 250 = 350 DZD
  const calc1 = await calculateTeacherPayroll(teacherId, periodStart, periodEnd);
  if (!calc1) throw new Error("Payroll calculation returned null!");

  console.log("\n--- Payroll Result (40%) ---");
  console.log(`Total sessions: ${calc1.totalSessions} (expected 2)`);
  console.log(`Total present students: ${calc1.totalPresentAttendances} (expected 3)`);
  console.log(`Gross amount: ${calc1.grossAmount} DZD (expected 600)`);
  console.log(`Photocopy deductions: ${calc1.photocopyDeductions} DZD (expected 100)`);
  console.log(`Salary advances: ${calc1.salaryAdvances} DZD (expected 150)`);
  console.log(`Net amount: ${calc1.netAmount} DZD (expected 350)`);

  if (calc1.grossAmount !== 600) {
    throw new Error(`Gross amount mismatch: got ${calc1.grossAmount}, expected 600`);
  }
  if (calc1.netAmount !== 350) {
    throw new Error(`Net amount mismatch: got ${calc1.netAmount}, expected 350`);
  }
  console.log("✓ Payroll at 40% matches §2.9 exact calculation!");

  // 11. Test Immediate Effect of Changing Percentage (Req 7)
  // Change percentage to 50%
  // New per-student cut: 500 * 50% = 250 DZD
  // Gross expected = 3 present students * 250 = 750 DZD
  // Net expected = 750 - 250 = 500 DZD
  console.log("\n--- Testing Owner Updating Percentage to 50% ---");
  await prisma.teacherPayRate.create({
    data: {
      teacherId,
      percentageOfSessionFee: new Prisma.Decimal(50), // 50%
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    },
  });

  const calc2 = await calculateTeacherPayroll(teacherId, periodStart, periodEnd);
  if (!calc2) throw new Error("Recalculation returned null!");

  console.log(`Gross at 50%: ${calc2.grossAmount} DZD (expected 750)`);
  console.log(`Net at 50%: ${calc2.netAmount} DZD (expected 500)`);

  if (calc2.grossAmount !== 750) {
    throw new Error(`Gross at 50% mismatch: got ${calc2.grossAmount}, expected 750`);
  }
  if (calc2.netAmount !== 500) {
    throw new Error(`Net at 50% mismatch: got ${calc2.netAmount}, expected 500`);
  }
  console.log("✓ Updating percentage immediately changed payroll calculation without any manual steps!");

  // 12. Verify Book Drop recording and level linkage (§2.11)
  const book = await prisma.book.upsert({
    where: { id: 99881 },
    update: {},
    create: {
      id: 99881,
      teacherId,
      levelId: level.id,
      title: "Physique - Mécanique BAC",
    },
  });

  await prisma.bookDrop.deleteMany({ where: { bookId: book.id } });
  const bookDrop = await prisma.bookDrop.create({
    data: {
      bookId: book.id,
      branchId,
      quantity: 25,
      recordedBy: "admin_test",
      dropDate: new Date("2026-09-07T11:00:00.000Z"),
    },
  });
  console.log(`✓ BookDrop created: ${bookDrop.quantity} copies of "${book.title}" for level "${level.name}"`);

  // 13. Verify §7.1 Teacher Field Reduction & Decoupling
  console.log("\n--- Testing §7.1 Teacher Field Reduction & Decoupling ---");
  const testReducedTeacherId = "test_reduced_teacher_01";
  const createdTeacher = await prisma.teacher.upsert({
    where: { id: testReducedTeacherId },
    update: {
      name: "Karim Ziani",
      phone: "0555123456",
      gender: "MALE",
    },
    create: {
      id: testReducedTeacherId,
      name: "Karim Ziani",
      phone: "0555123456",
      gender: "MALE",
      photocopyRatePerPage: new Prisma.Decimal(5),
    },
  });

  if (createdTeacher.phone !== "0555123456") {
    throw new Error(`Phone mismatch: got ${createdTeacher.phone}, expected 0555123456`);
  }
  if (createdTeacher.gender !== "MALE") {
    throw new Error(`Gender mismatch: got ${createdTeacher.gender}, expected MALE`);
  }
  console.log("✓ Teacher model successfully persists phone (optional) and gender!");

  // Verify that Class.teacherId is unchanged when updating teacher
  const testClassBefore = await prisma.class.findUnique({ where: { id: testClass.id } });
  if (testClassBefore?.teacherId !== teacherId) {
    throw new Error("Class teacherId mismatch before update test");
  }

  // Update teacher without groups or rate fields
  const updatedTeacher = await prisma.teacher.update({
    where: { id: testReducedTeacherId },
    data: {
      name: "Karim Ziani Updated",
      phone: "0666998877",
    },
  });
  if (updatedTeacher.name !== "Karim Ziani Updated" || updatedTeacher.phone !== "0666998877") {
    throw new Error("Teacher update failed for name and phone");
  }

  const testClassAfter = await prisma.class.findUnique({ where: { id: testClass.id } });
  if (testClassAfter?.teacherId !== teacherId) {
    throw new Error("Class teacherId was unexpectedly altered by teacher update!");
  }
  console.log("✓ Teacher updates are fully decoupled from groups (Class.teacherId is untouched)!");

  // Clean up test teacher
  await prisma.teacher.delete({ where: { id: testReducedTeacherId } }).catch(() => {});

  console.log("\n=== ALL VERIFICATIONS PASSED SUCCESSFULLY! ===");
}

verify()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
