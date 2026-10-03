import { prisma } from 'C:/Users/wassi/OneDrive/Bureau/massinissa-school-software/scripts/lib/db';

async function updateSaturdayLessons() {
  const satLessons = await prisma.lesson.findMany({
    where: {
      isExtra: false,
      startsAt: {
        gte: new Date('2026-09-26T00:00:00Z'),
        lt: new Date('2026-09-27T00:00:00Z')
      }
    }
  });

  console.log(`Found ${satLessons.length} Saturday regular lessons to advance to 2026-10-03.`);

  for (const l of satLessons) {
    const newStartsAt = new Date(l.startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const newEndsAt = new Date(l.endsAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    await prisma.lesson.update({
      where: { id: l.id },
      data: {
        startsAt: newStartsAt,
        endsAt: newEndsAt
      }
    });
  }

  console.log('Successfully advanced all Saturday lessons to 2026-10-03!');
  await prisma.$disconnect();
}

updateSaturdayLessons().catch(console.error);
