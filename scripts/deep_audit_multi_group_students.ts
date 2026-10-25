import { prisma } from './lib/db';

async function deepAudit() {
  const teacherId = 'd9e91746-9976-4993-933b-61b244bf372e'; // Hamoui

  const hamouiClasses = await prisma.class.findMany({
    where: { teacherId },
    select: { id: true, name: true }
  });
  const classIds = hamouiClasses.map(c => c.id);

  // Find all attendances in Hamoui's classes
  const attendances = await prisma.attendance.findMany({
    where: {
      lesson: { classId: { in: classIds } }
    },
    include: {
      lesson: {
        include: { class: true }
      },
      student: true
    },
    orderBy: { lesson: { startsAt: 'asc' } }
  });

  const studentsMap = new Map<string, {
    student: any;
    attendances: typeof attendances;
  }>();

  for (const a of attendances) {
    if (!studentsMap.has(a.studentId)) {
      studentsMap.set(a.studentId, {
        student: a.student,
        attendances: []
      });
    }
    studentsMap.get(a.studentId)!.attendances.push(a);
  }

  // Filter students who attended > 1 class
  const multiGroupStudents = Array.from(studentsMap.values()).filter(item => {
    const classNames = new Set(item.attendances.map(a => a.lesson.class.name));
    return classNames.size > 1;
  });

  console.log(`Found ${multiGroupStudents.length} students with attendances in multiple Hamoui groups:\n`);

  for (const item of multiGroupStudents) {
    const s = item.student;
    console.log(`================================================================================`);
    console.log(`STUDENT #${s.globalNumber} - ${s.name} (${s.id})`);
    console.log(`================================================================================`);

    // Fetch student's enrollments in Hamoui's classes
    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId: s.id,
        classId: { in: classIds }
      },
      include: {
        class: true,
        transfersFrom: { include: { toEnrollment: { include: { class: true } } } },
        transfersTo: { include: { fromEnrollment: { include: { class: true } } } }
      }
    });

    console.log(`ENROLLMENTS (${enrollments.length}):`);
    for (const e of enrollments) {
      console.log(` - ID: ${e.id} | Class: ${e.class.name} (classId: ${e.classId}) | Status: ${e.status} | EnrolledAt: ${e.enrolledAt?.toISOString().slice(0, 10)}`);
      for (const tf of e.transfersFrom) {
        console.log(`    -> Transfer OUT [ID ${tf.id}] on ${tf.transferredAt?.toISOString().slice(0, 10)}: ${tf.transferredSessions} sessions to ${tf.toEnrollment?.class?.name} (Enr #${tf.toEnrollmentId})`);
      }
      for (const tt of e.transfersTo) {
        console.log(`    <- Transfer IN  [ID ${tt.id}] on ${tt.transferredAt?.toISOString().slice(0, 10)}: ${tt.transferredSessions} sessions from ${tt.fromEnrollment?.class?.name} (Enr #${tt.fromEnrollmentId})`);
      }
    }

    console.log(`\nATTENDANCES (${item.attendances.length}):`);
    for (const a of item.attendances) {
      const d = a.lesson.startsAt.toISOString().slice(0, 10);
      console.log(` - ${d} | Class: ${a.lesson.class.name} | Lesson #${a.lesson.id} | Status: ${a.status} (justif: ${a.justification || 'none'})`);
    }

    // Vouchers
    const vouchers = await prisma.voucher.findMany({
      where: {
        studentId: s.id,
        classId: { in: classIds }
      },
      include: { class: true }
    });
    console.log(`\nVOUCHERS (${vouchers.length}):`);
    for (const v of vouchers) {
      console.log(` - Voucher #${v.voucherNumber} | Class: ${v.class?.name} | Amount: ${v.amount} | Date: ${v.issuedAt?.toISOString().slice(0, 10)}`);
    }
    console.log('\n');
  }
}

deepAudit().catch(console.error).finally(() => prisma.$disconnect());
