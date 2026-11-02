import { prisma } from './lib/db';

interface MoveOptions {
  apply: boolean;
}

async function moveVouchersToPayerBrother({ apply }: MoveOptions) {
  console.log('--- STARTING VOUCHER TRANSFER FOR STUDENT #799 ---');
  console.log(`Mode: ${apply ? 'APPLY (Database will be updated)' : 'DRY-RUN (No changes saved)'}\n`);

  // 1. Fetch Source Student #799
  const source = await prisma.student.findUnique({
    where: { globalNumber: 799 },
    include: {
      family: {
        include: {
          payerStudent: true,
          students: true,
        },
      },
      vouchers: {
        include: {
          class: { select: { id: true, name: true } },
          refunds: true,
        },
      },
      enrollments: {
        include: {
          class: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!source) {
    throw new Error('Student #799 not found!');
  }

  console.log(`Source Student:`);
  console.log(`  Name:         ${source.name}`);
  console.log(`  Global #:     #${source.globalNumber}`);
  console.log(`  ID:           ${source.id}`);
  console.log(`  Family:       ID ${source.familyId} (${source.family?.name ?? 'No Name'})`);
  console.log(`  Payer Status: ${source.payerStatus}`);

  // 2. Identify Payer Brother
  const payerStudentId = source.family?.payerStudentId;
  if (!payerStudentId) {
    throw new Error(`Student #799 does not belong to a family or has no payerStudentId set!`);
  }

  const payerBrother = await prisma.student.findUnique({
    where: { id: payerStudentId },
    include: {
      enrollments: {
        include: {
          class: { select: { id: true, name: true } },
        },
      },
      vouchers: {
        include: {
          class: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!payerBrother) {
    throw new Error(`Payer student with ID ${payerStudentId} not found in database!`);
  }

  if (payerBrother.id === source.id) {
    throw new Error(`Student #799 is already marked as the payer of the family.`);
  }

  console.log(`\nPayer Brother:`);
  console.log(`  Name:         ${payerBrother.name}`);
  console.log(`  Global #:     #${payerBrother.globalNumber}`);
  console.log(`  ID:           ${payerBrother.id}`);
  console.log(`  Payer Status: ${payerBrother.payerStatus}`);

  // 3. Inspect Vouchers of #799
  const vouchers = source.vouchers;
  console.log(`\nVouchers to move from #${source.globalNumber} to #${payerBrother.globalNumber} (${vouchers.length} vouchers):`);
  vouchers.forEach((v) => {
    console.log(
      `  - Voucher ID ${v.id} (Series ${v.seriesId}, #${v.number}): Amount ${v.amount} DZD | Type: ${v.paymentType} | Status: ${v.status} | Voided: ${v.isVoided} | Refund: ${v.isRefund} | Class: ${v.class?.name ?? 'N/A'} (ID ${v.classId})`
    );
  });

  if (vouchers.length === 0) {
    console.log('No vouchers found to move!');
    return;
  }

  // 4. Check enrollments in Class 33
  const sourceClass33Enr = source.enrollments.find((e) => e.classId === 33);
  const targetClass33Enr = payerBrother.enrollments.find((e) => e.classId === 33);

  console.log('\nEnrollments in Class 33:');
  console.log(
    `  #799 (${source.name}): Enrollment ID ${sourceClass33Enr?.id ?? 'None'}, Status: ${sourceClass33Enr?.status ?? 'N/A'}`
  );
  console.log(
    `  #784 (${payerBrother.name}): Enrollment ID ${targetClass33Enr?.id ?? 'None'}, Status: ${targetClass33Enr?.status ?? 'N/A'}`
  );

  if (!apply) {
    console.log('\n[DRY-RUN COMPLETE] Run with --apply to execute the transaction in the database.');
    return;
  }

  // 5. Execute in PostgreSQL Transaction
  console.log('\nExecuting transfer in database transaction...');

  await prisma.$transaction(async (tx) => {
    const voucherIds = vouchers.map((v) => v.id);

    // a. Update studentId on all vouchers
    const updateResult = await tx.voucher.updateMany({
      where: { id: { in: voucherIds } },
      data: {
        studentId: payerBrother.id,
        lastEditedAt: new Date(),
        lastEditedBy: 'system',
      },
    });

    console.log(`  ✓ Updated studentId to #${payerBrother.globalNumber} for ${updateResult.count} vouchers.`);

    // b. Create VoucherEdit records for each voucher
    for (const v of vouchers) {
      await tx.voucherEdit.create({
        data: {
          voucherId: v.id,
          editedBy: 'system',
          editedAt: new Date(),
          fieldName: 'studentId',
          oldValue: `${source.name} (#${source.globalNumber}, ${source.id})`,
          newValue: `${payerBrother.name} (#${payerBrother.globalNumber}, ${payerBrother.id})`,
          reason: `نقل وصل الدفع من الطالب #${source.globalNumber} (${source.name}) إلى أخيه الدافع #${payerBrother.globalNumber} (${payerBrother.name})`,
        },
      });
    }
    console.log(`  ✓ Created ${vouchers.length} VoucherEdit audit trail records.`);

    // c. If source enrollment in Class 33 was REFUNDED, restore it to ACTIVE
    if (sourceClass33Enr && sourceClass33Enr.status === 'REFUNDED') {
      await tx.enrollment.update({
        where: { id: sourceClass33Enr.id },
        data: {
          status: 'ACTIVE',
        },
      });
      console.log(`  ✓ Restored Enrollment ID ${sourceClass33Enr.id} for student #${source.globalNumber} in Class 33 to ACTIVE.`);
    }

    // d. Create AuditLog entry
    await tx.auditLog.create({
      data: {
        entityType: 'VOUCHER',
        entityId: String(source.globalNumber),
        action: 'MOVE_VOUCHERS_TO_PAYER_BROTHER',
        branchId: source.registeredBranchId,
        userId: 'admin',
        userName: 'Admin',
        oldValue: `Student #${source.globalNumber} (${source.name})`,
        newValue: `Student #${payerBrother.globalNumber} (${payerBrother.name})`,
        details: JSON.stringify({
          sourceStudent: { id: source.id, globalNumber: source.globalNumber, name: source.name },
          targetPayerBrother: { id: payerBrother.id, globalNumber: payerBrother.globalNumber, name: payerBrother.name },
          familyId: source.familyId,
          vouchersMoved: vouchers.map((v) => ({
            id: v.id,
            seriesId: v.seriesId,
            number: v.number,
            amount: v.amount,
            paymentType: v.paymentType,
            classId: v.classId,
          })),
          restoredEnrollmentId: sourceClass33Enr?.id,
        }),
      },
    });
    console.log(`  ✓ Created central AuditLog record.`);
  });

  console.log('\n--- TRANSFER COMPLETED SUCCESSFULLY ---');
}

const applyFlag = process.argv.includes('--apply');
moveVouchersToPayerBrother({ apply: applyFlag })
  .catch((err) => {
    console.error('Transfer failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
