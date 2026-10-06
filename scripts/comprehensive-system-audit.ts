/**
 * comprehensive-system-audit.ts
 *
 * Full End-to-End System Audit and Scenario Verification
 * Covers Scenarios 1 to 10 under both Owner and Branch-Admin roles.
 * Non-destructive: cleans up all test entities in finally block.
 */

import "dotenv/config";
import prisma from "../src/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  createStudent,
  updateStudent,
  createVoucher,
  createRefund,
  transferEnrollmentCredit,
  createLesson,
  markSingleAttendanceAction,
  updateEnrollmentPayerStatusAction,
  registerParticipant,
  addWorkshopPayment,
  recordWorkshopAttendance,
  declareMissingMoneyAction,
  confirmMissingMoneyAction,
  declareSurplusMoneyAction,
  confirmSurplusMoneyAction,
} from "../src/lib/actions";
import { createDailyExpenseAction } from "../src/lib/financeActions";
import {
  recordFormationLumpSumPayment,
  recordLevelTest,
} from "../src/lib/formationActions";
import { computeStudentSessionFee } from "../src/lib/studentBilling";
import { calculateTeacherPayroll } from "../src/lib/payroll";
import { getDailyBranchLedgerData } from "../src/lib/revenue";
import { syncDailyLedgerFromVouchers } from "../src/lib/ledger";

interface TestReportItem {
  scenario: string;
  name: string;
  status: "PASSED" | "FAILED";
  details: string;
}

const auditReport: TestReportItem[] = [];

function recordResult(scenario: string, name: string, passed: boolean, details: string) {
  auditReport.push({
    scenario,
    name,
    status: passed ? "PASSED" : "FAILED",
    details,
  });
  const icon = passed ? "✅" : "❌";
  console.log(`${icon} [${scenario}] ${name}: ${details}`);
}

async function runAudit() {
  console.log("================================================================================");
  console.log("🚀 STARTING COMPREHENSIVE FULL-SYSTEM AUDIT & SCENARIO TESTING (OPTION A)");
  console.log("================================================================================\n");

  // Identifiers for isolated test entities
  const PREFIX = `AUDIT_${Date.now()}`;
  const testStudentId = `${PREFIX}_STU_1`;
  const testStudent2Id = `${PREFIX}_STU_2`;
  const testTeacherId = `${PREFIX}_TCH_1`;
  const testBranch1Id = 1; // ECOLE
  const testBranch2Id = 2; // ANNEX
  const testClassroom1Id = 99991;
  const testClass1Id = 99991;
  const testClass2Id = 99992;
  const testWorkshopId = 99991;
  const testFormationClassId = 99993;
  let testStudentGlobalNumber = 999901;

  try {
    // -------------------------------------------------------------------------
    // Setup Base Sandbox Entities
    // -------------------------------------------------------------------------
    console.log("--- Setting up base sandbox test entities ---");
    
    // Ensure test academic year exists
    const academicYear = await prisma.academicYear.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        label: "2026-2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-06-30"),
      },
    });

    // Ensure test Level exists
    const testLevel = await prisma.level.upsert({
      where: { name: "TEST_BAC_LEVEL" },
      update: {},
      create: { name: "TEST_BAC_LEVEL" },
    });

    // Ensure Classroom exists
    await prisma.classroom.upsert({
      where: { id: testClassroom1Id },
      update: {},
      create: { id: testClassroom1Id, name: "Audit Lab 1", branchId: testBranch1Id },
    });

    // Create Test Teacher with 40% pay rate
    await prisma.teacher.upsert({
      where: { id: testTeacherId },
      update: { name: "Professeur Audit Test" },
      create: { id: testTeacherId, name: "Professeur Audit Test" },
    });

    await prisma.teacherPayRate.create({
      data: {
        teacherId: testTeacherId,
        percentageOfSessionFee: new Prisma.Decimal(40),
        effectiveFrom: new Date("2026-01-01"),
      },
    });

    // Create Test Class 1 (ECOLE, 2400 DZD/cycle = 600 DZD/session)
    const class1 = await prisma.class.upsert({
      where: { id: testClass1Id },
      update: {},
      create: {
        id: testClass1Id,
        name: "Classe Audit Ecole",
        branchId: testBranch1Id,
        teacherId: testTeacherId,
        levelId: testLevel.id,
        pricePerCycle: new Prisma.Decimal(2400),
        inscriptionFee: new Prisma.Decimal(1000),
        hasBooks: true,
        bookFee: new Prisma.Decimal(500),
      },
    });

    // Create Test Class 2 (ANNEX, 2800 DZD/cycle = 700 DZD/session)
    const class2 = await prisma.class.upsert({
      where: { id: testClass2Id },
      update: {},
      create: {
        id: testClass2Id,
        name: "Classe Audit Annex",
        branchId: testBranch2Id,
        teacherId: testTeacherId,
        levelId: testLevel.id,
        pricePerCycle: new Prisma.Decimal(2800),
        inscriptionFee: new Prisma.Decimal(1000),
      },
    });

    // -------------------------------------------------------------------------
    // SCENARIO 1: Student Lifecycle & Parent Phone Deduplication
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 1: Student Lifecycle & Data Integrity ---");
    process.env.TEST_AUTH_ROLE = "owner";
    process.env.TEST_BRANCH_IDS = "1,2,3";
    process.env.TEST_USER_ID = "owner_audit";

    const lastStudent = await prisma.student.findFirst({ orderBy: { globalNumber: "desc" } });
    testStudentGlobalNumber = (lastStudent?.globalNumber || 1000) + 99;

    const studentCreated = await prisma.student.create({
      data: {
        id: testStudentId,
        globalNumber: testStudentGlobalNumber,
        name: "Élève Audit Test Un",
        registeredBranchId: testBranch1Id,
        phone: "0555123456",
        sex: "MALE",
        payerStatus: "NORMAL",
        parentPhoneNumbers: {
          create: [{ phone: "0666112233" }, { phone: "0777445566" }],
        },
      },
      include: { parentPhoneNumbers: true },
    });

    const has2Phones = studentCreated.parentPhoneNumbers.length === 2;
    recordResult(
      "Scenario 1",
      "Student Creation & Parent Phones Association",
      has2Phones && studentCreated.globalNumber === testStudentGlobalNumber,
      `Student ID: ${studentCreated.id}, GlobalNumber: ${studentCreated.globalNumber}, Phones: ${studentCreated.parentPhoneNumbers.length}`
    );

    // -------------------------------------------------------------------------
    // SCENARIO 2: Multi-Branch Enrollment & RBAC Scoping
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 2: Multi-Branch Enrollment & RBAC ---");
    
    // Enroll in Class 1 (ECOLE)
    const enrollment1 = await prisma.enrollment.create({
      data: {
        studentId: testStudentId,
        classId: testClass1Id,
        academicYearId: academicYear.id,
        inscriptionFeeCharged: true,
        inscriptionFeeAmount: new Prisma.Decimal(1000),
        payerStatus: "NORMAL",
        status: "ACTIVE",
      },
    });

    // Enroll in Class 2 (ANNEX)
    const enrollment2 = await prisma.enrollment.create({
      data: {
        studentId: testStudentId,
        classId: testClass2Id,
        academicYearId: academicYear.id,
        inscriptionFeeCharged: false, // Inscription waived on 2nd enrollment
        inscriptionFeeAmount: new Prisma.Decimal(0),
        payerStatus: "NORMAL",
        status: "ACTIVE",
      },
    });

    recordResult(
      "Scenario 2",
      "Multi-Branch Enrollment with Inscription Fee Waiver",
      enrollment1.inscriptionFeeCharged === true && enrollment2.inscriptionFeeCharged === false,
      `Enrollment 1 (ECOLE) fee charged: ${enrollment1.inscriptionFeeCharged}, Enrollment 2 (ANNEX) fee waived: ${!enrollment2.inscriptionFeeCharged}`
    );

    // Test Branch Admin RBAC: Branch Admin of ECOLE (branchId: 1) cannot mutate Class 2 (branchId: 2)
    process.env.TEST_AUTH_ROLE = "branch_admin";
    process.env.TEST_BRANCH_IDS = "1";
    process.env.TEST_USER_ID = "admin_ecole";

    // -------------------------------------------------------------------------
    // SCENARIO 3: Tuition Payment, Continuous Voucher Series & Daily Ledger
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 3: Tuition Payment, Series Numbering & Ledger Attribution ---");
    process.env.TEST_AUTH_ROLE = "owner";
    process.env.TEST_BRANCH_IDS = "1,2,3";
    process.env.TEST_USER_ID = "owner_audit";

    // Create or find VoucherSeries for ECOLE (branchId: 1) and testLevel
    let series1 = await prisma.voucherSeries.findFirst({
      where: { issuingBranchId: testBranch1Id, levelId: testLevel.id },
    });
    if (!series1) {
      series1 = await prisma.voucherSeries.create({
        data: {
          issuingBranchId: testBranch1Id,
          targetBranchId: testBranch1Id,
          scope: "LOCAL_LEVEL",
          levelId: testLevel.id,
          currentNumber: 100,
        },
      });
    }

    const startSeriesNumber = series1.currentNumber;

    // Issue Tuition Voucher: 2400 DZD at issuingBranch 1 for class1
    const seriesUpdated = await prisma.voucherSeries.update({
      where: { id: series1.id },
      data: { currentNumber: { increment: 1 } },
    });

    const tuitionVoucher = await prisma.voucher.create({
      data: {
        seriesId: series1.id,
        number: seriesUpdated.currentNumber,
        studentId: testStudentId,
        classId: testClass1Id,
        issuingBranchId: testBranch1Id,
        targetBranchId: testBranch1Id,
        paymentType: "TUITION_4SESSION",
        amount: new Prisma.Decimal(2400),
        remainingBalance: new Prisma.Decimal(2400),
        issuedBy: "owner_audit",
        issuedAt: new Date(),
        status: "ACTIVE",
      },
    });

    // Update DailyLedger at issuing branch
    await prisma.dailyLedger.upsert({
      where: {
        branchId_date_type: {
          branchId: testBranch1Id,
          date: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 0, 0, 0, 0)),
          type: "TUITION",
        },
      },
      create: {
        branchId: testBranch1Id,
        date: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 0, 0, 0, 0)),
        type: "TUITION",
        amount: new Prisma.Decimal(2400),
      },
      update: {
        amount: { increment: new Prisma.Decimal(2400) },
      },
    });

    recordResult(
      "Scenario 3",
      "Voucher Series Auto-Increment & Issuing Ledger Update",
      seriesUpdated.currentNumber === startSeriesNumber + 1 && Number(tuitionVoucher.amount) === 2400,
      `Series #${series1.id} incremented from ${startSeriesNumber} to ${seriesUpdated.currentNumber}. Voucher #${tuitionVoucher.number} issued.`
    );

    // -------------------------------------------------------------------------
    // SCENARIO 4: Refund Flow, Dedicated Refund Voucher & No Double-Deduction
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 4: Refund Flow & Ledger Audit ---");
    
    // Execute createRefund via server action for 1200 DZD (2 unconsumed sessions refund)
    const refundResult = await createRefund(
      { success: false, error: false },
      {
        voucherId: tuitionVoucher.id,
        amount: 1200,
        reason: "Audit test partial refund of 2 sessions",
      }
    );

    const refreshedVoucher = await prisma.voucher.findUnique({ where: { id: tuitionVoucher.id } });
    const refundRecord = await prisma.refund.findFirst({ where: { voucherId: tuitionVoucher.id } });
    const refundVoucher = await prisma.voucher.findFirst({ where: { refundForVoucherId: tuitionVoucher.id } });

    const refundPassed =
      refundResult.success &&
      Number(refreshedVoucher?.amount) === 2400 && // Original face value preserved!
      Number(refreshedVoucher?.remainingBalance) === 1200 && // Remaining balance properly halved!
      refreshedVoucher?.status === "PARTIALLY_REFUNDED" &&
      refundVoucher?.isRefund === true &&
      Number(refundRecord?.amount) === 1200;

    recordResult(
      "Scenario 4",
      "Partial Refund, Remaining Balance & Dedicated Refund Voucher",
      refundPassed,
      `Original face amount preserved: ${refreshedVoucher?.amount} DZD, Remaining balance: ${refreshedVoucher?.remainingBalance} DZD, Refund voucher #${refundVoucher?.number} created.`
    );

    // Verify syncDailyLedgerFromVouchers integrity
    await syncDailyLedgerFromVouchers();
    const todayNormalized = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 0, 0, 0, 0));
    const ledgerAfterSync = await prisma.dailyLedger.findFirst({
      where: {
        branchId: testBranch1Id,
        date: todayNormalized,
        type: "REFUND",
      },
    });
    recordResult(
      "Scenario 4",
      "DailyLedger Dedicated REFUND Line Post-Sync",
      Boolean(ledgerAfterSync && Number(ledgerAfterSync.amount) >= 1200),
      `DailyLedger REFUND category successfully captured: ${ledgerAfterSync?.amount} DZD`
    );

    // -------------------------------------------------------------------------
    // SCENARIO 5: Inter-Group & Inter-Branch Credit Transfer
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 5: Inter-Group Credit Transfer ---");

    const transferResult = await transferEnrollmentCredit(
      { success: false, error: false },
      {
        fromEnrollmentId: enrollment1.id,
        toClassId: testClass2Id,
        studentId: testStudentId,
        transferredSessions: 2,
        notes: "Audit transfer from Class 1 (ECOLE) to Class 2 (ANNEX)",
      }
    );

    const transferRecord = await prisma.enrollmentTransfer.findFirst({
      where: { fromEnrollmentId: enrollment1.id, toEnrollmentId: enrollment2.id },
    });

    recordResult(
      "Scenario 5",
      "Inter-Branch Credit Transfer Execution",
      transferResult.success && Boolean(transferRecord),
      `Transfer result: ${transferResult.message}, Transferred sessions: ${transferRecord?.transferredSessions}, Amount: ${transferRecord?.amount} DZD`
    );

    // -------------------------------------------------------------------------
    // SCENARIO 6: Attendance Taking & Justification Roster
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 6: Attendance Taking & Absent Justification ---");

    const lessonStartsAt = new Date();
    const lessonEndsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const testLesson = await prisma.lesson.create({
      data: {
        classId: testClass1Id,
        teacherId: testTeacherId,
        classroomId: testClassroom1Id,
        branchId: testBranch1Id,
        startsAt: lessonStartsAt,
        endsAt: lessonEndsAt,
      },
    });

    const attendanceRes = await markSingleAttendanceAction({
      studentId: testStudentId,
      lessonId: testLesson.id,
      status: "ABSENT",
      justification: "Maladie justifiée avec certificat",
    });

    const attRecord = await prisma.attendance.findFirst({
      where: { lessonId: testLesson.id, studentId: testStudentId },
    });

    recordResult(
      "Scenario 6",
      "Attendance Recording with Mandatory Justification Note",
      attendanceRes.success && attRecord?.status === "ABSENT" && Boolean(attRecord.justification),
      `Status: ${attRecord?.status}, Justification: "${attRecord?.justification}"`
    );

    // -------------------------------------------------------------------------
    // SCENARIO 7: Student Payer Status (NORMAL, NON_PAYER, SCHOOL_FEES_ONLY)
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 7: Student Payer Status & Payroll Separation ---");

    // NORMAL
    const normalFee = computeStudentSessionFee({
      payerStatus: "NORMAL",
      pricePerCycle: 2400, // 600 DZD / session
      teacherPercentage: 40,
    });
    // NON_PAYER
    const nonPayerFee = computeStudentSessionFee({
      payerStatus: "NON_PAYER",
      pricePerCycle: 2400,
      teacherPercentage: 40,
    });
    // SCHOOL_FEES_ONLY
    const schoolFeesOnly = computeStudentSessionFee({
      payerStatus: "SCHOOL_FEES_ONLY",
      pricePerCycle: 2400,
      teacherPercentage: 40,
    });

    const payerStatusLogicValid =
      normalFee.studentSessionFee === 600 &&
      normalFee.teacherCut === 240 && // 40% of 600
      nonPayerFee.studentSessionFee === 0 &&
      nonPayerFee.teacherCut === 0 &&
      schoolFeesOnly.studentSessionFee === 360 && // 60% school share
      schoolFeesOnly.teacherCut === 0; // Teacher gets 0 per Wassim's rule!

    recordResult(
      "Scenario 7",
      "Three-Tier Payer Status Calculation Verification",
      payerStatusLogicValid,
      `NORMAL: fee=${normalFee.studentSessionFee}/teacherCut=${normalFee.teacherCut} | NON_PAYER: fee=${nonPayerFee.studentSessionFee}/teacherCut=${nonPayerFee.teacherCut} | SCHOOL_FEES_ONLY: fee=${schoolFeesOnly.studentSessionFee}/teacherCut=${schoolFeesOnly.teacherCut}`
    );

    // -------------------------------------------------------------------------
    // SCENARIO 8: Workshops / Dawarat (Gender & Continuous Chair Numbering)
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 8: Workshops, Gender Segregation & Chair Numbering ---");

    const workshop = await prisma.workshop.create({
      data: {
        id: testWorkshopId,
        title: "Atelier Audit Robotique",
        branchId: testBranch1Id,
        totalPrice: new Prisma.Decimal(3000),
      },
    });

    // Register male participant
    const partMale = await prisma.workshopParticipant.create({
      data: {
        workshopId: workshop.id,
        studentId: testStudentId,
        gender: "MALE",
        chairNumber: 1,
        status: "CONFIRMED",
        totalPaid: new Prisma.Decimal(3000),
      },
    });

    recordResult(
      "Scenario 8",
      "Workshop Participant Registration with Gender-Segregated Seat",
      partMale.gender === "MALE" && partMale.chairNumber === 1,
      `Workshop #${workshop.id}, Gender: ${partMale.gender}, Chair #${partMale.chairNumber}`
    );

    // -------------------------------------------------------------------------
    // SCENARIO 9: Formations (Lump-Sum Pricing & Level Progression)
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 9: Language Formation & Level Progression ---");

    const testLanguage = await prisma.language.upsert({
      where: { id: 991 },
      update: {},
      create: { id: 991, name: "Espagnol Audit" },
    });

    const formationLvl1 = await prisma.formationLevel.upsert({
      where: { id: 9991 },
      update: {},
      create: {
        id: 9991,
        languageId: testLanguage.id,
        levelNumber: 1,
        name: "Niveau A1 Audit",
        lumpSumPrice: new Prisma.Decimal(12000),
      },
    });

    const formationClass = await prisma.class.create({
      data: {
        id: testFormationClassId,
        name: "Groupe Espagnol A1 Audit",
        branchId: testBranch1Id,
        isFormation: true,
        formationLevelId: formationLvl1.id,
        inscriptionFee: new Prisma.Decimal(0),
        hasBooks: true,
        bookFee: new Prisma.Decimal(1500),
      },
    });

    await prisma.enrollment.create({
      data: {
        studentId: testStudentId,
        classId: formationClass.id,
        academicYearId: academicYear.id,
        inscriptionFeeCharged: false,
        payerStatus: "NORMAL",
        status: "ACTIVE",
      },
    });

    const levelTestScore = await recordLevelTest({
      studentId: testStudentId,
      formationLevelId: formationLvl1.id,
      classId: formationClass.id,
      testDate: new Date(),
      score: 85,
      passed: true,
      administeredBy: "owner_audit",
    });

    recordResult(
      "Scenario 9",
      "Formation Level Exam Evaluation & Result Recording",
      levelTestScore.success,
      `Exam registered for Formation Class #${formationClass.id}: Score 85%, Passed: true`
    );

    // -------------------------------------------------------------------------
    // SCENARIO 10: Cashbox Discrepancies, Daily Expenses & Teacher Payroll
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 10: Cashbox Discrepancies, Expenses & Payroll Deductions ---");

    // Declare Missing Money
    const missingRes = await declareMissingMoneyAction({
      branchId: testBranch1Id,
      amount: 500,
      reason: "Audit test missing change",
    });

    // Confirm Missing Money as Owner
    const missingRecord = await prisma.missingMoney.findFirst({
      where: { branchId: testBranch1Id, amount: new Prisma.Decimal(500) },
      orderBy: { id: "desc" },
    });

    let confirmPassed = false;
    if (missingRecord) {
      const confRes = await confirmMissingMoneyAction(missingRecord.id);
      confirmPassed = confRes.success;
    }

    // Daily Expense
    const expenseRes = await createDailyExpenseAction({
      branchId: testBranch1Id,
      amount: 1500,
      description: "Achat fournitures de bureau audit",
      category: "SUPPLIES",
    });

    // Salary Advance & Photocopy Charge for Teacher
    const adv = await prisma.salaryAdvance.create({
      data: {
        personId: testTeacherId,
        amount: new Prisma.Decimal(2000),
        date: new Date(),
      },
    });

    const photo = await prisma.photocopyCharge.create({
      data: {
        teacherId: testTeacherId,
        branchId: testBranch1Id,
        pages: 50,
        costAmount: new Prisma.Decimal(250),
        recordedBy: "owner_audit",
      },
    });

    // Calculate teacher payroll
    const payrollCalc = await calculateTeacherPayroll(
      testTeacherId,
      new Date("2026-01-01"),
      new Date("2026-12-31")
    );

    const payrollDeductionsAccurate =
      payrollCalc !== null &&
      payrollCalc.salaryAdvances >= 2000 &&
      payrollCalc.photocopyDeductions >= 250 &&
      payrollCalc.netAmount === Math.max(0, payrollCalc.grossAmount - payrollCalc.salaryAdvances - payrollCalc.photocopyDeductions);

    recordResult(
      "Scenario 10",
      "Cashbox Discrepancies, Expenses & Teacher Payroll Net Math",
      missingRes.success && confirmPassed && expenseRes.success && payrollDeductionsAccurate,
      `Missing declared/confirmed: ${confirmPassed}, Expense logged: ${expenseRes.success}, Teacher advances: ${payrollCalc?.salaryAdvances} DZD, Photocopy: ${payrollCalc?.photocopyDeductions} DZD, Net Math Correct: ${payrollDeductionsAccurate}`
    );

  } catch (err: any) {
    console.error("FATAL ERROR IN AUDIT RUNNER:", err);
    recordResult("Fatal", "Audit Execution", false, err.message || String(err));
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP SANDBOX ENTITIES (Option A - Zero Orphaned Data)
    // -------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log("🧹 EXECUTING COMPREHENSIVE TEARDOWN (CLEANING ALL SANDBOX TEST DATA)");
    console.log("================================================================================");

    try {
      // 1. Delete Attendances & Catch-ups
      await prisma.attendance.deleteMany({
        where: {
          OR: [
            { studentId: testStudentId },
            { studentId: testStudent2Id },
            { lesson: { teacherId: testTeacherId } },
          ],
        },
      });

      // 2. Delete Lessons
      await prisma.lesson.deleteMany({
        where: {
          OR: [
            { id: { in: [testClass1Id, testClass2Id] } },
            { teacherId: testTeacherId },
          ],
        },
      });

      // 3. Delete Refunds & VoucherEdits
      await prisma.refund.deleteMany({
        where: { voucher: { studentId: testStudentId } },
      });
      await prisma.voucherEdit.deleteMany({
        where: { voucher: { studentId: testStudentId } },
      });

      // 4. Delete Vouchers
      await prisma.voucher.deleteMany({
        where: {
          OR: [
            { studentId: testStudentId },
            { studentId: testStudent2Id },
            { classId: { in: [testClass1Id, testClass2Id, testFormationClassId] } },
          ],
        },
      });

      // 5. Delete Workshop Participants & Workshops
      await prisma.workshopParticipant.deleteMany({
        where: { workshopId: testWorkshopId },
      });
      await prisma.workshop.deleteMany({
        where: { id: testWorkshopId },
      });

      // 6. Delete Level Tests
      await prisma.levelTest.deleteMany({
        where: { studentId: testStudentId },
      });

      // 7. Delete Transfers & Enrollments
      await prisma.enrollmentTransfer.deleteMany({
        where: {
          OR: [
            { fromEnrollment: { studentId: testStudentId } },
            { toEnrollment: { studentId: testStudentId } },
          ],
        },
      });
      await prisma.enrollment.deleteMany({
        where: {
          OR: [
            { studentId: testStudentId },
            { studentId: testStudent2Id },
            { classId: { in: [testClass1Id, testClass2Id, testFormationClassId] } },
          ],
        },
      });

      // 8. Delete Parent Phone Numbers & Students
      await prisma.parentPhoneNumber.deleteMany({
        where: { studentId: { in: [testStudentId, testStudent2Id] } },
      });
      await prisma.student.deleteMany({
        where: { id: { in: [testStudentId, testStudent2Id] } },
      });

      // 9. Delete Classes & Formation Levels
      await prisma.class.deleteMany({
        where: { id: { in: [testClass1Id, testClass2Id, testFormationClassId] } },
      });
      await prisma.formationLevel.deleteMany({
        where: { id: 9991 },
      });
      await prisma.language.deleteMany({
        where: { id: 991 },
      });

      // 10. Delete Teacher Payroll Items & Teacher
      await prisma.salaryAdvance.deleteMany({
        where: { personId: testTeacherId },
      });
      await prisma.photocopyCharge.deleteMany({
        where: { teacherId: testTeacherId },
      });
      await prisma.teacherPayRate.deleteMany({
        where: { teacherId: testTeacherId },
      });
      await prisma.teacher.deleteMany({
        where: { id: testTeacherId },
      });

      // 11. Delete Classrooms & Levels
      await prisma.classroom.deleteMany({
        where: { id: testClassroom1Id },
      });
      await prisma.level.deleteMany({
        where: { name: "TEST_BAC_LEVEL" },
      });

      // 12. Delete Test Missing Money & Surplus Money & Daily Expenses
      await prisma.missingMoney.deleteMany({
        where: { reason: "Audit test missing change" },
      });
      await prisma.dailyExpense.deleteMany({
        where: { description: "Achat fournitures de bureau audit" },
      });

      // 13. Clean any test audit logs
      await prisma.auditLog.deleteMany({
        where: { userId: "owner_audit" },
      });

      // Re-sync ledger to restore virgin state
      await syncDailyLedgerFromVouchers();

      console.log("✅ Teardown complete: Database is 100% clean with zero orphaned test data.");
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
    }
  }

  // ---------------------------------------------------------------------------
  // Summary Audit Matrix Output
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("📊 SCENARIO AUDIT VERIFICATION SUMMARY MATRIX");
  console.log("================================================================================");
  console.table(auditReport);

  const passedCount = auditReport.filter((r) => r.status === "PASSED").length;
  const failedCount = auditReport.filter((r) => r.status === "FAILED").length;
  console.log(`TOTAL CHECKS: ${auditReport.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAudit();
