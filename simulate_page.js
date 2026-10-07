require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Let's check what DailyBranchLedgerPage renders for 2026-10-06 for each branch:
async function simulatePage(branchId, dateStr = '2026-10-06') {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  const now = new Date(dateStr + 'T12:00:00.000Z');
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  const [ledgerRows, missingRecords, surplusRecords, todayVouchers, todayTransfers] = await Promise.all([
    prisma.dailyLedger.findMany({
      where: { branchId, date: { gte: startOfDay, lte: endOfDay } },
    }),
    prisma.missingMoney.findMany({
      where: { branchId, date: { gte: startOfDay, lte: endOfDay } },
    }),
    prisma.surplusMoney.findMany({
      where: { branchId, date: { gte: startOfDay, lte: endOfDay } },
    }),
    prisma.voucher.findMany({
      where: { issuingBranchId: branchId, issuedAt: { gte: startOfDay, lte: endOfDay }, isVoided: false },
      include: {
        student: { select: { id: true, name: true } },
        class: { select: { name: true, branch: { select: { id: true, name: true } } } },
      },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.enrollmentTransfer.findMany({
      where: {
        transferredAt: { gte: startOfDay, lte: endOfDay },
        OR: [
          { fromEnrollment: { class: { branchId } } },
          { toEnrollment: { class: { branchId } } },
        ],
      },
      include: {
        fromEnrollment: { include: { student: true, class: { include: { branch: true } } } },
        toEnrollment: { include: { student: true, class: { include: { branch: true } } } },
      },
      orderBy: { transferredAt: "desc" },
    }),
  ]);

  const summary = {
    tuition: 0,
    inscription: 0,
    book: 0,
    atelierFormation: 0,
    grossRevenue: 0,
    refunds: 0,
    confirmedMissing: 0,
    pendingMissing: 0,
    confirmedSurplus: 0,
    pendingSurplus: 0,
    netCash: 0,
  };

  for (const row of ledgerRows) {
    const amount = Number(row.amount);
    const type = row.type;
    if (type === "REFUND") summary.refunds += Math.abs(amount);
    else {
      summary.grossRevenue += amount;
      if (type === "TUITION" || type === "EXTRA_SESSION") summary.tuition += amount;
      else if (type === "INSCRIPTION") summary.inscription += amount;
      else if (type === "BOOK") summary.book += amount;
      else if (type === "ATELIER_FORMATION") summary.atelierFormation += amount;
    }
  }

  summary.netCash = summary.grossRevenue - summary.refunds;

  const transfersInTotal = (todayTransfers || [])
    .filter((t) => t.toEnrollment?.class?.branch?.id === branchId && t.fromEnrollment?.class?.branch?.id !== branchId)
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const transfersOutTotal = (todayTransfers || [])
    .filter((t) => t.fromEnrollment?.class?.branch?.id === branchId && t.toEnrollment?.class?.branch?.id !== branchId)
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  console.log(`\n=============================================================`);
  console.log(`DAILY LEDGER PAGE FOR [${branchId}] ${branch?.name} (${dateStr})`);
  console.log(`=============================================================`);
  console.log(`[SECTION 1: CAISSE RECONCILIATION OVERVIEW]`);
  console.log(`  - Gross Collected Today : +${summary.grossRevenue} DZD`);
  console.log(`  - Refunds Today         : -${summary.refunds} DZD`);
  console.log(`  - Confirmed Missing     : -${summary.confirmedMissing} DZD`);
  console.log(`  - Confirmed Surplus     : +${summary.confirmedSurplus} DZD`);
  console.log(`  - NET CASH IN BOX       : ${summary.netCash} DZD`);
  console.log(`\n[SECTION 2: BREAKDOWN BY FEE TYPE]`);
  console.log(`  - Inscription Fees      : ${summary.inscription} DZD`);
  console.log(`  - Tuition Fees          : ${summary.tuition} DZD`);
  console.log(`  - Book Fees             : ${summary.book} DZD`);
  console.log(`  - Workshop Fees         : ${summary.atelierFormation} DZD`);
  console.log(`\n[SECTION 4: TODAY'S VOUCHERS]`);
  console.log(`  - Count: ${todayVouchers.length} vouchers`);
  console.log(`  - Sum  : ${todayVouchers.reduce((s, v) => s + Number(v.amount), 0)} DZD`);
  console.log(`\n[SECTION 5: TODAY'S CREDIT TRANSFERS]`);
  console.log(`  - Count: ${todayTransfers.length} transfers`);
  console.log(`  - Transfers IN (وارد) : +${transfersInTotal} DZD`);
  console.log(`  - Transfers OUT (صادر): -${transfersOutTotal} DZD`);
  todayTransfers.forEach(t => {
    const fromB = t.fromEnrollment?.class?.branch?.name;
    const toB = t.toEnrollment?.class?.branch?.name;
    const isCross = fromB !== toB;
    console.log(`    * Transfer #${t.id} | Student: ${t.fromEnrollment?.student?.name} | Amount: ${Number(t.amount)} DZD | ${fromB} -> ${toB} ${isCross ? '(CROSS-BRANCH)' : '(INTERNAL)'} | By: ${t.transferredBy} | Notes: ${t.notes}`);
  });
}

async function main() {
  await simulatePage(1, '2026-10-06');
  await simulatePage(2, '2026-10-06');
  await simulatePage(3, '2026-10-06');
}

main().catch(console.error).finally(() => prisma.$disconnect());
