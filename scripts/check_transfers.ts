import { prisma } from './lib/db';

async function main() {
  const transfers = await prisma.enrollmentTransfer.findMany({
    where: {
      OR: [
        { fromEnrollment: { classId: { in: [56, 57] } } },
        { toEnrollment: { classId: { in: [56, 57] } } }
      ]
    },
    include: {
      fromEnrollment: { include: { student: true, class: true } },
      toEnrollment: { include: { student: true, class: true } }
    }
  });

  console.log(`Transfers involving class 56 or 57: ${transfers.length}`);
  for (const t of transfers) {
    console.log(`Transfer #${t.id} | Student: ${t.fromEnrollment?.student?.name} | from ${t.fromEnrollment?.class?.name} -> to ${t.toEnrollment?.class?.name} | date: ${t.transferredAt.toISOString()} | transferredSessions: ${t.transferredSessions} | amount: ${t.amount}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
