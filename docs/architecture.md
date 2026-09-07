# School System (3 Branches) — Clean Feature Map & Architecture

Scope: the final feature list as refined and confirmed — multi-branch foundation, revenue tracking, the full voucher/payment system (including sibling discount and group credit transfer), payroll (including teacher photocopy-cost deductions), scheduling (including catch-up sessions), grades, attendance, ateliers/formations, and announcements. Gate check-in has been dropped from scope; everything else not on this list (events calendar, course materials hub, etc.) was already dropped earlier.

---

## Answers from the owner — locking in the remaining decisions

1. **Inscription rule resets every year** — the "first 3 classes" counter is per academic year, not lifetime. This needs an `AcademicYear` entity so the count can reset cleanly each September rather than living as a single never-reset counter.
2. **The owner can force-charge/force-waive** an inscription fee as an exception — but this override is scoped to the **owner role only**, not any branch admin, since it's a deliberate exception to a financial rule.
3. **Free lessons apply to specific lesson instances only** — never a whole class. The `isFree` flag stays exactly at the `Lesson` level, as already modeled; no class-level inheritance needed.
4. **Internet is reliable at all 3 branches** — Option A (single online central database, §5) is the final answer. The offline-queue option is dropped from scope entirely, not just deprioritized.
5. **Branch-limited feature list** — still to be defined later; stays an open item.
6. **Voucher migration must follow the existing numbering exactly** — the digital sequence continues from wherever each paper series currently stands, per branch/level and per cross-branch pad, rather than restarting at 1.
7. **Admins can edit a voucher when they made a mistake** — but since this touches recorded money, every edit needs an audit trail (what changed, who changed it, when), not a silent overwrite.

---

## 1. Feature Map

### 1.0 Cross-branch registration model (new, foundational)
This is a structural rule that changes how branch scoping works everywhere else below:
- A student registers **once**, at **one branch** (their "home branch" — where the administrative inscription happened).
- From then on, that student can enroll in classes located at **any of the 3 branches**, without re-registering. On the day of a session, they simply go to whichever branch that class is physically held at, and the system already has them enrolled — no per-branch duplicate registration.
- The **class/teacher catalog is visible to all 3 branches** — anyone browsing the schedule sees every class and every teacher across the whole school, not just their own branch.
- Other administrative features (which ones exactly, TBD with the owner) stay **limited to a branch scope** — e.g. a branch admin may only be able to *edit* students/payments/attendance for their own branch, even though they can *see* the full catalog. This split (global read on catalog, scoped write elsewhere) is the default assumption until you define the exact limits.

### 1.1 Daily revenue per branch
- "Today's revenue" dashboard per branch + consolidated view across all 3 branches.
- Revenue lines are typed by **voucher type** (see §1.2): tuition, inscription fee, book fee, extra session fee, atelier (dawarat)/formation fee.
- Auto-updated ledger, upserted the instant a voucher is issued — including cross-branch vouchers, which land on the *target* branch's revenue, not the issuing one.
- Branch comparison chart (which branch brings in more, on which fee type).
- Excel export, daily/monthly, per branch and consolidated.

### 1.2 Daily student payment tracking (Excel-style grid) — built on a digital voucher system

This is the module with the most real-world nuance, based on how payments are actually handled today (voucher pads → Excel → highlighted attendance lists). The digital version keeps the exact same logic your admins already know, but removes the manual transcription and the 10-day physical courier delay entirely.

**How it works today (paper), and what changes digitally:**
- An admin collects money from a student and issues a **voucher**: student name, group (teacher/level/module), amount, what it's for (4-session tuition, inscription fee, book fee, or a partial payment completing an earlier one), the student's list number, date, and a voucher number. Digitally, this becomes one form — the voucher number and date are generated automatically, nothing is transcribed by hand afterward.
- Voucher numbering stays **continuous per series**, exactly like the paper pads: a series is either "this branch, this level" (like the old 4AM 1 → 4AM 2 pads) or "this branch, vouchers for [other branch]" (like the old ECOLE/ANNEX pads kept at AMPHI). The counter never resets when a pad/series is exhausted — it just keeps counting, only the label changes. This preserves the audit trail your admins are already used to reading.
- **Cross-branch payments work exactly like before, minus the courier**: an admin at AMPHI can issue a voucher for a student's ECOLE class, same as writing it on the AMPHI-held "ECOLE" pad today. The only difference: since all 3 branches share one database, that voucher is visible on ECOLE's payment grid **instantly**, not after a 10-day printed-report handoff. No more risk of a student attending 10 days on an unrecorded payment.
- What used to be "highlight 4 cells in yellow" on the printed attendance list becomes: the voucher automatically credits 4 sessions to that student's session-credit balance for that class, which the payment grid (§1.2) and attendance roster both read from live — no separate manual highlighting step.
- **Book payments** get their own voucher type and their own tracked column per class (only for classes where `hasBooks = true`), mirroring the 3 extra columns on the paper list.
- **Partial payments / virements**: a voucher can be marked partial, with a remaining balance; a later voucher can reference and complete it, exactly like "this payment completes an earlier virement" is noted today.

