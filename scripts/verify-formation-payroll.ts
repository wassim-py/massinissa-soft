import "dotenv/config";
import prisma from "../src/lib/prisma";
import { calculateTeacherPayroll } from "../src/lib/payroll";
import { Prisma } from "@prisma/client";

async function runVerification() {
  console.log("==================================================================");
  console.log("   VERIFYING FORMATION TEACHER PAYROLL ARCHITECTURE (2-MONTH SPLIT)");
  console.log("==================================================================");

  const teacherId = "test_formation_teacher_verify";
  const branchId = 1; // ECOLE

  // 1. Ensure test teacher exists
  await prisma.teacher.upsert({
    where: { id: teacherId },
    update: { name: "Prof Formation Test" },
    create: { id: teacherId, name: "Prof Formation Test" },
  });

  // Assign branch
  await prisma.teacherBranch.upsert({
    where: { teacherId_branchId: { teacherId, branchId } },
    update: {},
    create: { teacherId, branchId },
  });

  // Set default rate: 50%
  await prisma.teacherPayRate.deleteMany({ where: { teacherId } });
  await prisma.teacherPayRate.create({
    data: {
      teacherId,
      percentageOfSessionFee: new Prisma.Decimal(50),
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    },
  });

  // 2. Ensure test formation class exists with pricePerCycle = 4000 DZD
  let formationClass = await prisma.class.findFirst({
    where: { name: "Test Formation Anglais 2M", isFormation: true },
  });

  if (!formationClass) {
    formationClass = await prisma.class.create({
      data: {
        name: "Test Formation Anglais 2M",
        branchId,
        teacherId,
        isFormation: true,
        pricePerCycle: new Prisma.Decimal(4000),
        inscriptionFee: new Prisma.Decimal(300),
      },
    });
  } else {
    formationClass = await prisma.class.update({
      where: { id: formationClass.id },
      data: {
        teacherId,
        pricePerCycle: new Prisma.Decimal(4000),
        isCompleted: false,
      },
    });
  }

  const classId = formationClass.id;
  console.log(`Formation Class ID: ${classId} ("${formationClass.name}") - Fee: 4,000 DZD`);

  // Ensure classroom
  let classroom = await prisma.classroom.findFirst({ where: { branchId } });
  if (!classroom) {
    classroom = await prisma.classroom.create({
      data: { name: "Salle Test", branchId },
    });
  }

  // 3. Clean up any previous test lessons, enrollments, vouchers for this class
  await prisma.attendance.deleteMany({ where: { lesson: { classId } } });
  await prisma.lesson.deleteMany({ where: { classId } });
  await prisma.voucher.deleteMany({ where: { classId } });
  await prisma.enrollment.deleteMany({ where: { classId } });

  // 4. Create Lessons:
  // Month 1 (October 2026): Lesson on 2026-10-05 and 2026-10-12
  // Month 2 (November 2026): Lesson on 2026-11-05 and 2026-11-12
  const l1 = await prisma.lesson.create({
    data: {
      classId,
      branchId,
      teacherId,
      classroomId: classroom.id,
      startsAt: new Date("2026-10-05T10:00:00.000Z"),
      endsAt: new Date("2026-10-05T12:00:00.000Z"),
    },
  });
  const l2 = await prisma.lesson.create({
    data: {
      classId,
      branchId,
      teacherId,
      classroomId: classroom.id,
      startsAt: new Date("2026-10-12T10:00:00.000Z"),
      endsAt: new Date("2026-10-12T12:00:00.000Z"),
    },
  });
  const l3 = await prisma.lesson.create({
    data: {
      classId,
      branchId,
      teacherId,
      classroomId: classroom.id,
      startsAt: new Date("2026-11-05T10:00:00.000Z"),
      endsAt: new Date("2026-11-05T12:00:00.000Z"),
    },
  });

  // 5. Create Students & Enrollments:
  // Student A: Full payment 4,000 DZD in Month 1
  // Student B: Partial payment 1,500 DZD in Month 1 (later completes 2,500 DZD in Month 2)
  // Student C: Partial payment 3,000 DZD in Month 1 (later completes 1,000 DZD in Month 2)
  const studentIds = ["test_std_full_4000", "test_std_part_1500", "test_std_part_3000"];
  const studentNames = ["Élève A (4000 Full)", "Élève B (1500 Partiel)", "Élève C (3000 Partiel)"];

  const academicYear = await prisma.academicYear.findFirst({ orderBy: { startDate: "desc" } });
  const yearId = academicYear ? academicYear.id : 1;

  const maxGlobal = await prisma.student.findFirst({ orderBy: { globalNumber: "desc" }, select: { globalNumber: true } });
  const startGlobal = (maxGlobal?.globalNumber || 90000);

  for (let i = 0; i < studentIds.length; i++) {
    await prisma.student.upsert({
      where: { id: studentIds[i] },
      update: { name: studentNames[i] },
      create: { id: studentIds[i], name: studentNames[i], globalNumber: startGlobal + i + 1, registeredBranchId: branchId },
    });
    await prisma.enrollment.create({
      data: {
        studentId: studentIds[i],
        classId,
        academicYearId: yearId,
        status: "ACTIVE",
        payerStatus: "NORMAL",
        inscriptionFeeCharged: true,
      },
    });

    // Record attendances in Month 1 lessons
    await prisma.attendance.create({
      data: { lessonId: l1.id, studentId: studentIds[i], status: "PRESENT" },
    });
    await prisma.attendance.create({
      data: { lessonId: l2.id, studentId: studentIds[i], status: "PRESENT" },
    });
    // Record attendance in Month 2 lesson
    await prisma.attendance.create({
      data: { lessonId: l3.id, studentId: studentIds[i], status: "PRESENT" },
    });
  }

  // Voucher Series for tests
  let series = await prisma.voucherSeries.findFirst({ where: { issuingBranchId: branchId } });
  if (!series) {
    series = await prisma.voucherSeries.create({
      data: {
        issuingBranchId: branchId,
        scope: "GLOBAL",
        currentNumber: 1000,
      },
    });
  }

  // Month 1 Vouchers (issued in October 2026):
  // Student A: 4000 DZD
  await prisma.voucher.create({
    data: {
      seriesId: series.id,
      number: 9901,
      studentId: studentIds[0],
      classId,
      issuingBranchId: branchId,
      targetBranchId: branchId,
      paymentType: "FORMATION",
      amount: new Prisma.Decimal(4000),
      issuedAt: new Date("2026-10-02T10:00:00.000Z"),
      issuedBy: "admin",
    },
  });

  // Student B: 1500 DZD
  await prisma.voucher.create({
    data: {
      seriesId: series.id,
      number: 9902,
      studentId: studentIds[1],
      classId,
      issuingBranchId: branchId,
      targetBranchId: branchId,
      paymentType: "FORMATION",
      amount: new Prisma.Decimal(1500),
      isPartial: true,
      issuedAt: new Date("2026-10-02T10:00:00.000Z"),
      issuedBy: "admin",
    },
  });

  // Student C: 3000 DZD
  await prisma.voucher.create({
    data: {
      seriesId: series.id,
      number: 9903,
      studentId: studentIds[2],
      classId,
      issuingBranchId: branchId,
      targetBranchId: branchId,
      paymentType: "FORMATION",
      amount: new Prisma.Decimal(3000),
      isPartial: true,
      issuedAt: new Date("2026-10-02T10:00:00.000Z"),
      issuedBy: "admin",
    },
  });

  // Formation Group Book Voucher: 500 DZD (Rule: 100% School revenue, 0 DZD to teacher)
  await prisma.voucher.create({
    data: {
      seriesId: series.id,
      number: 9904,
      studentId: studentIds[0],
      classId,
      issuingBranchId: branchId,
      targetBranchId: branchId,
      paymentType: "BOOK",
      amount: new Prisma.Decimal(500),
      issuedAt: new Date("2026-10-02T10:00:00.000Z"),
      issuedBy: "admin",
    },
  });

  console.log("Vouchers created for Month 1 (October):");
  console.log(" - Student A: 4000 DZD (FORMATION) + 500 DZD (BOOK)");
  console.log(" - Student B: 1500 DZD (FORMATION)");
  console.log(" - Student C: 3000 DZD (FORMATION)");

  // =====================================================================
  // TEST CYCLE 1 (MONTH 1 - OCTOBER 2026)
  // =====================================================================
  console.log("\n--- RUNNING PAYROLL FOR MONTH 1 (2026-10-01 to 2026-10-31) ---");
  const month1Start = new Date("2026-10-01T00:00:00.000Z");
  const month1End = new Date("2026-10-31T23:59:59.999Z");

  const calcM1 = await calculateTeacherPayroll(teacherId, month1Start, month1End);
  if (!calcM1) throw new Error("Calculation M1 failed!");

  console.log(`Month 1 Gross Amount: ${calcM1.grossAmount} DZD`);
  console.log(`Month 1 School Gross: ${calcM1.schoolGrossAmount} DZD`);
  console.log(`Month 1 Book Revenue (Teacher): ${calcM1.bookRevenue || 0} DZD`);

  // Assertions for Month 1:
  // Student A (paid 4000): base = min(4000, 2000) = 2000 DZD -> Teacher gets 1000 DZD
  // Student B (paid 1500): base = min(1500, 2000) = 1500 DZD -> Teacher gets 750 DZD
  // Student C (paid 3000): base = min(3000, 2000) = 2000 DZD -> Teacher gets 1000 DZD
  // Total Month 1 Recognized Base = 2000 + 1500 + 2000 = 5500 DZD
  // Total Teacher Gross = 1000 + 750 + 1000 = 2750 DZD
  // Total School Gross = 5500 - 2750 = 2750 DZD
  // Formation Book Revenue = 0 DZD to teacher (100% school)

  if (calcM1.bookRevenue !== 0) {
    throw new Error(`FAIL: Formation book revenue must be 0 for teacher! Got: ${calcM1.bookRevenue}`);
  }
  if (calcM1.grossAmount !== 2750) {
    throw new Error(`FAIL: Month 1 teacher gross must be 2750 DZD! Got: ${calcM1.grossAmount}`);
  }
  if (calcM1.schoolGrossAmount !== 2750) {
    throw new Error(`FAIL: Month 1 school gross must be 2750 DZD! Got: ${calcM1.schoolGrossAmount}`);
  }
  if (calcM1.totalTuitionGross !== 5500) {
    throw new Error(`FAIL: Month 1 total tuition gross must be 5500 DZD! Got: ${calcM1.totalTuitionGross}`);
  }
  console.log(">>> SUCCESS: Month 1 (Cycle 1) 50% Cap & Book 0% Rule PASSED!");

  // =====================================================================
  // TEST CYCLE 2 (MONTH 2 - NOVEMBER 2026) - PART 1: BEFORE NEW PAYMENTS
  // =====================================================================
  console.log("\n--- RUNNING PAYROLL FOR MONTH 2 BEFORE ANY NEW PAYMENTS (2026-11-01 to 2026-11-30) ---");
  const month2Start = new Date("2026-11-01T00:00:00.000Z");
  const month2End = new Date("2026-11-30T23:59:59.999Z");

  const calcM2Initial = await calculateTeacherPayroll(teacherId, month2Start, month2End);
  if (!calcM2Initial) throw new Error("Calculation M2 Initial failed!");

  // Expected in Month 2 before new payments:
  // Student A (paid 4000 total, 2000 in M1): base = min(4000 - 2000, 2000) = 2000 DZD -> Teacher gets 1000 DZD
  // Student B (paid 1500 total, 1500 in M1): base = min(1500 - 1500, 2500) = 0 DZD -> Teacher gets 0 DZD
  // Student C (paid 3000 total, 2000 in M1): base = min(3000 - 2000, 2000) = 1000 DZD -> Teacher gets 500 DZD
  // Total Month 2 Recognized Base = 2000 + 0 + 1000 = 3000 DZD
  // Total Teacher Gross = 1000 + 0 + 500 = 1500 DZD
  // Total School Gross = 1500 DZD
  console.log(`Month 2 Initial Gross Amount: ${calcM2Initial.grossAmount} DZD`);
  console.log(`Month 2 Initial School Gross: ${calcM2Initial.schoolGrossAmount} DZD`);

  if (calcM2Initial.grossAmount !== 1500) {
    throw new Error(`FAIL: Month 2 initial teacher gross must be 1500 DZD! Got: ${calcM2Initial.grossAmount}`);
  }
  if (calcM2Initial.schoolGrossAmount !== 1500) {
    throw new Error(`FAIL: Month 2 initial school gross must be 1500 DZD! Got: ${calcM2Initial.schoolGrossAmount}`);
  }
  if (calcM2Initial.totalTuitionGross !== 3000) {
    throw new Error(`FAIL: Month 2 initial total tuition gross must be 3000 DZD! Got: ${calcM2Initial.totalTuitionGross}`);
  }
  console.log(">>> SUCCESS: Month 2 (Cycle 2) Partial Payments & Deferred Payouts PASSED!");

  // =====================================================================
  // TEST CYCLE 2 (MONTH 2) - PART 2: STUDENTS B & C COMPLETE THEIR PAYMENTS
  // =====================================================================
  console.log("\n--- STUDENTS B & C COMPLETE PAYMENTS IN NOVEMBER ---");
  // Student B completes 2500 DZD in November (reaches 4000 DZD full)
  await prisma.voucher.create({
    data: {
      seriesId: series.id,
      number: 9905,
      studentId: studentIds[1],
      classId,
      issuingBranchId: branchId,
      targetBranchId: branchId,
      paymentType: "FORMATION",
      amount: new Prisma.Decimal(2500),
      isPartial: false,
      issuedAt: new Date("2026-11-10T10:00:00.000Z"),
      issuedBy: "admin",
    },
  });

  // Student C completes remaining 1000 DZD in November (reaches 4000 DZD full)
  await prisma.voucher.create({
    data: {
      seriesId: series.id,
      number: 9906,
      studentId: studentIds[2],
      classId,
      issuingBranchId: branchId,
      targetBranchId: branchId,
      paymentType: "FORMATION",
      amount: new Prisma.Decimal(1000),
      isPartial: false,
      issuedAt: new Date("2026-11-10T10:00:00.000Z"),
      issuedBy: "admin",
    },
  });

  const calcM2Final = await calculateTeacherPayroll(teacherId, month2Start, month2End);
  if (!calcM2Final) throw new Error("Calculation M2 Final failed!");

  // Expected in Month 2 after completions:
  // Student A (paid 4000 total, 2000 in M1): base = 2000 DZD -> Teacher gets 1000 DZD
  // Student B (paid 4000 total, 1500 in M1): base = min(4000 - 1500, 2500) = 2500 DZD -> Teacher gets 1250 DZD
  // Student C (paid 4000 total, 2000 in M1): base = min(4000 - 2000, 2000) = 2000 DZD -> Teacher gets 1000 DZD
  // Total Month 2 Recognized Base = 2000 + 2500 + 2000 = 6500 DZD
  // Total Teacher Gross = 1000 + 1250 + 1000 = 3250 DZD
  // Total School Gross = 3250 DZD
  console.log(`Month 2 Final Gross Amount: ${calcM2Final.grossAmount} DZD`);
  console.log(`Month 2 Final School Gross: ${calcM2Final.schoolGrossAmount} DZD`);

  if (calcM2Final.grossAmount !== 3250) {
    throw new Error(`FAIL: Month 2 final teacher gross must be 3250 DZD! Got: ${calcM2Final.grossAmount}`);
  }
  if (calcM2Final.schoolGrossAmount !== 3250) {
    throw new Error(`FAIL: Month 2 final school gross must be 3250 DZD! Got: ${calcM2Final.schoolGrossAmount}`);
  }
  if (calcM2Final.totalTuitionGross !== 6500) {
    throw new Error(`FAIL: Month 2 final total tuition gross must be 6500 DZD! Got: ${calcM2Final.totalTuitionGross}`);
  }

  // Cumulative across both months:
  // M1 Gross (2750) + M2 Gross (3250) = 6000 DZD Teacher earnings on 12,000 DZD total paid (3 students * 4000 DZD)!
  // Exactly 50% of 12,000 DZD!
  const total2Months = calcM1.grossAmount + calcM2Final.grossAmount;
  console.log(`\n>>> TWO MONTHS COMBINED TEACHER EARNINGS: ${total2Months} DZD (Exactly 50% of 12,000 DZD total tuition)`);
  if (total2Months !== 6000) {
    throw new Error(`FAIL: Combined earnings across 2 months must be 6000 DZD! Got: ${total2Months}`);
  }

  console.log(">>> SUCCESS: Completed Payments in Month 2 PASSED PERFECTLY!");

  // Clean up test data
  await prisma.attendance.deleteMany({ where: { lesson: { classId } } });
  await prisma.lesson.deleteMany({ where: { classId } });
  await prisma.voucher.deleteMany({ where: { classId } });
  await prisma.enrollment.deleteMany({ where: { classId } });
  await prisma.class.delete({ where: { id: classId } });
  await prisma.teacherPayRate.deleteMany({ where: { teacherId } });
  await prisma.teacherBranch.deleteMany({ where: { teacherId } });
  await prisma.teacher.delete({ where: { id: teacherId } });
  for (const sId of studentIds) {
    await prisma.student.delete({ where: { id: sId } });
  }

  console.log("\n==================================================================");
  console.log("   ALL TEST SCENARIOS PASSED WITH 100% MATHEMATICAL PRECISION!");
  console.log("==================================================================");
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
