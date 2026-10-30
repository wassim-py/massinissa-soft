import { prisma } from './lib/db';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';

  const allRuns = await prisma.payrollRun.findMany({
    include: {
      Payslip: {
        where: { personId: teacherId },
        include: {
          PayslipBranchLine: true
        }
      }
    }
  });

  console.log(`All payroll runs count: ${allRuns.length}`);
  for (const r of allRuns) {
    console.log(`Run #${r.id} (${r.periodStart.toISOString().slice(0, 10)} to ${r.periodEnd.toISOString().slice(0, 10)}): payslips=${r.Payslip.length}`);
    for (const p of r.Payslip) {
      console.log(`  Payslip #${p.id}: sessionsCount=${p.sessionsCount}, gross=${p.grossAmount}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
