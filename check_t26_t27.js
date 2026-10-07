require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const t26 = await prisma.enrollmentTransfer.findUnique({
    where: { id: 26 },
    include: {
      fromEnrollment: { include: { class: true } },
      toEnrollment: { include: { class: true } }
    }
  });
  console.log('Transfer #26:', t26);
  console.log('fromBranch:', t26?.fromEnrollment?.class?.branchId, 'toBranch:', t26?.toEnrollment?.class?.branchId);

  const t27 = await prisma.enrollmentTransfer.findUnique({
    where: { id: 27 },
    include: {
      fromEnrollment: { include: { class: true } },
      toEnrollment: { include: { class: true } }
    }
  });
  console.log('Transfer #27:', t27);
  console.log('fromBranch:', t27?.fromEnrollment?.class?.branchId, 'toBranch:', t27?.toEnrollment?.class?.branchId);
}

main().catch(console.error).finally(() => prisma.$disconnect());