**Grid + status:**
- Excel-style grid: students in rows, payment cycles in columns.
- Status badges: 🟢 Paid / 🟡 Expiring Soon / 🔴 Unpaid, based on remaining session credit.
- **Inscription fee handling** (§2.1) shown per enrollment: paid / waived (4th+ class).
- **Free lessons** (§2.2) never touch session-credit — excluded from this grid's countdown entirely.
- **Other branches enrolled** (new): a student's payment sheet shows which other branch(es) they're also enrolled at, so an admin isn't guessing whether a "missing" payment belongs to another siège.
- **Non-payer report** (new): a dedicated filtered list/export of students currently unpaid, beyond the red badge on the grid — for the owner to act on directly rather than scanning the whole grid.
- **Sibling discount** (new, see §2.4): the designated payer sibling is charged tuition normally; other siblings' tuition is auto-waived on the grid, while their inscription/book fees stay charged as usual.
- **Group credit transfer** (new, see §2.6): when a student changes group/class, their remaining paid session credit can be transferred to the new enrollment instead of being lost.
- Printable receipt on every voucher (replaces the torn-off paper copy).
- Filterable by branch, class, payment status. Excel export matching the current file layout (name → phone → inscription → books → 4-session columns).

### 1.3 Payroll (teachers + admin staff)
- Per-session or fixed-monthly rate per teacher, optionally different per branch (a teacher may have a different rate at each of the 3 branches they teach at).
- **Payroll is consolidated per teacher, not per branch.** A teacher who teaches at all 3 branches gets **one payslip, one net payment**, for a given month — not 3 separate payslips from 3 separate branches. The payslip shows a per-branch breakdown line (sessions + amount from each branch) purely for transparency, but the money is one line to the owner and one payment to the teacher.
- Same logic applies to admin staff if they work across branches.
- **Free lessons still count as worked sessions for payroll** even though they don't cost the student anything — the teacher still gets paid for giving them (see §2.2).
- **Photocopy costs are deducted from the teacher's payroll** (§2.5): an admin records the page count when making copies for a teacher, and the resulting cost is subtracted from that teacher's net pay for the period, alongside salary advances — never billed to a student.
- Payslips with total session count, rate(s), salary advances deducted, photocopy deductions, net due — printable/exportable.
- Owner view: total payroll cost vs. total revenue, with a branch breakdown available as a secondary view, not the primary one (the primary view is "how much do I owe this teacher, total").

### 1.4 Room scheduling + extra & catch-up sessions
- Existing-style conflict detection: no double-booking of teacher, class, or room.
- `isExtra` flag on a lesson for one-off/extra sessions outside the normal recurring schedule, with its own optional fee.
- **Catch-up sessions** (new): a distinct `isCatchUp` flag — a rattrapage session is not the same thing as an extra session (different purpose: making up a missed session vs. adding a new one), so it's tracked and billed separately.
- Weekly calendar shows normal, extra, catch-up, and free lessons with distinct visual tags.
- Per-branch room occupancy view to quickly find a free slot for an extra or catch-up session.

### 1.5 Grades consolidated across the 3 branches
- Every grade entry is tagged with the branch it was entered from, plus who entered it and when — replaces the paper trail.
- Consolidated "Notes" view for the owner: look up any student/class regardless of branch.
- Reliable sync between branches — see §5, always-online single database.

### 1.6 Attendance
- In-class attendance: per-lesson roster, Present/Absent — this is what drives session-credit consumption and payroll session counts.
- **On a free lesson** (§2.2), marking a student present shows a confirmation popup before saving, so an admin/teacher can't accidentally consume a session credit that shouldn't be touched.

