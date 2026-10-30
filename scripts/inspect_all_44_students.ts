import { prisma } from './lib/db';

async function main() {
  // Let's inspect all 44 students who have attendances in Class 56 or 57
  const students = await prisma.student.findMany({
    where: {
      attendances: {
        some: {
          lesson: { classId: { in: [56, 57] } },
          status: 'PRESENT'
        }
      }
    },
    include: {
      enrollments: {
        include: {
          class: true,
          transfersFrom: { include: { toEnrollment: { include: { class: true } } } },
          transfersTo: { include: { fromEnrollment: { include: { class: true } } } },
        }
      },
      vouchers: {
        include: { class: true },
        orderBy: { issuedAt: 'asc' }
      },
      family: {
        include: {
          students: true,
          payerStudent: true
        }
      },
      attendances: {
        where: { lesson: { classId: { in: [56, 57] } } },
        include: { lesson: { include: { class: true } } },
        orderBy: { lesson: { startsAt: 'asc' } }
      }
    }
  });

  console.log(`Total students: ${students.length}`);

  for (const s of students) {
    const presences56 = s.attendances.filter(a => a.lesson.classId === 56 && a.status === 'PRESENT');
    const presences57 = s.attendances.filter(a => a.lesson.classId === 57 && a.status === 'PRESENT');
    const totalPresences = presences56.length + presences57.length;

    // Check vouchers for 56 and 57
    const v56 = s.vouchers.filter(v => v.classId === 56);
    const v57 = s.vouchers.filter(v => v.classId === 57);
    const totalVoucherAmount56 = v56.reduce((sum, v) => sum + Number(v.amount), 0);
    const totalVoucherAmount57 = v57.reduce((sum, v) => sum + Number(v.amount), 0);

    // Any transfers?
    const hasTransfers = s.enrollments.some(e => e.transfersFrom.length > 0 || e.transfersTo.length > 0);
    const hasFamily = Boolean(s.familyId);
    const payerStatus = s.payerStatus;

    // Print if anything interesting: attended both, transferred, family, or vouchers != presences
    const pricePerSession = 375; // 1500 / 4
    const paidSessions56 = Math.floor(totalVoucherAmount56 / pricePerSession);
    const paidSessions57 = Math.floor(totalVoucherAmount57 / pricePerSession);

    console.log(`\n------------------------------------------------------------`);
    console.log(`Student #${s.globalNumber} ${s.name} (ID: ${s.id})`);
    console.log(`  G1 Presences: ${presences56.length} | Paid Sessions G1: ${paidSessions56} (vouchers: ${totalVoucherAmount56} DZD)`);
    console.log(`  G2 Presences: ${presences57.length} | Paid Sessions G2: ${paidSessions57} (vouchers: ${totalVoucherAmount57} DZD)`);
    if (hasTransfers) {
      console.log(`  TRANSFERS:`);
      for (const e of s.enrollments) {
        for (const tf of e.transfersFrom) {
          console.log(`    From ${e.class.name} to ${tf.toEnrollment?.class?.name} on ${tf.transferredAt.toISOString().slice(0, 10)} (${tf.transferredSessions} sess, ${tf.amount} DZD)`);
        }
        for (const tt of e.transfersTo) {
          console.log(`    To ${e.class.name} from ${tt.fromEnrollment?.class?.name} on ${tt.transferredAt.toISOString().slice(0, 10)} (${tt.transferredSessions} sess, ${tt.amount} DZD)`);
        }
      }
    }
    if (hasFamily) {
      console.log(`  FAMILY: ID ${s.family?.id}, discount: ${s.family?.discountPercentage}%, payer: ${s.family?.payerStudent?.name} (${s.family?.payerStudentId})`);
    }
    if (s.payerStatus !== 'NORMAL') {
      console.log(`  PAYER STATUS: ${s.payerStatus}`);
    }
    for (const e of s.enrollments.filter(e => [56, 57].includes(e.classId))) {
      if (e.payerStatus !== 'NORMAL' || e.creditResetOffset !== 0) {
        console.log(`  ENROLLMENT in ${e.class.name}: payerStatus=${e.payerStatus}, offset=${e.creditResetOffset}`);
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
