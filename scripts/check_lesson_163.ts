import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

import { prisma } from './lib/db';

async function main() {
  const lesson163 = await prisma.lesson.findUnique({
    where: { id: 163 },
    include: {
      attendances: {
        include: { student: true }
      }
    }
  });

  console.log('Lesson 163 attendances:');
  for (const a of lesson163?.attendances || []) {
    console.log(`- Student ${a.student.name} (id: ${a.studentId}): status=${a.status}`);
  }

  // Also check vouchers for these students in class 57
  const studentIds = lesson163?.attendances.filter(a => a.status === 'PRESENT').map(a => a.studentId) || [];
  const vouchers = await prisma.voucher.findMany({
    where: {
      studentId: { in: studentIds },
      classId: 57
    }
  });
  console.log('\nVouchers in class 57 for present students:');
  for (const v of vouchers) {
    console.log(`- Student ${v.studentId}: voucher #${v.id}, amount=${v.amount}`);
  }
}

main().finally(() => prisma.$disconnect());
