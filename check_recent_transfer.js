require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('═'.repeat(60));
  console.log('  RECENT TRANSFERS & DAILY LEDGER INSPECTION');
  console.log('═'.repeat(60));

  // 1. Fetch recent transfers
  const recentTransfers = await prisma.enrollmentTransfer.findMany({
    take: 10,
    orderBy: { transferredAt: 'desc' },
    include: {
      fromEnrollment: { include: { student: true, class: { include: { branch: true } } } },
      toEnrollment: { include: { student: true, class: { include: { branch: true } } } },
    }
  });

  console.log('\n--- 10 Most Recent Enrollment Transfers ---');
  for (const t of recentTransfers) {
    console.log(`ID: ${t.id} | At: ${t.transferredAt.toISOString()} | Student: ${t.fromEnrollment?.student?.name || t.toEnrollment?.student?.name} | Amount: ${Number(t.amount)} DZD | Sessions: ${t.transferredSessions} | From: [${t.fromEnrollment?.class?.branch?.name}] ${t.fromEnrollment?.class?.name} -> To: [${t.toEnrollment?.class?.branch?.name}] ${t.toEnrollment?.class?.name} | By: ${t.transferredBy} | Notes: ${t.notes}`);
  }

  // 2. Fetch DailyLedger records for today (2026-10-07) and yesterday (2026-10-06)
  const dls = await prisma.dailyLedger.findMany({
    where: {
      date: { gte: new Date('2026-10-06T00:00:00.000Z') }
    },
    include: { Branch: { select: { name: true } } },
    orderBy: [{ date: 'desc' }, { branchId: 'asc' }]
  });

  console.log('\n--- DailyLedger Entries (2026-10-06 and 2026-10-07) ---');
  for (const d of dls) {
    console.log(`Date: ${d.date.toISOString().split('T')[0]} | Branch: [${d.branchId}] ${d.Branch?.name} | Type: ${d.type.padEnd(14)} | Amount: ${Number(d.amount)} DZD`);
  }

  // 3. Vouchers for today (2026-10-07)
  const todayStart = new Date('2026-10-07T00:00:00.000Z');
  const todayVouchers = await prisma.voucher.findMany({
    where: {
      issuedAt: { gte: todayStart }
    },
    include: {
      student: { select: { name: true } },
      class: { select: { name: true, branchId: true } }
    },
    orderBy: { issuedAt: 'desc' }
  });

  console.log('\n--- Vouchers for Today (2026-10-07) --- Count:', todayVouchers.length);
  for (const v of todayVouchers) {
    console.log(`Voucher #${v.number} | At: ${v.issuedAt.toISOString()} | Student: ${v.student?.name} | Amount: ${Number(v.amount)} DZD | Type: ${v.paymentType} | Issuing: ${v.issuingBranchId} | Target: ${v.targetBranchId} | Class: ${v.class?.name}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
