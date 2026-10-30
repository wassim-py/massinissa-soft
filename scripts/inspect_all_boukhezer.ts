import { prisma } from './lib/db';

async function main() {
  const classes = await prisma.class.findMany({
    where: { name: { contains: 'بوخزر' } },
    include: {
      teacher: true,
      lessons: {
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          isFree: true,
          isCatchUp: true,
          isExtra: true,
          isTeacherAbsent: true,
          _count: {
            select: { attendances: true }
          }
        },
        orderBy: { startsAt: 'asc' }
      }
    }
  });

  console.log(`\nClasses with بوخزر (${classes.length}):`);
  for (const c of classes) {
    console.log(`Class #${c.id}: "${c.name}", Lessons count: ${c.lessons.length}`);
    for (const l of c.lessons) {
      console.log(`   Lesson #${l.id}: ${l.startsAt.toISOString()} | attendances: ${l._count.attendances} | free: ${l.isFree} | catchUp: ${l.isCatchUp} | absent: ${l.isTeacherAbsent}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
