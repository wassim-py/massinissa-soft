require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Import getDailyBranchLedgerData logic
async function checkLedger(branchId, dateStr) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true }
  });

  const now = new Date(dateStr + 'T12:00:00.000Z');
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  const [ledgerRows, missingRecords, surplusRecords, todayVouchers, todayTransfers] = await Promise.all([
    prisma.dailyLedger.findMany({
      where: {
        branchId,
        date: { gte: startOfDay, lte: endOfDay },
      },
    }),
    prisma.missingMoney.findMany({
      where: {
        branchId,
        date: { gte: startOfDay, lte: endOfDay },
      },
    }),
    prisma.surplusMoney.findMany({
      where: {
        branchId,
        date: { gte: startOfDay, lte: endOfDay },
      },
    }),
    prisma.voucher.findMany({
      where: {
        issuingBranchId: branchId,
        issuedAt: { gte: startOfDay, lte: endOfDay },
        isVoided: false,
      },
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
        fromEnrollment: {
          include: {
            student: { select: { id: true, name: true } },
            class: { include: { branch: { select: { id: true, name: true } } } },
          },
        },
        toEnrollment: {
          include: {
            student: { select: { id: true, name: true } },
            class: { include: { branch: { select: { id: true, name: true } } } },
          },
        },
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
    if (type === "REFUND") {
      summary.refunds += Math.abs(amount);
    } else {
      summary.grossRevenue += amount;
      if (type === "TUITION" || type === "EXTRA_SESSION") summary.tuition += amount;
      else if (type === "INSCRIPTION") summary.inscription += amount;
      else if (type === "BOOK") summary.book += amount;
      else if (type === "ATELIER_FORMATION") summary.atelierFormation += amount;
    }
  }

  for (const m of missingRecords) {
    const amt = Number(m.amount);
    if (m.status === "CONFIRMED") summary.confirmedMissing += amt;
    else if (m.status === "PENDING") summary.pendingMissing += amt;
  }

  for (const s of surplusRecords) {
    const amt = Number(s.amount);
    if (s.status === "CONFIRMED") summary.confirmedSurplus += amt;
    else if (s.status === "PENDING") summary.pendingSurplus += amt;
  }

  summary.netCash = summary.grossRevenue - summary.refunds - summary.confirmedMissing + summary.confirmedSurplus;

  const transfersInTotal = (todayTransfers || [])
    .filter((t) => t.toEnrollment?.class?.branch?.id === branchId && t.fromEnrollment?.class?.branch?.id !== branchId)
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const transfersOutTotal = (todayTransfers || [])
    .filter((t) => t.fromEnrollment?.class?.branch?.id === branchId && t.toEnrollment?.class?.branch?.id !== branchId)
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const voucherSum = todayVouchers.reduce((s, v) => s + Number(v.amount), 0);

  console.log(`\n======================================================`);
  console.log(`BRANCH [${branchId}] ${branch.name} — Date: ${dateStr}`);
  console.log(`======================================================`);
  console.log(`Gross Revenue (from DailyLedger) : ${summary.grossRevenue} DZD`);
  console.log(`Net Cash in Box (summary.netCash): ${summary.netCash} DZD`);
  console.log(`  - Tuition                      : ${summary.tuition} DZD`);
  console.log(`  - Inscription                  : ${summary.inscription} DZD`);
  console.log(`  - Book                         : ${summary.book} DZD`);
  console.log(`Physical Vouchers Sum            : ${voucherSum} DZD (Count: ${todayVouchers.length})`);
  console.log(`Voucher vs Ledger diff           : ${summary.netCash - voucherSum} DZD`);
  console.log(`Transfers Count                  : ${todayTransfers.length}`);
  console.log(`Transfers IN total (incoming)    : ${transfersInTotal} DZD`);
  console.log(`Transfers OUT total (outgoing)   : ${transfersOutTotal} DZD`);
  if (todayTransfers.length > 0) {
    console.log(`Transfers Details:`);
    todayTransfers.forEach(t => {
      console.log(`  - #${t.id}: ${t.fromEnrollment?.student?.name} | ${Number(t.amount)} DZD | From: ${t.fromEnrollment?.class?.branch?.name} -> To: ${t.toEnrollment?.class?.branch?.name} | By: ${t.transferredBy} | Notes: ${t.notes}`);
    });
  }
}

async function main() {
  for (const date of ['2026-10-06', '2026-10-07']) {
    for (const b of [1, 2, 3]) {
      await checkLedger(b, date);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
