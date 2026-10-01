require('dotenv').config();
const { Pool } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const rawConnectionString = process.env.DATABASE_URL || '';
const connectionString = rawConnectionString.replace('?sslmode=verify-full', '');
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('====================================================');
  console.log('🧹 DATABASE CLEANUP: EMPTY FOR RE-PUSH');
  console.log('====================================================');
  console.log('PRESERVING:');
  console.log('  ✓ 3 Branches & their Classrooms');
  console.log('  ✓ Subjects (Language, FormationLevel, Level)');
  console.log('  ✓ Teachers (Teacher, TeacherBranch, TeacherPayRate)');
  console.log('  ✓ Groups (Class)');
  console.log('  ✓ Accounts (UserProfile, StaffMember)');
  console.log('  ✓ Academic Calendar (AcademicYear, Trimester)');
  console.log('  ✓ System Settings (Setting)');
  console.log('----------------------------------------------------');
  console.log('DELETING ALL OPERATIONAL & TRANSACTIONAL DATA TO RE-PUSH:');
  console.log('  ✗ Attendances & Lessons');
  console.log('  ✗ Enrollments & Transfers');
  console.log('  ✗ Vouchers, Refunds, VoucherEdits');
  console.log('  ✗ Students, Parent Phones, Families');
  console.log('  ✗ Books, Receipts, Drops, Distributions');
  console.log('  ✗ Workshops, Sessions, Participants');
  console.log('  ✗ DailyLedgers');
  console.log('  ✗ PayrollRuns, Payslips, SalaryAdvances, StaffPayrolls');
  console.log('  ✗ PhotocopyCharges, LevelTests, Announcements, AuditLogs');
  console.log('  ✗ DailyExpenses, CaisseNoireTransactions, Missing/Surplus');
  console.log('====================================================\n');

  // Start Transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('1. Clearing circular references...');
    await client.query(`UPDATE "Student" SET "familyId" = NULL;`);
    await client.query(`UPDATE "Family" SET "payerStudentId" = NULL;`);

    console.log('2. Deleting Book & Distribution data...');
    const dBookCopy = await client.query(`DELETE FROM "BookCopyDistribution";`);
    const dBookReceipt = await client.query(`DELETE FROM "BookReceipt";`);
    const dBookDrop = await client.query(`DELETE FROM "BookDrop";`);
    const dBook = await client.query(`DELETE FROM "Book";`);
    console.log(`   - BookCopyDistribution: ${dBookCopy.rowCount}`);
    console.log(`   - BookReceipt:          ${dBookReceipt.rowCount}`);
    console.log(`   - BookDrop:             ${dBookDrop.rowCount}`);
    console.log(`   - Book:                 ${dBook.rowCount}`);

    console.log('3. Deleting Attendance, CatchUp & Lesson data...');
    const dCatchUp = await client.query(`DELETE FROM "CatchUpAttendance";`);
    const dAttendance = await client.query(`DELETE FROM "Attendance";`);
    const dAnnouncement = await client.query(`DELETE FROM "Announcement";`);
    const dLesson = await client.query(`DELETE FROM "Lesson";`);
    console.log(`   - CatchUpAttendance:    ${dCatchUp.rowCount}`);
    console.log(`   - Attendance:           ${dAttendance.rowCount}`);
    console.log(`   - Announcement:         ${dAnnouncement.rowCount}`);
    console.log(`   - Lesson:               ${dLesson.rowCount}`);

    console.log('4. Deleting Enrollment & Transfer data...');
    const dTransfer = await client.query(`DELETE FROM "EnrollmentTransfer";`);
    const dEnrollment = await client.query(`DELETE FROM "Enrollment";`);
    console.log(`   - EnrollmentTransfer:   ${dTransfer.rowCount}`);
    console.log(`   - Enrollment:           ${dEnrollment.rowCount}`);

    console.log('5. Deleting Voucher & Financial transaction data...');
    const dVoucherEdit = await client.query(`DELETE FROM "VoucherEdit";`);
    const dRefund = await client.query(`DELETE FROM "Refund";`);
    const dVoucher = await client.query(`DELETE FROM "Voucher";`);
    const dLedger = await client.query(`DELETE FROM "DailyLedger";`);
    const dPhotocopy = await client.query(`DELETE FROM "PhotocopyCharge";`);
    const dMissing = await client.query(`DELETE FROM "MissingMoney";`);
    const dSurplus = await client.query(`DELETE FROM "SurplusMoney";`);
    const dDailyExpense = await client.query(`DELETE FROM "DailyExpense";`);
    const dCaisseNoire = await client.query(`DELETE FROM "CaisseNoireTransaction";`);
    console.log(`   - VoucherEdit:          ${dVoucherEdit.rowCount}`);
    console.log(`   - Refund:               ${dRefund.rowCount}`);
    console.log(`   - Voucher:              ${dVoucher.rowCount}`);
    console.log(`   - DailyLedger:          ${dLedger.rowCount}`);
    console.log(`   - PhotocopyCharge:      ${dPhotocopy.rowCount}`);
    console.log(`   - MissingMoney:         ${dMissing.rowCount}`);
    console.log(`   - SurplusMoney:         ${dSurplus.rowCount}`);
    console.log(`   - DailyExpense:         ${dDailyExpense.rowCount}`);
    console.log(`   - CaisseNoire:          ${dCaisseNoire.rowCount}`);

    console.log('6. Resetting VoucherSeries counters to 0...');
    const uSeries = await client.query(`UPDATE "VoucherSeries" SET "currentNumber" = 0;`);
    console.log(`   - Reset ${uSeries.rowCount} VoucherSeries currentNumber to 0`);

    console.log('7. Deleting Workshop data...');
    const dWAttendance = await client.query(`DELETE FROM "WorkshopAttendance";`);
    const dWParticipant = await client.query(`DELETE FROM "WorkshopParticipant";`);
    const dWSession = await client.query(`DELETE FROM "WorkshopSession";`);
    const dWorkshop = await client.query(`DELETE FROM "Workshop";`);
    console.log(`   - WorkshopAttendance:   ${dWAttendance.rowCount}`);
    console.log(`   - WorkshopParticipant:  ${dWParticipant.rowCount}`);
    console.log(`   - WorkshopSession:      ${dWSession.rowCount}`);
    console.log(`   - Workshop:             ${dWorkshop.rowCount}`);

    console.log('8. Deleting Student, Parent Phones & Family data...');
    const dLevelTest = await client.query(`DELETE FROM "LevelTest";`);
    const dParentPhone = await client.query(`DELETE FROM "ParentPhoneNumber";`);
    const dFamily = await client.query(`DELETE FROM "Family";`);
    const dStudent = await client.query(`DELETE FROM "Student";`);
    console.log(`   - LevelTest:            ${dLevelTest.rowCount}`);
    console.log(`   - ParentPhoneNumber:    ${dParentPhone.rowCount}`);
    console.log(`   - Family:               ${dFamily.rowCount}`);
    console.log(`   - Student:              ${dStudent.rowCount}`);

    console.log('9. Deleting Payroll & Advance data...');
    const dStaffPayroll = await client.query(`DELETE FROM "StaffPayroll";`);
    const dPayslipLine = await client.query(`DELETE FROM "PayslipBranchLine";`);
    const dPayslip = await client.query(`DELETE FROM "Payslip";`);
    const dPayrollRun = await client.query(`DELETE FROM "PayrollRun";`);
    const dAdvance = await client.query(`DELETE FROM "SalaryAdvance";`);
    console.log(`   - StaffPayroll:         ${dStaffPayroll.rowCount}`);
    console.log(`   - PayslipBranchLine:    ${dPayslipLine.rowCount}`);
    console.log(`   - Payslip:              ${dPayslip.rowCount}`);
    console.log(`   - PayrollRun:           ${dPayrollRun.rowCount}`);
    console.log(`   - SalaryAdvance:        ${dAdvance.rowCount}`);

    console.log('10. Deleting Audit logs...');
    const dAudit = await client.query(`DELETE FROM "AuditLog";`);
    console.log(`   - AuditLog:             ${dAudit.rowCount}`);

    console.log('11. Resetting Class isCompleted status...');
    await client.query(`UPDATE "Class" SET "isCompleted" = false, "completedAt" = NULL WHERE "isCompleted" = true;`);

    console.log('12. Resetting PostgreSQL sequences for cleared tables...');
    const tablesToResetSeq = [
      'ParentPhoneNumber',
      'Lesson',
      'Attendance',
      'CatchUpAttendance',
      'Announcement',
      'Workshop',
      'WorkshopSession',
      'WorkshopParticipant',
      'WorkshopAttendance',
      'DailyLedger',
      'AuditLog',
      'Enrollment',
      'EnrollmentTransfer',
      'Family',
      'LevelTest',
      'PayrollRun',
      'Payslip',
      'PayslipBranchLine',
      'PhotocopyCharge',
      'SalaryAdvance',
      'Voucher',
      'Refund',
      'VoucherEdit',
      'Book',
      'BookReceipt',
      'BookDrop',
      'BookCopyDistribution',
      'MissingMoney',
      'SurplusMoney',
      'DailyExpense',
      'CaisseNoireTransaction',
      'StaffPayroll'
    ];

    for (const table of tablesToResetSeq) {
      try {
        await client.query(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), 1, false);`);
      } catch (e) {
        // Table may not have a serial sequence or may be empty
      }
    }

    await client.query('COMMIT');
    console.log('\n✅ TRANSACTION COMMITTED SUCCESSFULLY!\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERROR OCCURRED! TRANSACTION ROLLED BACK:', err);
    throw err;
  } finally {
    client.release();
  }

  // Verification step
  console.log('====================================================');
  console.log('🔍 POST-CLEANUP VERIFICATION');
  console.log('====================================================');

  const preservedCounts = {
    'Branch (branches)': (await pool.query('SELECT count(*) FROM "Branch";')).rows[0].count,
    'Classroom (classrooms)': (await pool.query('SELECT count(*) FROM "Classroom";')).rows[0].count,
    'Language (subjects)': (await pool.query('SELECT count(*) FROM "Language";')).rows[0].count,
    'Level (levels)': (await pool.query('SELECT count(*) FROM "Level";')).rows[0].count,
    'Teacher (teachers)': (await pool.query('SELECT count(*) FROM "Teacher";')).rows[0].count,
    'TeacherBranch (teacher-branches)': (await pool.query('SELECT count(*) FROM "TeacherBranch";')).rows[0].count,
    'TeacherPayRate (pay rates)': (await pool.query('SELECT count(*) FROM "TeacherPayRate";')).rows[0].count,
    'Class (groups)': (await pool.query('SELECT count(*) FROM "Class";')).rows[0].count,
    'UserProfile (user accounts)': (await pool.query('SELECT count(*) FROM "UserProfile";')).rows[0].count,
    'StaffMember (staff accounts)': (await pool.query('SELECT count(*) FROM "StaffMember";')).rows[0].count,
    'AcademicYear (academic years)': (await pool.query('SELECT count(*) FROM "AcademicYear";')).rows[0].count,
    'Trimester (trimesters)': (await pool.query('SELECT count(*) FROM "Trimester";')).rows[0].count,
    'Setting (settings)': (await pool.query('SELECT count(*) FROM "Setting";')).rows[0].count,
    'VoucherSeries (voucher series)': (await pool.query('SELECT count(*) FROM "VoucherSeries";')).rows[0].count,
  };
  console.log('PRESERVED RECORDS:');
  console.table(preservedCounts);

  const clearedCounts = {
    'Student': (await pool.query('SELECT count(*) FROM "Student";')).rows[0].count,
    'ParentPhoneNumber': (await pool.query('SELECT count(*) FROM "ParentPhoneNumber";')).rows[0].count,
    'Family': (await pool.query('SELECT count(*) FROM "Family";')).rows[0].count,
    'Enrollment': (await pool.query('SELECT count(*) FROM "Enrollment";')).rows[0].count,
    'EnrollmentTransfer': (await pool.query('SELECT count(*) FROM "EnrollmentTransfer";')).rows[0].count,
    'Lesson': (await pool.query('SELECT count(*) FROM "Lesson";')).rows[0].count,
    'Attendance': (await pool.query('SELECT count(*) FROM "Attendance";')).rows[0].count,
    'CatchUpAttendance': (await pool.query('SELECT count(*) FROM "CatchUpAttendance";')).rows[0].count,
    'Voucher': (await pool.query('SELECT count(*) FROM "Voucher";')).rows[0].count,
    'Refund': (await pool.query('SELECT count(*) FROM "Refund";')).rows[0].count,
    'VoucherEdit': (await pool.query('SELECT count(*) FROM "VoucherEdit";')).rows[0].count,
    'Book': (await pool.query('SELECT count(*) FROM "Book";')).rows[0].count,
    'BookReceipt': (await pool.query('SELECT count(*) FROM "BookReceipt";')).rows[0].count,
    'DailyLedger': (await pool.query('SELECT count(*) FROM "DailyLedger";')).rows[0].count,
    'PayrollRun': (await pool.query('SELECT count(*) FROM "PayrollRun";')).rows[0].count,
    'Payslip': (await pool.query('SELECT count(*) FROM "Payslip";')).rows[0].count,
    'AuditLog': (await pool.query('SELECT count(*) FROM "AuditLog";')).rows[0].count,
    'Announcement': (await pool.query('SELECT count(*) FROM "Announcement";')).rows[0].count,
  };
  console.log('\nCLEARED RECORDS (ALL SHOULD BE 0):');
  console.table(clearedCounts);

  const maxSeries = (await pool.query('SELECT MAX("currentNumber") as max_num FROM "VoucherSeries";')).rows[0].max_num;
  console.log(`VoucherSeries MAX currentNumber: ${maxSeries} (should be 0)`);

  console.log('\n🎉 ALL DONE! The database is clean and ready for re-push.');

  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
