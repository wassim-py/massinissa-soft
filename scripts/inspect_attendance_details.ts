import { prisma } from './lib/db';
import { getStudentCycleStatusHistory } from '../src/lib/studentBilling';

async function main() {
  const classes = await prisma.class.findMany({
    where: { id: { in: [56, 57] } },
    include: {
      enrollments: {
        include: { student: true }
      },
      lessons: {
        orderBy: { startsAt: 'asc' },
        include: {
          attendances: {
            include: { student: true }
          },
          catchUpVisitsHosted: {
            include: { student: true }
          }
        }
      }
    }
  });

  console.log('=== CLASS 56 & 57 LESSONS & ATTENDANCES ===');
  for (const c of classes) {
    console.log(`\n----------------- ${c.name} (ID: ${c.id}) -----------------`);
    for (const l of c.lessons) {
      console.log(`\nLesson #${l.id} on ${l.startsAt.toISOString().slice(0, 10)} (status: free=${l.isFree}, catchUp=${l.isCatchUp}, absent=${l.isTeacherAbsent}):`);
      console.log(`  Hosted catch-up visits: ${l.catchUpVisitsHosted.length}`);
      for (const cu of l.catchUpVisitsHosted) {
        console.log(`    Catch-up student: ${cu.student?.name} (ID: ${cu.studentId}), missedLesson: ${cu.missedLessonId}`);
      }

      const present = l.attendances.filter(a => a.status === 'PRESENT');
      const late = l.attendances.filter(a => a.status === 'LATE');
      const absent = l.attendances.filter(a => a.status === 'ABSENT');
      const other = l.attendances.filter(a => a.status !== 'PRESENT' && a.status !== 'LATE' && a.status !== 'ABSENT');

      console.log(`  Attendances: Total=${l.attendances.length} | Present=${present.length} | Late=${late.length} | Absent=${absent.length} | Other=${other.length}`);
      if (absent.length > 0) {
        console.log(`    Absent students:`, absent.map(a => `${a.student?.name} (${a.studentId})`).join(', '));
      }
      if (other.length > 0) {
        console.log(`    Other students:`, other.map(a => `${a.student?.name} (${a.studentId}) [${a.status}]`).join(', '));
      }
    }
  }

  // Also check all CatchUpAttendance records involving these classes
  const catchUps = await prisma.catchUpAttendance.findMany({
    where: {
      OR: [
        { hostedLesson: { classId: { in: [56, 57] } } },
        { missedLesson: { classId: { in: [56, 57] } } }
      ]
    },
    include: {
      student: true,
      hostedLesson: { include: { class: true } },
      missedLesson: { include: { class: true } }
    }
  });

  console.log(`\n=== CATCH UP ATTENDANCES (${catchUps.length}) ===`);
  for (const cu of catchUps) {
    console.log(`CatchUp #${cu.id} | Student: ${cu.student.name} | Missed: Lesson #${cu.missedLessonId} (${cu.missedLesson?.class.name}) | Hosted: Lesson #${cu.hostedLessonId} (${cu.hostedLesson?.class.name}) | Status: ${cu.status}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
