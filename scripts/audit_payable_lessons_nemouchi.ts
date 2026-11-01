import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'fc25e718-f9db-4f35-80c1-6feb794176ec';
  const startDate = new Date('2026-10-01T00:00:00.000Z');
  const endDate = new Date('2026-10-31T23:59:59.999Z');

  const payroll = await calculateTeacherPayroll(teacherId, startDate, endDate);

  console.log('=== PAYROLL SUMMARY ===');
  for (const g of payroll?.groupBreakdown || []) {
    if (g.className.includes('3 ابتدائي')) {
      console.log(`\nGroup: ${g.className}`);
      console.log(`  Course sessions: ${g.courseSessionsCount}`);
      console.log(`  Payable lessons (app): ${g.payableLessonsCount}`);
      console.log(`  Paid sessions: ${g.paidSessionsCount}`);
      console.log(`  Gross amount: ${g.amount}`);
    }
  }

  // Detailed lesson-by-lesson breakdown
  for (const cid of [91, 92]) {
    const c = await prisma.class.findUnique({
      where: { id: cid },
      include: {
        lessons: {
          where: {
            startsAt: { gte: startDate, lte: endDate }
          },
          orderBy: { startsAt: 'asc' },
          include: {
            attendances: {
              include: {
                student: true
              }
            }
          }
        },
        enrollments: {
          include: {
            student: {
              include: {
                vouchers: {
                  where: {
                    OR: [{ classId: cid }, { classId: null }]
                  }
                }
              }
            }
          }
        }
      }
    });

    console.log(`\n==================================================`);
    console.log(`CLASS ${cid}: ${c?.name}`);
    console.log(`==================================================`);
    console.log(`Lessons count in October: ${c?.lessons.length}`);
    for (const l of c?.lessons || []) {
      const sDetail = payroll?.sessionDetails?.find(s => s.lessonId === l.id);
      console.log(`\nLesson ID ${l.id} | Date: ${l.startsAt.toISOString()} | Absent: ${l.isTeacherAbsent}`);
      console.log(`  In Payroll: presentCount=${sDetail?.presentCount}, payingCount=${sDetail?.payingCount}, lessonAmount=${sDetail?.lessonAmount}`);
      for (const a of l.attendances) {
        console.log(`    Student: ${a.student.name} | status: ${a.status}`);
      }
    }

    console.log(`\n--- Student Summary for Class ${cid} ---`);
    for (const e of c?.enrollments || []) {
      const s = e.student;
      console.log(`\nStudent: ${s.name} (${s.id})`);
      console.log(`  Payer status: ${e.payerStatus}, Enrollment status: ${e.status}, EnrolledAt: ${e.enrolledAt.toISOString()}`);
      console.log(`  Vouchers:`, s.vouchers.map(v => `${v.paymentType} #${v.number} (${v.amount} DA)`));
      
      // Count total PRESENT and ABSENT in October
      const attsInPeriod = await prisma.attendance.findMany({
        where: {
          studentId: s.id,
          lesson: {
            classId: cid,
            startsAt: { gte: startDate, lte: endDate }
          }
        },
        include: {
          lesson: true
        },
        orderBy: {
          lesson: { startsAt: 'asc' }
        }
      });
      console.log(`  Attendances in October (${attsInPeriod.length}):`);
      for (const att of attsInPeriod) {
        console.log(`    Lesson ${att.lessonId} (${att.lesson.startsAt.toISOString()}): ${att.status} (TeacherAbsent: ${att.lesson.isTeacherAbsent})`);
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