### 1.7 Ateliers (Dawarat) — the existing Workshops module, kept as-is
- This is exactly the current `Workshop` feature already built in the app — title, description, total price, external/guest teacher, one or more session dates, participant registration with payment/refund tracking, per-session attendance. No structural change needed here beyond what every module gets anyway: branch scoping (§1.0) and routing payments through the voucher system (§1.2) instead of the standalone `WorkshopPayment` table.
- Revenue shows as its own ledger type, separate from tuition, in the branch revenue dashboard (§1.1).

### 1.8 Announcements (kept from old system)
- Post an announcement targeted to a specific class, a specific branch, or all 3 branches at once.
- Pinned/high-priority announcements shown at the top.
- Simple search across title/description.
- Branch-scoped visibility: a student/parent/teacher at Branch 2 only sees announcements targeted at their branch or at "all branches."

### 1.9 Formations — language courses with levels (new, structurally distinct from Ateliers)
This turned out to be nothing like Ateliers/Workshops — it's much closer to a regular `Class`, just with a level-progression system on top. Rebuilt accordingly, not merged with §1.7:
- Organized by **language** (English, French, German, etc.) and **age group** (exact brackets still to be confirmed with the owner).
- Each **level** requires **30 hours** of instruction, delivered over recurring sessions **twice a week** — this reuses the existing `Class`/`Lesson` scheduling and conflict-detection machinery from §1.4, not a new scheduling system. A formation group is just a `Class` flagged as a formation, with a teacher, room, and a normal twice-weekly recurring `Lesson` pattern like any other class.
- At the end of a level, the student sits a **"test de niveau"** (level test). Passing moves them up to the next level; failing keeps them at the current level.
- Levels are ordered per language (Level 1 → Level 2 → ...), so the system needs to know, for a given language, what the next level is and which group/schedule at that level a passing student should be moved into.
- Payment model still to be confirmed: billed the same way as a regular class (per-session/4-cycle tuition via the voucher system, §1.2) or as one lump sum per level (like Ateliers)? Defaulting to the standard per-class tuition approach for now, since it reuses existing machinery, but flagged as an open question.

---

## 2. New business rules discovered (integrated above, detailed here)

### 2.1 Inscription fee — first 3 classes per academic year
- Every class enrollment normally carries a one-time **inscription fee**, charged at enrollment time, separate from the recurring session-based tuition.
- A student pays this fee for their **first 3 class enrollments within the current academic year only**. From the **4th enrollment onward that year, the fee is automatically waived** — and the count starts fresh again at the next academic year.
- This is counted **per `AcademicYear`**, not as a lifetime counter: on every new enrollment, count that student's charged-fee enrollments within the current academic year.
  - if count `< 3` → charge the fee.
  - if count `>= 3` → waive automatically.
- **Exception override**: the **owner only** (not branch admins) can force-charge or force-waive a fee outside this automatic rule, with the override recorded (who did it, and optionally why).
- This fee is tracked as its own line item type in the ledger and the payment grid (§1.1, §1.2), not mixed with tuition, so the owner can see inscription-fee revenue separately from recurring session revenue.

### 2.2 Free lessons — flagged, don't consume session credit
- Some lessons are free. These need an `isFree` flag at the lesson level.
- When a student attends a free lesson, their **purchased/consumed session counter is not touched** — it's excluded entirely from the payment/session-credit logic in §1.2.
- Free lessons are still logged for attendance (§1.6) and still **count toward the teacher's worked sessions for payroll** (§1.3) — the lesson is free for the student, not for the teacher's pay.

### 2.3 Voucher-based payments with cross-branch issuance (discovered from the real workflow)
- Every payment is a **voucher**, not a bare payment record — it carries a continuous sequence number per series (per branch+level, or per branch+"target branch"), matching how the physical pads work today.
- A voucher can be issued at a **different branch than the class it pays for** (the AMPHI-admin-writing-an-ECOLE-voucher case). The issuing branch and the target branch are both recorded, but the payment always lands on the target branch's ledger and payment grid.
- Because there's one shared database (§4), a cross-branch voucher is visible everywhere **immediately** — this fully replaces the old 10-day manual courier cycle (collect foreign vouchers → transcribe to Excel → print → physically carry to the other branch). That delay, and the risk of a student attending on an unrecorded payment during those 10 days, is eliminated by design, not just shortened.
- **Editing a voucher**: admins can correct a mistaken voucher, but every edit is logged (`VoucherEdit`: who, when, which field, old vs. new value) rather than silently overwritten — this keeps the same accountability the paper trail had, since a torn-off paper voucher couldn't be silently changed either.

