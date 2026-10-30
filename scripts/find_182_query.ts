import { prisma } from './lib/db';

async function main() {
  // Let's test different queries on Attendance, Lesson, Student, Voucher, etc.
  
  // 1. Raw attendances for class 56 and 57
  const q1 = await prisma.attendance.count({
    where: {
      lesson: { classId: { in: [56, 57] } },
      status: 'PRESENT'
    }
  });
  console.log('Q1: attendance.count PRESENT:', q1); // 183

  // 2. Count distinct studentId, lessonId
  const q2 = await prisma.$queryRaw<any[]>`
    SELECT COUNT(DISTINCT ("studentId", "lessonId")) as count
    FROM "Attendance" a
    JOIN "Lesson" l ON l.id = a."lessonId"
    WHERE l."classId" IN (56, 57)
      AND a.status = 'PRESENT'
  `;
  console.log('Q2: distinct student, lesson:', q2);

  // 3. Count where student is currently active / enrolled
  const q3 = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*) as count
    FROM "Attendance" a
    JOIN "Lesson" l ON l.id = a."lessonId"
    JOIN "Enrollment" e ON e."studentId" = a."studentId" AND e."classId" = l."classId"
    WHERE l."classId" IN (56, 57)
      AND a.status = 'PRESENT'
  `;
  console.log('Q3: with enrollment in same class:', q3);

  // 4. Count where student enrollment is ACTIVE
  const q4 = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*) as count
    FROM "Attendance" a
    JOIN "Lesson" l ON l.id = a."lessonId"
    JOIN "Enrollment" e ON e."studentId" = a."studentId" AND e."classId" = l."classId"
    WHERE l."classId" IN (56, 57)
      AND a.status = 'PRESENT'
      AND e.status = 'ACTIVE'
  `;
  console.log('Q4: with ACTIVE enrollment in same class:', q4);

  // 5. Let's check attendance by studentId IN enrolled students
  const q5 = await prisma.$queryRaw<any[]>`
    SELECT l."classId", COUNT(*) as count
    FROM "Attendance" a
    JOIN "Lesson" l ON l.id = a."lessonId"
    WHERE l."classId" IN (56, 57)
      AND a.status = 'PRESENT'
      AND a."studentId" IN (
        SELECT e."studentId" FROM "Enrollment" e WHERE e."classId" = l."classId"
      )
    GROUP BY l."classId"
  `;
  console.log('Q5: by class where student in class enrollments:', q5);
}

main().catch(console.error).finally(() => prisma.$disconnect());
