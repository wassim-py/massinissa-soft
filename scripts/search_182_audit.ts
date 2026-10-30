import { prisma } from './lib/db';

async function main() {
  const audit = await prisma.auditLog.findMany({
    where: {
      OR: [
        { details: { contains: '182' } },
        { details: { contains: '181' } },
        { details: { contains: 'بوخزر' } }
      ]
    },
    take: 20,
    orderBy: { timestamp: 'desc' }
  });
  console.log(`Audit logs matching: ${audit.length}`);
  for (const a of audit) {
    console.log(`Audit #${a.id} [${a.action}]: ${a.details}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
