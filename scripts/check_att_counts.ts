import { prisma } from './lib/db';

async function main() {
  // Let's examine all attendances recorded for Class 56 and Class 57
  const atts56 = await prisma.attendance.findMany({
    where: { lesson: { classId: 56 } },
    include: { student: true, lesson: true }
  });

  const atts57 = await prisma.attendance.findMany({
    where: { lesson: { classId: 57 } },
    include: { student: true, lesson: true }
  });

  console.log(`Class 56 attendances: total=${atts56.length}`);
  console.log(`Class 57 attendances: total=${atts57.length}`);

  // Let's check status breakdown
  const status56: Record<string, number> = {};
  for (const a of atts56) status56[a.status] = (status56[a.status] || 0) + 1;
  console.log('Status 56:', status56);

  const status57: Record<string, number> = {};
  for (const a of atts57) status57[a.status] = (status57[a.status] || 0) + 1;
  console.log('Status 57:', status57);
}

main().catch(console.error).finally(() => prisma.$disconnect());
