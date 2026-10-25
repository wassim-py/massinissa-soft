import { prisma } from './lib/db';

async function checkTransfers() {
  const teacherId = 'd9e91746-9976-4993-933b-61b244bf372e'; // Hamoui

  // Find all transfers where either fromEnrollment or toEnrollment is in one of Hamoui's classes
  const transfers = await prisma.enrollmentTransfer.findMany({
    include: {
      fromEnrollment: {
        include: {
          student: true,
          class: true,
        }
      },
      toEnrollment: {
        include: {
          student: true,
          class: true,
        }
      }
    },
    orderBy: { transferredAt: 'desc' }
  });

  const hamouiTransfers = transfers.filter(
    t => t.fromEnrollment?.class?.teacherId === teacherId || t.toEnrollment?.class?.teacherId === teacherId
  );

  console.log(`Found ${hamouiTransfers.length} transfers related to Hamoui's classes:\n`);
  for (const t of hamouiTransfers) {
    const student = t.fromEnrollment?.student || t.toEnrollment?.student;
    console.log(`Transfer ID: ${t.id} | Date: ${t.transferredAt.toISOString().slice(0, 10)}`);
    console.log(`  Student: #${student?.globalNumber} - ${student?.name} (${student?.id})`);
    console.log(`  FROM: ${t.fromEnrollment?.class?.name} (Status: ${t.fromEnrollment?.status}, EnrID: ${t.fromEnrollmentId})`);
    console.log(`  TO:   ${t.toEnrollment?.class?.name} (Status: ${t.toEnrollment?.status}, EnrID: ${t.toEnrollmentId})`);
    console.log(`  Transferred Sessions: ${t.transferredSessions}, Amount: ${t.amount}, Notes: ${t.notes}`);
    console.log('----------------------------------------------------');
  }

  // Also check students who have attendances in more than one Hamoui group
  console.log('\n--- Checking students attending multiple Hamoui groups ---');
  const hamouiClasses = await prisma.class.findMany({
    where: { teacherId },
    select: { id: true, name: true }
  });
  const classIds = hamouiClasses.map(c => c.id);

  const attendances = await prisma.attendance.findMany({
    where: {
      lesson: {
        classId: { in: classIds }
      }
    },
    select: {
      studentId: true,
      student: { select: { globalNumber: true, name: true } },
      lesson: { select: { classId: true, class: { select: { name: true } }, startsAt: true } }
    }
  });

  const studentGroupsMap = new Map<string, { student: { globalNumber: number; name: string }; groups: Set<string>; dates: { date: string; group: string }[] }>();
  for (const a of attendances) {
    if (!studentGroupsMap.has(a.studentId)) {
      studentGroupsMap.set(a.studentId, {
        student: a.student,
        groups: new Set(),
        dates: []
      });
    }
    const item = studentGroupsMap.get(a.studentId)!;
    item.groups.add(a.lesson.class.name);
    item.dates.push({
      date: a.lesson.startsAt.toISOString().slice(0, 10),
      group: a.lesson.class.name
    });
  }

  const multiGroupStudents = Array.from(studentGroupsMap.entries()).filter(([_, v]) => v.groups.size > 1);
  console.log(`Found ${multiGroupStudents.length} students who attended more than one Hamoui group:\n`);
  for (const [id, v] of multiGroupStudents) {
    console.log(`Student #${v.student.globalNumber} - ${v.student.name}: Groups: [${Array.from(v.groups).join(', ')}]`);
  }
}

checkTransfers().catch(console.error).finally(() => prisma.$disconnect());
