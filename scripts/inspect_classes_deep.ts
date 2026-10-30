import { prisma } from './lib/db';

async function main() {
  const class56 = await prisma.class.findUnique({
    where: { id: 56 },
    include: {
      enrollments: {
        include: { student: true }
      },
      lessons: {
        include: {
          attendances: {
            include: { student: true }
          }
        }
      }
    }
  });

  const class57 = await prisma.class.findUnique({
    where: { id: 57 },
    include: {
      enrollments: {
        include: { student: true }
      },
      lessons: {
        include: {
          attendances: {
            include: { student: true }
          }
        }
      }
    }
  });

  console.log(`Class 56 (${class56?.name}):`);
  console.log(`  Enrollments: ${class56?.enrollments.length}`);
  console.log(`  Lessons: ${class56?.lessons.length}`);
  let totalAtt56 = 0;
  let presentAtt56 = 0;
  for (const l of class56?.lessons || []) {
    const present = l.attendances.filter(a => a.status === 'PRESENT').length;
    const late = l.attendances.filter(a => a.status === 'LATE').length;
    const absent = l.attendances.filter(a => a.status === 'ABSENT').length;
    totalAtt56 += l.attendances.length;
    presentAtt56 += (present + late);
    console.log(`    Lesson #${l.id} (${l.startsAt.toISOString().slice(0, 10)}): total=${l.attendances.length}, present=${present}, late=${late}, absent=${absent}`);
  }
  console.log(`  Total attendances: ${totalAtt56}, Present+Late: ${presentAtt56}`);

  console.log(`\nClass 57 (${class57?.name}):`);
  console.log(`  Enrollments: ${class57?.enrollments.length}`);
  console.log(`  Lessons: ${class57?.lessons.length}`);
  let totalAtt57 = 0;
  let presentAtt57 = 0;
  for (const l of class57?.lessons || []) {
    const present = l.attendances.filter(a => a.status === 'PRESENT').length;
    const late = l.attendances.filter(a => a.status === 'LATE').length;
    const absent = l.attendances.filter(a => a.status === 'ABSENT').length;
    totalAtt57 += l.attendances.length;
    presentAtt57 += (present + late);
    console.log(`    Lesson #${l.id} (${l.startsAt.toISOString().slice(0, 10)}): total=${l.attendances.length}, present=${present}, late=${late}, absent=${absent}`);
  }
  console.log(`  Total attendances: ${totalAtt57}, Present+Late: ${presentAtt57}`);

  // Vouchers for class 56 and 57
  const vouchers56 = await prisma.voucher.findMany({ where: { classId: 56 } });
  const vouchers57 = await prisma.voucher.findMany({ where: { classId: 57 } });
  console.log(`\nVouchers for Class 56: count=${vouchers56.length}, total amount=${vouchers56.reduce((s, v) => s + Number(v.amount), 0)}`);
  console.log(`Vouchers for Class 57: count=${vouchers57.length}, total amount=${vouchers57.reduce((s, v) => s + Number(v.amount), 0)}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
