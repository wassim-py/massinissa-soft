import { prisma } from './lib/db';

async function main() {
  const log5865 = await prisma.auditLog.findUnique({
    where: { id: 5865 }
  });
  console.log('Audit 5865:', log5865);

  const log5102 = await prisma.auditLog.findUnique({
    where: { id: 5102 }
  });
  console.log('Audit 5102:', log5102);

  // Check enrollment payerStatus for class 56 and 57
  const enrolls56 = await prisma.enrollment.findMany({
    where: { classId: 56 },
    select: { id: true, studentId: true, payerStatus: true, student: { select: { name: true } } }
  });
  console.log(`Class 56 enrollments payerStatus:`, enrolls56.map(e => `${e.student.name}: ${e.payerStatus}`));

  const enrolls57 = await prisma.enrollment.findMany({
    where: { classId: 57 },
    select: { id: true, studentId: true, payerStatus: true, student: { select: { name: true } } }
  });
  console.log(`Class 57 enrollments payerStatus:`, enrolls57.map(e => `${e.student.name}: ${e.payerStatus}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
