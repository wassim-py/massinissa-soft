import { prisma } from './lib/db';

async function main() {
  const teacherId = 'e8e8bea1-60a2-42f2-97bf-188e37f1fc4b';
  const payslips = await prisma.payslip.findMany({
    where: { personId: teacherId },
    include: {
      PayrollRun: true,
      PayslipBranchLine: {
        include: { Branch: true }
      }
    },
    orderBy: { id: 'desc' }
  });

  console.log(`Payslips found: ${payslips.length}`);
  for (const p of payslips) {
    console.log(`Payslip #${p.id}: period ${p.PayrollRun.periodStart.toISOString().split('T')[0]} to ${p.PayrollRun.periodEnd.toISOString().split('T')[0]} | sessionsCount: ${p.sessionsCount} | grossAmount: ${p.grossAmount} | netAmount: ${p.netAmount}`);
    for (const bl of p.PayslipBranchLine) {
      console.log(`   BranchLine: branch=${bl.Branch?.name} sessionsCount=${bl.sessionsCount} amount=${bl.amount}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
