/**
 * scripts/clean-attendance-db.ts
 * Safely removes the corrupted attendance records, extra lessons created by the
 * previous import, and book receipts created by system_import.
 */
import { prisma } from './lib/db';

async function main() {
  console.log('--- CLEANING ATTENDANCE DATABASE ---');

  const extraLessonsWithAtt = await prisma.lesson.findMany({
    where: { isExtra: true },
    select: { id: true }
  });
  const extraLessonIds = extraLessonsWithAtt.map(l => l.id);

  console.log(`Found ${extraLessonIds.length} extra lessons.`);

  const totalAttendances = await prisma.attendance.count();
  console.log(`Current total attendance records in DB: ${totalAttendances}`);

  const systemReceiptsCount = await prisma.bookReceipt.count({
    where: { receivedBy: 'system_import' }
  });
  console.log(`Book receipts by system_import: ${systemReceiptsCount}`);

  // Delete all attendance records (they all come from the import or were corrupted by it)
  const delAtt = await prisma.attendance.deleteMany({});
  console.log(`Deleted ${delAtt.count} attendance records.`);

  // Delete extra lessons created by the import
  const delLessons = await prisma.lesson.deleteMany({
    where: { isExtra: true }
  });
  console.log(`Deleted ${delLessons.count} extra lessons.`);

  // Delete system_import book receipts so they can be re-imported cleanly
  const delReceipts = await prisma.bookReceipt.deleteMany({
    where: { receivedBy: 'system_import' }
  });
  console.log(`Deleted ${delReceipts.count} system_import book receipts.`);

  // Verify regular lessons (isExtra: false)
  const remainingLessons = await prisma.lesson.count();
  console.log(`Remaining schedule/regular lessons in DB: ${remainingLessons}`);

  const remainingAttendances = await prisma.attendance.count();
  console.log(`Remaining attendances: ${remainingAttendances}`);

  console.log('--- CLEANUP COMPLETE ---');
  await prisma.$disconnect();
}

main().catch(console.error);
