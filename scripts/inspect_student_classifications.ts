import { prisma } from './lib/db';
import { getStudentCycleStatusHistory } from '../src/lib/studentBilling';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  // For both classes 56 and 57
  for (const classId of [56, 57]) {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        enrollments: {
          include: { student: true }
        },
        lessons: {
          orderBy: { startsAt: 'asc' }
        }
      }
    });

    console.log(`\n======================================================`);
    console.log(`CLASS ${cls?.name} (ID: ${classId})`);
    console.log(`Total lessons: ${cls?.lessons.length}`);
    console.log(`Total enrolled students: ${cls?.enrollments.length}`);

    let totalLessonsCountedForTeacher = 0;
    let totalPresentAttendances = 0;

    // Check each student
    for (const enrollment of cls?.enrollments || []) {
      const student = enrollment.student;
      const history = await getStudentCycleStatusHistory(student.id, classId);

      // Print student info if they have non-standard attendance
      const attended = history.sessionStatuses.filter(s => s.status === 'PRESENT' || s.status === 'LATE');
      const teacherPayable = history.sessionStatuses.filter(s => s.isTeacherPayable);
      const interleaved = history.sessionStatuses.filter(s => s.classification === 'INTERLEAVED_ABSENCE');
      const caughtUp = history.sessionStatuses.filter(s => s.classification === 'CAUGHT_UP_ABSENCE');
      const held = history.sessionStatuses.filter(s => s.isHeld || s.classification === 'TRAILING_ABSENCE_HELD');
      const preStart = history.sessionStatuses.filter(s => s.classification === 'PRE_START_ABSENCE');
      const suspended = history.sessionStatuses.filter(s => s.classification === 'SUSPENDED_ABSENCE');

      totalPresentAttendances += attended.length;
      totalLessonsCountedForTeacher += teacherPayable.length;

      if (interleaved.length > 0 || caughtUp.length > 0 || held.length > 0 || preStart.length > 0 || suspended.length > 0 || attended.length !== teacherPayable.length) {
        console.log(`\nStudent: ${student.name} (#${student.globalNumber}, ${student.id})`);
        console.log(`  PayerStatus: ${enrollment.payerStatus}, Attended: ${attended.length}, TeacherPayable: ${teacherPayable.length}`);
        for (const s of history.sessionStatuses) {
          console.log(`    Lesson #${s.lessonId} (${s.startsAt.toISOString().slice(0, 10)}): attStatus=${s.status}, classif=${s.classification}, isTeacherPayable=${s.isTeacherPayable}, isCatchUp=${s.isCatchUp}, isConsumed=${s.isConsumedCredit}`);
        }
      }
    }

    console.log(`\n>>> CLASS ${classId} SUMMARY:`);
    console.log(`  Total Present Attendances: ${totalPresentAttendances}`);
    console.log(`  Total Teacher Payable sessions from getStudentCycleStatusHistory: ${totalLessonsCountedForTeacher}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
