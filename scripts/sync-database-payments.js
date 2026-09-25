/**
 * scripts/sync-database-payments.js
 * Synchronizes DailyLedger from all active Vouchers and Refunds,
 * and fixes VoucherSeries currentNumber counters.
 */
require('dotenv').config();
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

function normalizeDateToStartOfDay(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function resolveLedgerType(paymentType, isFormation = false) {
  if (isFormation || paymentType === "WORKSHOP") {
    return "ATELIER_FORMATION";
  }
  switch (paymentType) {
    case "TUITION_4SESSION":
    case "CATCHUP":
    case "EXTRA_SESSION":
      return "TUITION";
    case "INSCRIPTION":
      return "INSCRIPTION";
    case "BOOK":
      return "BOOK";
    default:
      return "TUITION";
  }
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  SYNCHRONIZING DATABASE PAYMENTS & DAILY LEDGER');
  console.log('═'.repeat(60));

  // 1. Fetch all active vouchers and refunds
  const [vouchers, refunds] = await Promise.all([
    prisma.voucher.findMany({
      where: { isVoided: false },
      include: { class: true },
    }),
    prisma.refund.findMany({
      include: { voucher: true },
    }),
  ]);

  console.log(`\nFound ${vouchers.length} active vouchers, ${refunds.length} refunds.`);

  // 2. Aggregate DailyLedger entries
  const ledgerMap = new Map();

  for (const v of vouchers) {
    const amount = Number(v.amount);
    if (amount <= 0) continue;

    const normalizedDate = normalizeDateToStartOfDay(v.issuedAt);
    const dateKey = normalizedDate.toISOString();
    const type = resolveLedgerType(v.paymentType, v.class?.isFormation ?? false);
    const branchId = v.targetBranchId; // Cross-branch lands on TARGET branch
    const mapKey = `${branchId}|${dateKey}|${type}`;

    const current = ledgerMap.get(mapKey);
    if (current) {
      current.amount += amount;
    } else {
      ledgerMap.set(mapKey, { branchId, date: normalizedDate, type, amount });
    }
  }

  for (const r of refunds) {
    const amount = Number(r.amount);
    if (amount <= 0) continue;

    const normalizedDate = normalizeDateToStartOfDay(r.refundedAt);
    const dateKey = normalizedDate.toISOString();
    const type = "REFUND";
    const branchId = r.voucher.targetBranchId;
    const mapKey = `${branchId}|${dateKey}|${type}`;

    const current = ledgerMap.get(mapKey);
    if (current) {
      current.amount += amount;
    } else {
      ledgerMap.set(mapKey, { branchId, date: normalizedDate, type, amount });
    }
  }

  const items = Array.from(ledgerMap.values()).map(item => ({
    branchId: item.branchId,
    date: item.date,
    type: item.type,
    amount: new Prisma.Decimal(item.amount),
  }));

  console.log(`Generated ${items.length} DailyLedger entries across all dates and branches.`);

  // 3. Atomically overwrite DailyLedger
  await prisma.$transaction(async (tx) => {
    await tx.dailyLedger.deleteMany({});
    if (items.length > 0) {
      await tx.dailyLedger.createMany({
        data: items,
      });
    }
  });

  console.log('✅ DailyLedger successfully updated in the database!');

  // 4. Update VoucherSeries currentNumber counters
  console.log('\nChecking VoucherSeries currentNumber counters...');
  const allSeries = await prisma.voucherSeries.findMany({
    include: {
      issuingBranch: { select: { name: true } },
      level: { select: { name: true } },
    }
  });

  let fixedSeriesCount = 0;
  for (const s of allSeries) {
    const agg = await prisma.voucher.aggregate({
      where: { seriesId: s.id },
      _max: { number: true },
    });
    const maxNum = agg._max.number ?? 0;
    if (maxNum > s.currentNumber) {
      console.log(`  Updating Series #${s.id} (${s.issuingBranch?.name} - ${s.level?.name || 'GLOBAL'}): ${s.currentNumber} → ${maxNum}`);
      await prisma.voucherSeries.update({
        where: { id: s.id },
        data: { currentNumber: maxNum },
      });
      fixedSeriesCount++;
    }
  }

  console.log(`✅ VoucherSeries counters verified (${fixedSeriesCount} updated).`);

  // 5. Final verification check
  const [ledgerCount, totalGross] = await Promise.all([
    prisma.dailyLedger.count(),
    prisma.dailyLedger.aggregate({
      where: { type: { not: 'REFUND' } },
      _sum: { amount: true },
    }),
  ]);

  console.log(`\n${'═'.repeat(60)}`);
  console.log('SYNC COMPLETE');
  console.log(`  DailyLedger rows: ${ledgerCount}`);
  console.log(`  Total revenue:    ${totalGross._sum.amount?.toString()} DZD`);
  console.log('═'.repeat(60));
}

main()
  .catch((err) => {
    console.error('❌ Sync failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
