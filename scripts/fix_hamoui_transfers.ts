import { prisma } from './lib/db';

async function fixTransfers(dryRun = true) {
  console.log(`=== RUNNING FIX HAMOUI TRANSFERS (dryRun: ${dryRun}) ===\n`);

  await prisma.$transaction(async (tx) => {
    // -------------------------------------------------------------
    // 1. Student #228 - قداري وسيم
    // -------------------------------------------------------------
    console.log('--- Fixing Student #228 (قداري وسيم) ---');
    // Enr 470 = حموي علمي 3 (Active)
    // Enr 2485 = حموي علمي 1 (Transferred)
    // Transfer 133: reverse direction from 2485 to 470
    // Attendance on lesson 416 (23/10 in علمي 1) delete
    if (!dryRun) {
      await tx.enrollment.update({
        where: { id: 470 },
        data: { status: 'ACTIVE' }
      });
      await tx.enrollment.update({
        where: { id: 2485 },
        data: { status: 'TRANSFERRED' }
      });
      await tx.enrollmentTransfer.update({
        where: { id: 133 },
        data: {
          fromEnrollmentId: 2485,
          toEnrollmentId: 470,
          notes: 'تحويل من حموي علمي 1 إلى حموي علمي 3'
        }
      });
      const del228 = await tx.attendance.deleteMany({
        where: {
          student: { globalNumber: 228 },
          lessonId: 416
        }
      });
      console.log(`  ✓ Updated Enr 470 (ACTIVE), Enr 2485 (TRANSFERRED), Transfer 133 reversed, deleted ${del228.count} phantom attendance`);
    } else {
      console.log('  [DRY-RUN] Would update Enr 470 (ACTIVE), Enr 2485 (TRANSFERRED), reverse Transfer 133, delete attendance on lesson 416');
    }

    // -------------------------------------------------------------
    // 2. Student #205 - بن دكوم أشرف
    // -------------------------------------------------------------
    console.log('\n--- Fixing Student #205 (بن دكوم أشرف) ---');
    // Enr 435 = حموي علمي 3 (Active)
    // Enr 2339 = حموي علمي 2 (Transferred)
    // Clean ping-pong transfers 110 & 111, set Transfer 128 from 2339 to 435
    // Attendance on lesson 529 (24/10 in علمي 2) delete
    if (!dryRun) {
      await tx.enrollment.update({
        where: { id: 435 },
        data: { status: 'ACTIVE' }
      });
      await tx.enrollment.update({
        where: { id: 2339 },
        data: { status: 'TRANSFERRED' }
      });
      await tx.enrollmentTransfer.deleteMany({
        where: { id: { in: [110, 111] } }
      });
      await tx.enrollmentTransfer.update({
        where: { id: 128 },
        data: {
          fromEnrollmentId: 2339,
          toEnrollmentId: 435,
          notes: 'تحويل من حموي علمي 2 إلى حموي علمي 3'
        }
      });
      const del205 = await tx.attendance.deleteMany({
        where: {
          student: { globalNumber: 205 },
          lessonId: 529
        }
      });
      console.log(`  ✓ Updated Enr 435 (ACTIVE), Enr 2339 (TRANSFERRED), removed ping-pong 110/111, updated Transfer 128, deleted ${del205.count} phantom attendance`);
    } else {
      console.log('  [DRY-RUN] Would update Enr 435 (ACTIVE), Enr 2339 (TRANSFERRED), remove ping-pong 110/111, update Transfer 128, delete attendance on lesson 529');
    }

    // -------------------------------------------------------------
    // 3. Student #400 - قادري انيس
    // -------------------------------------------------------------
    console.log('\n--- Fixing Student #400 (قادري انيس) ---');
    // Enr 454 = حموي علمي 3 (Active)
    // Enr 2295 = حموي علمي 2 (Transferred)
    // Clean ping-pong transfers 106 & 107, set Transfer 130 from 2295 to 454
    // Attendance on lesson 529 (24/10 in علمي 2) delete
    if (!dryRun) {
      await tx.enrollment.update({
        where: { id: 454 },
        data: { status: 'ACTIVE' }
      });
      await tx.enrollment.update({
        where: { id: 2295 },
        data: { status: 'TRANSFERRED' }
      });
      await tx.enrollmentTransfer.deleteMany({
        where: { id: { in: [106, 107] } }
      });
      await tx.enrollmentTransfer.update({
        where: { id: 130 },
        data: {
          fromEnrollmentId: 2295,
          toEnrollmentId: 454,
          notes: 'تحويل من حموي علمي 2 إلى حموي علمي 3'
        }
      });
      const del400 = await tx.attendance.deleteMany({
        where: {
          student: { globalNumber: 400 },
          lessonId: 529
        }
      });
      console.log(`  ✓ Updated Enr 454 (ACTIVE), Enr 2295 (TRANSFERRED), removed ping-pong 106/107, updated Transfer 130, deleted ${del400.count} phantom attendance`);
    } else {
      console.log('  [DRY-RUN] Would update Enr 454 (ACTIVE), Enr 2295 (TRANSFERRED), remove ping-pong 106/107, update Transfer 130, delete attendance on lesson 529');
    }

    // -------------------------------------------------------------
    // 4. Student #403 - غيتي محمد لؤي
    // -------------------------------------------------------------
    console.log('\n--- Fixing Student #403 (غيتي محمد لؤي) ---');
    // Enr 457 = حموي علمي 3 (Active)
    // Enr 2457 = حموي علمي 2 (Transferred)
    // Transfer 131: reverse direction from 2457 to 457
    // Attendance on lesson 529 (24/10 in علمي 2) delete
    if (!dryRun) {
      await tx.enrollment.update({
        where: { id: 457 },
        data: { status: 'ACTIVE' }
      });
      await tx.enrollment.update({
        where: { id: 2457 },
        data: { status: 'TRANSFERRED' }
      });
      await tx.enrollmentTransfer.update({
        where: { id: 131 },
        data: {
          fromEnrollmentId: 2457,
          toEnrollmentId: 457,
          notes: 'تحويل من حموي علمي 2 إلى حموي علمي 3'
        }
      });
      const del403 = await tx.attendance.deleteMany({
        where: {
          student: { globalNumber: 403 },
          lessonId: 529
        }
      });
      console.log(`  ✓ Updated Enr 457 (ACTIVE), Enr 2457 (TRANSFERRED), reversed Transfer 131, deleted ${del403.count} phantom attendance`);
    } else {
      console.log('  [DRY-RUN] Would update Enr 457 (ACTIVE), Enr 2457 (TRANSFERRED), reverse Transfer 131, delete attendance on lesson 529');
    }

    // -------------------------------------------------------------
    // 5. Student #387 - بابوري امين الياس
    // -------------------------------------------------------------
    console.log('\n--- Fixing Student #387 (بابوري امين الياس) ---');
    // Enr 441 = حموي علمي 3 (Active)
    // Enr 2456 = حموي علمي 1 (Transferred)
    // Transfer 129 was the accidental transfer (from 441 to 2456) reversed by 151 (from 2456 to 441)
    // Delete 129 so Enr 441 has no outgoing transfer!
    if (!dryRun) {
      await tx.enrollment.update({
        where: { id: 441 },
        data: { status: 'ACTIVE' }
      });
      await tx.enrollment.update({
        where: { id: 2456 },
        data: { status: 'TRANSFERRED' }
      });
      await tx.enrollmentTransfer.deleteMany({
        where: { id: 129 }
      });
      console.log(`  ✓ Updated Enr 441 (ACTIVE), Enr 2456 (TRANSFERRED), removed cancelled Transfer 129`);
    } else {
      console.log('  [DRY-RUN] Would update Enr 441 (ACTIVE), Enr 2456 (TRANSFERRED), remove cancelled Transfer 129');
    }

    // -------------------------------------------------------------
    // 6. Student #77 - بروة يحي جاد
    // -------------------------------------------------------------
    console.log('\n--- Fixing Student #77 (بروة يحي جاد) ---');
    // Enr 77 = حموي علمي 2 (Transferred)
    // Enr 2494 = حموي رياضي (Active)
    // Attendance on lesson 529 (24/10 in علمي 2, NOT_DEFINED 'حول') delete
    if (!dryRun) {
      await tx.enrollment.update({
        where: { id: 77 },
        data: { status: 'TRANSFERRED' }
      });
      await tx.enrollment.update({
        where: { id: 2494 },
        data: { status: 'ACTIVE' }
      });
      const del77 = await tx.attendance.deleteMany({
        where: {
          student: { globalNumber: 77 },
          lessonId: 529
        }
      });
      console.log(`  ✓ Updated Enr 77 (TRANSFERRED), Enr 2494 (ACTIVE), deleted ${del77.count} phantom attendance`);
    } else {
      console.log('  [DRY-RUN] Would update Enr 77 (TRANSFERRED), Enr 2494 (ACTIVE), delete phantom attendance on lesson 529');
    }

    // -------------------------------------------------------------
    // 7. Student #1283 - قاسي ملاك
    // -------------------------------------------------------------
    console.log('\n--- Fixing Student #1283 (قاسي ملاك) ---');
    // Enr 1840 = حموي علمي 3 (Transferred)
    // Enr 2498 = حموي رياضي (Active)
    // Attendance on lesson 390 (23/10 in علمي 3, ABSENT after transfer) delete
    if (!dryRun) {
      await tx.enrollment.update({
        where: { id: 1840 },
        data: { status: 'TRANSFERRED' }
      });
      await tx.enrollment.update({
        where: { id: 2498 },
        data: { status: 'ACTIVE' }
      });
      const del1283 = await tx.attendance.deleteMany({
        where: {
          student: { globalNumber: 1283 },
          lessonId: 390
        }
      });
      console.log(`  ✓ Updated Enr 1840 (TRANSFERRED), Enr 2498 (ACTIVE), deleted ${del1283.count} phantom attendance`);
    } else {
      console.log('  [DRY-RUN] Would update Enr 1840 (TRANSFERRED), Enr 2498 (ACTIVE), delete phantom attendance on lesson 390');
    }

    // -------------------------------------------------------------
    // 8. Student #408 - مزايري توفيق
    // -------------------------------------------------------------
    console.log('\n--- Fixing Student #408 (مزايري توفيق) ---');
    // Attendance on lesson 390 (23/10 in علمي 3, ABSENT after transfer on 22/10) delete
    if (!dryRun) {
      const del408 = await tx.attendance.deleteMany({
        where: {
          student: { globalNumber: 408 },
          lessonId: 390
        }
      });
      console.log(`  ✓ Deleted ${del408.count} phantom attendance on lesson 390`);
    } else {
      console.log('  [DRY-RUN] Would delete phantom attendance on lesson 390');
    }
  });

  console.log(`\n=== FIX HAMOUI TRANSFERS FINISHED ===`);
}

const isLive = process.argv.includes('--live');
fixTransfers(!isLive).catch(console.error).finally(() => prisma.$disconnect());
