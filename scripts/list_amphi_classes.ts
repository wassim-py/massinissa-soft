import { prisma } from './lib/db';

async function main() {
  const classes = await prisma.class.findMany({
    where: { branchId: 3 },
    include: { level: true, teacher: true },
    orderBy: [{ levelId: 'asc' }, { id: 'asc' }]
  });
  console.log(`=== AMPHI CLASSES (Branch ID: 3) Total: ${classes.length} ===`);
  for (const c of classes) {
    console.log(`ID: ${c.id.toString().padStart(3)} | Level: ${(c.level?.name || 'N/A').padEnd(12)} | Class: "${c.name}" | Teacher: ${c.teacher?.name || 'N/A'} | hasBooks: ${c.hasBooks}`);
  }
}

main().finally(() => prisma.$disconnect());
