import { prisma } from './lib/db';

async function main() {
  // Let's get all 183 PRESENT attendances in Class 56 & 57
  const attendances = await prisma.attendance.findMany({
    where: {
      lesson: { classId: { in: [56, 57] } },
      status: 'PRESENT'
    },
    include: {
      student: {
        include: {
          vouchers: {
            where: { classId: { in: [56, 57] } },
            orderBy: { issuedAt: 'asc' }
          },
          enrollments: {
            include: {
              transfersTo: true,
              transfersFrom: true
            }
          }
        }
      },
      lesson: {
        include: { class: true }
      }
    },
    orderBy: [
      { lesson: { startsAt: 'asc' } },
      { student: { name: 'asc' } }
    ]
  });

  console.log(`Total PRESENT attendances: ${attendances.length}`);

  // Let's check for each attendance:
  // Is it G1 or G2?
  // Let's check if the attendance has any special condition
}

main().catch(console.error).finally(() => prisma.$disconnect());
