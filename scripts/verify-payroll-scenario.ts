import "dotenv/config";
import prisma from "../src/lib/prisma";
import { generatePayrollRun } from "../src/lib/payroll";
import { Prisma } from "@prisma/client";

async function runScenario() {
  console.log("=== STARTING PAYROLL MULTI-BRANCH & PHOTOCOPY TEST SCENARIO ===");

  const teacherId = "teacher_karim_benali";
  const startDate = new Date("2026-09-01T00:00:00.000Z");
  const endDate = new Date("2026-09-30T23:59:59.999Z");

  // 1. Ensure Teacher exists
  const teacher = await prisma.teacher.upsert({
    where: { id: teacherId },
    update: { name: "Karim Benali" },
    create: { id: teacherId, name: "Karim Benali" },
  });
  console.log(`Teacher: ${teacher.name} (${teacher.id})`);

  // 2. Configure Pay Rates
  // General: 1,000 DZD per session
  await prisma.teacherPayRate.deleteMany({ where: { teacherId } });
  await prisma.teacherPayRate.create({
    data: {
      teacherId,
      ratePerSession: new Prisma.Decimal(1000),
      effectiveFrom: startDate,
    },
  });

  // Branch override: ANNEX (branch 2) gets 1,200 DZD / session; ECOLE (branch 1) uses default (null override)
  await prisma.teacherBranch.upsert({
    where: { teacherId_branchId: { teacherId, branchId: 1 } },
    update: { payRate: null },
    create: { teacherId, branchId: 1, payRate: null },
  });

  await prisma.teacherBranch.upsert({
    where: { teacherId_branchId: { teacherId, branchId: 2 } },
    update: { payRate: new Prisma.Decimal(1200) },
    create: { teacherId, branchId: 2, payRate: new Prisma.Decimal(1200) },
  });
  console.log("Pay rates configured: General = 1,000 DZD/session, ANNEX override = 1,200 DZD/session");

  // 3. Ensure Classes and Classrooms exist at ECOLE (1) and ANNEX (2)
  const classEcole = await prisma.class.findFirst({ where: { branchId: 1 } }) ||
    await prisma.class.create({
      data: {
        name: "Math 1AS ECOLE",
        branchId: 1,
        inscriptionFee: new Prisma.Decimal(2000),
      },
    });

  const classAnnex = await prisma.class.findFirst({ where: { branchId: 2 } }) ||
    await prisma.class.create({
      data: {
        name: "Math 2AS ANNEX",
        branchId: 2,
        inscriptionFee: new Prisma.Decimal(2000),
      },
    });

  const roomEcole = await prisma.classroom.findFirst({ where: { branchId: 1 } }) ||
    await prisma.classroom.create({
      data: { name: "Salle 1 ECOLE", branchId: 1 },
    });

  const roomAnnex = await prisma.classroom.findFirst({ where: { branchId: 2 } }) ||
    await prisma.classroom.create({
      data: { name: "Salle 1 ANNEX", branchId: 2 },
    });

  // Ensure a test student exists for attendance
  let student = await prisma.student.findUnique({ where: { id: "student_payroll_test" } });
  if (!student) {
    const maxG = await prisma.student.aggregate({ _max: { globalNumber: true } });
    student = await prisma.student.create({
      data: {
        id: "student_payroll_test",
        globalNumber: (maxG._max.globalNumber || 10000) + 1,
        name: "Yacine Amrani",
        registeredBranchId: 1,
      },
    });
  }

  // Clean old test lessons in September 2026 for this teacher
  const oldLessons = await prisma.lesson.findMany({
    where: {
      teacherId,
      startsAt: { gte: startDate, lte: endDate },
    },
  });
  for (const l of oldLessons) {
    await prisma.attendance.deleteMany({ where: { lessonId: l.id } });
    await prisma.lesson.delete({ where: { id: l.id } });
  }

  // 4. Create Lessons with Attendance:
  // ECOLE Lesson 1: Regular session (starts 2026-09-06)
  const l1 = await prisma.lesson.create({
    data: {
      teacherId,
      branchId: 1,
      classId: classEcole.id,
      classroomId: roomEcole.id,
      startsAt: new Date("2026-09-06T10:00:00Z"),
      endsAt: new Date("2026-09-06T12:00:00Z"),
      isFree: false,
    },
  });
  await prisma.attendance.create({
    data: { lessonId: l1.id, studentId: student.id, status: "PRESENT" },
  });

  // ECOLE Lesson 2: FREE LESSON (isFree: true) (starts 2026-09-13) - Still paid to teacher per §2.2!
  const l2 = await prisma.lesson.create({
    data: {
      teacherId,
      branchId: 1,
      classId: classEcole.id,
      classroomId: roomEcole.id,
      startsAt: new Date("2026-09-13T10:00:00Z"),
      endsAt: new Date("2026-09-13T12:00:00Z"),
      isFree: true,
    },
  });
  await prisma.attendance.create({
    data: { lessonId: l2.id, studentId: student.id, status: "PRESENT" },
  });

  // ANNEX Lesson 3: Regular session (starts 2026-09-08)
  const l3 = await prisma.lesson.create({
    data: {
      teacherId,
      branchId: 2,
      classId: classAnnex.id,
      classroomId: roomAnnex.id,
      startsAt: new Date("2026-09-08T14:00:00Z"),
      endsAt: new Date("2026-09-08T16:00:00Z"),
      isFree: false,
    },
  });
  await prisma.attendance.create({
    data: { lessonId: l3.id, studentId: student.id, status: "PRESENT" },
  });

  // ANNEX Lesson 4: Regular session (starts 2026-09-15)
  const l4 = await prisma.lesson.create({
    data: {
      teacherId,
      branchId: 2,
      classId: classAnnex.id,
      classroomId: roomAnnex.id,
      startsAt: new Date("2026-09-15T14:00:00Z"),
      endsAt: new Date("2026-09-15T16:00:00Z"),
      isFree: false,
    },
  });
  await prisma.attendance.create({
    data: { lessonId: l4.id, studentId: student.id, status: "PRESENT" },
  });
  console.log("Lessons created & attendance logged: 2 at ECOLE (including 1 free lesson), 2 at ANNEX");

  // 5. Clean & Record Photocopy Charges in September 2026 (§2.5)
  await prisma.photocopyCharge.deleteMany({
    where: { teacherId, date: { gte: startDate, lte: endDate } },
  });

  const pc1 = await prisma.photocopyCharge.create({
    data: {
      teacherId,
      branchId: 1, // ECOLE
      pages: 50,
      costAmount: new Prisma.Decimal(250),
      date: new Date("2026-09-05T09:00:00Z"),
      recordedBy: "admin_ecole",
    },
  });

  const pc2 = await prisma.photocopyCharge.create({
    data: {
      teacherId,
      branchId: 2, // ANNEX
      pages: 30,
      costAmount: new Prisma.Decimal(150),
      date: new Date("2026-09-18T11:00:00Z"),
      recordedBy: "admin_annex",
    },
  });
  console.log(`Photocopy charges created: ECOLE (50 pages = ${pc1.costAmount} DZD), ANNEX (30 pages = ${pc2.costAmount} DZD). Total = 400 DZD`);

  // 6. Clean & Record Salary Advance in September 2026
  await prisma.salaryAdvance.deleteMany({
    where: { personId: teacherId, date: { gte: startDate, lte: endDate } },
  });

  const sa = await prisma.salaryAdvance.create({
    data: {
      personId: teacherId,
      amount: new Prisma.Decimal(1000),
      date: new Date("2026-09-10T12:00:00Z"),
    },
  });
  console.log(`Salary advance created: ${sa.amount} DZD on 2026-09-10`);

  // 7. Generate Payroll Run for September 2026
  console.log("\nGenerating PayrollRun for period 2026-09-01 to 2026-09-30...");
  const payrollRun = await generatePayrollRun(startDate, endDate);
  console.log(`PayrollRun created: ID #${payrollRun.id}, status = ${payrollRun.status}`);

  // 8. Fetch the generated Payslip for Karim Benali
  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: payrollRun.id, personId: teacherId },
    include: {
      PayrollRun: true,
      PayslipBranchLine: {
        include: { Branch: true },
      },
    },
  });

  console.log(`\n=== RESULTS FOR TEACHER ${teacher.name} ===`);
  console.log(`Total Payslips generated for teacher across all branches: ${payslips.length} (MUST BE EXACTLY 1)`);

  if (payslips.length !== 1) {
    throw new Error(`FAILURE: Expected 1 payslip, found ${payslips.length}!`);
  }

  const slip = payslips[0];
  console.log(`Payslip ID: #${slip.id}`);
  console.log(`Person ID: ${slip.personId} (${slip.personType})`);
  console.log(`Total Sessions Count (includes free lesson): ${slip.sessionsCount}`);
  console.log(`Gross Amount (Total across branches): ${slip.grossAmount} DZD`);
  console.log(`Advances Deducted: ${slip.advances} DZD`);
  console.log(`Photocopy Deductions: ${slip.photocopyDeductions} DZD`);
  console.log(`Net Amount Payable: ${slip.netAmount} DZD`);

  console.log("\n--- PayslipBranchLine Breakdown (Informational Only) ---");
  slip.PayslipBranchLine.forEach((line) => {
    console.log(`• Branch: ${line.Branch.name} (ID: ${line.branchId}) | Sessions: ${line.sessionsCount} | Amount: ${line.amount} DZD`);
  });

  // Verify assertions
  const expectedGross = 4400; // 2 * 1000 (ECOLE) + 2 * 1200 (ANNEX)
  const expectedAdvances = 1000;
  const expectedPhotocopy = 400;
  const expectedNet = 3000;

  console.log("\n--- Verifying Exact Mathematical Correctness ---");
  console.log(`Gross: ${slip.grossAmount} == ${expectedGross} -> ${Number(slip.grossAmount) === expectedGross ? "PASS" : "FAIL"}`);
  console.log(`Advances: ${slip.advances} == ${expectedAdvances} -> ${Number(slip.advances) === expectedAdvances ? "PASS" : "FAIL"}`);
  console.log(`Photocopy: ${slip.photocopyDeductions} == ${expectedPhotocopy} -> ${Number(slip.photocopyDeductions) === expectedPhotocopy ? "PASS" : "FAIL"}`);
  console.log(`Net: ${slip.netAmount} == ${expectedNet} -> ${Number(slip.netAmount) === expectedNet ? "PASS" : "FAIL"}`);

  console.log("\n=== SCENARIO VERIFICATION COMPLETED SUCCESSFULLY ===");
}

runScenario()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
