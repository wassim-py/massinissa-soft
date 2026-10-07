import "dotenv/config";
import prisma from "../src/lib/prisma";
import { calculateTeacherPayroll } from "../src/lib/payroll";
import { Prisma } from "@prisma/client";

async function runVerification() {
  console.log("=== Starting Teacher Group Percentage Verification ===");

  const testTeacherId = "test-group-pct-teacher";
  const testBranchId = 1; // Existing main branch

  // Clean up any prior test artifacts
  await prisma.catchUpAttendance.deleteMany({
    where: { studentId: { in: ["test-stud-1", "test-stud-2"] } },
  });
  await prisma.attendance.deleteMany({
    where: { studentId: { in: ["test-stud-1", "test-stud-2"] } },
  });
  await prisma.lesson.deleteMany({
    where: { teacherId: testTeacherId },
  });
  await prisma.enrollment.deleteMany({
    where: { studentId: { in: ["test-stud-1", "test-stud-2"] } },
  });
  await prisma.teacherClassRate.deleteMany({
    where: { teacherId: testTeacherId },
  });
  await prisma.teacherPayRate.deleteMany({
    where: { teacherId: testTeacherId },
  });
  await prisma.class.deleteMany({
    where: { id: { in: [99991, 99992] } },
  });
  await prisma.teacherBranch.deleteMany({
    where: { teacherId: testTeacherId },
  });
  await prisma.teacher.deleteMany({
    where: { id: testTeacherId },
  });
  await prisma.student.deleteMany({
    where: { id: { in: ["test-stud-1", "test-stud-2"] } },
  });

  // 1. Create Test Teacher
  const teacher = await prisma.teacher.create({
    data: {
      id: testTeacherId,
      name: "Professeur Test Pourcentages",
      gender: "MALE",
      photocopyRatePerPage: new Prisma.Decimal(5),
      TeacherBranch: {
        create: { branchId: testBranchId },
      },
      TeacherPayRate: {
        create: {
          percentageOfSessionFee: new Prisma.Decimal(40), // Default 40% overall
          effectiveFrom: new Date("2026-01-01"),
        },
      },
    },
  });
  console.log("✓ Created Test Teacher with overall 40% rate");

  // 2. Create Two Classes (Groups)
  // Class 1: Price per cycle = 4000 (Session price = 1000)
  // Class 2: Price per cycle = 4000 (Session price = 1000)
  const class1 = await prisma.class.create({
    data: {
      id: 99991,
      name: "Groupe A (Maths)",
      branchId: testBranchId,
      teacherId: testTeacherId,
      pricePerCycle: new Prisma.Decimal(4000),
      inscriptionFee: new Prisma.Decimal(0),
    },
  });

  const class2 = await prisma.class.create({
    data: {
      id: 99992,
      name: "Groupe B (Physique)",
      branchId: testBranchId,
      teacherId: testTeacherId,
      pricePerCycle: new Prisma.Decimal(4000),
      inscriptionFee: new Prisma.Decimal(0),
    },
  });
  console.log("✓ Created Class 1 (99991) and Class 2 (99992)");

  // 3. Create Students and Enrollments
  const student1 = await prisma.student.create({
    data: {
      id: "test-stud-1",
      globalNumber: 999991,
      name: "Élève Un",
      registeredBranchId: testBranchId,
    },
  });
  const student2 = await prisma.student.create({
    data: {
      id: "test-stud-2",
      globalNumber: 999992,
      name: "Élève Deux",
      registeredBranchId: testBranchId,
    },
  });

  // Find active academic year
  const academicYear = await prisma.academicYear.findFirst() || await prisma.academicYear.create({
    data: {
      label: "2026-2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-06-30"),
    },
  });

  await prisma.enrollment.create({
    data: {
      studentId: student1.id,
      classId: class1.id,
      academicYearId: academicYear.id,
      inscriptionFeeCharged: false,
    },
  });
  await prisma.enrollment.create({
    data: {
      studentId: student2.id,
      classId: class2.id,
      academicYearId: academicYear.id,
      inscriptionFeeCharged: false,
    },
  });

  // Find a classroom
  const classroom = await prisma.classroom.findFirst({ where: { branchId: testBranchId } }) ||
    await prisma.classroom.create({ data: { name: "Salle Test", branchId: testBranchId } });

  // 4. Create Lessons and Attendance in Current Month
  const now = new Date();
  const startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));

  const lessonDate1 = new Date(startDate.getTime() + 2 * 24 * 3600 * 1000);
  const lessonDate2 = new Date(startDate.getTime() + 4 * 24 * 3600 * 1000);

  const lesson1 = await prisma.lesson.create({
    data: {
      teacherId: testTeacherId,
      classId: class1.id,
      classroomId: classroom.id,
      branchId: testBranchId,
      startsAt: lessonDate1,
      endsAt: new Date(lessonDate1.getTime() + 2 * 3600 * 1000),
      attendances: {
        create: {
          studentId: student1.id,
          status: "PRESENT",
        },
      },
    },
  });

  const lesson2 = await prisma.lesson.create({
    data: {
      teacherId: testTeacherId,
      classId: class2.id,
      classroomId: classroom.id,
      branchId: testBranchId,
      startsAt: lessonDate2,
      endsAt: new Date(lessonDate2.getTime() + 2 * 3600 * 1000),
      attendances: {
        create: {
          studentId: student2.id,
          status: "PRESENT",
        },
      },
    },
  });
  console.log("✓ Created Lesson 1 for Class 1 and Lesson 2 for Class 2");

  // TEST SCENARIO A: No group overrides (both should use overall 40%)
  const payrollA = await calculateTeacherPayroll(testTeacherId, startDate, endDate);
  if (!payrollA) throw new Error("Payroll A calculation returned null");

  const s1A = payrollA.sessionDetails?.find((s) => s.lessonId === lesson1.id);
  const s2A = payrollA.sessionDetails?.find((s) => s.lessonId === lesson2.id);

  console.log(`Scenario A (Overall 40%):`);
  console.log(`  - Lesson 1 cut: ${s1A?.teacherCut} DZD (Expected: 400 DZD, applied: ${s1A?.appliedPercentage}%)`);
  console.log(`  - Lesson 2 cut: ${s2A?.teacherCut} DZD (Expected: 400 DZD, applied: ${s2A?.appliedPercentage}%)`);
  console.log(`  - Total gross: ${payrollA.grossAmount} DZD (Expected: 800 DZD)`);

  if (s1A?.teacherCut !== 400 || s2A?.teacherCut !== 400 || payrollA.grossAmount !== 800) {
    throw new Error(`Scenario A assertion failed: s1A=${s1A?.teacherCut}, s2A=${s2A?.teacherCut}`);
  }

  // TEST SCENARIO B: Override Class 1 with 60%
  await prisma.teacherClassRate.create({
    data: {
      teacherId: testTeacherId,
      classId: class1.id,
      percentage: new Prisma.Decimal(60),
    },
  });
  console.log("✓ Created TeacherClassRate: Class 1 -> 60%");

  const payrollB = await calculateTeacherPayroll(testTeacherId, startDate, endDate);
  if (!payrollB) throw new Error("Payroll B calculation returned null");

  const s1B = payrollB.sessionDetails?.find((s) => s.lessonId === lesson1.id);
  const s2B = payrollB.sessionDetails?.find((s) => s.lessonId === lesson2.id);

  console.log(`Scenario B (Class 1 at 60%, Class 2 at default 40%):`);
  console.log(`  - Lesson 1 cut: ${s1B?.teacherCut} DZD (Expected: 600 DZD, applied: ${s1B?.appliedPercentage}%)`);
  console.log(`  - Lesson 2 cut: ${s2B?.teacherCut} DZD (Expected: 400 DZD, applied: ${s2B?.appliedPercentage}%)`);
  console.log(`  - Total gross: ${payrollB.grossAmount} DZD (Expected: 1000 DZD)`);

  if (s1B?.teacherCut !== 600 || s2B?.teacherCut !== 400 || payrollB.grossAmount !== 1000) {
    throw new Error(`Scenario B assertion failed: s1B=${s1B?.teacherCut}, s2B=${s2B?.teacherCut}, gross=${payrollB.grossAmount}`);
  }

  // TEST SCENARIO C: Revert Class 1 override (delete override)
  await prisma.teacherClassRate.delete({
    where: { teacherId_classId: { teacherId: testTeacherId, classId: class1.id } },
  });
  console.log("✓ Reverted TeacherClassRate for Class 1");

  const payrollC = await calculateTeacherPayroll(testTeacherId, startDate, endDate);
  if (!payrollC) throw new Error("Payroll C calculation returned null");

  const s1C = payrollC.sessionDetails?.find((s) => s.lessonId === lesson1.id);
  const s2C = payrollC.sessionDetails?.find((s) => s.lessonId === lesson2.id);

  console.log(`Scenario C (Reverted back to default 40%):`);
  console.log(`  - Lesson 1 cut: ${s1C?.teacherCut} DZD (Expected: 400 DZD, applied: ${s1C?.appliedPercentage}%)`);
  console.log(`  - Lesson 2 cut: ${s2C?.teacherCut} DZD (Expected: 400 DZD, applied: ${s2C?.appliedPercentage}%)`);
  console.log(`  - Total gross: ${payrollC.grossAmount} DZD (Expected: 800 DZD)`);

  if (s1C?.teacherCut !== 400 || s2C?.teacherCut !== 400 || payrollC.grossAmount !== 800) {
    throw new Error(`Scenario C assertion failed`);
  }

  // Cleanup test artifacts
  await prisma.attendance.deleteMany({
    where: { studentId: { in: ["test-stud-1", "test-stud-2"] } },
  });
  await prisma.lesson.deleteMany({
    where: { teacherId: testTeacherId },
  });
  await prisma.enrollment.deleteMany({
    where: { studentId: { in: ["test-stud-1", "test-stud-2"] } },
  });
  await prisma.teacherClassRate.deleteMany({
    where: { teacherId: testTeacherId },
  });
  await prisma.teacherPayRate.deleteMany({
    where: { teacherId: testTeacherId },
  });
  await prisma.class.deleteMany({
    where: { id: { in: [99991, 99992] } },
  });
  await prisma.teacherBranch.deleteMany({
    where: { teacherId: testTeacherId },
  });
  await prisma.teacher.deleteMany({
    where: { id: testTeacherId },
  });
  await prisma.student.deleteMany({
    where: { id: { in: ["test-stud-1", "test-stud-2"] } },
  });

  console.log("✓ Cleaned up all test artifacts");
  console.log("=== ALL VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
}

runVerification()
  .catch((e) => {
    console.error("Verification failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