### 2.4 Sibling discount — one payer per family on lesson fees only
- This is a **full waiver, not a percentage**: within a family, tuition/lesson fees are charged in full to **one designated child** (the "payer"). Every other sibling in that family has their **tuition fees waived entirely** on their enrollments.
- **Inscription fees and book fees are unaffected** — every sibling still pays these normally, per the standard rules (§2.1 for inscription). Only the recurring lesson/tuition fee is waived for non-payer siblings.
- Requires a `Family` grouping (already modeled) plus a way to mark which sibling is the designated payer — **still open**: is this the first child registered, the eldest, or something the admin sets manually? Needs to be confirmed with the owner, since it changes whether this is automatic or requires an admin action per family.
- Also open: does this apply to *every* class a non-payer sibling is enrolled in, or only when siblings share the exact same class? The description implies "lesson fees" broadly, so the current assumption is **all of that sibling's tuition, across all their classes, is waived** — flag this explicitly to the owner before building it, since it's a real revenue impact if the assumption is wrong.

### 2.5 Photocopy fees — a teacher cost, not a student fee
- Photocopies are **not billed to students at all** — this was corrected from an earlier draft where it was modeled as a student voucher type. Photocopies are a **cost the teacher owes the school**: when an admin makes photocopies for a teacher, the admin records the page count, and that cost is **deducted directly from that teacher's payroll** (§1.3), the same way a salary advance is deducted, but as an expense rather than a repayment.
- This means photocopy charges live entirely in the payroll module, not in the voucher/revenue system — they never touch `DailyLedger` or the student payment grid, since no student ever pays for them.

### 2.6 Group credit transfer
- When a student changes group/class, any remaining paid session credit on the old enrollment can be transferred to the new one instead of being lost — recorded as its own transfer event (from which enrollment, to which, how many sessions, by whom), so it's auditable like a voucher edit.

### 2.7 Ateliers (Dawarat) vs. Formations — resolved, structurally distinct
- Confirmed with the owner: these are **not variants of the same thing**. Ateliers/Dawarat is exactly the existing Workshops module (§1.7), untouched. Formations (§1.9, §2.8) are language courses with levels, built on `Class`/`Lesson`, not on the Workshop structure. No shared "category" model needed — that earlier approach was based on an incorrect assumption and has been dropped.

### 2.8 Formations — levels, progression, and the test de niveau
- A formation is scoped by **language + age group** (e.g. "English, ages 10–13"), with the exact age-group brackets still to be confirmed with the owner.
- Each level = **30 hours**, delivered in recurring sessions **twice a week** — modeled as a `Class` (flagged `isFormation`) with normal `Lesson` rows, reusing the existing scheduling/conflict-detection engine (§1.4) rather than a new one.
- Levels are ordered per language (`FormationLevel`, e.g. Level 1 → Level 2 → ...), each with its own `hoursRequired` (defaulting to 30, but configurable in case a future level differs).
- At the end of a level, the student takes a **test de niveau** (`LevelTest`: score, pass/fail, date, who administered it). On a pass, the admin moves the student into the corresponding group at the next level for that language — this is an assisted action (the admin picks the destination group/schedule), not fully automatic, since which specific next-level group/time-slot fits the student isn't something the system can decide on its own.
- On a fail, the student stays enrolled at the current level (no automatic re-billing assumed — whether a retake costs anything extra is an open question).

---

## 3. Core Data Model (only what these 6 features need)

