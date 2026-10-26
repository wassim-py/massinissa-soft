import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'd9e91746-9976-4993-933b-61b244bf372e';
  const start = new Date(Date.UTC(2026, 9, 1));
  const end = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));

  // Find class 6 (حموي فوج خاص)
  const class6 = await prisma.class.findUnique({
    where: { id: 6 },
    include: {
      enrollments: { include: { student: { include: { family: true } } } },
      lessons: { where: { startsAt: { lte: end } }, orderBy: { startsAt: 'asc' } },
      vouchers: { where: { isVoided: false, isRefund: false } }
    }
  });

  console.log('Class 6:', class6?.name, 'pricePerCycle:', class6?.pricePerCycle);

  const maroua = class6?.enrollments.find(e => e.student.globalNumber === 534);
  const safaa = class6?.enrollments.find(e => e.student.globalNumber === 529);

  console.log('\n--- MAROUA (#534) ---');
  console.log('Vouchers:');
  const marouaVouchers = class6?.vouchers.filter(v => v.studentId === maroua?.studentId);
  for (const v of marouaVouchers || []) {
    console.log(`  Voucher #${v.id} | ${v.issuedAt.toISOString().slice(0, 10)} | ${v.amount} DZD | type: ${v.paymentType}`);
  }

  console.log('\n--- SAFAA (#529) ---');
  console.log('Vouchers:');
  const safaaVouchers = class6?.vouchers.filter(v => v.studentId === safaa?.studentId);
  for (const v of safaaVouchers || []) {
    console.log(`  Voucher #${v.id} | ${v.issuedAt.toISOString().slice(0, 10)} | ${v.amount} DZD | type: ${v.paymentType}`);
  }

  // Let's check payroll sessions for class 6 and check paying students in each lesson
  const payroll = await calculateTeacherPayroll(teacherId, start, end);
  const class6Sessions = payroll?.sessionDetails.filter((s: any) => s.className.includes('خاص'));

  console.log('\n=== PAYROLL SESSIONS FOR حموي فوج خاص ===');
  for (const s of class6Sessions || []) {
    console.log(`Lesson #${s.lessonId} | Date: ${new Date(s.startsAt).toISOString().slice(0, 10)} | PayingCount: ${s.payingCount} | Retro: ${s.isRetroactive}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
