import { prisma } from './lib/db';
import { calculateTeacherPayroll } from '../src/lib/payroll';

async function main() {
  const teacherId = 'd9e91746-9976-4993-933b-61b244bf372e';
  const start = new Date(Date.UTC(2026, 9, 1));
  const end = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));

  // Let's run calculateTeacherPayroll and inspect studentDetails for class 6
  // But calculateTeacherPayroll doesn't put studentDetails in TeacherPayrollCalculation by default,
  // let's see how payingCount is calculated in payroll.ts lines 564-620
  const payroll = await calculateTeacherPayroll(teacherId, start, end);
  const class6Sessions = payroll?.sessionDetails.filter((s: any) => s.className.includes('خاص'));
  console.log('Class 6 sessions:');
  for (const s of class6Sessions || []) {
    console.log(`Lesson #${s.lessonId} | ${new Date(s.startsAt).toISOString().slice(0, 10)} | payingCount: ${s.payingCount} | retro: ${s.isRetroactive}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
