import { prisma } from './lib/db';

async function main() {
  // Let's get all attendances with status = PRESENT in Class 56 and 57
  const attendances = await prisma.attendance.findMany({
    where: {
      lesson: { classId: { in: [56, 57] } },
      status: 'PRESENT'
    },
    include: {
      student: {
        include: {
          family: true,
          enrollments: {
            where: { classId: { in: [56, 57] } }
          },
          vouchers: {
            where: { classId: { in: [56, 57] } }
          }
        }
      },
      lesson: {
        include: { class: true }
      }
    },
    orderBy: [
      { lesson: { startsAt: 'asc' } },
      { student: { name: 'asc' } }
    ]
  });

  console.log(`Total PRESENT attendances in Class 56 & 57: ${attendances.length}`);

  // Count per class
  const att56 = attendances.filter(a => a.lesson.classId === 56);
  const att57 = attendances.filter(a => a.lesson.classId === 57);
  console.log(`Class 56 PRESENT attendances: ${att56.length}`);
  console.log(`Class 57 PRESENT attendances: ${att57.length}`);

  // Check student payer status or any special conditions among these 183 attendances
  const nonNormalStudents = new Set<string>();
  const unpaidStudents = new Set<string>();
  const transferredStudents = new Set<string>();

  for (const a of attendances) {
    const student = a.student;
    const enrollment = student.enrollments.find(e => e.classId === a.lesson.classId);
    const payerStatus = enrollment?.payerStatus || student.payerStatus;
    if (payerStatus !== 'NORMAL') {
      console.log(`[Non-normal payerStatus] Attendance #${a.id} | Lesson #${a.lessonId} (${a.lesson.class.name}, ${a.lesson.startsAt.toISOString().slice(0, 10)}) | Student: ${student.name} (${student.id}) | payerStatus: ${payerStatus}`);
    }
  }

  // Check students with 0 vouchers or less vouchers than attendances
  const studentMap = new Map<string, { student: any, class56Att: number, class57Att: number }>();
  for (const a of attendances) {
    const s = studentMap.get(a.studentId) || { student: a.student, class56Att: 0, class57Att: 0 };
    if (a.lesson.classId === 56) s.class56Att++;
    if (a.lesson.classId === 57) s.class57Att++;
    studentMap.set(a.studentId, s);
  }

  console.log(`\nUnique students who attended PRESENT: ${studentMap.size}`);
  for (const [sid, data] of studentMap.entries()) {
    const v56 = data.student.vouchers.filter((v: any) => v.classId === 56).length;
    const v57 = data.student.vouchers.filter((v: any) => v.classId === 57).length;
    const enroll56 = data.student.enrollments.find((e: any) => e.classId === 56);
    const enroll57 = data.student.enrollments.find((e: any) => e.classId === 57);

    if (data.class56Att > 0 && data.class57Att > 0) {
      console.log(`[ATTENDED BOTH CLASSES] Student: ${data.student.name} (#${data.student.globalNumber}) | Attended G1: ${data.class56Att}, Attended G2: ${data.class57Att} | Vouchers G1: ${v56}, G2: ${v57}`);
    }

    if (enroll56?.payerStatus !== 'NORMAL' || enroll57?.payerStatus !== 'NORMAL' || data.student.payerStatus !== 'NORMAL') {
      console.log(`[SPECIAL STATUS] ${data.student.name}: student.payerStatus=${data.student.payerStatus}, enroll56=${enroll56?.payerStatus}, enroll57=${enroll57?.payerStatus}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
