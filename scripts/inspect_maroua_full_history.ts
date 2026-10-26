import { prisma } from './lib/db';

async function main() {
  const maroua = await prisma.student.findFirst({
    where: { globalNumber: 534 },
    include: {
      attendances: {
        where: { lesson: { classId: 6 } },
        include: { lesson: true },
        orderBy: { lesson: { startsAt: 'asc' } }
      },
      vouchers: {
        where: { classId: 6 },
        orderBy: { issuedAt: 'asc' }
      }
    }
  });

  console.log('=== MAROUA BELKHEIRI (#534) FULL HISTORY IN حموي فوج خاص ===');
  console.log('Vouchers:');
  for (const v of maroua?.vouchers || []) {
    console.log(`  Voucher #${v.id} | ${v.issuedAt.toISOString().slice(0, 10)} | ${v.amount} DZD | type: ${v.paymentType}`);
  }

  console.log('\nLessons & Attendances:');
  maroua?.attendances.forEach((a, idx) => {
    console.log(`  ${idx + 1}. Date: ${a.lesson.startsAt.toISOString().slice(0, 10)} | Lesson #${a.lesson.id} | Status: ${a.status} | isFree: ${a.lesson.isFree}`);
  });
}

main().finally(() => prisma.$disconnect());
