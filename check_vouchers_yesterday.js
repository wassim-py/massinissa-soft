require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const start = new Date('2026-10-06T00:00:00.000Z');
  const end = new Date('2026-10-06T23:59:59.999Z');

  const vouchers = await prisma.voucher.findMany({
    where: {
      issuedAt: { gte: start, lte: end },
      isVoided: false,
    },
    include: {
      class: { select: { name: true, branchId: true } },
      student: { select: { name: true } }
    },
    orderBy: { issuedAt: 'asc' }
  });

  console.log('Total active vouchers on 2026-10-06:', vouchers.length);

  // Group by issuing branch
  const byIssuing = { 1: { count: 0, sum: 0, tuition: 0, inscription: 0, book: 0 }, 2: { count: 0, sum: 0, tuition: 0, inscription: 0, book: 0 }, 3: { count: 0, sum: 0, tuition: 0, inscription: 0, book: 0 } };
  // Group by target branch
  const byTarget = { 1: { count: 0, sum: 0, tuition: 0, inscription: 0, book: 0 }, 2: { count: 0, sum: 0, tuition: 0, inscription: 0, book: 0 }, 3: { count: 0, sum: 0, tuition: 0, inscription: 0, book: 0 } };

  for (const v of vouchers) {
    const amt = Number(v.amount);
    const ib = v.issuingBranchId;
    const tb = v.targetBranchId;

    if (byIssuing[ib]) {
      byIssuing[ib].count++;
      byIssuing[ib].sum += amt;
      if (v.paymentType.startsWith('TUITION')) byIssuing[ib].tuition += amt;
      else if (v.paymentType === 'INSCRIPTION') byIssuing[ib].inscription += amt;
      else if (v.paymentType === 'BOOK') byIssuing[ib].book += amt;
    }

    if (byTarget[tb]) {
      byTarget[tb].count++;
      byTarget[tb].sum += amt;
      if (v.paymentType.startsWith('TUITION')) byTarget[tb].tuition += amt;
      else if (v.paymentType === 'INSCRIPTION') byTarget[tb].inscription += amt;
      else if (v.paymentType === 'BOOK') byTarget[tb].book += amt;
    }
  }

  console.log('\n--- BY ISSUING BRANCH (Cash in box at that location) ---');
  console.log(byIssuing);

  console.log('\n--- BY TARGET BRANCH (Pedagogical class location) ---');
  console.log(byTarget);

  console.log('\n--- Current DailyLedger in DB for 2026-10-06 ---');
  const dls = await prisma.dailyLedger.findMany({
    where: { date: start },
    include: { Branch: { select: { name: true } } },
    orderBy: [{ branchId: 'asc' }, { type: 'asc' }]
  });
  dls.forEach(d => {
    console.log(`Branch [${d.branchId}] ${d.Branch?.name}: ${d.type.padEnd(14)} = ${Number(d.amount)} DZD`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
