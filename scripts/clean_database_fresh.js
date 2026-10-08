require('dotenv').config();
const { Pool } = require('pg');

const rawConnectionString = process.env.DATABASE_URL || '';
const connectionString = rawConnectionString.replace('?sslmode=verify-full', '');
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function runCleanup() {
  console.log('====================================================');
  console.log('🧹 COMPLETE DATABASE FRESH CLEANUP');
  console.log('====================================================');
  console.log('PRESERVING:');
  console.log('  ✓ Groups / Classes (Class)');
  console.log('  ✓ Teachers (Teacher, TeacherBranch, TeacherPayRate)');
  console.log('  ✓ Legitimate Classrooms (Classroom: 9 records)');
  console.log('  ✓ Branches (Branch: 3 records)');
  console.log('  ✓ Legitimate Levels (Level: 10 records)');
  console.log('  ✓ Academic Calendar (AcademicYear id 11 & Trimesters)');
  console.log('  ✓ Books & Book Drops (Book, BookDrop)');
  console.log('  ✓ Languages & Formation Levels (Language, FormationLevel)');
  console.log('  ✓ User Profiles & Staff (UserProfile, StaffMember)');
  console.log('  ✓ System Settings (Setting)');
  console.log('  ✓ Teacher Photocopy Charges & Announcements');
  console.log('----------------------------------------------------');
  console.log('DELETING:');
  console.log('  ✗ Students, Parent Phones, Families');
  console.log('  ✗ Lessons, Attendances & CatchUpAttendances');
  console.log('  ✗ Enrollments & EnrollmentTransfers');
  console.log('  ✗ Vouchers, Refunds, VoucherEdits');
  console.log('  ✗ DailyLedgers, Missing/Surplus money');
  console.log('  ✗ Student Book Receipts & Distributions');
  console.log('  ✗ Workshop participants/attendances & Level tests');
  console.log('  ✗ AuditLogs');
  console.log('  ✗ Test Data: Level BAC-TEST-SP (id 74) & VoucherSeries 7701');
  console.log('  ✗ Test Data: Test Classrooms 6602 & 6603');
  console.log('  ✗ Test Data: Extra/Test AcademicYears (id 991, id 1)');
  console.log('RESETTING:');
  console.log('  ↻ VoucherSeries counters to 0');
  console.log('  ↻ Class isCompleted flag to false');
  console.log('  ↻ PostgreSQL sequences for cleared tables');
  console.log('====================================================\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Unlink circular references & nullable foreign keys
    console.log('1. Unlinking circular foreign keys...');
    await client.query(`UPDATE "Student" SET "familyId" = NULL;`);
    await client.query(`UPDATE "Family" SET "payerStudentId" = NULL;`);
    await client.query(`UPDATE "Voucher" SET "refundForVoucherId" = NULL, "completesVoucherId" = NULL;`);
    await client.query(`UPDATE "Announcement" SET "lessonId" = NULL WHERE "lessonId" IS NOT NULL;`);

    // 2. Delete Student Book receipts & distributions
    console.log('2. Deleting BookReceipt & BookCopyDistribution...');
    const dBookDist = await client.query(`DELETE FROM "BookCopyDistribution";`);
    const dBookRec = await client.query(`DELETE FROM "BookReceipt";`);
    console.log(`   - BookCopyDistribution: ${dBookDist.rowCount}`);
    console.log(`   - BookReceipt:          ${dBookRec.rowCount}`);

    // 3. Delete Attendances & Lessons
    console.log('3. Deleting Attendance, CatchUpAttendance & Lessons...');
    const dCatchUp = await client.query(`DELETE FROM "CatchUpAttendance";`);
    const dAttendance = await client.query(`DELETE FROM "Attendance";`);
    const dLesson = await client.query(`DELETE FROM "Lesson";`);
    console.log(`   - CatchUpAttendance: ${dCatchUp.rowCount}`);
    console.log(`   - Attendance:        ${dAttendance.rowCount}`);
    console.log(`   - Lesson:            ${dLesson.rowCount}`);

    // 4. Delete Workshops participants/attendance
    console.log('4. Deleting Workshop participants & attendances...');
    const dWAtt = await client.query(`DELETE FROM "WorkshopAttendance";`);
    const dWPart = await client.query(`DELETE FROM "WorkshopParticipant";`);
    console.log(`   - WorkshopAttendance:  ${dWAtt.rowCount}`);
    console.log(`   - WorkshopParticipant: ${dWPart.rowCount}`);

    // 5. Delete Vouchers, Refunds, VoucherEdits, DailyLedger
    console.log('5. Deleting Vouchers, Refunds, VoucherEdits & DailyLedgers...');
    const dRefund = await client.query(`DELETE FROM "Refund";`);
    const dVoucherEdit = await client.query(`DELETE FROM "VoucherEdit";`);
    const dVoucher = await client.query(`DELETE FROM "Voucher";`);
    const dLedger = await client.query(`DELETE FROM "DailyLedger";`);
    const dMissing = await client.query(`DELETE FROM "MissingMoney";`);
    const dSurplus = await client.query(`DELETE FROM "SurplusMoney";`);
    console.log(`   - Refund:       ${dRefund.rowCount}`);
    console.log(`   - VoucherEdit:  ${dVoucherEdit.rowCount}`);
    console.log(`   - Voucher:      ${dVoucher.rowCount}`);
    console.log(`   - DailyLedger:  ${dLedger.rowCount}`);
    console.log(`   - MissingMoney: ${dMissing.rowCount}`);
    console.log(`   - SurplusMoney: ${dSurplus.rowCount}`);

    // 6. Delete Enrollments & Transfers (keeping Classes intact!)
    console.log('6. Deleting EnrollmentTransfer & Enrollment (keeping Classes intact)...');
    const dTransfer = await client.query(`DELETE FROM "EnrollmentTransfer";`);
    const dEnrollment = await client.query(`DELETE FROM "Enrollment";`);
    console.log(`   - EnrollmentTransfer: ${dTransfer.rowCount}`);
    console.log(`   - Enrollment:         ${dEnrollment.rowCount}`);

    // 7. Delete LevelTests
    console.log('7. Deleting LevelTests...');
    const dLevelTest = await client.query(`DELETE FROM "LevelTest";`);
    console.log(`   - LevelTest: ${dLevelTest.rowCount}`);

    // 8. Delete Parent phones, Families, Students
    console.log('8. Deleting ParentPhoneNumber, Family & Student...');
    const dParentPhone = await client.query(`DELETE FROM "ParentPhoneNumber";`);
    const dFamily = await client.query(`DELETE FROM "Family";`);
    const dStudent = await client.query(`DELETE FROM "Student";`);
    console.log(`   - ParentPhoneNumber: ${dParentPhone.rowCount}`);
    console.log(`   - Family:            ${dFamily.rowCount}`);
    console.log(`   - Student:           ${dStudent.rowCount}`);

    // 9. Delete AuditLogs
    console.log('9. Deleting AuditLogs...');
    const dAudit = await client.query(`DELETE FROM "AuditLog";`);
    console.log(`   - AuditLog: ${dAudit.rowCount}`);

    // 10. Delete Test Data
    console.log('10. Deleting Test Data...');
    const dTestSeries = await client.query(`DELETE FROM "VoucherSeries" WHERE "levelId" = 74 OR id = 7701;`);
    console.log(`   - Test VoucherSeries (7701): ${dTestSeries.rowCount}`);

    const dTestLevel = await client.query(`DELETE FROM "Level" WHERE name = 'BAC-TEST-SP' OR id = 74;`);
    console.log(`   - Test Level (BAC-TEST-SP):   ${dTestLevel.rowCount}`);

    const dTestClassrooms = await client.query(`DELETE FROM "Classroom" WHERE id IN (6601, 6602, 6603) OR name LIKE '%(ANNEX)%' OR name LIKE '%(AMPHI)%';`);
    console.log(`   - Test Classrooms (6602, 6603): ${dTestClassrooms.rowCount}`);

    const dTestAY = await client.query(`DELETE FROM "AcademicYear" WHERE id IN (1, 991);`);
    console.log(`   - Extra/Test AcademicYears:    ${dTestAY.rowCount}`);

    // 11. Reset VoucherSeries counters to 0
    console.log('11. Resetting legitimate VoucherSeries currentNumber to 0...');
    const uSeries = await client.query(`UPDATE "VoucherSeries" SET "currentNumber" = 0;`);
    console.log(`   - Reset ${uSeries.rowCount} VoucherSeries currentNumber to 0`);

    // 12. Reset Class isCompleted status
    console.log('12. Resetting Class isCompleted status...');
    const uClass = await client.query(`UPDATE "Class" SET "isCompleted" = false, "completedAt" = NULL WHERE "isCompleted" = true;`);
    console.log(`   - Reset ${uClass.rowCount} completed classes`);

    // 13. Reset sequences
    console.log('13. Resetting sequences for cleared tables...');
    const tablesToResetSeq = [
      'ParentPhoneNumber',
      'Lesson',
      'Attendance',
      'CatchUpAttendance',
      'DailyLedger',
      'AuditLog',
      'Enrollment',
      'EnrollmentTransfer',
      'Family',
      'LevelTest',
      'Voucher',
      'Refund',
      'VoucherEdit',
      'BookReceipt',
      'BookCopyDistribution',
      'MissingMoney',
      'SurplusMoney',
      'WorkshopAttendance',
      'WorkshopParticipant'
    ];

    for (const table of tablesToResetSeq) {
      try {
        await client.query(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), 1, false);`);
      } catch (e) {
        // Ignored if sequence does not exist
      }
    }

    await client.query('COMMIT');
    console.log('\n✅ TRANSACTION COMMITTED SUCCESSFULLY!\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERROR OCCURRED! TRANSACTION ROLLED BACK:\n', err);
    throw err;
  } finally {
    client.release();
  }

  // 14. Verification
  console.log('====================================================');
  console.log('🔍 VERIFICATION AFTER CLEANUP');
  console.log('====================================================');

  const preserved = {
    'Branch (branches)': (await pool.query('SELECT count(*) FROM "Branch";')).rows[0].count,
    'Classroom (classrooms)': (await pool.query('SELECT count(*) FROM "Classroom";')).rows[0].count,
    'Teacher (teachers)': (await pool.query('SELECT count(*) FROM "Teacher";')).rows[0].count,
    'TeacherBranch': (await pool.query('SELECT count(*) FROM "TeacherBranch";')).rows[0].count,
    'TeacherPayRate': (await pool.query('SELECT count(*) FROM "TeacherPayRate";')).rows[0].count,
    'Class (groups/classes)': (await pool.query('SELECT count(*) FROM "Class";')).rows[0].count,
    'Level (levels)': (await pool.query('SELECT count(*) FROM "Level";')).rows[0].count,
    'Language (subjects)': (await pool.query('SELECT count(*) FROM "Language";')).rows[0].count,
    'FormationLevel': (await pool.query('SELECT count(*) FROM "FormationLevel";')).rows[0].count,
    'AcademicYear': (await pool.query('SELECT count(*) FROM "AcademicYear";')).rows[0].count,
    'Trimester': (await pool.query('SELECT count(*) FROM "Trimester";')).rows[0].count,
    'Book': (await pool.query('SELECT count(*) FROM "Book";')).rows[0].count,
    'BookDrop': (await pool.query('SELECT count(*) FROM "BookDrop";')).rows[0].count,
    'UserProfile': (await pool.query('SELECT count(*) FROM "UserProfile";')).rows[0].count,
    'StaffMember': (await pool.query('SELECT count(*) FROM "StaffMember";')).rows[0].count,
    'Setting': (await pool.query('SELECT count(*) FROM "Setting";')).rows[0].count,
    'PhotocopyCharge': (await pool.query('SELECT count(*) FROM "PhotocopyCharge";')).rows[0].count,
    'Announcement': (await pool.query('SELECT count(*) FROM "Announcement";')).rows[0].count,
    'VoucherSeries': (await pool.query('SELECT count(*) FROM "VoucherSeries";')).rows[0].count,
  };
  console.log('PRESERVED ENTITIES:');
  console.table(preserved);

  const cleared = {
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
    'DailyLedger': (await pool.query('SELECT count(*) FROM "DailyLedger";')).rows[0].count,
    'MissingMoney': (await pool.query('SELECT count(*) FROM "MissingMoney";')).rows[0].count,
    'SurplusMoney': (await pool.query('SELECT count(*) FROM "SurplusMoney";')).rows[0].count,
    'BookReceipt': (await pool.query('SELECT count(*) FROM "BookReceipt";')).rows[0].count,
    'BookCopyDistribution': (await pool.query('SELECT count(*) FROM "BookCopyDistribution";')).rows[0].count,
    'WorkshopParticipant': (await pool.query('SELECT count(*) FROM "WorkshopParticipant";')).rows[0].count,
    'WorkshopAttendance': (await pool.query('SELECT count(*) FROM "WorkshopAttendance";')).rows[0].count,
    'LevelTest': (await pool.query('SELECT count(*) FROM "LevelTest";')).rows[0].count,
    'AuditLog': (await pool.query('SELECT count(*) FROM "AuditLog";')).rows[0].count,
  };
  console.log('\nCLEARED ENTITIES (ALL MUST BE 0):');
  console.table(cleared);

  const testLevelCheck = await pool.query(`SELECT count(*) FROM "Level" WHERE name = 'BAC-TEST-SP';`);
  const testClassroomCheck = await pool.query(`SELECT count(*) FROM "Classroom" WHERE id IN (6601, 6602, 6603);`);
  const maxVoucherNumber = await pool.query(`SELECT max("currentNumber") FROM "VoucherSeries";`);

  console.log(`BAC-TEST-SP count: ${testLevelCheck.rows[0].count} (must be 0)`);
  console.log(`Test classrooms count: ${testClassroomCheck.rows[0].count} (must be 0)`);
  console.log(`Max VoucherSeries currentNumber: ${maxVoucherNumber.rows[0].max} (must be 0)`);

  const classroomsRemaining = await pool.query(`SELECT id, name, "branchId" FROM "Classroom" ORDER BY id;`);
  console.log('\nRemaining Classrooms:');
  console.log(classroomsRemaining.rows);

  const levelsRemaining = await pool.query(`SELECT id, name FROM "Level" ORDER BY id;`);
  console.log('\nRemaining Levels:');
  console.log(levelsRemaining.rows);

  const ayRemaining = await pool.query(`SELECT id, label, "startDate", "endDate" FROM "AcademicYear" ORDER BY id;`);
  console.log('\nRemaining Academic Years:');
  console.log(ayRemaining.rows);

  await pool.end();
}

runCleanup().catch((e) => {
  console.error(e);
  process.exit(1);
});
