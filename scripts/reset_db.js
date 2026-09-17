require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { Pool } = require('pg')
const { PrismaPg } = require('@prisma/adapter-pg')

const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString, ssl: true })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function resetDatabase() {
  console.log('🚀 Starting clean database reset...')

  // 1. Break mutual foreign keys
  console.log('1. Breaking circular references between Student and Family...')
  await prisma.$executeRawUnsafe(`UPDATE "Student" SET "familyId" = NULL;`)
  await prisma.$executeRawUnsafe(`UPDATE "Family" SET "payerStudentId" = NULL;`)

  // 2. Delete transactional and operational tables in reverse dependency order
  console.log('2. Deleting operational and transactional data...')
  await prisma.bookCopyDistribution.deleteMany()
  await prisma.bookReceipt.deleteMany()
  await prisma.bookDrop.deleteMany()
  await prisma.book.deleteMany()

  await prisma.catchUpAttendance.deleteMany()
  await prisma.attendance.deleteMany()
  await prisma.lesson.deleteMany()

  await prisma.levelTest.deleteMany()
  await prisma.photocopyCharge.deleteMany()

  await prisma.enrollmentTransfer.deleteMany()
  await prisma.enrollment.deleteMany()

  await prisma.voucherEdit.deleteMany()
  await prisma.refund.deleteMany()
  await prisma.voucher.deleteMany()
  await prisma.voucherSeries.deleteMany()

  await prisma.class.deleteMany()
  await prisma.formationLevel.deleteMany()
  await prisma.language.deleteMany()
  await prisma.classroom.deleteMany()

  await prisma.workshopAttendance.deleteMany()
  await prisma.workshopParticipant.deleteMany()
  await prisma.workshopSession.deleteMany()
  await prisma.workshop.deleteMany()

  await prisma.parentPhoneNumber.deleteMany()
  await prisma.family.deleteMany()
  await prisma.student.deleteMany()

  await prisma.payslipBranchLine.deleteMany()
  await prisma.payslip.deleteMany()
  await prisma.payrollRun.deleteMany()
  await prisma.salaryAdvance.deleteMany()
  await prisma.teacherPayRate.deleteMany()
  await prisma.teacherBranch.deleteMany()
  await prisma.teacher.deleteMany()

  await prisma.announcement.deleteMany()
  await prisma.dailyLedger.deleteMany()
  await prisma.missingMoney.deleteMany()
  await prisma.surplusMoney.deleteMany()
  await prisma.auditLog.deleteMany()

  // 3. Clean orphan settings
  console.log('3. Cleaning temporary/orphan settings...')
  await prisma.setting.deleteMany({
    where: {
      id: { startsWith: 'subject_teachers_' },
    },
  })

  // 4. Clean user profiles: keep ONLY owner, admin_ecole, admin_annex, admin_amphi
  console.log('4. Cleaning user profiles...')
  const deletedUsers = await prisma.userProfile.deleteMany({
    where: {
      AND: [
        { role: { not: 'OWNER' } },
        { username: { notIn: ['owner', 'admin_ecole', 'admin_annex', 'admin_amphi'] } },
      ],
    },
  })
  console.log(`   Deleted ${deletedUsers.count} test/extra user profiles.`)

  // 5. Clean AcademicYears & Trimesters: leave ONE clean 2026-2027 year
  console.log('5. Resetting Academic Year and Trimesters...')
  await prisma.trimester.deleteMany()
  await prisma.academicYear.deleteMany()

  const academicYear = await prisma.academicYear.create({
    data: {
      label: '2026-2027',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2027-06-30T23:59:59.000Z'),
      trimesters: {
        create: [
          {
            name: 'Trimestre 1',
            label: 'T1',
            status: 'active',
            startDate: new Date('2026-09-01T00:00:00.000Z'),
            endDate: new Date('2026-12-31T23:59:59.000Z'),
          },
          {
            name: 'Trimestre 2',
            label: 'T2',
            status: 'not_started',
            startDate: new Date('2027-01-01T00:00:00.000Z'),
            endDate: new Date('2027-03-31T23:59:59.000Z'),
          },
          {
            name: 'Trimestre 3',
            label: 'T3',
            status: 'not_started',
            startDate: new Date('2027-04-01T00:00:00.000Z'),
            endDate: new Date('2027-06-30T23:59:59.000Z'),
          },
        ],
      },
    },
  })
  console.log(`   Created clean Academic Year: ${academicYear.label}`)

  // 6. Reset Grade Levels: standard Algerian levels 3AP -> BAC
  console.log('6. Resetting Grade Levels (3AP through BAC)...')
  await prisma.level.deleteMany()
  const standardLevels = ['3AP', '4AP', '5AP', '1AM', '2AM', '3AM', '4AM', '1AS', '2AS', 'BAC']
  for (const name of standardLevels) {
    await prisma.level.create({ data: { name } })
  }

  // 7. Ensure exact Branches: 1: ECOLE, 2: ANNEX, 3: AMPHI
  console.log('7. Verifying Branches...')
  await prisma.branch.deleteMany({
    where: {
      id: { notIn: [1, 2, 3] },
    },
  })

  // 8. Reset Auto-Increment Sequences
  console.log('8. Resetting PostgreSQL sequences...')
  const autoIncrementTables = [
    'ParentPhoneNumber',
    'Class',
    'Lesson',
    'Attendance',
    'CatchUpAttendance',
    'Announcement',
    'Classroom',
    'Workshop',
    'WorkshopSession',
    'WorkshopParticipant',
    'WorkshopAttendance',
    'DailyLedger',
    'AuditLog',
    'Enrollment',
    'EnrollmentTransfer',
    'Family',
    'FormationLevel',
    'Language',
    'LevelTest',
    'PayrollRun',
    'Payslip',
    'PayslipBranchLine',
    'PhotocopyCharge',
    'TeacherBranch',
    'TeacherPayRate',
    'Voucher',
    'Refund',
    'VoucherEdit',
    'VoucherSeries',
    'Book',
    'BookReceipt',
    'BookDrop',
    'BookCopyDistribution',
    'MissingMoney',
    'SurplusMoney',
  ]

  for (const table of autoIncrementTables) {
    try {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), 1, false);`
      )
    } catch (err) {
      // Sequence might not exist or already at 1
    }
  }

  // Reset Branch sequence to 3 (so next is 4)
  try {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"Branch"', 'id'), 3, true);`
    )
  } catch (err) {}

  console.log('✨ Database reset successfully!')
}

resetDatabase()
  .catch((e) => {
    console.error('❌ Error during reset:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
