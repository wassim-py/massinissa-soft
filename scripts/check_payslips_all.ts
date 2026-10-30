import { prisma } from './lib/db';

async function main() {
  const payslips = await prisma.payslip.findMany({
    take: 20,
    include: {
      PayrollRun: true,
      PayslipBranchLine: true,
    }
  });

  console.log(`Total payslips in DB: ${payslips.length}`);
  for (const p of payslips) {
    console.log(`Payslip #${p.id} | person: ${p.personId} (${p.personType}) | sessions: ${p.sessionsCount} | gross: ${p.grossAmount}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