```prisma
model Branch {
  id       Int    @id @default(autoincrement())
  name     String
  address  String
  phone    String?
  manager  String?

  students    Student[]
  teachers    TeacherBranch[]
  classes     Class[]
  classrooms  Classroom[]
  lessons     Lesson[]
  exams       Exam[]
  ledger      DailyLedger[]
  payrollRuns PayrollRun[]
  workshops   Workshop[]
  voucherSeriesIssued VoucherSeries[] @relation("IssuingBranch")
  voucherSeriesTarget VoucherSeries[] @relation("TargetBranch")
}

model AcademicYear {
  id        Int      @id @default(autoincrement())
  label     String   // e.g. "2026-2027"
  startDate DateTime
  endDate   DateTime

  enrollments Enrollment[]
}

model Family {
  id                Int       @id @default(autoincrement())
  payerStudentId    String?   // the designated sibling who pays tuition in full; exact designation rule (first registered? admin-set?) TBD with owner
  students          Student[]
  // rule: non-payer siblings get TUITION_4SESSION waived on their vouchers; inscription and book fees are unaffected (§2.4)
}

model Student {
  id                 String   @id
  registeredBranchId Int      // home branch — where inscription happened, fixed at signup
  familyId           Int?     // links siblings for the discount rule, see §2.4
  name               String
  // ...core profile fields
  // note: no lifetime paidInscriptionsCount field — the "first 3" count is
  // computed per AcademicYear from Enrollment.inscriptionFeeCharged, see §2.1

  registeredBranch Branch        @relation(fields: [registeredBranchId], references: [id])
  family           Family?       @relation(fields: [familyId], references: [id])
  enrollments      Enrollment[]  // classes can be at ANY branch, not just registeredBranchId
  attendances      Attendance[]
  levelTests       LevelTest[]
}

model Class {
  id        Int      @id @default(autoincrement())
  branchId  Int
  name      String
  pricePerCycle Decimal   // recurring tuition, per 4-session cycle
  inscriptionFee Decimal  // standard fee amount charged on enrollment (subject to the 3x rule)
  hasBooks  Boolean  @default(false)
  bookFee   Decimal?       // set when hasBooks = true
  isFormation      Boolean  @default(false) // true = this is a language-formation group, see §1.9/§2.8
  formationLevelId Int?     // set when isFormation = true
  ageGroup         String?  // set when isFormation = true — exact brackets TBD with owner

  branch         Branch          @relation(fields: [branchId], references: [id])
  formationLevel FormationLevel? @relation(fields: [formationLevelId], references: [id])
  enrollments    Enrollment[]
  lessons        Lesson[]
  levelTests     LevelTest[]
}

model Enrollment {
  id                    Int      @id @default(autoincrement())
  studentId             String
  classId               Int      // class.branchId can differ from student.registeredBranchId — that's expected, not an error
  academicYearId        Int      // the "first 3" inscription-fee count resets per year, scoped here
  enrolledAt            DateTime @default(now())
  inscriptionFeeCharged Boolean  // true if this enrollment actually charged the fee
  inscriptionFeeAmount  Decimal? // amount charged, null if waived
  feeOverriddenByOwner  Boolean  @default(false) // true if the owner manually forced/waived outside the automatic rule
  feeOverrideNote        String?

  student      Student      @relation(fields: [studentId], references: [id])
  class        Class        @relation(fields: [classId], references: [id])
  academicYear AcademicYear @relation(fields: [academicYearId], references: [id])
  transfersFrom EnrollmentTransfer[] @relation("FromEnrollment")
  transfersTo   EnrollmentTransfer[] @relation("ToEnrollment")
}

model EnrollmentTransfer {
  id                  Int      @id @default(autoincrement())
  fromEnrollmentId    Int
  toEnrollmentId      Int
  transferredSessions Int      // remaining paid session credit carried over
  transferredAt       DateTime @default(now())
  transferredBy       String   // admin id

  fromEnrollment Enrollment @relation("FromEnrollment", fields: [fromEnrollmentId], references: [id])
  toEnrollment   Enrollment @relation("ToEnrollment", fields: [toEnrollmentId], references: [id])
}

model Teacher {
  id       String @id
  branches TeacherBranch[]
  rates    TeacherPayRate[]
  lessons  Lesson[]
  photocopyCharges PhotocopyCharge[]
}

model TeacherBranch {
  id        Int     @id @default(autoincrement())
  teacherId String
  branchId  Int
  payRate   Decimal?   // overrides TeacherPayRate for this branch, if set

  teacher Teacher @relation(fields: [teacherId], references: [id])
  branch  Branch  @relation(fields: [branchId], references: [id])
  @@unique([teacherId, branchId])
}

model TeacherPayRate {
  id             Int      @id @default(autoincrement())
  teacherId      String
  ratePerSession Decimal?
  fixedMonthly   Decimal?
  effectiveFrom  DateTime

  teacher Teacher @relation(fields: [teacherId], references: [id])
}

model Classroom {
  id       Int    @id @default(autoincrement())
  branchId Int
  name     String

  branch  Branch   @relation(fields: [branchId], references: [id])
  lessons Lesson[]
}

model Lesson {
  id          Int      @id @default(autoincrement())
  branchId    Int
  classId     Int
  teacherId   String
  classroomId Int
  startsAt    DateTime
  endsAt      DateTime
  isExtra     Boolean  @default(false)   // extra/one-off session
  extraFee    Decimal?                    // if isExtra and separately billed
  isCatchUp   Boolean  @default(false)   // rattrapage session — distinct from isExtra
  isFree      Boolean  @default(false)   // free lesson — no session credit consumed

  branch    Branch    @relation(fields: [branchId], references: [id])
  class     Class     @relation(fields: [classId], references: [id])
  teacher   Teacher   @relation(fields: [teacherId], references: [id])
  classroom Classroom @relation(fields: [classroomId], references: [id])
  attendances Attendance[]
}

model Attendance {
  id        Int      @id @default(autoincrement())
  lessonId  Int
  studentId String
  status    String   // PRESENT | ABSENT
  // session credit is decremented on PRESENT unless lesson.isFree = true

  lesson  Lesson  @relation(fields: [lessonId], references: [id])
  student Student @relation(fields: [studentId], references: [id])
}

model VoucherSeries {
  id              Int    @id @default(autoincrement())
  issuingBranchId Int
  scope           String  // LOCAL_LEVEL | CROSS_BRANCH
  levelId         Int?    // set when scope = LOCAL_LEVEL (mirrors "4AM 1, 4AM 2..." pads)
  targetBranchId  Int?    // set when scope = CROSS_BRANCH (mirrors the "ECOLE"/"ANNEX" pads held at another branch)
  currentNumber   Int     @default(0)  // continuous counter, never resets when a "pad" is exhausted

  issuingBranch Branch    @relation("IssuingBranch", fields: [issuingBranchId], references: [id])
  targetBranch  Branch?   @relation("TargetBranch", fields: [targetBranchId], references: [id])
  vouchers      Voucher[]
}

model Voucher {
  id                 Int      @id @default(autoincrement())
  seriesId           Int
  number             Int      // sequential within the series
  studentId          String
  classId            Int      // may belong to a different branch than issuingBranchId
  issuingBranchId    Int      // where the admin physically was when writing it
  targetBranchId     Int      // the branch this payment actually belongs to (== class.branchId)
  paymentType        String   // INSCRIPTION | TUITION_4SESSION | BOOK | EXTRA_SESSION | CATCHUP | WORKSHOP
  amount             Decimal
  isPartial          Boolean  @default(false)
  completesVoucherId Int?     // links a completing payment back to the original partial one
  remainingBalance   Decimal?
  issuedBy           String   // admin id
  issuedAt           DateTime @default(now())
  isVoided           Boolean  @default(false)
  lastEditedAt        DateTime?
  lastEditedBy         String?

  series  VoucherSeries @relation(fields: [seriesId], references: [id])
  student Student       @relation(fields: [studentId], references: [id])
  class   Class         @relation(fields: [classId], references: [id])
  edits   VoucherEdit[]
}

model VoucherEdit {
  id         Int      @id @default(autoincrement())
  voucherId  Int
  editedBy   String   // admin id
  editedAt   DateTime @default(now())
  fieldName  String   // which field changed, e.g. "amount", "paymentType"
  oldValue   String
  newValue   String
  reason     String?

  voucher Voucher @relation(fields: [voucherId], references: [id])
}

model DailyLedger {
  id       Int      @id @default(autoincrement())
  branchId Int
  date     DateTime
  type     String   // TUITION | INSCRIPTION | BOOK | EXTRA_SESSION | CATCHUP | WORKSHOP | PAYROLL_OUT
  amount   Decimal

  branch Branch @relation(fields: [branchId], references: [id])
}

model PayrollRun {
  id          Int       @id @default(autoincrement())
  periodStart DateTime
  periodEnd   DateTime
  status      String    // DRAFT | VALIDATED | PAID
  // no branchId here on purpose — payroll is consolidated across all 3 branches, see Payslip/PayslipBranchLine

  payslips Payslip[]
}

model Payslip {
  id                Int      @id @default(autoincrement())
  payrollRunId      Int
  personId          String   // teacherId or staffId
  personType        String   // TEACHER | STAFF
  sessionsCount     Int?     // total across all branches, includes free lessons taught
  grossAmount       Decimal  // total across all branches
  advances          Decimal  @default(0)
  photocopyDeductions Decimal @default(0) // sum of PhotocopyCharge for this teacher in this period, see §2.5
  netAmount         Decimal  // ONE net payment, regardless of how many branches this person worked at

  payrollRun   PayrollRun          @relation(fields: [payrollRunId], references: [id])
  branchLines  PayslipBranchLine[] // breakdown only, not separate payments
}

model PayslipBranchLine {
  id            Int      @id @default(autoincrement())
  payslipId     Int
  branchId      Int
  sessionsCount Int
  amount        Decimal  // portion of the gross amount earned at this branch — informational only

  payslip Payslip @relation(fields: [payslipId], references: [id])
  branch  Branch  @relation(fields: [branchId], references: [id])
}

model SalaryAdvance {
  id       Int      @id @default(autoincrement())
  personId String
  amount   Decimal
  date     DateTime
}

model PhotocopyCharge {
  id          Int      @id @default(autoincrement())
  teacherId   String
  branchId    Int
  pages       Int
  costAmount  Decimal  // total cost for this batch of copies, deducted from the teacher's next payslip
  date        DateTime @default(now())
  recordedBy  String   // admin id who made the copies and logged them

  teacher Teacher @relation(fields: [teacherId], references: [id])
  branch  Branch  @relation(fields: [branchId], references: [id])
}

model Exam {
  id        Int      @id @default(autoincrement())
  branchId  Int
  classId   Int
  createdBy String
  createdAt DateTime @default(now())

  branch Branch @relation(fields: [branchId], references: [id])
}

model Workshop {
  id             Int      @id @default(autoincrement())
  branchId       Int
  title          String
  description    String?
  totalPrice     Decimal
  guestTeacher   String?  // external/guest teacher name, if not an internal Teacher

  branch       Branch                @relation(fields: [branchId], references: [id])
  sessions     WorkshopSession[]
  participants WorkshopParticipant[]
}

model WorkshopSession {
  id         Int      @id @default(autoincrement())
  workshopId Int
  startsAt   DateTime
  endsAt     DateTime

  workshop    Workshop             @relation(fields: [workshopId], references: [id])
  attendances WorkshopAttendance[]
}

model WorkshopParticipant {
  id            Int      @id @default(autoincrement())
  workshopId    Int
  studentId     String
  totalPaid     Decimal  @default(0)
  totalRefunded Decimal  @default(0)
  status        String   // OWED | PAID_IN_FULL

  workshop Workshop @relation(fields: [workshopId], references: [id])
  student  Student  @relation(fields: [studentId], references: [id])
}

model WorkshopAttendance {
  id        Int      @id @default(autoincrement())
  sessionId Int
  studentId String
  status    String   // PRESENT | ABSENT

  session WorkshopSession @relation(fields: [sessionId], references: [id])
  student Student         @relation(fields: [studentId], references: [id])
}

model Language {
  id     Int    @id @default(autoincrement())
  name   String // "English", "French", "German", ...

  levels FormationLevel[]
}

model FormationLevel {
  id            Int      @id @default(autoincrement())
  languageId    Int
  levelNumber   Int      // ordering: 1, 2, 3...
  name          String   // display name, e.g. "Level 1" or "A1" — whatever naming the owner uses
  hoursRequired Int      @default(30)

  language Language @relation(fields: [languageId], references: [id])
  classes  Class[]  // formation groups running at this level
}

model LevelTest {
  id             Int      @id @default(autoincrement())
  studentId      String
  formationLevelId Int
  classId        Int      // which formation group they were tested out of
  testDate       DateTime
  score          Decimal?
  passed         Boolean
  administeredBy String   // teacher/admin id

  student        Student        @relation(fields: [studentId], references: [id])
  formationLevel FormationLevel @relation(fields: [formationLevelId], references: [id])
  class          Class          @relation(fields: [classId], references: [id])
}

model Announcement {
  id          Int      @id @default(autoincrement())
  branchId    Int?     // null = all branches
  classId     Int?     // null = whole branch/all branches, not one class
  title       String
  description String
  pinned      Boolean  @default(false)
  createdAt   DateTime @default(now())
  createdBy   String

  branch Branch? @relation(fields: [branchId], references: [id])
  class  Class?  @relation(fields: [classId], references: [id])
}
```

