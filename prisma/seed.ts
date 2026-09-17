import 'dotenv/config'
import { PrismaClient, Prisma } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

// ─── Prisma / Neon Connection Setup ──────────────────────────────────────────
const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString, ssl: true })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// ─── Date & Array Helpers ───────────────────────────────────────────────────
function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ─── Realistic Algerian Identity Pool ────────────────────────────────────────
const FIRST_NAMES = [
  'Amine', 'Yassine', 'Mohamed', 'Ibrahim', 'Bilal',
  'Karim', 'Rayan', 'Wassim', 'Fares', 'Ilyes',
  'Sarah', 'Lina', 'Meriem', 'Fatima', 'Nour',
  'Imane', 'Amira', 'Rania', 'Yasmine', 'Asma',
  'Chaima', 'Ayoub', 'Zakaria', 'Houssem', 'Walid',
  'Khadidja', 'Manel', 'Selma', 'Souhila', 'Sirine',
]

const LAST_NAMES = [
  'Benali', 'Saidi', 'Mansouri', 'Brahimi', 'Toumi',
  'Haddad', 'Khelil', 'Zitouni', 'Djellal', 'Bouzid',
  'Ferhat', 'Meziane', 'Hamdi', 'Cherif', 'Larbi',
  'Boukhalfa', 'Abdelli', 'Mebarki', 'Benhamed', 'Aissaoui',
  'Belkacem', 'Chaoui', 'Mokrani', 'Kouider', 'Bensaad',
]

const PHONE_PREFIXES = ['0550', '0660', '0770', '0555', '0665', '0775']
function genPhone(n: number): string {
  const prefix = PHONE_PREFIXES[n % PHONE_PREFIXES.length]
  const suffix = String(100000 + (n * 37) % 900000)
  return `${prefix}${suffix.slice(1)}`
}

