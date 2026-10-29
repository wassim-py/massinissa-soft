import { prisma } from './lib/db';

const FRIDAY_CLASS_ID = 18;
const BAC_CLASS_IDS = [17, 18, 174];

// The 9 chronological lesson IDs for نذير 3ثانوي الجمعة:
// 04/09 (270), 09/09 (271), 13/09 (272), 16/09 (273), 20/09 (274), 02/10 (320), 09/10 (72), 16/10 (345), 23/10 (404)
const LESSON_IDS = [270, 271, 272, 273, 274, 320, 72, 345, 404];

type CellCode = 'P' | 'A' | 'N' | '-';

interface FriStudentRow {
  row: number;
  globalNumber: number;
  expectedName: string;
  enrollmentStatus: 'ACTIVE' | 'SUSPENDED';
  cells: [CellCode, CellCode, CellCode, CellCode, CellCode, CellCode, CellCode, CellCode, CellCode];
}

const FRIDAY_ROWS: FriStudentRow[] = [
  // Page 1 (Rows 1-25)
  { row: 1, globalNumber: 806, expectedName: 'حالية اسراء', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 2, globalNumber: 16, expectedName: 'مناصرية اخلاص', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 3, globalNumber: 843, expectedName: 'بن حمادي سيرين', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', 'P', 'P', 'P', 'P', 'P'] },
  { row: 4, globalNumber: 810, expectedName: 'فقراوي ياسمين', enrollmentStatus: 'ACTIVE', cells: ['-', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 5, globalNumber: 837, expectedName: 'المنصوري ريتاج', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'A'] },
  { row: 6, globalNumber: 820, expectedName: 'عبد الرحمن زهوة', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 7, globalNumber: 834, expectedName: 'بوحصان مريم', enrollmentStatus: 'ACTIVE', cells: ['-', '-', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 8, globalNumber: 830, expectedName: 'بوبربارة باية', enrollmentStatus: 'ACTIVE', cells: ['-', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 9, globalNumber: 851, expectedName: 'العاني رنيم', enrollmentStatus: 'ACTIVE', cells: ['-', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 10, globalNumber: 833, expectedName: 'العاني رونق', enrollmentStatus: 'ACTIVE', cells: ['-', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 11, globalNumber: 835, expectedName: 'بوربوحات محمد مصعب', enrollmentStatus: 'ACTIVE', cells: ['-', '-', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 12, globalNumber: 228, expectedName: 'قداري وسيم', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', 'P', 'P', 'P', 'P'] },
  { row: 13, globalNumber: 119, expectedName: 'غربي جمانة', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 14, globalNumber: 873, expectedName: 'محالي جيهان', enrollmentStatus: 'ACTIVE', cells: ['-', '-', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 15, globalNumber: 61, expectedName: 'عدوي صهيب', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 16, globalNumber: 110, expectedName: 'عكاشة عبد المؤمن', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 17, globalNumber: 878, expectedName: 'بوصبع وئام', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 18, globalNumber: 162, expectedName: 'مشاطي عبد المجيب', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 19, globalNumber: 1436, expectedName: 'زروال لجين', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'N', 'P', 'P'] },
  { row: 20, globalNumber: 142, expectedName: 'بعاج أسماء', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'A', 'A', 'P', 'P', 'P', 'P'] },
  { row: 21, globalNumber: 1712, expectedName: 'بن حملة  سامي', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'N', 'P', 'P'] },
  { row: 22, globalNumber: 1240, expectedName: 'مرابط  انس', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'P', 'P', 'P'] },
  { row: 23, globalNumber: 1241, expectedName: 'لطرش شيماء', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'P', 'P', 'P'] },
  { row: 24, globalNumber: 1697, expectedName: 'طشطاش هيام', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', '-', 'P', 'P'] },
  { row: 25, globalNumber: 1469, expectedName: 'لرقط انفال', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', '-', 'P', 'P'] },

  // Page 2 (Rows 27-28)
  { row: 27, globalNumber: 126, expectedName: 'زعتري طه', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'A', 'A', 'A'] },
  { row: 28, globalNumber: 870, expectedName: 'مالكي رقية', enrollmentStatus: 'ACTIVE', cells: ['-', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
];

const STATUS_MAP: Record<Exclude<CellCode, '-'>, string> = {
  P: 'PRESENT',
  A: 'ABSENT',
  N: 'NOT_DEFINED',
};

async function run(dryRun = true) {
  console.log(`=== ALIGNING نذير 3ثانوي الجمعة (Class 18) | dryRun=${dryRun} ===\n`);

  const globalNumbers = FRIDAY_ROWS.map((r) => r.globalNumber);
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

  for (const row of FRIDAY_ROWS) {
    const s = studentByGlobal.get(row.globalNumber);
    if (!s) {
      throw new Error(`Missing student in DB for row ${row.row}: #${row.globalNumber} ${row.expectedName}`);
    }
  }
  console.log(`✓ Verified all ${FRIDAY_ROWS.length} students exist in database.`);

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

  for (const row of FRIDAY_ROWS) {
    const s = studentByGlobal.get(row.globalNumber)!;
    const bacEnrollments = s.enrollments;

    const anyInscCharged = bacEnrollments.some((e) => e.inscriptionFeeCharged);
    const anyInscAmt = bacEnrollments.find((e) => e.inscriptionFeeAmount !== null)?.inscriptionFeeAmount ?? null;
    const earliestEnrolledAt = bacEnrollments.reduce(
      (min, e) => (e.enrolledAt < min ? e.enrolledAt : min),
      bacEnrollments[0]?.enrolledAt ?? new Date()
    );
    const preservedPayerStatus =
      bacEnrollments.find((e) => e.classId === FRIDAY_CLASS_ID)?.payerStatus ??
      bacEnrollments[0]?.payerStatus ??
      s.payerStatus;

    const friEnrollment = bacEnrollments.find((e) => e.classId === FRIDAY_CLASS_ID);
    const otherEnrollments = bacEnrollments.filter((e) => e.classId !== FRIDAY_CLASS_ID);

    if (friEnrollment) {
      for (const oe of otherEnrollments) redundantEnrollmentIdsToDelete.push(oe.id);
      if (
        friEnrollment.status !== row.enrollmentStatus ||
        friEnrollment.payerStatus !== preservedPayerStatus ||
        friEnrollment.inscriptionFeeCharged !== anyInscCharged ||
        friEnrollment.creditResetOffset !== 0
      ) {
        enrollmentUpdates.push({
          id: friEnrollment.id,
          data: {
            classId: FRIDAY_CLASS_ID,
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
          classId: FRIDAY_CLASS_ID,
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
    s.vouchers.filter((v) => v.classId !== FRIDAY_CLASS_ID).map((v) => v.id)
  );

  console.log(`Planned operations:`);
  console.log(`  - Enrollment updates:               ${enrollmentUpdates.length}`);
  console.log(`  - Redundant BAC enrollments delete: ${redundantEnrollmentIdsToDelete.length}`);
  console.log(`  - Vouchers to reassign to Class 18: ${voucherIdsToReassign.length}`);
  console.log(`  - Total Class 18 attendances set:   ${newAttendancesToCreate.length}`);

  if (!dryRun) {
    await prisma.$transaction(
      async (tx) => {
        // 1. Delete transfers strictly between Nadhir's BAC enrollments for these students
        const delTransfers = await tx.enrollmentTransfer.deleteMany({
          where: {
            fromEnrollment: { classId: { in: BAC_CLASS_IDS } },
            toEnrollment: { classId: { in: BAC_CLASS_IDS } },
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

        // 4. Reassign vouchers to Class 18
        if (voucherIdsToReassign.length > 0) {
          await tx.voucher.updateMany({
            where: { id: { in: voucherIdsToReassign } },
            data: { classId: FRIDAY_CLASS_ID },
          });
        }

        // 5. Delete CatchUpAttendance records for these 27 students in BAC classes
        const delCatchUps = await tx.catchUpAttendance.deleteMany({
          where: {
            studentId: { in: studentIds },
            OR: [
              { missedLesson: { classId: { in: BAC_CLASS_IDS } } },
              { catchUpLesson: { classId: { in: BAC_CLASS_IDS } } },
            ],
          },
        });

        // 6. Replace BAC attendances for these 27 students with exact Friday list attendances
        const delAtt = await tx.attendance.deleteMany({
          where: {
            studentId: { in: studentIds },
            lesson: { classId: { in: BAC_CLASS_IDS } },
          },
        });

        const createdAtt = await tx.attendance.createMany({
          data: newAttendancesToCreate,
        });

        console.log(`\n✓ APPLIED SUCCESSFULLY:`);
        console.log(`  - Transfers deleted:                ${delTransfers.count}`);
        console.log(`  - Redundant enrollments deleted:    ${redundantEnrollmentIdsToDelete.length}`);
        console.log(`  - Enrollments updated:              ${enrollmentUpdates.length}`);
        console.log(`  - Vouchers moved to Class 18:       ${voucherIdsToReassign.length}`);
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