---

## 4. System Architecture

```
                                ┌───────────────────────────┐
                                │        Cloud (1x)         │
                                │  ─────────────────────    │
                                │  Next.js 14 App Router     │
                                │  (Server Actions, RSC)     │
                                │  Auth (RBAC + branch scope)│
                                │  Prisma ORM                │
                                │  PostgreSQL (single source)│
                                └─────────────┬──────────────┘
                                              │ HTTPS (Internet)
              ┌───────────────────────────────┼───────────────────────────────┐
              │                               │                               │
     ┌────────▼────────┐            ┌─────────▼────────┐            ┌─────────▼────────┐
     │ Branch: Central  │            │ Branch 2         │            │ Branch 3         │
     │ Admin/teacher    │            │ Admin/teacher     │            │ Admin/teacher     │
     │ terminals (web)  │            │ terminals (web)   │            │ terminals (web)   │
     └───────────────────┘            └───────────────────┘            └───────────────────┘
```

- **Single unified app**: Next.js (App Router, Server Actions), same codebase serves all 3 branches, scoped by `branchId` in the session.
- **Catalog is a shared read layer**: classes, teachers, and the schedule are queried without a branch filter by default — every branch sees the whole school's offering. Branch scoping is applied only on the *write* side (and on specific views like the payment grid or attendance roster), per §1.0.
- **Single PostgreSQL database**: source of truth for revenue, payments, payroll, grades, and family/sibling data across all 3 branches — this is what makes the branch merge reliable, no separate databases to reconcile. It's also what makes consolidated payroll (§1.3) possible: one query across all lessons/branches for a teacher, not 3 separate systems to add up by hand.
- **Excel export**: server-side generation (ExcelJS), filterable by branch/date/fee type, reused across §1.1, §1.2, §1.3.
- **Receipts/payslips**: server-generated printable PDF/receipt for both payments (§1.2) and payroll (§1.3) — one payslip PDF per teacher per period, not one per branch.
- **Future extensibility — public online presence**: not part of this build, but the app is a standard Next.js app, so a future public-facing site (marketing pages, an online enrollment inquiry form, eventually online payments) can be added as additional routes on the same codebase later, without needing to re-architect anything built now.

