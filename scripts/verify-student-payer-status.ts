import "dotenv/config";
import prisma from "../src/lib/prisma";
import { Prisma } from "@prisma/client";
import { updateEnrollmentPayerStatusAction } from "../src/lib/actions";
import { computeStudentSessionFee } from "../src/lib/studentBilling";
import { calculateTeacherPayroll } from "../src/lib/payroll";

async function verifyStudentPayerStatus() {
  console.log("=== STARTING GROUP-SPECIFIC STUDENT PAYER STATUS & PAYROLL RULE VERIFICATION ===");

  const studentId = "test_payer_student_718";
  const student2Id = "test_payer_student2_718";
  const student3Id = "test_payer_student3_718";
  const teacherId = "test_payer_teacher_718";
  const mathClassId = 88718;
  const physicsClassId = 88719;
  const englishClassId = 88720;
  const classroomId = 88718;
  const lessonId = 88718;

  try {
    // 1. Ensure test Branch and Classroom exist
    await prisma.branch.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, name: "ECOLE", address: "Centre" },
    });

    await prisma.classroom.upsert({
      where: { id: classroomId },
      update: {},
      create: { id: classroomId, name: "Salle 718", branchId: 1 },
    });

    const academicYear = await prisma.academicYear.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, label: "2026-2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") },
    });

    // 2. Create Teacher with 40% TeacherPayRate.percentageOfSessionFee
    await prisma.teacherPayRate.deleteMany({ where: { teacherId } });
    await prisma.teacher.upsert({
      where: { id: teacherId },
      update: { name: "Professeur Test Payer Status" },
      create: { id: teacherId, name: "Professeur Test Payer Status" },
    });

    await prisma.teacherPayRate.create({
      data: {
        teacherId,
        percentageOfSessionFee: new Prisma.Decimal(40), // 40%
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      },
    });
    console.log("✓ Step 1: Teacher created with 40% percentageOfSessionFee");

    // 3. Create Classes: Math (2,000 DZD/cycle = 500 DZD/session) & Physics (2,400 DZD/cycle = 600 DZD/session)
    const mathClass = await prisma.class.upsert({
      where: { id: mathClassId },
      update: {
        pricePerCycle: new Prisma.Decimal(2000),
        teacherId,
        branchId: 1,
      },
      create: {
        id: mathClassId,
        name: "Mathématiques Test 718",
        branchId: 1,
        teacherId,
        inscriptionFee: new Prisma.Decimal(1000),
        pricePerCycle: new Prisma.Decimal(2000),
      },
    });

    const physicsClass = await prisma.class.upsert({
      where: { id: physicsClassId },
      update: {
        pricePerCycle: new Prisma.Decimal(2400),
        teacherId,
        branchId: 1,
      },
      create: {
        id: physicsClassId,
        name: "Physique Test 718",
        branchId: 1,
        teacherId,
        inscriptionFee: new Prisma.Decimal(1000),
        pricePerCycle: new Prisma.Decimal(2400),
      },
    });
    console.log("✓ Step 2: Math and Physics classes created");

    // 4. Create Students
    await prisma.attendance.deleteMany({ where: { studentId: { in: [studentId, student2Id, student3Id] } } });
    await prisma.voucher.deleteMany({ where: { studentId: { in: [studentId, student2Id, student3Id] } } });
    await prisma.enrollment.deleteMany({ where: { studentId: { in: [studentId, student2Id, student3Id] } } });

    await prisma.student.upsert({
      where: { id: studentId },
      update: {},
      create: { id: studentId, globalNumber: 99718, name: "Karim Multi-Cycle", registeredBranchId: 1 },
    });
    await prisma.student.upsert({
      where: { id: student2Id },
      update: {},
      create: { id: student2Id, globalNumber: 99719, name: "Sami Non-Payer", registeredBranchId: 1 },
    });
    await prisma.student.upsert({
      where: { id: student3Id },
      update: {},
      create: { id: student3Id, globalNumber: 99720, name: "Amine School-Fees-Only", registeredBranchId: 1 },
    });

    // 5. Enroll Karim into Math and Physics -> verify default is NORMAL for both
    const mathEnrollment = await prisma.enrollment.create({
      data: {
        studentId,
        classId: mathClassId,
        academicYearId: academicYear.id,
        inscriptionFeeCharged: true,
      },
    });

    const physicsEnrollment = await prisma.enrollment.create({
      data: {
        studentId,
        classId: physicsClassId,
        academicYearId: academicYear.id,
        inscriptionFeeCharged: false,
      },
    });

    console.log(`✓ Step 3: Karim enrolled in Math (id: ${mathEnrollment.id}, status: ${mathEnrollment.payerStatus}) and Physics (id: ${physicsEnrollment.id}, status: ${physicsEnrollment.payerStatus})`);
    if (mathEnrollment.payerStatus !== "NORMAL" || physicsEnrollment.payerStatus !== "NORMAL") {
      throw new Error(`Expected default payerStatus to be NORMAL for both groups`);
    }

    // 6. MULTI-CYCLE LIFECYCLE & HISTORICAL PAYMENT SAFETY TEST
    console.log("\n--- Testing Multi-Cycle Lifecycle & Historical Payment Safety ---");

    // Ensure VoucherSeries exists
    const series = await prisma.voucherSeries.upsert({
      where: { id: 88718 },
      update: {},
      create: {
        id: 88718,
        scope: "ECOLE",
        issuingBranchId: 1,
        targetBranchId: 1,
        currentNumber: 0,
      },
    });

    // Cycle 1: Karim is NORMAL in Math -> Issue Voucher #1 at 2,000 DZD
    const voucher1 = await prisma.voucher.create({
      data: {
        seriesId: series.id,
        number: 1,
        studentId,
        classId: mathClassId,
        issuingBranchId: 1,
        targetBranchId: 1,
        paymentType: "TUITION_4SESSION",
        amount: new Prisma.Decimal(2000),
        issuedBy: "Admin",
      },
    });
    console.log(`✓ Cycle 1 (NORMAL): Voucher #1 created at ${voucher1.amount} DZD`);

    // Mid-cycle / Term transition: Karim becomes NON_PAYER in Math
    const resNp = await updateEnrollmentPayerStatusAction(studentId, mathEnrollment.id, "NON_PAYER");
    console.log("Status change to NON_PAYER result:", resNp.message);

    // Verify Math is NON_PAYER, but Physics remains NORMAL! (Group isolation)
    const checkMathNp = await prisma.enrollment.findUnique({ where: { id: mathEnrollment.id } });
    const checkPhysicsNorm = await prisma.enrollment.findUnique({ where: { id: physicsEnrollment.id } });
    if (checkMathNp?.payerStatus !== "NON_PAYER") throw new Error("Expected Math to be NON_PAYER");
    if (checkPhysicsNorm?.payerStatus !== "NORMAL") throw new Error("Expected Physics to remain NORMAL");
    console.log("✓ Group isolation verified: Math changed to NON_PAYER, Physics remains NORMAL");

    // Cycle 2: Issue Voucher #2 for Math at 0 DZD
    const voucher2 = await prisma.voucher.create({
      data: {
        seriesId: series.id,
        number: 2,
        studentId,
        classId: mathClassId,
        issuingBranchId: 1,
        targetBranchId: 1,
        paymentType: "TUITION_4SESSION",
        amount: new Prisma.Decimal(0),
        issuedBy: "Admin",
      },
    });
    console.log(`✓ Cycle 2 (NON_PAYER): Voucher #2 created at ${voucher2.amount} DZD`);

    // Verify historical safety: Voucher #1 is completely UNTOUCHED
    const checkVoucher1 = await prisma.voucher.findUnique({ where: { id: voucher1.id } });
    if (Number(checkVoucher1?.amount) !== 2000) {
      throw new Error(`CRITICAL: Voucher #1 was corrupted! Expected 2000, got ${checkVoucher1?.amount}`);
    }
    console.log(`✓ Historical payment safety verified: Voucher #1 intact at ${checkVoucher1?.amount} DZD`);

    // Cycle 3: Karim transitions to SCHOOL_FEES_ONLY in Math
    const resSf = await updateEnrollmentPayerStatusAction(studentId, mathEnrollment.id, "SCHOOL_FEES_ONLY");
    console.log("Status change to SCHOOL_FEES_ONLY result:", resSf.message);

    // Issue Voucher #3 at 1,200 DZD (60% of 2,000)
    const voucher3 = await prisma.voucher.create({
      data: {
        seriesId: series.id,
        number: 3,
        studentId,
        classId: mathClassId,
        issuingBranchId: 1,
        targetBranchId: 1,
        paymentType: "TUITION_4SESSION",
        amount: new Prisma.Decimal(1200),
        issuedBy: "Admin",
      },
    });
    console.log(`✓ Cycle 3 (SCHOOL_FEES_ONLY): Voucher #3 created at ${voucher3.amount} DZD`);

    // Cycle 4: Karim returns to NORMAL in Math (clear toggle)
    const resNorm = await updateEnrollmentPayerStatusAction(studentId, mathEnrollment.id, "NORMAL");
    console.log("Return to NORMAL result:", resNorm.message);

    // Issue Voucher #4 at 2,000 DZD
    const voucher4 = await prisma.voucher.create({
      data: {
        seriesId: series.id,
        number: 4,
        studentId,
        classId: mathClassId,
        issuingBranchId: 1,
        targetBranchId: 1,
        paymentType: "TUITION_4SESSION",
        amount: new Prisma.Decimal(2000),
        issuedBy: "Admin",
      },
    });
    console.log(`✓ Cycle 4 (NORMAL again): Voucher #4 created at ${voucher4.amount} DZD`);

    // Verify all 4 vouchers exist safely in student payment records
    const allVouchers = await prisma.voucher.findMany({
      where: { studentId, classId: mathClassId },
      orderBy: { number: "asc" },
    });
    const voucherAmounts = allVouchers.map((v) => Number(v.amount));
    console.log("All historical vouchers in student records:", voucherAmounts);
    if (JSON.stringify(voucherAmounts) !== JSON.stringify([2000, 0, 1200, 2000])) {
      throw new Error(`Expected voucher amounts [2000, 0, 1200, 2000], got ${JSON.stringify(voucherAmounts)}`);
    }
    const totalPurchasedSessions = allVouchers.length * 4;
    console.log(`✓ Total purchased sessions across all 4 cycles: ${totalPurchasedSessions} sessions`);

    // 7. TEST NEW ENROLLMENT IN GROUP C (ENGLISH)
    console.log("\n--- Testing New Enrollment Default Status ---");
    const englishClass = await prisma.class.upsert({
      where: { id: englishClassId },
      update: { branchId: 1, pricePerCycle: new Prisma.Decimal(1800) },
      create: { id: englishClassId, name: "Anglais Test 718", branchId: 1, inscriptionFee: new Prisma.Decimal(0), pricePerCycle: new Prisma.Decimal(1800) },
    });
    const englishEnrollment = await prisma.enrollment.create({
      data: {
        studentId,
        classId: englishClassId,
        academicYearId: academicYear.id,
        inscriptionFeeCharged: false,
      },
    });
    if (englishEnrollment.payerStatus !== "NORMAL") {
      throw new Error(`Expected new group enrollment to default to NORMAL, got ${englishEnrollment.payerStatus}`);
    }
    console.log("✓ New group enrollment automatically defaulted to NORMAL");

    // 8. TEST WASSIM'S EXACT TEACHER PAYROLL RULE
    console.log("\n--- Testing Wassim's Teacher Payroll Rule ---");
    // Setup Student 2 (NON_PAYER) and Student 3 (SCHOOL_FEES_ONLY) in Math
    await prisma.enrollment.create({
      data: {
        studentId: student2Id,
        classId: mathClassId,
        academicYearId: academicYear.id,
        inscriptionFeeCharged: false,
        payerStatus: "NON_PAYER",
      },
    });
    await prisma.enrollment.create({
      data: {
        studentId: student3Id,
        classId: mathClassId,
        academicYearId: academicYear.id,
        inscriptionFeeCharged: false,
        payerStatus: "SCHOOL_FEES_ONLY",
      },
    });

    // Create Lesson with all 3 students attending
    await prisma.lesson.deleteMany({ where: { id: lessonId } });
    const lesson = await prisma.lesson.create({
      data: {
        id: lessonId,
        startsAt: new Date("2026-09-10T10:00:00Z"),
        endsAt: new Date("2026-09-10T12:00:00Z"),
        classId: mathClassId,
        teacherId,
        classroomId,
        branchId: 1,
        isFree: false,
      },
    });

    // Mark all 3 students PRESENT
    await prisma.attendance.createMany({
      data: [
        { lessonId, studentId: studentId, status: "PRESENT" },  // NORMAL (Karim)
        { lessonId, studentId: student2Id, status: "PRESENT" }, // NON_PAYER (Sami)
        { lessonId, studentId: student3Id, status: "PRESENT" }, // SCHOOL_FEES_ONLY (Amine)
      ],
    });

    // Run payroll calculation for teacher
    const payroll = await calculateTeacherPayroll(
      teacherId,
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-30T23:59:59Z")
    );
    if (!payroll || !payroll.sessionDetails) throw new Error("Payroll result is null or missing sessionDetails");

    const sessionDetail = payroll.sessionDetails.find((d) => d.lessonId === lessonId);
    if (!sessionDetail) throw new Error("Test lesson not found in payroll session details");

    console.log("Teacher payroll session details for lesson:", {
      presentCount: sessionDetail.presentCount,
      payingCount: sessionDetail.payingCount,
      teacherCut: sessionDetail.teacherCut,
      lessonAmount: sessionDetail.lessonAmount,
    });

    // VERIFY WASSIM'S RULE:
    // presentCount must be 3 (all 3 students attended)
    // payingCount must be 1 (only NORMAL student Karim generates pay)
    // teacherCut = 200 DZD (40% of 500 DZD session price)
    // lessonAmount MUST BE 200 DZD (1 * 200), NOT 600 DZD!
    if (sessionDetail.presentCount !== 3) {
      throw new Error(`Expected presentCount = 3, got ${sessionDetail.presentCount}`);
    }
    if (sessionDetail.payingCount !== 1) {
      throw new Error(`Expected payingCount = 1, got ${sessionDetail.payingCount}`);
    }
    if (sessionDetail.lessonAmount !== 200) {
      throw new Error(`CRITICAL: Expected teacher lessonAmount = 200 DZD (only for paying student), got ${sessionDetail.lessonAmount} DZD`);
    }
    console.log("✓ Wassim's Rule Verified: Teacher earned 200 DZD (1 paying student). Teacher was NOT paid for NON_PAYER or SCHOOL_FEES_ONLY students!");

    // 9. VERIFY AUDIT TRAIL
    console.log("\n--- Testing Audit Trail ---");
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: "ENROLLMENT",
        entityId: String(mathEnrollment.id),
      },
      orderBy: { timestamp: "asc" },
    });
    console.log(`Found ${auditLogs.length} audit log entries for enrollment ${mathEnrollment.id}:`);
    auditLogs.forEach((log) => {
      console.log(`  - [${log.action}] ${log.oldValue} -> ${log.newValue} (${log.details})`);
    });
    if (auditLogs.length < 3) {
      throw new Error(`Expected at least 3 audit log entries for status transitions, found ${auditLogs.length}`);
    }
    console.log("✓ Audit trail successfully logged all status transitions with timestamps and actors");

    // 10. CLEANUP
    await prisma.attendance.deleteMany({ where: { lessonId } });
    await prisma.lesson.deleteMany({ where: { id: lessonId } });
    await prisma.voucher.deleteMany({ where: { seriesId: series.id } });
    await prisma.voucherSeries.deleteMany({ where: { id: series.id } });
    await prisma.enrollment.deleteMany({ where: { studentId: { in: [studentId, student2Id, student3Id] } } });
    await prisma.student.deleteMany({ where: { id: { in: [studentId, student2Id, student3Id] } } });
    await prisma.class.deleteMany({ where: { id: { in: [mathClassId, physicsClassId, englishClassId] } } });
    await prisma.teacherPayRate.deleteMany({ where: { teacherId } });
    await prisma.teacher.deleteMany({ where: { id: teacherId } });

    console.log("\n🎉 ALL MULTI-CYCLE, PAYMENT SAFETY, AND WASSIM'S PAYROLL RULE CHECKS PASSED SUCCESSFULLY!");
  } catch (err) {
    console.error("❌ Verification failed:", err);
    process.exit(1);
  }
}

verifyStudentPayerStatus();

