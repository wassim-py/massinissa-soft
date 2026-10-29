import { prisma } from './lib/db';

const SATURDAY_CLASS_ID = 17;
const BAC_CLASS_IDS = [17, 18, 174];

// The 9 chronological lesson IDs for نذير 3ثانوي السبت:
// 04/09 (276), 09/09 (277), 13/09 (278), 16/09 (279), 20/09 (280), 03/10 (281), 10/10 (282), 17/10 (508), 24/10 (521)
const LESSON_IDS = [276, 277, 278, 279, 280, 281, 282, 508, 521];

type CellCode = 'P' | 'A' | 'N' | '-';

interface SatStudentRow {
  row: number;
  globalNumber: number;
  expectedName: string;
  enrollmentStatus: 'ACTIVE' | 'SUSPENDED';
  cells: [CellCode, CellCode, CellCode, CellCode, CellCode, CellCode, CellCode, CellCode, CellCode];
}

const SATURDAY_ROWS: SatStudentRow[] = [
  // Page 1 (Rows 1-25, Row 12 is duplicate of Row 62)
  { row: 1, globalNumber: 10, expectedName: 'محروق سيد أحمد', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 2, globalNumber: 23, expectedName: 'تليلاني بشرى', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 3, globalNumber: 807, expectedName: 'علمي صوفيا', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 4, globalNumber: 808, expectedName: 'عيساني ميار', enrollmentStatus: 'ACTIVE', cells: ['N', 'N', 'N', 'N', 'P', 'P', 'P', 'P', 'P'] },
  { row: 5, globalNumber: 816, expectedName: 'بن سقسلي لينا', enrollmentStatus: 'ACTIVE', cells: ['P', 'A', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 6, globalNumber: 817, expectedName: 'مسبوط شهرزاد', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'A'] },
  { row: 7, globalNumber: 819, expectedName: 'طوبال عفاف', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 8, globalNumber: 821, expectedName: 'بوغدة شمس الدين', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 9, globalNumber: 825, expectedName: 'طواهري حسناء', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'A', 'P'] },
  { row: 10, globalNumber: 822, expectedName: 'ميهوبي عبد الباري', enrollmentStatus: 'ACTIVE', cells: ['P', 'A', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 11, globalNumber: 827, expectedName: 'ربايعية رتاج', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  // Row 12 -> moved to Row 62 (#828 شطابي لجين)
  { row: 13, globalNumber: 839, expectedName: 'مفتاح سندس', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', 'P', 'P', 'P', 'P', 'P'] },
  { row: 14, globalNumber: 380, expectedName: 'سمان ولاء', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', 'P', 'P', 'P', 'P', 'P'] },
  { row: 15, globalNumber: 845, expectedName: 'بونعاس ريم', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', 'N', 'P', 'P', 'P'] },
  { row: 16, globalNumber: 850, expectedName: 'بعزيز اية', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', 'P', 'P', 'P', 'P'] },
  { row: 17, globalNumber: 157, expectedName: 'قاولي نهال', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 18, globalNumber: 118, expectedName: 'بلبعلي ندى', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 19, globalNumber: 129, expectedName: 'فداوي نارادين', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 20, globalNumber: 117, expectedName: 'بن عمارة هبة الله', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 21, globalNumber: 856, expectedName: 'لوصيف أمينة وصال', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 22, globalNumber: 857, expectedName: 'حميمص هبة الرحمان', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 23, globalNumber: 858, expectedName: 'حبيباتي آية الرحمان', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 24, globalNumber: 133, expectedName: 'سليمي اسراء', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 25, globalNumber: 135, expectedName: 'زويد اسكندر وسيم', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'A'] },

  // Page 2 (Rows 27-52, Row 31 #1418 صراب تسنيم is crossed out for Tuesday)
  { row: 27, globalNumber: 859, expectedName: 'خالص أيمن', enrollmentStatus: 'ACTIVE', cells: ['-', 'P', 'A', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 28, globalNumber: 122, expectedName: 'بلقاسم أمة الله', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 29, globalNumber: 875, expectedName: 'موالدي تسنيم', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 30, globalNumber: 861, expectedName: 'لعروق الاء', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  // Row 31 -> #1418 صراب تسنيم (Tuesday)
  { row: 32, globalNumber: 863, expectedName: 'دوبابي محمد مهدي', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 33, globalNumber: 125, expectedName: 'هدواس لجين', enrollmentStatus: 'ACTIVE', cells: ['-', '-', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 34, globalNumber: 28, expectedName: 'غزال ملاك', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'A', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 35, globalNumber: 811, expectedName: 'غيموز لينا', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 36, globalNumber: 860, expectedName: 'بولتين ندير', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 37, globalNumber: 877, expectedName: 'نكاع سارة', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 38, globalNumber: 167, expectedName: 'مريبعي معاذ', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 39, globalNumber: 846, expectedName: 'لقرون حسام', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', 'P', 'P', 'P', 'P'] },
  { row: 40, globalNumber: 847, expectedName: 'دبش نسيم', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', 'P', 'P', 'P', 'P'] },
  { row: 41, globalNumber: 848, expectedName: 'بوداروي نوفل', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', 'P', 'P', 'P', 'P'] },
  { row: 42, globalNumber: 849, expectedName: 'عايب ايناس', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', 'P', 'P', 'P', 'P'] },
  { row: 43, globalNumber: 163, expectedName: 'كرميش ايمان', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', 'P', 'P', 'P', 'P'] },
  { row: 44, globalNumber: 1713, expectedName: 'ساعي محمد', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'P', 'P', 'P'] },
  { row: 45, globalNumber: 1354, expectedName: 'بورنان لميس', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'P', 'P', 'P'] },
  { row: 46, globalNumber: 58, expectedName: 'رميشي لجين', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'P', 'P', 'P'] },
  { row: 47, globalNumber: 1690, expectedName: 'خلاف بلسم', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', 'N', 'N', 'N', 'A'] },
  { row: 48, globalNumber: 1352, expectedName: 'عطاب مروة', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'P', 'P', 'P'] },
  { row: 49, globalNumber: 1686, expectedName: 'لقواسم ملاك', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'N', 'N', 'A'] },
  { row: 50, globalNumber: 1358, expectedName: 'خطيب كوثر', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'P', 'P', 'P'] },
  { row: 51, globalNumber: 1359, expectedName: 'محروق مرام', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'N', 'P', 'P'] },
  { row: 52, globalNumber: 12, expectedName: 'طلحي مرام', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'N', 'N', 'P', 'P', 'P'] },

  // Page 3 (Rows 53-74, Row 70 is blank)
  { row: 53, globalNumber: 20, expectedName: 'بن عبيد ألاء الرحمان', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'N', 'N', 'P', 'P', 'P'] },
  { row: 54, globalNumber: 1704, expectedName: 'بركات علاء', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'P', 'P', 'A'] },
  { row: 55, globalNumber: 1360, expectedName: 'بوزازل رنيم', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'P', 'P', 'A'] },
  { row: 56, globalNumber: 1516, expectedName: 'رمضاني اريج', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'N', 'N', 'N'] },
  { row: 57, globalNumber: 100, expectedName: 'حمادو هديل', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', '-', '-', 'P'] },
  { row: 58, globalNumber: 1558, expectedName: 'سدراية نور الهدى', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', '-', 'P', 'A'] },
  { row: 59, globalNumber: 1563, expectedName: 'بن زوة  لؤي', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', '-', 'P', 'P'] },
  { row: 60, globalNumber: 1564, expectedName: 'دغداق عبد الرؤوف', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', '-', 'P', 'P'] },
  { row: 61, globalNumber: 1565, expectedName: 'عليلي امينة', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', '-', 'P', 'P'] },
  { row: 62, globalNumber: 828, expectedName: 'شطابي لجين', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'A'] },
  { row: 63, globalNumber: 871, expectedName: 'بن والي تميم', enrollmentStatus: 'ACTIVE', cells: ['-', '-', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 64, globalNumber: 864, expectedName: 'بوشاقور عبد الوكيل', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 65, globalNumber: 1566, expectedName: 'شلي معتصم بالله', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', '-', 'P', 'P'] },
  { row: 66, globalNumber: 838, expectedName: 'حلفاوي غزلان', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', 'P', 'P', 'P', 'P', 'A'] },
  { row: 67, globalNumber: 370, expectedName: 'شوقي رغد مفيدة', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 68, globalNumber: 1654, expectedName: 'سدراتي امال', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', '-', '-', 'A'] },
  { row: 69, globalNumber: 501, expectedName: 'العرباوي ايناس', enrollmentStatus: 'SUSPENDED', cells: ['P', 'P', 'P', 'P', 'P', 'A', 'A', 'A', 'A'] },
  { row: 71, globalNumber: 813, expectedName: 'عتيق سراج عبد المعز', enrollmentStatus: 'SUSPENDED', cells: ['P', 'P', 'P', 'P', 'P', 'A', 'A', 'A', 'A'] },
  { row: 72, globalNumber: 500, expectedName: 'دولة أريج', enrollmentStatus: 'SUSPENDED', cells: ['P', 'A', 'P', 'P', 'P', 'A', 'A', 'A', 'A'] },
  { row: 73, globalNumber: 1642, expectedName: 'لعطالة انيس', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', '-', '-', 'P'] },
  { row: 74, globalNumber: 1645, expectedName: 'شلوق عبد الصمد', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', '-', '-', 'P'] },
];

const STATUS_MAP: Record<Exclude<CellCode, '-'>, string> = {
  P: 'PRESENT',
  A: 'ABSENT',
  N: 'NOT_DEFINED',
};

async function run(dryRun = true) {
  console.log(`=== ALIGNING نذير 3ثانوي السبت (Class 17) | dryRun=${dryRun} ===\n`);

  const globalNumbers = SATURDAY_ROWS.map((r) => r.globalNumber);
  const students = await prisma.student.findMany({
    where: { globalNumber: { in: globalNumbers } },
    include: {
      enrollments: {
        where: { classId: { in: BAC_CLASS_IDS } },
      },
      vouchers: {
        where: { classId: { in: BAC_CLASS_IDS } },
      },
      attendances: {
        where: { lesson: { classId: { in: BAC_CLASS_IDS } } },
      },
    },
  });

  const studentByGlobal = new Map(students.map((s) => [s.globalNumber, s]));
  const studentIds = students.map((s) => s.id);
  const allBacEnrollmentIds = students.flatMap((s) => s.enrollments.map((e) => e.id));

  // Verify all 70 exist
  for (const row of SATURDAY_ROWS) {
    const s = studentByGlobal.get(row.globalNumber);
    if (!s) {
      throw new Error(`Missing student in DB for row ${row.row}: #${row.globalNumber} ${row.expectedName}`);
    }
  }
  console.log(`✓ Verified all ${SATURDAY_ROWS.length} students exist in database.`);

  // Prepare bulk operations
  const redundantEnrollmentIdsToDelete: number[] = [];
  const enrollmentUpdates: Array<{
    id: number;
    data: {
      classId: number;
      status: string;
      payerStatus: string;
      inscriptionFeeCharged: boolean;
      inscriptionFeeAmount: any;
      enrolledAt: Date;
      creditResetOffset: number;
    };
  }> = [];

  const newAttendancesToCreate: Array<{
    studentId: string;
    lessonId: number;
    status: string;
    justification: string | null;
  }> = [];

  for (const row of SATURDAY_ROWS) {
    const s = studentByGlobal.get(row.globalNumber)!;
    const bacEnrollments = s.enrollments;

    const anyInscCharged = bacEnrollments.some((e) => e.inscriptionFeeCharged);
    const anyInscAmt = bacEnrollments.find((e) => e.inscriptionFeeAmount !== null)?.inscriptionFeeAmount ?? null;
    const earliestEnrolledAt = bacEnrollments.reduce(
      (min, e) => (e.enrolledAt < min ? e.enrolledAt : min),
      bacEnrollments[0]?.enrolledAt ?? new Date()
    );
    const preservedPayerStatus =
      bacEnrollments.find((e) => e.classId === SATURDAY_CLASS_ID)?.payerStatus ??
      bacEnrollments[0]?.payerStatus ??
      s.payerStatus;

    const satEnrollment = bacEnrollments.find((e) => e.classId === SATURDAY_CLASS_ID);
    const otherEnrollments = bacEnrollments.filter((e) => e.classId !== SATURDAY_CLASS_ID);

    if (satEnrollment) {
      for (const oe of otherEnrollments) redundantEnrollmentIdsToDelete.push(oe.id);
      if (
        satEnrollment.status !== row.enrollmentStatus ||
        satEnrollment.payerStatus !== preservedPayerStatus ||
        satEnrollment.inscriptionFeeCharged !== anyInscCharged ||
        satEnrollment.creditResetOffset !== 0
      ) {
        enrollmentUpdates.push({
          id: satEnrollment.id,
          data: {
            classId: SATURDAY_CLASS_ID,
            status: row.enrollmentStatus,
            payerStatus: preservedPayerStatus,
            inscriptionFeeCharged: anyInscCharged,
            inscriptionFeeAmount: anyInscAmt,
            enrolledAt: earliestEnrolledAt,
            creditResetOffset: 0,
          },
        });
      }
    } else if (otherEnrollments.length > 0) {
      const primaryOther = otherEnrollments[0];
      for (const oe of otherEnrollments.slice(1)) redundantEnrollmentIdsToDelete.push(oe.id);
      enrollmentUpdates.push({
        id: primaryOther.id,
        data: {
          classId: SATURDAY_CLASS_ID,
          status: row.enrollmentStatus,
          payerStatus: preservedPayerStatus,
          inscriptionFeeCharged: anyInscCharged,
          inscriptionFeeAmount: anyInscAmt,
          enrolledAt: earliestEnrolledAt,
          creditResetOffset: 0,
        },
      });
    }

    for (let i = 0; i < LESSON_IDS.length; i++) {
      const lessonId = LESSON_IDS[i];
      const cell = row.cells[i];
      if (cell !== '-') {
        const existingAtt = s.attendances.find((a) => a.lessonId === lessonId);
        newAttendancesToCreate.push({
          studentId: s.id,
          lessonId,
          status: STATUS_MAP[cell],
          justification: cell === 'N' ? (existingAtt?.justification || 'الفا') : null,
        });
      }
    }
  }

  const voucherIdsToReassign = students.flatMap((s) =>
    s.vouchers.filter((v) => v.classId !== SATURDAY_CLASS_ID).map((v) => v.id)
  );

  console.log(`Planned operations:`);
  console.log(`  - Enrollment updates:               ${enrollmentUpdates.length}`);
  console.log(`  - Redundant BAC enrollments delete: ${redundantEnrollmentIdsToDelete.length}`);
  console.log(`  - Vouchers to reassign to Class 17: ${voucherIdsToReassign.length}`);
  console.log(`  - Total Class 17 attendances set:   ${newAttendancesToCreate.length}`);

  if (!dryRun) {
    await prisma.$transaction(
      async (tx) => {
        // 1. Delete transfers involving any of these 70 students' BAC enrollments
        const delTransfers = await tx.enrollmentTransfer.deleteMany({
          where: {
            OR: [
              { fromEnrollmentId: { in: allBacEnrollmentIds } },
              { toEnrollmentId: { in: allBacEnrollmentIds } },
            ],
          },
        });

        // 2. Delete redundant enrollments in other BAC groups
        if (redundantEnrollmentIdsToDelete.length > 0) {
          await tx.enrollment.deleteMany({
            where: { id: { in: redundantEnrollmentIdsToDelete } },
          });
        }

        // 3. Update enrollments needing changes
        for (const u of enrollmentUpdates) {
          await tx.enrollment.update({
            where: { id: u.id },
            data: u.data,
          });
        }

        // 4. Reassign vouchers to Class 17
        if (voucherIdsToReassign.length > 0) {
          await tx.voucher.updateMany({
            where: { id: { in: voucherIdsToReassign } },
            data: { classId: SATURDAY_CLASS_ID },
          });
        }

        // 5. Delete CatchUpAttendance records for these 70 students in BAC classes
        const delCatchUps = await tx.catchUpAttendance.deleteMany({
          where: {
            studentId: { in: studentIds },
            OR: [
              { missedLesson: { classId: { in: BAC_CLASS_IDS } } },
              { catchUpLesson: { classId: { in: BAC_CLASS_IDS } } },
            ],
          },
        });

        // 6. Delete existing BAC attendances for these 70 students and bulk insert exact aligned attendances
        const delAtt = await tx.attendance.deleteMany({
          where: {
            studentId: { in: studentIds },
            lesson: { classId: { in: BAC_CLASS_IDS } },
          },
        });

        const createdAtt = await tx.attendance.createMany({
          data: newAttendancesToCreate,
        });

        // 7. Delete duplicate empty lesson #507 on 2026-10-10 in Class 17 if it has 0 attendances
        const lesson507Count = await tx.attendance.count({ where: { lessonId: 507 } });
        if (lesson507Count === 0) {
          await tx.lesson.deleteMany({ where: { id: 507, classId: SATURDAY_CLASS_ID } });
        }

        console.log(`\n✓ APPLIED SUCCESSFULLY:`);
        console.log(`  - Transfers deleted:                ${delTransfers.count}`);
        console.log(`  - Redundant enrollments deleted:    ${redundantEnrollmentIdsToDelete.length}`);
        console.log(`  - Enrollments updated:              ${enrollmentUpdates.length}`);
        console.log(`  - Vouchers moved to Class 17:       ${voucherIdsToReassign.length}`);
        console.log(`  - CatchUp records deleted:          ${delCatchUps.count}`);
        console.log(`  - Old BAC attendances replaced:     ${delAtt.count} -> ${createdAtt.count}`);
      },
      { maxWait: 30000, timeout: 60000 }
    );
  }
}

const isApply = process.argv.includes('--apply');
run(!isApply)
  .catch(console.error)
  .finally(() => process.exit(0));