---

## 5. Multi-branch sync — final decision

Internet connectivity is confirmed reliable at all 3 branches, so the offline-queue option is **out of scope entirely**, not just deprioritized:

- **Single central database, always online.** All 3 branches write directly to the same cloud database in real time. No conflicts, no merge logic, no offline queue to build or maintain.
- This is also what makes the voucher system (§2.3) work as a true real-time replacement for the old courier cycle — a cross-branch voucher is visible everywhere the instant it's issued.

---

## 6. Build order
1. Branch model + auth scoping.
2. **Voucher series migration**: seed `VoucherSeries` for every existing paper pad (per branch/level, and per branch/target-branch pair) with `currentNumber` set to match where the paper series currently stands — the digital sequence must continue, not restart.
3. Voucher system (§1.2, §2.3) with inscription-fee logic (§2.1, year-scoped via `AcademicYear`), free-lesson exclusion (§2.2), and sibling discount (§2.4) — the highest-value, most rule-dependent piece, and what replaces the paper pads and the 10-day courier cycle.
4. Revenue dashboard (§1.1), built directly on the ledger fed by vouchers from step 3.
5. Rooms + extra/catch-up/free sessions (§1.4), with the `isFree`/`isExtra`/`isCatchUp` flags feeding both the calendar and the voucher logic.
6. Group credit transfer (§2.6), once enrollments and session credit exist to transfer.
7. Grades consolidation (§1.5).
8. Payroll (§1.3), including the photocopy cost deduction (§2.5), consuming attendance data (including free lessons) from step 5.
9. Ateliers/Dawarat (§1.7) — the existing Workshops module, just branch-scoped and routed through the voucher system; low effort since it already exists.
10. Formations (§1.9, §2.8) — genuinely new, built after step 5 since it reuses the Class/Lesson scheduling engine from that step, and after step 3 since it bills through the voucher system.
11. Announcements (§1.8) — additive, lower priority.

---

## Open questions (remaining)
- **Which specific features should stay branch-limited** for a branch admin (per §1.0)? Still to be defined — likely candidates: editing/deleting students not registered at their branch, viewing payroll for teachers who don't teach at their branch, editing vouchers issued at another branch.
- **Sibling discount — who is the designated payer?** First child registered, eldest, or admin-chosen per family? And does the waiver apply to *all* of a non-payer sibling's classes, or only matching ones?
- **Non-payer report**: any specific criteria beyond "session credit is at 0" (e.g. only flag after X days unpaid, or exclude students on an active partial-payment plan)?
- **Photocopy cost rate**: is the per-page cost a fixed school-wide rate, or does it vary (e.g. by branch, or by paper type)? Needed to compute `PhotocopyCharge.costAmount` from a page count automatically rather than requiring the admin to type in both numbers every time.
- **Formation age-group brackets**: what are the actual age ranges used (e.g. "6–9", "10–13", "Adults")?
- **Formation payment model**: billed like a regular class (per 4-session cycle, via the voucher system) or as one lump sum for the whole 30-hour level? Current default assumption is the former.
- **Formation retake**: if a student fails the test de niveau, is there any extra charge to continue/retake, or do they just keep attending the same level's sessions at no additional cost?
