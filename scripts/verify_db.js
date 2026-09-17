require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { Pool } = require('pg')
const { PrismaPg } = require('@prisma/adapter-pg')

const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString, ssl: true })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function verify() {
  const branches = await prisma.branch.findMany({ orderBy: { id: 'asc' } })
  console.log('--- BRANCHES (' + branches.length + ') ---')
  console.table(branches.map(b => ({ id: b.id, name: b.name, manager: b.manager })))

  const users = await prisma.userProfile.findMany({ orderBy: { role: 'asc' } })
  console.log('--- USER PROFILES (' + users.length + ') ---')
  console.table(users.map(u => ({ id: u.id, username: u.username, role: u.role, branchId: u.branchId })))

  const years = await prisma.academicYear.findMany({ include: { trimesters: true } })
  console.log('--- ACADEMIC YEARS (' + years.length + ') ---')
  console.log(years.map(y => ({
    label: y.label,
    trimesters: y.trimesters.map(t => `${t.name} (${t.status})`)
  })))

  const levels = await prisma.level.findMany({ orderBy: { id: 'asc' } })
  console.log('--- LEVELS (' + levels.length + ') ---')
  console.log(levels.map(l => l.name).join(', '))

  const counts = {
    students: await prisma.student.count(),
    parentPhones: await prisma.parentPhoneNumber.count(),
    families: await prisma.family.count(),
    teachers: await prisma.teacher.count(),
    teacherBranches: await prisma.teacherBranch.count(),
    teacherPayRates: await prisma.teacherPayRate.count(),
    classes: await prisma.class.count(),
    classrooms: await prisma.classroom.count(),
    lessons: await prisma.lesson.count(),
    attendances: await prisma.attendance.count(),
    catchUpAttendances: await prisma.catchUpAttendance.count(),
    enrollments: await prisma.enrollment.count(),
    enrollmentTransfers: await prisma.enrollmentTransfer.count(),
    vouchers: await prisma.voucher.count(),
    voucherSeries: await prisma.voucherSeries.count(),
    voucherEdits: await prisma.voucherEdit.count(),
    refunds: await prisma.refund.count(),
    workshops: await prisma.workshop.count(),
    workshopSessions: await prisma.workshopSession.count(),
    workshopParticipants: await prisma.workshopParticipant.count(),
    workshopAttendances: await prisma.workshopAttendance.count(),
    books: await prisma.book.count(),
    bookDrops: await prisma.bookDrop.count(),
    bookCopies: await prisma.bookCopyDistribution.count(),
    bookReceipts: await prisma.bookReceipt.count(),
    languages: await prisma.language.count(),
    formationLevels: await prisma.formationLevel.count(),
    levelTests: await prisma.levelTest.count(),
    photocopyCharges: await prisma.photocopyCharge.count(),
    salaryAdvances: await prisma.salaryAdvance.count(),
    payrollRuns: await prisma.payrollRun.count(),
    payslips: await prisma.payslip.count(),
    payslipBranchLines: await prisma.payslipBranchLine.count(),
    announcements: await prisma.announcement.count(),
    dailyLedgers: await prisma.dailyLedger.count(),
    missingMoney: await prisma.missingMoney.count(),
    surplusMoney: await prisma.surplusMoney.count(),
    auditLogs: await prisma.auditLog.count(),
  }

  console.log('--- OPERATIONAL COUNTS ---')
  console.log(JSON.stringify(counts, null, 2))
}

verify()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