async function main() {
  console.log('🗑  Clearing existing data…')

  // Clear in correct foreign key dependency order
  await prisma.bookCopyDistribution.deleteMany()
  await prisma.bookDrop.deleteMany()
  await prisma.book.deleteMany()
  await prisma.catchUpAttendance.deleteMany()
  await prisma.attendance.deleteMany()
  await prisma.workshopAttendance.deleteMany()
  await prisma.workshopParticipant.deleteMany()
  await prisma.workshopSession.deleteMany()
  await prisma.workshop.deleteMany()
  await prisma.levelTest.deleteMany()
  await prisma.voucherEdit.deleteMany()
  await prisma.refund.deleteMany()
  await prisma.voucher.deleteMany()
  await prisma.voucherSeries.deleteMany()
  await prisma.enrollmentTransfer.deleteMany()
  await prisma.enrollment.deleteMany()
  await prisma.lesson.deleteMany()
  await prisma.classroom.deleteMany()
  await prisma.class.deleteMany()
  await prisma.formationLevel.deleteMany()
  await prisma.language.deleteMany()
  await prisma.photocopyCharge.deleteMany()
  await prisma.payslipBranchLine.deleteMany()
  await prisma.payslip.deleteMany()
  await prisma.payrollRun.deleteMany()
  await prisma.salaryAdvance.deleteMany()
  await prisma.teacherPayRate.deleteMany()
  await prisma.teacherBranch.deleteMany()
  await prisma.student.deleteMany()
  await prisma.family.deleteMany()
  await prisma.teacher.deleteMany()
  await prisma.trimester.deleteMany()
  await prisma.academicYear.deleteMany()
  await prisma.level.deleteMany()
  await prisma.announcement.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.userProfile.deleteMany()
  await prisma.dailyLedger.deleteMany()
  await prisma.branch.deleteMany()

  // Reset Branch auto-increment sequence
  try {
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE "Branch_id_seq" RESTART WITH 1;`)
  } catch {}

  // ── 1. BRANCHES (Exact IDs: 1: ECOLE, 2: ANNEX, 3: AMPHI) ────────────────
  console.log('🏫  Seeding exact branches (1: ECOLE, 2: ANNEX, 3: AMPHI)…')
  const branchEcole = await prisma.branch.create({
    data: {
      id: 1,
      name: 'ECOLE',
      address: 'Constantine - Centre, Algérie',
      phone: '0550000001',
      manager: 'Directeur ECOLE',
    },
  })
  const branchAnnex = await prisma.branch.create({
    data: {
      id: 2,
      name: 'ANNEX',
      address: 'Constantine - Annex, Algérie',
      phone: '0550000002',
      manager: 'Directeur ANNEX',
    },
  })
  const branchAmphi = await prisma.branch.create({
    data: {
      id: 3,
      name: 'AMPHI',
      address: 'Constantine - Amphi, Algérie',
      phone: '0550000003',
      manager: 'Directeur AMPHI',
    },
  })
  const branches = [branchEcole, branchAnnex, branchAmphi]

  // Ensure sequence is now at 3 so future inserts don't conflict
  try {
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"Branch"', 'id'), 3);`)
  } catch {}

  // ── 2. LEVELS ────────────────────────────────────────────────────────────
  console.log('📚  Seeding shared grade levels…')
  const levelNames = ['3AP', '4AP', '5AP', '1AM', '2AM', '3AM', '4AM', '1AS', '2AS', 'BAC']
  const levelRows = await Promise.all(
    levelNames.map((name) => prisma.level.create({ data: { name } }))
  )
  const levelByName: Record<string, typeof levelRows[0]> = {}
  for (const l of levelRows) levelByName[l.name] = l

  // ── 3. ACADEMIC YEARS & TRIMESTERS ───────────────────────────────────────
  console.log('📅  Seeding academic years & trimesters…')
  const prevAcademicYear = await prisma.academicYear.create({
    data: {
      label: '2025-2026',
      startDate: new Date('2025-09-01T00:00:00Z'),
      endDate: new Date('2026-08-31T23:59:59Z'),
    },
  })
  const currentAcademicYear = await prisma.academicYear.create({
    data: {
      label: '2026-2027',
      startDate: new Date('2026-09-01T00:00:00Z'),
      endDate: new Date('2027-06-30T23:59:59Z'),
    },
  })

  // Trimesters for current year (2026-2027)
  const [trim1, trim2, trim3] = await Promise.all([
    prisma.trimester.create({
      data: {
        academicYearId: currentAcademicYear.id,
        name: 'Trimestre 1',
        startDate: new Date('2026-09-01T00:00:00Z'),
        endDate: new Date('2026-12-31T23:59:59Z'),
      },
    }),
    prisma.trimester.create({
      data: {
        academicYearId: currentAcademicYear.id,
        name: 'Trimestre 2',
        startDate: new Date('2027-01-01T00:00:00Z'),
        endDate: new Date('2027-03-31T23:59:59Z'),
      },
    }),
    prisma.trimester.create({
      data: {
        academicYearId: currentAcademicYear.id,
        name: 'Trimestre 3',
        startDate: new Date('2027-04-01T00:00:00Z'),
        endDate: new Date('2027-06-30T23:59:59Z'),
      },
    }),
  ])

  // Also create Trimestre 3 for 2025-2026 (for August 2026 vouchers)
  const trim3PrevYear = await prisma.trimester.create({
    data: {
      academicYearId: prevAcademicYear.id,
      name: 'Trimestre 3',
      startDate: new Date('2026-04-01T00:00:00Z'),
      endDate: new Date('2026-08-31T23:59:59Z'),
    },
  })

  // ── 4. TEACHERS (Exactly 10) ─────────────────────────────────────────────
  console.log('👨‍🏫  Seeding exactly 10 teachers…')
  interface TeacherDef {
    id: string
    name: string
    photocopyRatePerPage: number
    percentageOfSessionFee: number
  }

  const teacherDefs: TeacherDef[] = [
    { id: 'teacher-1',  name: 'Pr. Hamoui Rachid',   photocopyRatePerPage: 5, percentageOfSessionFee: 45 },
    { id: 'teacher-2',  name: 'Mme. Toumi Nadia',     photocopyRatePerPage: 5, percentageOfSessionFee: 42 },
    { id: 'teacher-3',  name: 'Pr. Benali Omar',       photocopyRatePerPage: 4, percentageOfSessionFee: 40 },
    { id: 'teacher-4',  name: 'Mme. Saidi Fatima',     photocopyRatePerPage: 5, percentageOfSessionFee: 38 },
    { id: 'teacher-5',  name: 'Pr. Mansouri Karim',    photocopyRatePerPage: 4, percentageOfSessionFee: 35 },
    { id: 'teacher-6',  name: 'Mme. Brahimi Houria',   photocopyRatePerPage: 5, percentageOfSessionFee: 40 },
    { id: 'teacher-7',  name: 'Pr. Haddad Youcef',     photocopyRatePerPage: 4, percentageOfSessionFee: 36 },
    { id: 'teacher-8',  name: 'Mme. Khelil Amina',     photocopyRatePerPage: 5, percentageOfSessionFee: 42 },
    { id: 'teacher-9',  name: 'Pr. Zitouni Brahim',    photocopyRatePerPage: 4, percentageOfSessionFee: 40 },
    { id: 'teacher-10', name: 'Mme. Aissaoui Samia',  photocopyRatePerPage: 5, percentageOfSessionFee: 38 },
  ]

  const teachers = await Promise.all(
    teacherDefs.map((t) =>
      prisma.teacher.create({
        data: {
          id: t.id,
          name: t.name,
          photocopyRatePerPage: t.photocopyRatePerPage,
        },
      })
    )
  )

  await Promise.all(
    teachers.map((t, i) =>
      prisma.teacherPayRate.create({
        data: {
          teacherId: t.id,
          percentageOfSessionFee: teacherDefs[i].percentageOfSessionFee,
          effectiveFrom: new Date('2025-09-01T00:00:00Z'),
        },
      })
    )
  )

  // Teacher-branch assignments
  const tbMap: { idx: number; bids: number[] }[] = [
    { idx: 0, bids: [branchEcole.id, branchAmphi.id] },
    { idx: 1, bids: [branchEcole.id, branchAmphi.id, branchAnnex.id] },
    { idx: 2, bids: [branchEcole.id, branchAmphi.id] },
    { idx: 3, bids: [branchEcole.id, branchAnnex.id] },
    { idx: 4, bids: [branchEcole.id, branchAnnex.id] },
    { idx: 5, bids: [branchEcole.id] },
    { idx: 6, bids: [branchAmphi.id, branchEcole.id] },
    { idx: 7, bids: [branchAnnex.id, branchAmphi.id] },
    { idx: 8, bids: [branchAnnex.id] },
    { idx: 9, bids: [branchAnnex.id, branchEcole.id] },
  ]

  for (const { idx, bids } of tbMap) {
    for (const branchId of bids) {
      await prisma.teacherBranch.create({
        data: {
          teacherId: teachers[idx].id,
          branchId,
        },
      })
    }
  }

  // ── 5. CLASSROOMS ────────────────────────────────────────────────────────
  console.log('🚪  Seeding classrooms across all 3 branches…')
  const classroomDefs = [
    // ECOLE (branch 1) - exactly 3 classrooms
    { name: 'Salle E1', branchId: branchEcole.id },
    { name: 'Salle E2', branchId: branchEcole.id },
    { name: 'Salle E3', branchId: branchEcole.id },

    // ANNEX (branch 2) - exactly 4 classrooms
    { name: 'Salle N1', branchId: branchAnnex.id },
    { name: 'Salle N2', branchId: branchAnnex.id },
    { name: 'Salle N3', branchId: branchAnnex.id },
    { name: 'Salle N4', branchId: branchAnnex.id },

    // AMPHI (branch 3) - exactly 1 classroom
    { name: 'Grand Amphi', branchId: branchAmphi.id },
  ]
  const classroomRows = await Promise.all(
    classroomDefs.map((c) => prisma.classroom.create({ data: c }))
  )
  const classroomsByName: Record<string, typeof classroomRows[0]> = {}
  for (const cr of classroomRows) {
    classroomsByName[cr.name] = cr
  }

  // ── 6. LANGUAGES & FORMATION LEVELS ──────────────────────────────────────
  console.log('🌐  Seeding languages & formation progression levels…')
  const langEnglish = await prisma.language.create({ data: { name: 'Anglais' } })
  const langFrench = await prisma.language.create({ data: { name: 'Français' } })

  const formLvlEngA1 = await prisma.formationLevel.create({
    data: {
      languageId: langEnglish.id,
      levelNumber: 1,
      name: 'Niveau 1 (A1 - Débutant)',
      hoursRequired: 30,
      lumpSumPrice: 12000,
    },
  })
  const formLvlFrB1 = await prisma.formationLevel.create({
    data: {
      languageId: langFrench.id,
      levelNumber: 1,
      name: 'Niveau 1 (B1 - Conversation)',
      hoursRequired: 30,
      lumpSumPrice: 12000,
    },
  })

  // ── 7. CLASSES (Regular + Formations) ────────────────────────────────────
  console.log('📋  Seeding classes & groups…')
  interface ClassDef {
    name: string
    branchId: number
    tIdx: number
    levelName: string
    price: number
    ins: number
    hasBooks: boolean
    bookFee?: number
    isFormation?: boolean
    formationLevelId?: number
    ageGroup?: string
  }

  const classDefs: ClassDef[] = [
    // AMPHI (branch 3)
    { name: 'BAC Physique – Hamoui (G1)',    branchId: branchAmphi.id, tIdx: 0, levelName: 'BAC', price: 3200, ins: 1500, hasBooks: true,  bookFee: 600 },
    { name: 'BAC Physique – Hamoui (G2)',    branchId: branchAmphi.id, tIdx: 0, levelName: 'BAC', price: 3200, ins: 1500, hasBooks: true,  bookFee: 600 },
    { name: 'BAC Maths – Toumi (G1)',        branchId: branchAmphi.id, tIdx: 1, levelName: 'BAC', price: 3000, ins: 1500, hasBooks: true,  bookFee: 500 },
    { name: '3AM Sciences – Benali (G1)',    branchId: branchAmphi.id, tIdx: 2, levelName: '3AM', price: 2000, ins: 1000, hasBooks: false },
    { name: '1AS Français – Saidi (G1)',     branchId: branchAmphi.id, tIdx: 3, levelName: '1AS', price: 2400, ins: 1200, hasBooks: false },

    // ECOLE (branch 1)
    { name: 'BAC Anglais – Mansouri (G1)',   branchId: branchEcole.id, tIdx: 4, levelName: 'BAC', price: 2800, ins: 1500, hasBooks: false },
    { name: '2AS Arabe – Brahimi (G1)',      branchId: branchEcole.id, tIdx: 5, levelName: '2AS', price: 2600, ins: 1200, hasBooks: false },
    { name: '2AS Histoire – Haddad (G1)',    branchId: branchEcole.id, tIdx: 6, levelName: '2AS', price: 2400, ins: 1200, hasBooks: false },
    { name: '4AM Maths – Toumi (G2)',        branchId: branchEcole.id, tIdx: 1, levelName: '4AM', price: 2200, ins: 1000, hasBooks: false },
    { name: '4AM Sciences – Benali (G2)',    branchId: branchEcole.id, tIdx: 2, levelName: '4AM', price: 2200, ins: 1000, hasBooks: true,  bookFee: 500 },

    // ANNEX (branch 2)
    { name: 'BAC Maths – Khelil (G1)',       branchId: branchAnnex.id, tIdx: 7, levelName: 'BAC', price: 3000, ins: 1500, hasBooks: false },
    { name: '2AS Physique – Zitouni (G1)',   branchId: branchAnnex.id, tIdx: 8, levelName: '2AS', price: 2800, ins: 1200, hasBooks: true,  bookFee: 600 },
    { name: '1AS Sciences – Aissaoui (G1)', branchId: branchAnnex.id, tIdx: 9, levelName: '1AS', price: 2200, ins: 1200, hasBooks: false },
    { name: '3AM Maths – Khelil (G2)',       branchId: branchAnnex.id, tIdx: 7, levelName: '3AM', price: 2000, ins: 1000, hasBooks: false },
    { name: '1AM Français – Saidi (G2)',     branchId: branchAnnex.id, tIdx: 3, levelName: '1AM', price: 1800, ins: 1000, hasBooks: false },

    // Formations
    { name: 'Formation Anglais A1 (Weekend)', branchId: branchEcole.id, tIdx: 4, levelName: '1AS', price: 12000, ins: 0, hasBooks: false, isFormation: true, formationLevelId: formLvlEngA1.id, ageGroup: '14-18 ans' },
    { name: 'Formation Français B1 (Soir)',   branchId: branchAnnex.id, tIdx: 3, levelName: '2AS', price: 12000, ins: 0, hasBooks: false, isFormation: true, formationLevelId: formLvlFrB1.id, ageGroup: 'Adultes' },
  ]

  const classRows = await Promise.all(
    classDefs.map((d) =>
      prisma.class.create({
        data: {
          name: d.name,
          branchId: d.branchId,
          teacherId: teachers[d.tIdx].id,
          levelId: levelByName[d.levelName].id,
          pricePerCycle: d.price,
          inscriptionFee: d.ins,
          hasBooks: d.hasBooks,
          bookFee: d.hasBooks ? (d.bookFee ?? null) : null,
          isFormation: d.isFormation ?? false,
          formationLevelId: d.formationLevelId ?? null,
          ageGroup: d.ageGroup ?? null,
        },
      })
    )
  )

  // ── 8. VOUCHER SERIES ────────────────────────────────────────────────────
  console.log('🧾  Seeding voucher series (Local-Level & Cross-Branch pads)…')
  interface VSRow {
    id: number
    issuingBranchId: number
    levelId: number | null
    targetBranchId: number | null
    currentNumber: number
  }
  const seriesMap: Record<string, VSRow> = {}

  // Local-level series for each branch and level
  for (const cls of classRows) {
    const key = `${cls.branchId}-${cls.levelId}`
    if (!seriesMap[key]) {
      const vs = await prisma.voucherSeries.create({
        data: {
          issuingBranchId: cls.branchId,
          scope: 'LOCAL_LEVEL',
          levelId: cls.levelId,
          currentNumber: Math.floor(Math.random() * 80) + 40,
        },
      })
      seriesMap[key] = vs as VSRow
    }
  }

  // Cross-branch series for all pairs (ECOLE, ANNEX, AMPHI)
  const crossPairs = [
    { issuingBranchId: branchEcole.id, targetBranchId: branchAnnex.id },
    { issuingBranchId: branchEcole.id, targetBranchId: branchAmphi.id },
    { issuingBranchId: branchAnnex.id, targetBranchId: branchEcole.id },
    { issuingBranchId: branchAnnex.id, targetBranchId: branchAmphi.id },
    { issuingBranchId: branchAmphi.id, targetBranchId: branchEcole.id },
    { issuingBranchId: branchAmphi.id, targetBranchId: branchAnnex.id },
  ]
  for (const cp of crossPairs) {
    const vs = await prisma.voucherSeries.create({
      data: {
        issuingBranchId: cp.issuingBranchId,
        scope: 'CROSS_BRANCH',
        targetBranchId: cp.targetBranchId,
        currentNumber: Math.floor(Math.random() * 40) + 15,
      },
    })
    seriesMap[`cross-${cp.issuingBranchId}-${cp.targetBranchId}`] = vs as VSRow
  }

  function getSeries(branchId: number, levelId: number | null): VSRow {
    const key = `${branchId}-${levelId}`
    return seriesMap[key] ?? (Object.values(seriesMap)[0] as VSRow)
  }

  // ── 9. STUDENTS (Exactly 100) ────────────────────────────────────────────
  console.log('👧  Seeding exactly 100 students with realistic Algerian identities…')
  const studentList: {
    id: string
    globalNumber: number
    name: string
    registeredBranchId: number
    phone: string
  }[] = []

  const usedNames = new Set<string>()
  let gNum = 1

  while (studentList.length < 100) {
    const fn = rand(FIRST_NAMES)
    const ln = rand(LAST_NAMES)
    const full = `${fn} ${ln}`
    if (usedNames.has(full)) continue
    usedNames.add(full)

    // Distribute home branches across 1: ECOLE, 2: ANNEX, 3: AMPHI
    const homeBranch = branches[(gNum - 1) % 3]

    studentList.push({
      id: `student-${gNum}`,
      globalNumber: gNum,
      name: full,
      registeredBranchId: homeBranch.id,
      phone: genPhone(gNum),
    })
    gNum++
  }

  const studentRows = await Promise.all(
    studentList.map((s) => prisma.student.create({ data: s }))
  )

  // Sibling discount families (§2.4):
  // Family 1: student-1 (payer) & student-2 (waived tuition)
  // Family 2: student-10 (payer) & student-11 (waived tuition)
  // Family 3: student-25 (payer) & student-26 (waived tuition)
  const fam1 = await prisma.family.create({ data: { payerStudentId: studentRows[0].id } })
  const fam2 = await prisma.family.create({ data: { payerStudentId: studentRows[9].id } })
  const fam3 = await prisma.family.create({ data: { payerStudentId: studentRows[24].id } })

  await Promise.all([
    prisma.student.update({ where: { id: studentRows[0].id },  data: { familyId: fam1.id } }),
    prisma.student.update({ where: { id: studentRows[1].id },  data: { familyId: fam1.id } }),
    prisma.student.update({ where: { id: studentRows[9].id },  data: { familyId: fam2.id } }),
    prisma.student.update({ where: { id: studentRows[10].id }, data: { familyId: fam2.id } }),
    prisma.student.update({ where: { id: studentRows[24].id }, data: { familyId: fam3.id } }),
    prisma.student.update({ where: { id: studentRows[25].id }, data: { familyId: fam3.id } }),
  ])

  // ── 10. ENROLLMENTS & INSCRIPTION VOUCHERS ──────────────────────────────
  console.log('📝  Enrolling students & applying 3-class inscription fee rule…')
  const adminId = 'admin-seed'
  const insCount: Record<string, number> = {}
  interface EnrRow {
    id: number
    studentId: string
    classId: number
    isSiblingWaived: boolean
  }
  const enrollmentRows: EnrRow[] = []

  // Base enrollment for all 100 students
  for (let i = 0; i < studentRows.length; i++) {
    const student = studentRows[i]
    // Assign student to 1 or more classes (some students have 2, 3, or 4 enrollments)
    const primaryClass = classRows[i % 15] // regular classes 0..14
    const prev = insCount[student.id] ?? 0
    const chargeIns = prev < 3
    insCount[student.id] = prev + (chargeIns ? 1 : 0)

    const isSiblingWaived =
      student.id === studentRows[1].id ||
      student.id === studentRows[10].id ||
      student.id === studentRows[25].id

    const enr = await prisma.enrollment.create({
      data: {
        studentId: student.id,
        classId: primaryClass.id,
        academicYearId: currentAcademicYear.id,
        enrolledAt: new Date('2026-08-01T08:30:00Z'),
        inscriptionFeeCharged: chargeIns,
        inscriptionFeeAmount: chargeIns ? primaryClass.inscriptionFee : null,
      },
    })
    enrollmentRows.push({
      id: enr.id,
      studentId: student.id,
      classId: primaryClass.id,
      isSiblingWaived,
    })

    if (chargeIns) {
      const series = getSeries(primaryClass.branchId, primaryClass.levelId)
      const upd = await prisma.voucherSeries.update({
        where: { id: series.id },
        data: { currentNumber: { increment: 1 } },
      })
      await prisma.voucher.create({
        data: {
          seriesId: series.id,
          number: upd.currentNumber,
          studentId: student.id,
          classId: primaryClass.id,
          issuingBranchId: primaryClass.branchId,
          targetBranchId: primaryClass.branchId,
          paymentType: 'INSCRIPTION',
          amount: primaryClass.inscriptionFee,
          issuedBy: adminId,
          issuedAt: new Date('2026-08-01T08:45:00Z'),
          status: 'ACTIVE',
        },
      })
    }
  }

  // Additional enrollments for students 1..10 to test 2nd, 3rd, and 4th enrollment auto-waiver!
  for (let i = 0; i < 10; i++) {
    const student = studentRows[i]
    // 2nd class (different branch to test cross-branch registration)
    const secondClass = classRows[(i + 5) % 15]
    const prev = insCount[student.id] ?? 0
    const chargeIns = prev < 3
    insCount[student.id] = prev + (chargeIns ? 1 : 0)

    const enr2 = await prisma.enrollment.create({
      data: {
        studentId: student.id,
        classId: secondClass.id,
        academicYearId: currentAcademicYear.id,
        enrolledAt: new Date('2026-08-03T10:00:00Z'),
        inscriptionFeeCharged: chargeIns,
        inscriptionFeeAmount: chargeIns ? secondClass.inscriptionFee : null,
      },
    })
    enrollmentRows.push({
      id: enr2.id,
      studentId: student.id,
      classId: secondClass.id,
      isSiblingWaived: false,
    })

    if (chargeIns) {
      const series = getSeries(secondClass.branchId, secondClass.levelId)
      const upd = await prisma.voucherSeries.update({
        where: { id: series.id },
        data: { currentNumber: { increment: 1 } },
      })
      await prisma.voucher.create({
        data: {
          seriesId: series.id,
          number: upd.currentNumber,
          studentId: student.id,
          classId: secondClass.id,
          issuingBranchId: secondClass.branchId,
          targetBranchId: secondClass.branchId,
          paymentType: 'INSCRIPTION',
          amount: secondClass.inscriptionFee,
          issuedBy: adminId,
          issuedAt: new Date('2026-08-03T10:15:00Z'),
          status: 'ACTIVE',
        },
      })
    }
  }

  // 4th enrollment for student-1: tests the AUTOMATIC WAIVER on the 4th class!
  const fourthClass = classRows[10]
  const enr4 = await prisma.enrollment.create({
    data: {
      studentId: studentRows[0].id,
      classId: fourthClass.id,
      academicYearId: currentAcademicYear.id,
      enrolledAt: new Date('2026-08-05T14:00:00Z'),
      inscriptionFeeCharged: false,
      inscriptionFeeAmount: null,
      feeOverrideNote: 'معفى تلقائياً: التسجيل رقم 4 في السنة الدراسية',
    },
  })
  enrollmentRows.push({
    id: enr4.id,
    studentId: studentRows[0].id,
    classId: fourthClass.id,
    isSiblingWaived: false,
  })

  // Enroll in language formations
  const formEnr1 = await prisma.enrollment.create({
    data: {
      studentId: studentRows[2].id,
      classId: classRows[15].id, // Formation Anglais
      academicYearId: currentAcademicYear.id,
      enrolledAt: new Date('2026-08-10T09:00:00Z'),
      inscriptionFeeCharged: false,
      inscriptionFeeAmount: null,
    },
  })
  enrollmentRows.push({
    id: formEnr1.id,
    studentId: studentRows[2].id,
    classId: classRows[15].id,
    isSiblingWaived: false,
  })

  // ── 11. LESSONS – Two Last Months (August 2026 & September 2026) ─────────
  console.log('📆  Generating lessons for August and September 2026 (1 lesson/week per group, 2-hour duration, 7/7, 08:00–20:00)…')
  // Reference start: Saturday August 1, 2026
  const augStart = new Date('2026-08-01T00:00:00Z')

  interface ScheduleConfig {
    dayOffset: number // 0=Sat, 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri
    startHour: number // 8, 10, 12, 14, 16, 18
    roomName: string
  }

  // Conflict-free weekly recurring schedule:
  // - AMPHI (branch 3) has only 1 classroom: Grand Amphi
  // - ECOLE (branch 1) has exactly 3 classrooms: Salle E1, Salle E2, Salle E3
  // - ANNEX (branch 2) has exactly 4 classrooms: Salle N1, Salle N2, Salle N3, Salle N4
  // - School operates 7/7 between 08:00 and 20:00
  // - Every group has exactly 1 lesson per week, duration exactly 2 hours
  const classSchedules: Record<number, ScheduleConfig> = {
    // AMPHI (branch 3) - Grand Amphi
    0: { dayOffset: 0, startHour: 8,  roomName: 'Grand Amphi' }, // Sat 08:00-10:00 (Hamoui G1)
    1: { dayOffset: 0, startHour: 10, roomName: 'Grand Amphi' }, // Sat 10:00-12:00 (Hamoui G2)
    2: { dayOffset: 1, startHour: 8,  roomName: 'Grand Amphi' }, // Sun 08:00-10:00 (Toumi G1)
    3: { dayOffset: 2, startHour: 14, roomName: 'Grand Amphi' }, // Mon 14:00-16:00 (Benali G1)
    4: { dayOffset: 3, startHour: 16, roomName: 'Grand Amphi' }, // Tue 16:00-18:00 (Saidi G1)

    // ECOLE (branch 1) - Salle E1, Salle E2, Salle E3
    5: { dayOffset: 1, startHour: 10, roomName: 'Salle E1' }, // Sun 10:00-12:00 (Mansouri G1)
    6: { dayOffset: 1, startHour: 14, roomName: 'Salle E1' }, // Sun 14:00-16:00 (Brahimi G1)
    7: { dayOffset: 2, startHour: 10, roomName: 'Salle E2' }, // Mon 10:00-12:00 (Haddad G1)
    8: { dayOffset: 3, startHour: 10, roomName: 'Salle E2' }, // Tue 10:00-12:00 (Toumi G2)
    9: { dayOffset: 4, startHour: 10, roomName: 'Salle E3' }, // Wed 10:00-12:00 (Benali G2)
    15: { dayOffset: 5, startHour: 16, roomName: 'Salle E3' }, // Thu 16:00-18:00 (Formation Anglais)

    // ANNEX (branch 2) - Salle N1, Salle N2, Salle N3, Salle N4
    10: { dayOffset: 1, startHour: 8,  roomName: 'Salle N1' }, // Sun 08:00-10:00 (Khelil G1)
    11: { dayOffset: 1, startHour: 10, roomName: 'Salle N2' }, // Sun 10:00-12:00 (Zitouni G1)
    12: { dayOffset: 2, startHour: 8,  roomName: 'Salle N3' }, // Mon 08:00-10:00 (Aissaoui G1)
    13: { dayOffset: 3, startHour: 14, roomName: 'Salle N1' }, // Tue 14:00-16:00 (Khelil G2)
    14: { dayOffset: 4, startHour: 14, roomName: 'Salle N2' }, // Wed 14:00-16:00 (Saidi G2)
    16: { dayOffset: 6, startHour: 16, roomName: 'Salle N4' }, // Fri 16:00-18:00 (Formation Français)
  }

  interface LessonRec {
    id: number
    classId: number
    branchId: number
    startsAt: Date
    isFree: boolean
  }
  const lessonsByClass: Record<number, LessonRec[]> = {}

  for (let ci = 0; ci < classRows.length; ci++) {
    const cls = classRows[ci]
    const teacherId = cls.teacherId!
    const sched = classSchedules[ci] || { dayOffset: ci % 7, startHour: 8 + (ci % 5) * 2, roomName: 'Salle E1' }
    const classroom = classroomsByName[sched.roomName] || classroomRows[0]
    const lessons: LessonRec[] = []

    for (let week = 0; week < 6; week++) {
      const lessonDate = addDays(augStart, week * 7 + sched.dayOffset)
      lessonDate.setUTCHours(sched.startHour, 0, 0, 0)
      const isFirstLessonFree = week === 0 && ci === 0 // Sample free lesson §2.2
      const isExtraSession = week === 4 && ci === 1 // Sample extra session §1.4

      const ls = await prisma.lesson.create({
        data: {
          branchId: cls.branchId,
          classId: cls.id,
          teacherId,
          classroomId: classroom.id,
          startsAt: lessonDate,
          endsAt: addHours(lessonDate, 2),
          isFree: isFirstLessonFree,
          isExtra: isExtraSession,
          extraFee: null,
        },
      })
      lessons.push({
        id: ls.id,
        classId: cls.id,
        branchId: cls.branchId,
        startsAt: lessonDate,
        isFree: isFirstLessonFree,
      })
    }
    lessonsByClass[cls.id] = lessons
  }

  // ── 12. ATTENDANCE RECORDS (August & September) ──────────────────────────
  console.log('✅  Generating attendance records…')
  for (const enr of enrollmentRows) {
    const lessons = lessonsByClass[enr.classId] ?? []
    for (const lesson of lessons) {
      const r = Math.random()
      const status = r < 0.88 ? 'PRESENT' : r < 0.98 ? 'ABSENT' : 'NOT_DEFINED'
      await prisma.attendance.create({
        data: {
          lessonId: lesson.id,
          studentId: enr.studentId,
          status,
        },
      })
    }
  }

  // Cross-group catch-up attendance (§2.12):
  // Student-2 was ABSENT in BAC Physique (G1) on Saturday Aug 8 at 08:00, and attended BAC Physique (G2) on Saturday Aug 8 at 10:00
  const c0Lessons = lessonsByClass[classRows[0].id] ?? []
  const c1Lessons = lessonsByClass[classRows[1].id] ?? []
  if (c0Lessons.length >= 2 && c1Lessons.length >= 2) {
    await prisma.attendance.updateMany({
      where: { lessonId: c0Lessons[1].id, studentId: 'student-2' },
      data: { status: 'ABSENT' },
    })
    await prisma.catchUpAttendance.create({
      data: {
        studentId: 'student-2',
        missedLessonId: c0Lessons[1].id,
        catchUpLessonId: c1Lessons[1].id,
        recordedBy: adminId,
        recordedAt: new Date('2026-08-08T11:00:00Z'),
      },
    })
  }

  // ── 13. TUITION VOUCHERS (August & September Cycles) ─────────────────────
  console.log('💳  Issuing tuition vouchers for August & September cycles…')
  for (let i = 0; i < enrollmentRows.length; i++) {
    const enr = enrollmentRows[i]
    if (enr.isSiblingWaived) {
      // Non-payer sibling in family has tuition waived (§2.4)
      continue
    }

    const cls = classRows.find((c) => c.id === enr.classId)!
    const series = getSeries(cls.branchId, cls.levelId)

    // August Cycle voucher (issued ~Aug 2)
    const upd1 = await prisma.voucherSeries.update({
      where: { id: series.id },
      data: { currentNumber: { increment: 1 } },
    })
    await prisma.voucher.create({
      data: {
        seriesId: series.id,
        number: upd1.currentNumber,
        studentId: enr.studentId,
        classId: enr.classId,
        issuingBranchId: cls.branchId,
        targetBranchId: cls.branchId,
        paymentType: cls.isFormation ? 'FORMATION' : 'TUITION_4SESSION',
        amount: cls.pricePerCycle ?? 2000,
        issuedBy: adminId,
        issuedAt: new Date('2026-08-02T10:00:00Z'),
        status: 'ACTIVE',
      },
    })

    // September Cycle voucher (issued ~Sep 2)
    if (!cls.isFormation) {
      const upd2 = await prisma.voucherSeries.update({
        where: { id: series.id },
        data: { currentNumber: { increment: 1 } },
      })
      await prisma.voucher.create({
        data: {
          seriesId: series.id,
          number: upd2.currentNumber,
          studentId: enr.studentId,
          classId: enr.classId,
          issuingBranchId: cls.branchId,
          targetBranchId: cls.branchId,
          paymentType: 'TUITION_4SESSION',
          amount: cls.pricePerCycle ?? 2000,
          issuedBy: adminId,
          issuedAt: new Date('2026-09-02T10:00:00Z'),
          status: 'ACTIVE',
        },
      })
    }
  }

  // Cross-branch voucher sample:
  // Admin at AMPHI (branch 3) issues a voucher for an ECOLE (branch 1) class
  const crossSeriesAmphiToEcole =
    seriesMap[`cross-${branchAmphi.id}-${branchEcole.id}`]
  if (crossSeriesAmphiToEcole) {
    const updCross = await prisma.voucherSeries.update({
      where: { id: crossSeriesAmphiToEcole.id },
      data: { currentNumber: { increment: 1 } },
    })
    await prisma.voucher.create({
      data: {
        seriesId: crossSeriesAmphiToEcole.id,
        number: updCross.currentNumber,
        studentId: studentRows[5].id,
        classId: classRows[5].id, // ECOLE class
        issuingBranchId: branchAmphi.id,
        targetBranchId: branchEcole.id,
        paymentType: 'TUITION_4SESSION',
        amount: 2800,
        issuedBy: adminId,
        issuedAt: new Date('2026-08-15T11:00:00Z'),
        status: 'ACTIVE',
      },
    })
  }

  // Sample Partial Voucher + Completing Voucher (§1.2)
  const partialSeries = getSeries(branchAmphi.id, levelByName['BAC'].id)
  const updPart1 = await prisma.voucherSeries.update({
    where: { id: partialSeries.id },
    data: { currentNumber: { increment: 1 } },
  })
  const partialVoucher = await prisma.voucher.create({
    data: {
      seriesId: partialSeries.id,
      number: updPart1.currentNumber,
      studentId: studentRows[12].id,
      classId: classRows[0].id,
      issuingBranchId: branchAmphi.id,
      targetBranchId: branchAmphi.id,
      paymentType: 'TUITION_4SESSION',
      amount: 2000,
      isPartial: true,
      remainingBalance: 1200,
      issuedBy: adminId,
      issuedAt: new Date('2026-08-10T09:30:00Z'),
      status: 'ACTIVE',
    },
  })

  const updPart2 = await prisma.voucherSeries.update({
    where: { id: partialSeries.id },
    data: { currentNumber: { increment: 1 } },
  })
  await prisma.voucher.create({
    data: {
      seriesId: partialSeries.id,
      number: updPart2.currentNumber,
      studentId: studentRows[12].id,
      classId: classRows[0].id,
      issuingBranchId: branchAmphi.id,
      targetBranchId: branchAmphi.id,
      paymentType: 'TUITION_4SESSION',
      amount: 1200,
      isPartial: false,
      completesVoucherId: partialVoucher.id,
      issuedBy: adminId,
      issuedAt: new Date('2026-08-20T10:00:00Z'),
      status: 'ACTIVE',
    },
  })

  // Sample Voucher Edit audit trail record (§2.3)
  await prisma.voucherEdit.create({
    data: {
      voucherId: partialVoucher.id,
      editedBy: adminId,
      editedAt: new Date('2026-08-11T14:00:00Z'),
      fieldName: 'remainingBalance',
      oldValue: '1500',
      newValue: '1200',
      reason: 'Rectification montant versé initialement',
    },
  })

  // ── 14. BOOKS, DROPS & DISTRIBUTIONS ─────────────────────────────────────
  console.log('📖  Seeding books, drops, and copy distributions…')
  const bookH1 = await prisma.book.create({
    data: {
      teacherId: 'teacher-1',
      levelId: levelByName['BAC'].id,
      trimesterId: trim1.id,
      title: 'Physique BAC – Unité 1 : Mécanique & Cinématique',
    },
  })
  const bookH2 = await prisma.book.create({
    data: {
      teacherId: 'teacher-1',
      levelId: levelByName['BAC'].id,
      trimesterId: trim1.id,
      title: 'Physique BAC – Unité 2 : Électricité & Circuits RC/RL',
    },
  })
  const bookT1 = await prisma.book.create({
    data: {
      teacherId: 'teacher-2',
      levelId: levelByName['BAC'].id,
      trimesterId: trim1.id,
      title: 'Maths BAC – Fonctions Logarithmes et Exponentielles',
    },
  })
  const bookB1 = await prisma.book.create({
    data: {
      teacherId: 'teacher-3',
      levelId: levelByName['4AM'].id,
      trimesterId: trim1.id,
      title: 'Sciences 4AM – Fascicule Révision BEM',
    },
  })

  const dropH1 = await prisma.bookDrop.create({
    data: {
      bookId: bookH1.id,
      branchId: branchAmphi.id,
      quantity: 40,
      dropDate: new Date('2026-08-15T10:00:00Z'),
      recordedBy: adminId,
    },
  })
  const dropH2 = await prisma.bookDrop.create({
    data: {
      bookId: bookH2.id,
      branchId: branchAmphi.id,
      quantity: 35,
      dropDate: new Date('2026-09-05T10:00:00Z'),
      recordedBy: adminId,
    },
  })
  await prisma.bookDrop.create({
    data: {
      bookId: bookT1.id,
      branchId: branchAmphi.id,
      quantity: 30,
      dropDate: new Date('2026-09-02T10:00:00Z'),
      recordedBy: adminId,
    },
  })
  await prisma.bookDrop.create({
    data: {
      bookId: bookB1.id,
      branchId: branchEcole.id,
      quantity: 25,
      dropDate: new Date('2026-08-25T10:00:00Z'),
      recordedBy: adminId,
    },
  })

  // Book fee vouchers & distributions for enrolled students
  const bacEnrollments = enrollmentRows
    .filter((e) => e.classId === classRows[0].id || e.classId === classRows[1].id)
    .slice(0, 15)

  for (const enr of bacEnrollments) {
    const series = getSeries(branchAmphi.id, levelByName['BAC'].id)
    const updBook = await prisma.voucherSeries.update({
      where: { id: series.id },
      data: { currentNumber: { increment: 1 } },
    })
    await prisma.voucher.create({
      data: {
        seriesId: series.id,
        number: updBook.currentNumber,
        studentId: enr.studentId,
        classId: enr.classId,
        trimesterId: trim1.id,
        issuingBranchId: branchAmphi.id,
        targetBranchId: branchAmphi.id,
        paymentType: 'BOOK',
        amount: 600,
        issuedBy: adminId,
        issuedAt: new Date('2026-08-15T11:00:00Z'),
        status: 'ACTIVE',
      },
    })
    await prisma.bookCopyDistribution.create({
      data: {
        bookDropId: dropH1.id,
        studentId: enr.studentId,
        distributedAt: new Date('2026-08-16T10:00:00Z'),
        distributedBy: adminId,
      },
    }).catch(() => {})
  }

  // ── 15. ATELIERS / WORKSHOPS ─────────────────────────────────────────────
  console.log('🔬  Seeding workshops & participants…')
  const workshop1 = await prisma.workshop.create({
    data: {
      title: 'Séminaire Révision Intensive BAC – Mécanique',
      description: 'Session spéciale de 6 heures pour préparer le premier devoir de Physique',
      branchId: branchAmphi.id,
      guestTeacher: 'Pr. Hamoui Rachid',
      totalPrice: 4000,
    },
  })
  const ws1Session1 = await prisma.workshopSession.create({
    data: {
      workshopId: workshop1.id,
      startsAt: new Date('2026-08-22T14:00:00Z'),
      endsAt: new Date('2026-08-22T17:00:00Z'),
    },
  })
  const ws1Session2 = await prisma.workshopSession.create({
    data: {
      workshopId: workshop1.id,
      startsAt: new Date('2026-08-23T14:00:00Z'),
      endsAt: new Date('2026-08-23T17:00:00Z'),
    },
  })

  // Workshop participants & vouchers
  for (let i = 0; i < 6; i++) {
    const st = studentRows[i]
    await prisma.workshopParticipant.create({
      data: {
        workshopId: workshop1.id,
        studentId: st.id,
        totalPaid: 4000,
        status: 'PAID_IN_FULL',
      },
    })
    await prisma.workshopAttendance.create({
      data: {
        sessionId: ws1Session1.id,
        studentId: st.id,
        status: 'PRESENT',
      },
    })
    await prisma.workshopAttendance.create({
      data: {
        sessionId: ws1Session2.id,
        studentId: st.id,
        status: 'PRESENT',
      },
    })
  }

  // ── 16. LEVEL TEST (Formation) ───────────────────────────────────────────
  console.log('📝  Seeding formation level test…')
  await prisma.levelTest.create({
    data: {
      studentId: studentRows[2].id,
      formationLevelId: formLvlEngA1.id,
      classId: classRows[15].id,
      testDate: new Date('2026-09-10T14:00:00Z'),
      score: 16.5,
      passed: true,
      administeredBy: teachers[4].id,
    },
  })

  // ── 17. PHOTOCOPY CHARGES & SALARY ADVANCES ──────────────────────────────
  console.log('🖨  Seeding photocopy charges & salary advances…')
  const photoCopies = [
    { tIdx: 0, bid: branchAmphi.id, pages: 120, date: new Date('2026-08-10T09:00:00Z') },
    { tIdx: 0, bid: branchAmphi.id, pages:  80, date: new Date('2026-09-04T09:00:00Z') },
    { tIdx: 1, bid: branchAmphi.id, pages:  70, date: new Date('2026-08-15T10:00:00Z') },
    { tIdx: 2, bid: branchEcole.id, pages: 100, date: new Date('2026-08-20T11:00:00Z') },
    { tIdx: 4, bid: branchEcole.id, pages:  90, date: new Date('2026-09-02T09:00:00Z') },
    { tIdx: 7, bid: branchAnnex.id, pages:  65, date: new Date('2026-08-18T14:00:00Z') },
  ]
  for (const pc of photoCopies) {
    await prisma.photocopyCharge.create({
      data: {
        teacherId: teachers[pc.tIdx].id,
        branchId: pc.bid,
        pages: pc.pages,
        costAmount: pc.pages * teacherDefs[pc.tIdx].photocopyRatePerPage,
        date: pc.date,
        recordedBy: adminId,
      },
    })
  }

  await prisma.salaryAdvance.create({
    data: {
      personId: teachers[0].id,
      amount: 3000,
      date: new Date('2026-08-15T00:00:00Z'),
    },
  })
  await prisma.salaryAdvance.create({
    data: {
      personId: teachers[3].id,
      amount: 2000,
      date: new Date('2026-08-20T00:00:00Z'),
    },
  })

  // ── 18. CONSOLIDATED PAYROLL RUNS (August & September) ───────────────────
  console.log('💰  Generating consolidated payroll runs (August & September)…')
  const payrollPeriods = [
    {
      start: new Date('2026-08-01T00:00:00Z'),
      end: new Date('2026-08-31T23:59:59Z'),
      status: 'VALIDATED',
    },
    {
      start: new Date('2026-09-01T00:00:00Z'),
      end: new Date('2026-09-30T23:59:59Z'),
      status: 'DRAFT',
    },
  ]

  for (const period of payrollPeriods) {
    const run = await prisma.payrollRun.create({
      data: {
        periodStart: period.start,
        periodEnd: period.end,
        status: period.status,
      },
    })

    for (let ti = 0; ti < teachers.length; ti++) {
      const teacher = teachers[ti]
      const tDef = teacherDefs[ti]
      let totalSessions = 0
      let totalGross = 0
      const breakdown: Record<number, { sessions: number; amount: number }> = {}

      for (let ci = 0; ci < classRows.length; ci++) {
        const cls = classRows[ci]
        if (cls.teacherId !== teacher.id) continue
        const periodLessons = (lessonsByClass[cls.id] ?? []).filter(
          (l) => l.startsAt >= period.start && l.startsAt <= period.end
        )
        if (!periodLessons.length) continue

        const pps = Number(cls.pricePerCycle ?? 2000) / 4
        const earning = pps * (tDef.percentageOfSessionFee / 100) * periodLessons.length
        totalSessions += periodLessons.length
        totalGross += earning

        if (!breakdown[cls.branchId]) {
          breakdown[cls.branchId] = { sessions: 0, amount: 0 }
        }
        breakdown[cls.branchId].sessions += periodLessons.length
        breakdown[cls.branchId].amount += earning
      }

      if (totalSessions === 0) continue

      // Compute photocopy deductions in this period
      const pcAgg = await prisma.photocopyCharge.aggregate({
        where: {
          teacherId: teacher.id,
          date: { gte: period.start, lte: period.end },
        },
        _sum: { costAmount: true },
      })
      const photoDed = Number(pcAgg._sum.costAmount ?? 0)

      // Advances in this period
      const advAgg = await prisma.salaryAdvance.aggregate({
        where: {
          personId: teacher.id,
          date: { gte: period.start, lte: period.end },
        },
        _sum: { amount: true },
      })
      const advances = Number(advAgg._sum.amount ?? 0)

      const gross = Math.round(totalGross)
      const net = Math.max(0, gross - advances - photoDed)

      const payslip = await prisma.payslip.create({
        data: {
          payrollRunId: run.id,
          personId: teacher.id,
          personType: 'TEACHER',
          sessionsCount: totalSessions,
          grossAmount: gross,
          advances,
          photocopyDeductions: photoDed,
          netAmount: net,
        },
      })

      for (const [bid, bd] of Object.entries(breakdown)) {
        await prisma.payslipBranchLine.create({
          data: {
            payslipId: payslip.id,
            branchId: parseInt(bid),
            sessionsCount: bd.sessions,
            amount: Math.round(bd.amount),
          },
        })
      }
    }
  }

  // ── 19. DAILY LEDGER ─────────────────────────────────────────────────────
  console.log('📊  Seeding daily ledger entries…')
  const ledgerEntries = [
    // ECOLE
    { branchId: branchEcole.id, date: new Date('2026-08-01T00:00:00Z'), type: 'INSCRIPTION', amount: 15000 },
    { branchId: branchEcole.id, date: new Date('2026-08-02T00:00:00Z'), type: 'TUITION',     amount: 48000 },
    { branchId: branchEcole.id, date: new Date('2026-08-25T00:00:00Z'), type: 'BOOK',        amount:  5000 },
    { branchId: branchEcole.id, date: new Date('2026-09-02T00:00:00Z'), type: 'TUITION',     amount: 46000 },

    // ANNEX
    { branchId: branchAnnex.id, date: new Date('2026-08-01T00:00:00Z'), type: 'INSCRIPTION', amount: 14000 },
    { branchId: branchAnnex.id, date: new Date('2026-08-02T00:00:00Z'), type: 'TUITION',     amount: 44000 },
    { branchId: branchAnnex.id, date: new Date('2026-09-02T00:00:00Z'), type: 'TUITION',     amount: 42000 },

    // AMPHI
    { branchId: branchAmphi.id, date: new Date('2026-08-01T00:00:00Z'), type: 'INSCRIPTION', amount: 18000 },
    { branchId: branchAmphi.id, date: new Date('2026-08-02T00:00:00Z'), type: 'TUITION',     amount: 54000 },
    { branchId: branchAmphi.id, date: new Date('2026-08-15T00:00:00Z'), type: 'BOOK',        amount:  9000 },
    { branchId: branchAmphi.id, date: new Date('2026-08-22T00:00:00Z'), type: 'ATELIER_FORMATION', amount: 24000 },
    { branchId: branchAmphi.id, date: new Date('2026-09-02T00:00:00Z'), type: 'TUITION',     amount: 52000 },
  ]

  for (const entry of ledgerEntries) {
    await prisma.dailyLedger.upsert({
      where: {
        branchId_date_type: {
          branchId: entry.branchId,
          date: entry.date,
          type: entry.type,
        },
      },
      update: { amount: entry.amount },
      create: entry,
    })
  }

  // ── 20. ANNOUNCEMENTS ────────────────────────────────────────────────────
  console.log('📣  Seeding announcements…')
  await prisma.announcement.createMany({
    data: [
      {
        title: 'Rentrée scolaire 2026-2027 – Bienvenue',
        description: 'Bienvenue à tous les élèves et enseignants. Les cours débutent le dimanche 1er septembre.',
        branchId: null, // all branches
        pinned: true,
        createdBy: adminId,
        createdAt: new Date('2026-08-28T08:00:00Z'),
      },
      {
        title: 'Emploi du temps des séances de rattrapage (AMPHI)',
        description: 'Les séances de rattrapage en Physique et Mathématiques auront lieu les mercredis après-midi.',
        branchId: branchAmphi.id,
        pinned: false,
        createdBy: adminId,
        createdAt: new Date('2026-09-03T09:00:00Z'),
      },
      {
        title: 'Disponibilité des fascicules du 1er Trimestre (ECOLE)',
        description: 'Les manuels et fascicules de sciences 4AM sont disponibles auprès de l\'administration.',
        branchId: branchEcole.id,
        pinned: true,
        createdBy: adminId,
        createdAt: new Date('2026-09-05T10:00:00Z'),
      },
    ],
  })

  // ── 21. USER PROFILES ────────────────────────────────────────────────────
  console.log('👤  Seeding user profiles…')
  await prisma.userProfile.createMany({
    data: [
      {
        id: 'owner-1',
        email: 'owner@massinissa-school.dz',
        name: 'Propriétaire Directeur',
        role: 'OWNER',
        branchId: null,
        updatedAt: new Date(),
      },
      {
        id: 'admin-ecole-1',
        email: 'admin.ecole@massinissa-school.dz',
        name: 'Directeur ECOLE',
        role: 'BRANCH_ADMIN',
        branchId: branchEcole.id,
        updatedAt: new Date(),
      },
      {
        id: 'admin-annex-1',
        email: 'admin.annex@massinissa-school.dz',
        name: 'Directeur ANNEX',
        role: 'BRANCH_ADMIN',
        branchId: branchAnnex.id,
        updatedAt: new Date(),
      },
      {
        id: 'admin-amphi-1',
        email: 'admin.amphi@massinissa-school.dz',
        name: 'Directeur AMPHI',
        role: 'BRANCH_ADMIN',
        branchId: branchAmphi.id,
        updatedAt: new Date(),
      },
    ],
  })

  console.log('\n✨ Database seeding completed successfully!')
  console.log('====================================================')
  console.log(`🏫 Branches (3)       : [1] ECOLE, [2] ANNEX, [3] AMPHI (Constantine)`)
  console.log(`📚 Grade Levels (10)  : 3AP → BAC`)
  console.log(`📅 Academic Years     : 2025-2026 and 2026-2027 (Active)`)
  console.log(`👨‍🏫 Teachers (10)      : Realistic professors with pay cuts & photocopy rates`)
  console.log(`📋 Classes            : 15 regular groups + 2 language formations`)
  console.log(`👧 Students (100)     : Permanent global IDs #1 → #100, Algerian names & phones`)
  console.log(`👨‍👩‍👧 Families (3)       : Sibling discount payers and waived siblings`)
  console.log(`🚪 Classrooms (8)     : ECOLE (3), ANNEX (4), AMPHI (1)`)
  console.log(`📆 Records (Aug & Sep): 6 weeks of recurring lessons (1 per week, 2h duration, 7/7, 08:00–20:00)`)
  console.log(`✅ Attendance         : Realistic statuses + cross-group catch-up record`)
  console.log(`💳 Vouchers           : August & September cycles, Inscriptions, Books, Partials`)
  console.log(`📖 Books & Drops      : Drops at branches and distribution tracking`)
  console.log(`🔬 Workshops          : BAC physics seminar & robotics workshop with participants`)
  console.log(`🌐 Formations         : Languages, levels, and level test`)
  console.log(`💰 Payroll Runs       : August (Validated) & September (Draft) with branch breakdowns`)
  console.log(`📊 Daily Ledger       : Upserted daily revenues per branch`)
  console.log(`📣 Announcements      : Global & branch-targeted`)
  console.log(`👤 User Profiles      : Owner & 3 Branch Admins`)
  console.log('====================================================')
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })