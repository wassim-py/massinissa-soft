/**
 * check-db.js — Quick DB reference data check
 * Run: node scripts/check-db.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [branches, classes, years, trims, levels, voucherSeries, studentCount, lessonCount, classCount] =
    await Promise.all([
      prisma.branch.findMany({ select: { id: true, name: true } }),
      prisma.class.findMany({
        select: { id: true, name: true, branchId: true, levelId: true, hasBooks: true, pricePerCycle: true, teacherId: true },
        orderBy: [{ branchId: 'asc' }, { name: 'asc' }],
      }),
      prisma.academicYear.findMany(),
      prisma.trimester.findMany({ orderBy: { startDate: 'asc' } }),
      prisma.level.findMany({ orderBy: { name: 'asc' } }),
      prisma.voucherSeries.findMany({
        include: { issuingBranch: { select: { name: true } }, level: { select: { name: true } }, targetBranch: { select: { name: true } } },
      }),
      prisma.student.count(),
      prisma.lesson.count(),
      prisma.class.count(),
    ]);

  console.log('\n=== BRANCHES ===');
  console.table(branches);

  console.log('\n=== ACADEMIC YEARS ===');
  console.table(years);

  console.log('\n=== TRIMESTERS ===');
  console.table(trims.map(t => ({ id: t.id, label: t.label, name: t.name, status: t.status, start: t.startDate?.toISOString()?.slice(0,10), end: t.endDate?.toISOString()?.slice(0,10) })));

  console.log('\n=== LEVELS ===');
  console.table(levels);

  console.log('\n=== VOUCHER SERIES ===');
  console.table(voucherSeries.map(s => ({
    id: s.id,
    issuingBranch: s.issuingBranch?.name,
    targetBranch: s.targetBranch?.name ?? '—',
    level: s.level?.name ?? '—',
    scope: s.scope,
    currentNumber: s.currentNumber,
  })));

  console.log(`\n=== COUNTS: Students=${studentCount} | Classes/Groups=${classCount} | Lessons=${lessonCount} ===`);

  console.log('\n=== CLASSES/GROUPS (first 30) ===');
  console.table(classes.slice(0, 30).map(c => ({
    id: c.id, name: c.name, branchId: c.branchId, levelId: c.levelId, hasBooks: c.hasBooks, pricePerCycle: c.pricePerCycle?.toString(),
  })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
