import { prisma } from './lib/db';

const TEACHER_ID = '1afdbbc0-7831-4c22-b90f-0a444486cf5a';
const TUESDAY_CLASS_ID = 174;
const BAC_CLASS_IDS = [17, 18, 174];

type CellCode = 'P' | 'A' | 'N' | '-';

interface TueStudentRow {
  row: number;
  globalNumber: number;
  expectedName: string;
  enrollmentStatus: 'ACTIVE' | 'SUSPENDED';
  // 10 lessons: 04/09, 09/09, 13/09, 16/09, 20/09, 29/09, 06/10, 13/10, 20/10, 27/10
  cells: [CellCode, CellCode, CellCode, CellCode, CellCode, CellCode, CellCode, CellCode, CellCode, CellCode];
}

const TUESDAY_ROWS: TueStudentRow[] = [
  // Page 1 (Rows 1-25, Row 9 #828 شطابي لجين is in Saturday)
  { row: 1, globalNumber: 9, expectedName: 'فراجة هيام', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 2, globalNumber: 526, expectedName: 'نعيجة جيهان', enrollmentStatus: 'ACTIVE', cells: ['-', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 3, globalNumber: 80, expectedName: 'فرحات ريم', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'A'] },
  { row: 4, globalNumber: 812, expectedName: 'فردي محمد ياسر', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'A', 'P', 'P', 'A', 'A'] },
  { row: 5, globalNumber: 824, expectedName: 'عكال باية', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'N', 'N', 'P', 'P', 'A', 'A'] },
  { row: 6, globalNumber: 815, expectedName: 'بوجلال محمد اسلام', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'A', 'P'] },
  { row: 7, globalNumber: 823, expectedName: 'بوقريط لجين', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'N', 'N', 'P', 'P', 'P', 'P'] },
  { row: 8, globalNumber: 826, expectedName: 'ياعو نسرين', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  // Row 9 -> #828 شطابي لجين (Saturday)
  { row: 10, globalNumber: 829, expectedName: 'بوالخروف نزار', enrollmentStatus: 'ACTIVE', cells: ['-', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 11, globalNumber: 841, expectedName: 'بوربوحات صفوان', enrollmentStatus: 'ACTIVE', cells: ['-', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 12, globalNumber: 60, expectedName: 'بحاري عادل', enrollmentStatus: 'ACTIVE', cells: ['-', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 13, globalNumber: 105, expectedName: 'بلخميس محمد منجد', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 14, globalNumber: 416, expectedName: 'صحراوي شهاب', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'P', 'P', 'P', 'P'] },
  { row: 15, globalNumber: 853, expectedName: 'شلغوم عبد الرحمان', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'P', 'P', 'P', 'P'] },
  { row: 16, globalNumber: 854, expectedName: 'شطبي امين', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', 'P', 'P', 'P', 'A'] },
  { row: 17, globalNumber: 115, expectedName: 'كويرة هديل', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', '-', 'P', 'P', 'P'] },
  { row: 18, globalNumber: 866, expectedName: 'صولي اية الرحمان', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'A', 'P'] },
  { row: 19, globalNumber: 867, expectedName: 'بسكري برهان', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'A', 'A', 'P'] },
  { row: 20, globalNumber: 852, expectedName: 'بونعاس وسيم', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 21, globalNumber: 879, expectedName: 'رمضاني الاء', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', 'P', 'P', 'P', 'P', 'P', 'A', 'P'] },
  { row: 22, globalNumber: 874, expectedName: 'مسعودي محمد اسلام', enrollmentStatus: 'ACTIVE', cells: ['-', '-', 'P', 'P', 'P', 'P', 'P', 'P', 'A', 'A'] },
  { row: 23, globalNumber: 528, expectedName: 'عروم سامي', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', '-', 'P', 'P', 'P'] },
  { row: 24, globalNumber: 805, expectedName: 'لقرع حبيبة', enrollmentStatus: 'ACTIVE', cells: ['-', 'N', 'N', 'N', 'P', 'P', 'P', 'P', 'P', 'P'] },
  { row: 25, globalNumber: 872, expectedName: 'دنش محمد وسيم', enrollmentStatus: 'ACTIVE', cells: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'] },

  // Page 2 (Rows 27-28)
  { row: 27, globalNumber: 1418, expectedName: 'صراب تسنيم', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', '-', '-', 'P', 'P'] },
  { row: 28, globalNumber: 1795, expectedName: 'نيني احمد ياسين', enrollmentStatus: 'ACTIVE', cells: ['-', '-', '-', '-', '-', '-', '-', '-', '-', 'P'] },
];

const LESSON_SPECS = [
  { date: '2026-09-04', startsAt: '2026-09-04T16:00:00.000Z', endsAt: '2026-09-04T18:30:00.000Z', isExtra: true },
  { date: '2026-09-09', startsAt: '2026-09-09T16:00:00.000Z', endsAt: '2026-09-09T18:30:00.000Z', isExtra: true },
  { date: '2026-09-13', startsAt: '2026-09-13T16:00:00.000Z', endsAt: '2026-09-13T18:30:00.000Z', isExtra: true },
  { date: '2026-09-16', startsAt: '2026-09-16T16:00:00.000Z', endsAt: '2026-09-16T18:30:00.000Z', isExtra: true },
  { date: '2026-09-20', startsAt: '2026-09-20T16:00:00.000Z', endsAt: '2026-09-20T18:30:00.000Z', isExtra: true },
  { date: '2026-09-29', startsAt: '2026-09-29T16:00:00.000Z', endsAt: '2026-09-29T18:30:00.000Z', isExtra: false },
  { date: '2026-10-06', startsAt: '2026-10-06T16:00:00.000Z', endsAt: '2026-10-06T18:30:00.000Z', isExtra: false },
  { date: '2026-10-13', startsAt: '2026-10-13T16:00:00.000Z', endsAt: '2026-10-13T18:30:00.000Z', isExtra: false },
  { date: '2026-10-20', startsAt: '2026-10-20T16:00:00.000Z', endsAt: '2026-10-20T18:30:00.000Z', isExtra: false },
  { date: '2026-10-27', startsAt: '2026-10-27T16:00:00.000Z', endsAt: '2026-10-27T18:30:00.000Z', isExtra: false },
];

const STATUS_MAP: Record<Exclude<CellCode, '-'>, string> = {
  P: 'PRESENT',
  A: 'ABSENT',
  N: 'NOT_DEFINED',
};

async function run(dryRun = true) {
  console.log(`=== ALIGNING نذير 3 ثانوي الثلاثاء (Class 174) | dryRun=${dryRun} ===\n`);

  const globalNumbers = TUESDAY_ROWS.map((r) => r.globalNumber);
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

  for (const row of TUESDAY_ROWS) {
    const s = studentByGlobal.get(row.globalNumber);
    if (!s) {
      throw new Error(`Missing student in DB for row ${row.row}: #${row.globalNumber} ${row.expectedName}`);
    }
  }
  console.log(`✓ Verified all ${TUESDAY_ROWS.length} students exist in database.`);

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

  for (const row of TUESDAY_ROWS) {
    const s = studentByGlobal.get(row.globalNumber)!;
    const bacEnrollments = s.enrollments;

    const anyInscCharged = bacEnrollments.some((e) => e.inscriptionFeeCharged);
    const anyInscAmt = bacEnrollments.find((e) => e.inscriptionFeeAmount !== null)?.inscriptionFeeAmount ?? null;
    const earliestEnrolledAt = bacEnrollments.reduce(
      (min, e) => (e.enrolledAt < min ? e.enrolledAt : min),
      bacEnrollments[0]?.enrolledAt ?? new Date()
    );
    const preservedPayerStatus =
      bacEnrollments.find((e) => e.classId === TUESDAY_CLASS_ID)?.payerStatus ??
      bacEnrollments[0]?.payerStatus ??
      s.payerStatus;

    const tueEnrollment = bacEnrollments.find((e) => e.classId === TUESDAY_CLASS_ID);
    const otherEnrollments = bacEnrollments.filter((e) => e.classId !== TUESDAY_CLASS_ID);

    if (tueEnrollment) {
      for (const oe of otherEnrollments) redundantEnrollmentIdsToDelete.push(oe.id);
      if (
        tueEnrollment.status !== row.enrollmentStatus ||
        tueEnrollment.payerStatus !== preservedPayerStatus ||
        tueEnrollment.inscriptionFeeCharged !== anyInscCharged ||
        tueEnrollment.creditResetOffset !== 0
      ) {
        enrollmentUpdates.push({
          id: tueEnrollment.id,
          data: {
            classId: TUESDAY_CLASS_ID,
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
          classId: TUESDAY_CLASS_ID,
          status: row.enrollmentStatus,
          payerStatus: preservedPayerStatus,
          inscriptionFeeCharged: anyInscCharged,
          inscriptionFeeAmount: anyInscAmt,
          enrolledAt: earliestEnrolledAt,
          creditResetOffset: 0,
        },
      });
    }
  }

  const voucherIdsToReassign = students.flatMap((s) =>
    s.vouchers.filter((v) => v.classId !== TUESDAY_CLASS_ID).map((v) => v.id)
  );

  console.log(`Planned operations:`);
  console.log(`  - Enrollment updates:                ${enrollmentUpdates.length}`);
  console.log(`  - Redundant BAC enrollments delete:  ${redundantEnrollmentIdsToDelete.length}`);
  console.log(`  - Vouchers to reassign to Class 174: ${voucherIdsToReassign.length}`);

  if (!dryRun) {
    await prisma.$transaction(
      async (tx) => {
        // 1. Ensure all 10 lessons exist in Class 174
        const existingLessons = await tx.lesson.findMany({
          where: { classId: TUESDAY_CLASS_ID },
        });
        const lessonIdByDate = new Map<string, number>();
        for (const l of existingLessons) {
          lessonIdByDate.set(l.startsAt.toISOString().slice(0, 10), l.id);
        }

        let createdLessonsCount = 0;
        for (const spec of LESSON_SPECS) {
          if (!lessonIdByDate.has(spec.date)) {
            const created = await tx.lesson.create({
              data: {
                classId: TUESDAY_CLASS_ID,
                teacherId: TEACHER_ID,
                classroomId: 2,
                branchId: 1,
                startsAt: new Date(spec.startsAt),
                endsAt: new Date(spec.endsAt),
                isExtra: spec.isExtra,
                isFree: false,
                isCatchUp: false,
                isTeacherAbsent: false,
              },
            });
            lessonIdByDate.set(spec.date, created.id);
            createdLessonsCount++;
          }
        }

        const orderedLessonIds = LESSON_SPECS.map((spec) => lessonIdByDate.get(spec.date)!);

        // 2. Delete transfers strictly between Nadhir's BAC enrollments for these students
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

        // 3. Delete redundant enrollments in other BAC groups
        if (redundantEnrollmentIdsToDelete.length > 0) {
          await tx.enrollment.deleteMany({
            where: { id: { in: redundantEnrollmentIdsToDelete } },
          });
        }

        // 4. Update enrollments needing changes
        for (const u of enrollmentUpdates) {
          await tx.enrollment.update({
            where: { id: u.id },
            data: u.data,
          });
        }

        // 5. Reassign vouchers to Class 174
        if (voucherIdsToReassign.length > 0) {
          await tx.voucher.updateMany({
            where: { id: { in: voucherIdsToReassign } },
            data: { classId: TUESDAY_CLASS_ID },
          });
        }

        // 6. Delete CatchUpAttendance records for these 26 students in BAC classes
        const delCatchUps = await tx.catchUpAttendance.deleteMany({
          where: {
            studentId: { in: studentIds },
            OR: [
              { missedLesson: { classId: { in: BAC_CLASS_IDS } } },
              { catchUpLesson: { classId: { in: BAC_CLASS_IDS } } },
            ],
          },
        });

        // 7. Replace BAC attendances for these 26 students with exact Tuesday list attendances
        const delAtt = await tx.attendance.deleteMany({
          where: {
            studentId: { in: studentIds },
            lesson: { classId: { in: BAC_CLASS_IDS } },
          },
        });

        const newAttendancesToCreate: Array<{
          studentId: string;
          lessonId: number;
          status: string;
          justification: string | null;
        }> = [];

        for (const row of TUESDAY_ROWS) {
          const s = studentByGlobal.get(row.globalNumber)!;
          for (let i = 0; i < orderedLessonIds.length; i++) {
            const lessonId = orderedLessonIds[i];
            const cell = row.cells[i];
            if (cell !== '-') {
              newAttendancesToCreate.push({
                studentId: s.id,
                lessonId,
                status: STATUS_MAP[cell],
                justification: cell === 'N' ? 'الفا' : null,
              });
            }
          }
        }

        const createdAtt = await tx.attendance.createMany({
          data: newAttendancesToCreate,
        });

        console.log(`\n✓ APPLIED SUCCESSFULLY:`);
        console.log(`  - Missing lessons created in 174:   ${createdLessonsCount}`);
        console.log(`  - Transfers deleted:                ${delTransfers.count}`);
        console.log(`  - Redundant enrollments deleted:    ${redundantEnrollmentIdsToDelete.length}`);
        console.log(`  - Enrollments updated:              ${enrollmentUpdates.length}`);
        console.log(`  - Vouchers moved to Class 174:      ${voucherIdsToReassign.length}`);
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
