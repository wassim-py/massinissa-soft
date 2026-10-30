import { prisma } from './lib/db';
import { isLessonApplicableToEnrollment } from '../src/lib/studentBilling';

async function main() {
  // Let's test attendance count using isLessonApplicableToEnrollment
  for (const classId of [56, 57]) {
    const rawAttendances = await prisma.$queryRaw<any[]>`
      SELECT 
          a.id as "attendanceId",
          a."studentId",
          a.status,
          l.id as "lessonId",
          l."startsAt" as date,
          l."classId" as "lessonClassId"
      FROM "Attendance" a
      JOIN "Lesson" l ON l.id = a."lessonId"
      WHERE l."classId" = ${classId}
        AND a.status = 'PRESENT'
      ORDER BY l."startsAt" ASC
    `;

    console.log(`Class ${classId} raw PRESENT: ${rawAttendances.length}`);

    // Fetch enrollments with transfers
    const enrollments = await prisma.enrollment.findMany({
      where: { classId },
      include: {
        transfersTo: true,
        transfersFrom: true,
        student: true
      }
    });

    const enrollMap = new Map<string, any>();
    for (const e of enrollments) {
      enrollMap.set(e.studentId, e);
    }

    let applicableCount = 0;
    const excluded: any[] = [];
    for (const att of rawAttendances) {
      const e = enrollMap.get(att.studentId);
      const isApp = isLessonApplicableToEnrollment(
        { id: att.lessonId, classId: att.lessonClassId, startsAt: att.date },
        classId,
        e
      );
      if (isApp) {
        applicableCount++;
      } else {
        excluded.push({ att, student: e?.student?.name });
      }
    }

    console.log(`Class ${classId} applicable PRESENT: ${applicableCount}`);
    if (excluded.length > 0) {
      console.log(`Class ${classId} excluded:`, JSON.stringify(excluded, null, 2));
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
