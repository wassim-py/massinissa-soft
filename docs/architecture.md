# School System (3 Branches) — Clean Feature Map & Architecture

Scope: the final feature list as refined and confirmed — multi-branch foundation, revenue tracking, the full voucher/payment system (including sibling discount and group credit transfer), payroll (including teacher photocopy-cost deductions), scheduling (including catch-up sessions), attendance, ateliers/formations, and announcements. Exams/grades and gate check-in have both been dropped from scope; everything else not on this list (events calendar, course materials hub, etc.) was already dropped earlier.

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
- **Display format**: every voucher renders as `BRANCH [LEVEL] BON NUMBER (DATE)` — e.g. `ANNEX 4AM BON 155 (15/05/2026)`. The level segment appears when the voucher's series is a local-level series (`VoucherSeries.scope = LOCAL_LEVEL`, level derived from `series.levelId`); cross-branch series (`scope = CROSS_BRANCH`) have no level attached, so the format for those stays `BRANCH BON NUMBER (DATE)` without a level segment, matching how the physical cross-branch pads never had a level either.
- **Cross-branch payments work exactly like before, minus the courier**: an admin at AMPHI can issue a voucher for a student's ECOLE class, same as writing it on the AMPHI-held "ECOLE" pad today. The only difference: since all 3 branches share one database, that voucher is visible on ECOLE's payment grid **instantly**, not after a 10-day printed-report handoff. No more risk of a student attending 10 days on an unrecorded payment.
- What used to be "highlight 4 cells in yellow" on the printed attendance list becomes: the voucher automatically credits 4 sessions to that student's session-credit balance for that class, which the payment grid (§1.2) and attendance roster both read from live — no separate manual highlighting step.
- **Book payments** get their own voucher type and their own tracked column per class (only for classes where `hasBooks = true`) — paid per trimester per group, see §2.11 for the full book-eligibility system (a separate section from this grid, since book copies aren't distributed here — they're checked off during attendance).
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

### 1.5 Attendance
- In-class attendance: per-lesson roster, Present/Absent — this is what drives session-credit consumption and payroll session counts.
- **On a free lesson** (§2.2), marking a student present shows a confirmation popup before saving, so an admin/teacher can't accidentally consume a session credit that shouldn't be touched.

### 1.6 Ateliers (Dawarat) — the existing Workshops module, kept as-is
- This is exactly the current `Workshop` feature already built in the app — title, description, total price, external/guest teacher, one or more session dates, participant registration with payment/refund tracking, per-session attendance. No structural change needed here beyond what every module gets anyway: branch scoping (§1.0) and routing payments through the voucher system (§1.2) instead of the standalone `WorkshopPayment` table.
- Revenue shows as its own ledger type, separate from tuition, in the branch revenue dashboard (§1.1).

### 1.7 Announcements (kept from old system)
- Post an announcement targeted to a specific class, a specific branch, or all 3 branches at once.
- Pinned/high-priority announcements shown at the top.
- Simple search across title/description.
- Branch-scoped visibility: a student/parent/teacher at Branch 2 only sees announcements targeted at their branch or at "all branches."

### 1.8 Formations — language courses with levels (new, structurally distinct from Ateliers)
This turned out to be nothing like Ateliers/Workshops — it's much closer to a regular `Class`, just with a level-progression system on top. Rebuilt accordingly, not merged with §1.6:
- Organized by **language** (English, French, German, etc.) and **age group** (exact brackets still to be confirmed with the owner).
- Each **level** requires **30 hours** of instruction, delivered over recurring sessions **twice a week** — this reuses the existing `Class`/`Lesson` scheduling and conflict-detection machinery from §1.4, not a new scheduling system. A formation group is just a `Class` flagged as a formation, with a teacher, room, and a normal twice-weekly recurring `Lesson` pattern like any other class.
- At the end of a level, the student sits a **"test de niveau"** (level test). Passing moves them up to the next level; failing keeps them at the current level.
- Levels are ordered per language (Level 1 → Level 2 → ...), so the system needs to know, for a given language, what the next level is and which group/schedule at that level a passing student should be moved into.
- Payment model still to be confirmed: billed the same way as a regular class (per-session/4-cycle tuition via the voucher system, §1.2) or as one lump sum per level (like Ateliers)? Defaulting to the standard per-class tuition approach for now, since it reuses existing machinery, but flagged as an open question.

### 1.9 Installable app (PWA) & WebView compatibility
The app must work as a normal responsive website in a desktop browser, but also be installable as an app on phones and behave correctly when embedded in a WebView:
- **Web App Manifest** (`manifest.json`): app name, icons at the required sizes, theme color, `display: standalone` — this is what makes "Add to Home Screen" produce a real app icon that opens without browser chrome, on both Android and iOS.
- **Service worker for the app shell only** — caches static assets (JS/CSS/icons) so the app installs and launches quickly. This is explicitly NOT the offline-data-sync layer that was deliberately dropped in §5 (internet is reliable at all 3 branches) — it's purely about installability and load speed, not about writing vouchers/attendance while offline.
- **iOS-specific meta tags** (`apple-touch-icon`, `apple-mobile-web-app-capable`, status bar styling, splash screens) — iOS handles "Add to Home Screen" differently from Android and needs these explicitly, they don't come for free from the manifest alone.
- **Responsive, touch-first UI** validated at phone viewport widths, not just desktop — this matters most for the dense screens (payment grid, attendance roster, weekly calendar), which are the ones most likely to have been designed assuming a wide desktop screen.
- **WebView compatibility check**: confirm the app works correctly when loaded inside an embedded WebView (not just a normal mobile browser tab) — the main risk area is Clerk authentication, since third-party sign-in flows and cookies can behave differently inside an embedded WebView than in a regular browser tab. This needs an explicit test pass, not an assumption that "it's just a browser."
- This does **not** require publishing to the Play Store/App Store to be useful — installable-from-browser (PWA) already gets the "feels like an app" outcome. Wrapping it in a native shell (e.g. Capacitor, or a Trusted Web Activity on Android) to actually list it on the stores is a possible future step, in the same spirit as the "future public online presence" extensibility note in §4 — not required now, but nothing in this phase should make that harder to do later.

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
- Free lessons are still logged for attendance (§1.5) and still **count toward the teacher's worked sessions for payroll** (§1.3) — the lesson is free for the student, not for the teacher's pay.

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
- Photocopies are **not billed to students at all** — this was corrected from an earlier draft where it was modeled as a student voucher type. Photocopies are a **cost the teacher owes the school**: when an admin makes photocopies for a teacher, the admin records only the page count, and the cost is **auto-computed** (`pages × Teacher.photocopyRatePerPage`) and **deducted directly from that teacher's payroll** (§1.3), the same way a salary advance is deducted, but as an expense rather than a repayment.
- **The per-page rate is set individually per teacher by the owner** — not a single school-wide rate. The admin recording a photocopy batch never types in a cost, only a page count; the system does the math.
- This means photocopy charges live entirely in the payroll module, not in the voucher/revenue system — they never touch `DailyLedger` or the student payment grid, since no student ever pays for them.

### 2.6 Group credit transfer
- When a student changes group/class, any remaining paid session credit on the old enrollment can be transferred to the new one instead of being lost — recorded as its own transfer event (from which enrollment, to which, how many sessions, by whom), so it's auditable like a voucher edit.

### 2.7 Ateliers (Dawarat) vs. Formations — resolved, structurally distinct
- Confirmed with the owner: these are **not variants of the same thing**. Ateliers/Dawarat is exactly the existing Workshops module (§1.6), untouched. Formations (§1.8, §2.8) are language courses with levels, built on `Class`/`Lesson`, not on the Workshop structure. No shared "category" model needed — that earlier approach was based on an incorrect assumption and has been dropped.

### 2.8 Formations — levels, progression, and the test de niveau
- A formation is scoped by **language + age group** (e.g. "English, ages 10–13"), with the exact age-group brackets still to be confirmed with the owner.
- Each level = **30 hours**, delivered in recurring sessions **twice a week** — modeled as a `Class` (flagged `isFormation`) with normal `Lesson` rows, reusing the existing scheduling/conflict-detection engine (§1.4) rather than a new one.
- Levels are ordered per language (`FormationLevel`, e.g. Level 1 → Level 2 → ...), each with its own `hoursRequired` (defaulting to 30, but configurable in case a future level differs).
- **Billing is a lump sum for the whole level** (confirmed), not per 4-session cycle — tracked via a dedicated `WORKSHOP`-style voucher type (`FORMATION`) rather than `TUITION_4SESSION`, since the shape of the payment is different (one full-level charge, payable in partial installments via the existing partial-voucher mechanism if needed).
- At the end of a level, the student takes a **test de niveau** (`LevelTest`: score, pass/fail, date, who administered it). On a **pass**, the admin moves the student into the corresponding group at the next level for that language — an assisted action (the admin picks the destination group/schedule), not fully automatic.
- On a **fail** (confirmed): the student **pays the full level fee again** and repeats the same level — a new `Enrollment` at the same `FormationLevel`, with a new lump-sum voucher, not a free retake.

### 2.9 Payroll — percentage of session fee, not just flat rates
- The owner sets an **individual percentage per teacher** (`TeacherPayRate.percentageOfSessionFee`) — this is the primary payroll model, not a flat per-session amount. A teacher earns that percentage of the per-session tuition price (`Class.pricePerCycle / 4`) for every session actually delivered.
- **Pay follows actual attendance, not what the student paid for**: if a student pays for a 4-session cycle but only attends 2 that month, the teacher is paid for 2 sessions, not 4 — payroll is driven by `Attendance` records, never by `Voucher`/tuition amounts directly.
- This percentage-based calculation replaces `ratePerSession`/`fixedMonthly` as the default expectation; those fields stay available for edge cases (e.g. a fixed-salary admin role) but the teacher payroll flow is built around the percentage model first.

### 2.10 Permanent, school-wide student ID number
- Every student gets a **sequential ID number** (1, 2, 3...), unique across **all 3 branches combined**, not per-branch — a student keeps the same number regardless of which branch(es) they study at.
- **Numbers are reused, not just incremented forever**: when a student is deleted, their number becomes available again, and the **next newly-registered student receives the lowest available deleted number** in the sequence — not simply the next highest number. This needs a small allocation check on student creation (find the lowest unused number in the sequence) rather than a simple auto-increment.

### 2.11 Books — trimester fee, teacher-owned drops, level-based eligibility
Book handling is genuinely four separate things, not one flat "book fee":
- **The fee** a student pays is scoped to **one trimester, per group** they're enrolled in (`Voucher`, type `BOOK`, `trimesterId` set) — not a one-time flat charge. Algeria's school year has exactly 3 trimesters (`Trimester`, owner-configured dates, once a year). This stays tied to the student's specific group enrollment; nothing here changes.
- **A `Book` belongs to a teacher AND a school level** (`Book.teacherId`, `Book.levelId`) — e.g. Hamoui's "Unity 1" is registered once, for Physics, at the BAC level. Eligibility is **computed, not manually curated**: every `Class` where `class.teacherId == book.teacherId AND class.levelId == book.levelId` is automatically covered. If Hamoui teaches 4 separate BAC groups, all 4 are covered the instant the book is registered — no admin action per group, and a 5th BAC group added later is covered automatically too, with zero risk of someone forgetting to re-link it (this replaces an earlier draft where the admin manually picked classes per book, which didn't scale and could misfire — e.g. accidentally linking a BAC book to a 1AS group).
- **A book can be delivered multiple times** within a trimester — each delivery is its own `BookDrop` (quantity, date, branch), so "Unity 1" might have a 15-copy drop, then "Unity 2" as a separate `BookDrop`-generating `Book`... actually each distinct book/unit is its own `Book` row (own title), and each one can itself have multiple drops (e.g. a reprint). Summing `BookDrop.quantity` for a teacher across a trimester gives the "how many copies did this teacher drop this trimester" figure, and can be broken down by branch.
- **Eligibility for a copy** requires BOTH: the student is enrolled in one of the teacher's classes at that book's level, AND they've paid the `BOOK` voucher for **that specific group they're enrolled in**, in that book's trimester. A student only ever pays once (for their own group); that single payment then covers every book registered for their teacher+level that trimester, no matter which of the teacher's groups drops it.
- **Retroactive access confirmed**: paying anytime during a trimester covers every drop that already happened earlier in that same trimester for every eligible book — no cutoff based on exact payment date within the trimester. A student who enrolls and pays after "Unity 1" already dropped still gets it, same as a student who paid on day one.
- **Drop assignment is FIFO by `dropDate`**: when an admin checks a student off as having received a copy, the system silently assigns that `BookCopyDistribution` to the **oldest** `BookDrop` for that book that still has remaining capacity (`quantity - distribution count > 0`), never the newest. This keeps each drop's real fulfillment auditable (did that specific batch of 15 actually reach 15 students) and is entirely invisible to the admin — they only ever see and check one box per book title, never a drop picker.
- **Distribution is tracked per (drop, student)** (`BookCopyDistribution`, `@@unique([bookDropId, studentId])`) — checked off by an admin during attendance-taking, so it's fast in the moment and auditable afterward (who got which drop, when, who recorded it).
- **Implementation note**: since this lookup runs every time a class's attendance roster loads, index `Voucher(classId, trimesterId, type)` — that's the exact filter hit on every roll call to determine which enrolled students have paid.

### 2.12 Cross-group catch-up attendance (distinct from `Lesson.isCatchUp`)
This is a different mechanism from the admin-scheduled catch-up *session* already modeled on `Lesson.isCatchUp` — that flag is for a brand-new session slot created specifically as a makeup. This rule instead covers a student attending an **already-scheduled, different group's regular lesson** (typically same teacher, same subject) to make up content they missed elsewhere:
- Example: Physics Group 1 meets Friday; a student in Group 1 is absent. The same teacher's Physics Group 2 meets Saturday — the student can attend Group 2's Saturday lesson to catch up on Friday's missed content.
- The original missed lesson's attendance record **stays exactly as `ABSENT`** for the student's own group — it is not overwritten to `PRESENT`. This preserves the honest record: they were absent from their own group, but caught up elsewhere.
- The catch-up attendance is recorded as its own link (`CatchUpAttendance`: the missed lesson, the catch-up lesson actually attended, the student, who recorded it) — **not** as a new `Attendance` row against the catch-up group's own roster, since the student has no paid `Enrollment`/session credit in that other group. This is exactly what prevents double-charging: no new session credit is consumed anywhere, and no new payment is required for the group they're visiting.
- A student can only catch up a given missed lesson **once** — the same missed lesson can't be linked to two different catch-up attendances.

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
  ledger      DailyLedger[]
  payrollRuns PayrollRun[]
  workshops   Workshop[]
  bookDrops   BookDrop[]
  voucherSeriesIssued VoucherSeries[] @relation("IssuingBranch")
  voucherSeriesTarget VoucherSeries[] @relation("TargetBranch")
}

model Level {
  id   Int    @id @default(autoincrement())
  name String @unique // school grade level — "4AM", "1AS", "2AS", "BAC", etc. — shared across all 3 branches, not branch-specific

  classes       Class[]
  books         Book[]
  voucherSeries VoucherSeries[]
}

model AcademicYear {
  id        Int      @id @default(autoincrement())
  label     String   // e.g. "2026-2027"
  startDate DateTime
  endDate   DateTime

  enrollments Enrollment[]
  trimesters  Trimester[]
}

model Trimester {
  id             Int      @id @default(autoincrement())
  academicYearId Int
  name           String   // "Trimestre 1" | "Trimestre 2" | "Trimestre 3"
  startDate      DateTime // owner-configured once per academic year, not auto-computed
  endDate        DateTime

  academicYear AcademicYear @relation(fields: [academicYearId], references: [id])
  books        Book[]
  vouchers     Voucher[]    // BOOK-type vouchers are scoped to the trimester they were paid for
}

model Book {
  id          Int      @id @default(autoincrement())
  teacherId   String
  levelId     Int      // eligibility is computed, not curated (§2.11): every Class where class.teacherId == this.teacherId AND class.levelId == this.levelId is automatically covered, including groups added after this Book was registered
  trimesterId Int
  title       String   // e.g. "Unity 1", "Alchemy", "Mechanics"

  teacher   Teacher    @relation(fields: [teacherId], references: [id])
  level     Level      @relation(fields: [levelId], references: [id])
  trimester Trimester  @relation(fields: [trimesterId], references: [id])
  drops     BookDrop[]
}

model BookDrop {
  id         Int      @id @default(autoincrement())
  bookId     Int
  branchId   Int
  quantity   Int      // copies delivered in THIS drop — a book can have many drops over a trimester
  dropDate   DateTime @default(now())
  recordedBy String   // admin id

  book          Book                   @relation(fields: [bookId], references: [id])
  branch        Branch                 @relation(fields: [branchId], references: [id])
  distributions BookCopyDistribution[]
  // remaining undistributed copies = quantity - count(distributions) — computed, not stored
}

model BookCopyDistribution {
  id             Int      @id @default(autoincrement())
  bookDropId     Int
  studentId      String
  distributedAt  DateTime @default(now())
  distributedBy  String   // admin id who checked it off during attendance

  bookDrop BookDrop @relation(fields: [bookDropId], references: [id])
  student  Student  @relation(fields: [studentId], references: [id])
  @@unique([bookDropId, studentId]) // a student can't be marked twice for the same drop
}

model Family {
  id                Int       @id @default(autoincrement())
  payerStudentId    String?   // the designated sibling who pays tuition in full; exact designation rule (first registered? admin-set?) TBD with owner
  students          Student[]
  // rule: non-payer siblings get TUITION_4SESSION waived on their vouchers; inscription and book fees are unaffected (§2.4)
}

model Student {
  id                 String   @id
  globalNumber       Int      @unique // permanent, sequential across ALL 3 branches (§2.10); reused when a student is deleted — lowest available number is assigned to the next new registration
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
  bookCopiesReceived BookCopyDistribution[]
  catchUpAttendances CatchUpAttendance[]
}

model Class {
  id        Int      @id @default(autoincrement())
  branchId  Int
  teacherId String   // the group's stable primary teacher — always exactly one teacher per group (confirmed with owner, no co-taught/mid-year-swap case). Distinct from Lesson.teacherId, which covers per-session reality (e.g. a substitute covering one lesson) without changing this field.
  levelId   Int      // school grade level this group belongs to (1AS, 2AS, BAC, 4AM...) — drives book eligibility (§2.11) and is the same Level used for voucher-series naming (§1.2). NOT the same thing as formationLevelId below.
  name      String
  pricePerCycle Decimal   // recurring tuition, per 4-session cycle
  inscriptionFee Decimal  // standard fee amount charged on enrollment (subject to the 3x rule)
  hasBooks  Boolean  @default(false)
  bookFeePerTrimester Decimal? // set when hasBooks = true — paid once per trimester (§2.11), not a one-time flat fee
  isFormation      Boolean  @default(false) // true = this is a language-formation group, see §1.8/§2.8
  formationLevelId Int?     // set when isFormation = true — the language-progression level (§1.8), unrelated to levelId (school grade) above
  ageGroup         String?  // set when isFormation = true — exact brackets TBD with owner

  branch         Branch          @relation(fields: [branchId], references: [id])
  teacher        Teacher         @relation(fields: [teacherId], references: [id])
  level          Level           @relation(fields: [levelId], references: [id])
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
  isNonPayer            Boolean  @default(false) // per-enrollment exemption (e.g. scholarship): this student pays nothing for THIS group, no session credit required; unaffected in any other enrollment

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
  photocopyRatePerPage Decimal? // owner-set, individual per teacher — used to auto-compute PhotocopyCharge.costAmount
  branches TeacherBranch[]
  rates    TeacherPayRate[]
  classes  Class[]   // groups this teacher permanently owns (§2.11 eligibility is computed from this + level, not manually curated)
  lessons  Lesson[]
  photocopyCharges PhotocopyCharge[]
  books    Book[]
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
  id                     Int      @id @default(autoincrement())
  teacherId              String
  ratePerSession         Decimal?
  fixedMonthly           Decimal?
  percentageOfSessionFee Decimal? // owner-set per teacher, e.g. 40.00 = teacher earns 40% of that session's per-session tuition price (Class.pricePerCycle / 4); this is the primary payroll model per §2.9, not a flat rate
  effectiveFrom          DateTime

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
  isCatchUp   Boolean  @default(false)   // a whole NEW makeup session slot — distinct from CatchUpAttendance (§2.12), which is a student joining an EXISTING different group's lesson instead
  isFree      Boolean  @default(false)   // free lesson — no session credit consumed

  branch    Branch    @relation(fields: [branchId], references: [id])
  class     Class     @relation(fields: [classId], references: [id])
  teacher   Teacher   @relation(fields: [teacherId], references: [id])
  classroom Classroom @relation(fields: [classroomId], references: [id])
  attendances Attendance[]
  missedByCatchUps    CatchUpAttendance[] @relation("MissedLesson")
  catchUpVisitsHosted CatchUpAttendance[] @relation("CatchUpLessonAttended")
}

model Attendance {
  id        Int      @id @default(autoincrement())
  lessonId  Int
  studentId String
  status    String   // PRESENT | ABSENT | NOT_DEFINED
  // session credit is decremented on PRESENT unless lesson.isFree = true or Enrollment.isNonPayer = true
  // NOT_DEFINED: neither present nor absent — this specific student's session on this lesson is excluded
  // from BOTH their session credit AND the teacher's payroll count for that session (§2.9)

  lesson  Lesson  @relation(fields: [lessonId], references: [id])
  student Student @relation(fields: [studentId], references: [id])
}

model CatchUpAttendance {
  id              Int      @id @default(autoincrement())
  studentId       String
  missedLessonId  Int      // the lesson in the student's OWN group where they were marked ABSENT
  catchUpLessonId Int      // the different group's lesson they actually attended instead
  recordedBy      String   // admin id
  recordedAt      DateTime @default(now())

  student       Student @relation(fields: [studentId], references: [id])
  missedLesson  Lesson  @relation("MissedLesson", fields: [missedLessonId], references: [id])
  catchUpLesson Lesson  @relation("CatchUpLessonAttended", fields: [catchUpLessonId], references: [id])
  @@unique([studentId, missedLessonId]) // a given missed lesson can only be caught up once
}

model VoucherSeries {
  id              Int    @id @default(autoincrement())
  issuingBranchId Int
  scope           String  // LOCAL_LEVEL | CROSS_BRANCH
  levelId         Int?    // set when scope = LOCAL_LEVEL (mirrors "4AM 1, 4AM 2..." pads) — same Level entity now shared with Class.levelId and Book.levelId (§2.11)
  targetBranchId  Int?    // set when scope = CROSS_BRANCH (mirrors the "ECOLE"/"ANNEX" pads held at another branch)
  currentNumber   Int     @default(0)  // continuous counter, never resets when a "pad" is exhausted

  issuingBranch Branch    @relation("IssuingBranch", fields: [issuingBranchId], references: [id])
  level         Level?    @relation(fields: [levelId], references: [id])
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
  paymentType        String   // INSCRIPTION | TUITION_4SESSION | BOOK | EXTRA_SESSION | CATCHUP | WORKSHOP | FORMATION
  trimesterId        Int?     // set when paymentType = BOOK — scopes eligibility for book distribution (§2.11)
  amount             Decimal
  isPartial          Boolean  @default(false)
  completesVoucherId Int?     // links a completing payment back to the original partial one
  remainingBalance   Decimal?
  issuedBy           String   // admin id
  issuedAt           DateTime @default(now())
  isVoided           Boolean  @default(false)
  lastEditedAt        DateTime?
  lastEditedBy         String?

  series    VoucherSeries @relation(fields: [seriesId], references: [id])
  student   Student       @relation(fields: [studentId], references: [id])
  class     Class         @relation(fields: [classId], references: [id])
  trimester Trimester?    @relation(fields: [trimesterId], references: [id])
  edits     VoucherEdit[]
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
  type     String   // TUITION | INSCRIPTION | BOOK | EXTRA_SESSION | CATCHUP | WORKSHOP | FORMATION | PAYROLL_OUT
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
  pages       Int      // the ONLY number an admin types in
  costAmount  Decimal  // auto-computed as pages × teacher.photocopyRatePerPage at creation time, never typed manually
  date        DateTime @default(now())
  recordedBy  String   // admin id who made the copies and logged them

  teacher Teacher @relation(fields: [teacherId], references: [id])
  branch  Branch  @relation(fields: [branchId], references: [id])
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
1. Branch model + auth scoping, plus the shared `Level` catalog (1AS, 2AS, BAC, 4AM...) and `Class.teacherId`/`Class.levelId` — foundational, since voucher series (step 2) and books (step 11) both depend on `Level` existing first.
2. **Voucher series migration**: seed `VoucherSeries` for every existing paper pad (per branch/level, and per branch/target-branch pair) with `currentNumber` set to match where the paper series currently stands — the digital sequence must continue, not restart.
3. Voucher system (§1.2, §2.3) with inscription-fee logic (§2.1, year-scoped via `AcademicYear`), free-lesson exclusion (§2.2), and sibling discount (§2.4) — the highest-value, most rule-dependent piece, and what replaces the paper pads and the 10-day courier cycle.
4. Revenue dashboard (§1.1), built directly on the ledger fed by vouchers from step 3.
5. Rooms + extra/catch-up/free sessions (§1.4), with the `isFree`/`isExtra`/`isCatchUp` flags feeding both the calendar and the voucher logic.
6. Group credit transfer (§2.6), once enrollments and session credit exist to transfer.
7. Payroll (§1.3), including the photocopy cost deduction (§2.5), consuming attendance data (including free lessons) from step 5.
8. Ateliers/Dawarat (§1.6) — the existing Workshops module, just branch-scoped and routed through the voucher system; low effort since it already exists.
9. Formations (§1.8, §2.8) — genuinely new, built after step 5 since it reuses the Class/Lesson scheduling engine from that step, and after step 3 since it bills through the voucher system.
10. Announcements (§1.7) — additive, lower priority.
11. Books system (§2.11) — Trimester setup, Book/BookDrop/BookCopyDistribution, built after step 3 (needs the voucher system for BOOK-type payment eligibility) and after step 5 (distribution is checked off during attendance-taking).
12. Cross-group catch-up attendance (§2.12) — built after step 5 (needs Lesson/Attendance to exist) and after the group credit transfer logic in step 6, since both touch the same "how attendance affects credit" area and are easiest to get right together.
13. PWA/installable app & WebView compatibility (§1.9) — best done once the core UI exists and is stable, since it's a polish/packaging layer on top of the app, not a blocker for any feature above.

---

## Other — answered by the owner, resolved

- **Branch-limited features**: resolved as a blanket principle rather than a feature-by-feature list — branch admins get exactly what they need to do their day-to-day job at their branch (students, teachers, groups, attendance, vouchers, schedule, announcements — all scoped to their branch or shared-read per §1.0). **Every other permission is exclusive to the owner**: payroll, the revenue/finance dashboard, teacher profiles, creating/editing groups, creating teachers, and anything cross-branch-administrative. This is now the default assumption for RBAC everywhere in the app, not just a short list — see the detailed page-by-page access breakdown in the UI/RBAC execution plan.
- **Sibling discount — who is the designated payer?** The **admin manually picks** which sibling pays, per family — not an automatic rule (not "first registered," not "eldest"). Both siblings still pay inscription fees and book fees in full; only the lesson/tuition fee is waived for the non-designated sibling(s).
- **Non-payer status**: this isn't a report of overdue students — it's a deliberate **per-enrollment exemption**. An admin can mark a specific student as a non-payer **for a specific group/class only** (e.g. a scholarship case) — that student's sessions in that group aren't tracked against payment and no session credit is required, while the same student pays normally in any other group they're enrolled in. This replaces the earlier "session credit = 0" report concept entirely.
- **Photocopy cost rate**: **not** a single school-wide per-page rate — the **owner sets an individual photocopy rate per teacher**. `PhotocopyCharge.costAmount` is computed automatically from `pages × that teacher's rate`, so the admin only ever types in the page count, never a manually-calculated total.
- **Formation payment model**: confirmed as **one lump sum for the entire 30-hour level** — not billed per 4-session cycle like a regular class.
- **Formation retake**: if a student fails the test de niveau, they **pay the full level fee again** and repeat the same level (new enrollment, new lump-sum voucher) until they pass.
- **Book eligibility scope**: resolved as **teacher + school level**, not a manually-picked set of groups. A `Book` (e.g. Hamoui's "Unity 1," BAC) is automatically available across every one of that teacher's groups at that level — including groups added after the book was registered — because `Class` now carries its own stable `teacherId` and `levelId` (one teacher per group, confirmed with owner, no exceptions). The per-student payment stays scoped to the student's own group enrollment; only the *set of books that payment unlocks* is now computed from teacher+level instead of curated by hand. Drop fulfillment is FIFO by `dropDate` so each drop's real capacity stays auditable.

---

## 7. Enhancement Addendum — Round 2 (Sep 2026)

This section amends and extends the spec above. Where a rule here conflicts with an earlier section, this section wins — the earlier section is now out of date on that specific point. Each entry names which original section it amends, if any.

### 7.1 Teacher model — field reduction (amends §2.5, §2.9, Phase 5)
- `Teacher` creation/edit form keeps only: first name, last name, subject(s) taught, gender, phone number (optional). Every other field previously on this form — email, date of birth, profile picture — is removed **entirely from the project**, not just hidden (drop the columns/fields if nothing else depends on them).
- The `groups` field is removed from teacher creation/edit. A teacher is no longer assigned to groups from their own form — assignment happens the other way around, when a group is created/edited and a head teacher is picked for it (`Class.teacherId`, already the source of truth per §2.11's teacher+level model).
- `TeacherPayRate.percentageOfSessionFee` (the payroll percentage) is **not** shown or editable on the teacher creation/edit form at all. It is only visible and editable on the owner-only Teacher Profile page (Phase 15), exactly as that phase already specifies.
- **Flag for Wassim to confirm with Antigravity**: your note said "the photocopy rate will show only in the teacher profile page (as the percentage)" — `photocopyRatePerPage` and `percentageOfSessionFee` are two different fields (§2.5 vs §2.9). This addendum assumes you mean: neither field appears on the create/edit form, both live only in the profile page. Correct this if you meant only one of them.

### 7.2 Student model — field reduction + parent phone numbers (amends §2.10, Phase 6)
- Student creation/edit form: remove `studentNumber` (the old manual number), `email`, `password`, and profile picture entirely from the project. The permanent, auto-assigned `globalNumber` (§2.10) is unaffected and keeps working exactly as already specified — this only removes the separate/manual number field, not the ID system itself.
- Add an optional, repeatable `ParentPhoneNumber` record linked to the student (one student → zero or many phone numbers). No label/relationship field needed beyond the number itself — just a simple list. Shown as a simple list on the student profile page (Phase 16). Not required at registration.
- Every other field on the student form not mentioned above (name, level, groups, etc.) stays exactly as it is.

### 7.3 Parent model — field reduction
- Parent creation/edit form: remove the ID (identity/ID-card number) field, email, password, and profile picture entirely from the project. No other change to the Parents page (per Phase 7, it otherwise stays as-is).

### 7.4 Groups model — remove capacity (amends §1.2, Phase 8)
- Remove the `capacity` field from the Group/Class creation and edit form entirely (Phase 8 already removed it from the table; this closes the loop on the form itself).

### 7.5 Lesson creation — derived fields, single type, branch lock, smarter conflict check (amends §1.4, Phase 9)
- **Lesson name**: auto-derived from the selected group's name (`Lesson.name = Class.name`) — no manual name entry.
- **Teacher**: no teacher dropdown on the lesson form. The teacher is auto-fetched from the selected group's head teacher (`Class.teacherId`).
- **Branch lock**: a newly created lesson is automatically scheduled at the branch of the admin who creates it — a branch admin cannot schedule a lesson at another branch (e.g. the ECOLE admin cannot create an ANNEX lesson). The owner is not subject to this lock.
- **Single lesson type**: a lesson can be exactly one of normal / extra / catch-up / free — never two flags at once (e.g. `isExtra` and `isCatchUp` can't both be true). Enforce this as a single selector on the form, not independent checkboxes, and as a validation constraint server-side.
- **Time-conflict detection**: must compare full time ranges (start–end overlap), not just matching start times. Two lessons that merely start at different times but overlap in duration on the same room/teacher must still be flagged as conflicting.

### 7.6 Extra lessons — billing correction (amends §1.1, §1.2, §1.4)
- Extra lessons carry **no separate fee**. They are billed exactly like normal lessons: they consume the student's existing session credit for that group, the same pool normal lessons draw from.
- Consequence: the revenue dashboard (§1.1) and finance page no longer show "extra session fee" as its own line/category — extra lessons fold into normal tuition revenue, since no separate voucher type is issued for them. `isExtra` remains a scheduling/display flag only (still shows in the calendar for the week it occurs in, per Phase 9) — it no longer has independent billing logic.

### 7.7 Attendance — NOT_DEFINED justification + status color coding (amends §3 Attendance model, Phase 17)
- When an admin marks a student `NOT_DEFINED` for a lesson, a text field appears for the admin to enter why (a short justification). This is stored with the attendance record.
- `NOT_DEFINED` continues to exclude that student's session from credit deduction and from teacher payroll for that lesson, exactly as already specified.
- **Group attendance records table — status color coding**:
  - 🔴 Red circle: student was absent and has no catch-up recorded for that missed lesson.
  - 🟠 Orange circle: student was marked `NOT_DEFINED` — clicking/tapping the circle shows the recorded justification text.
  - 🔵 Blue circle: student missed their group's lesson but attended a catch-up (per §2.12, same teacher + same level, a different group) — this only shows for the student's most recent un-caught-up-for miss; hovering shows the date and the group they caught up in. This matches the catch-up display already built into the take-attendance page (Phase 17) — this entry just carries that same logic into the records table's color coding.

### 7.8 Payments/Vouchers — cashback rule, group payments page rework (amends §1.2, §2.3, Phase 11)
- **Cashback rule** (new — §1.2 didn't fully specify this): a cashback/refund can only be applied against the student's **most recent paid, currently-active cycle**, and only for the portion of that cycle **not yet consumed**. Example: a 4-session cycle costs 3000; the student has already attended 2 of those 4 sessions; the refundable amount is capped at the value of the 2 remaining sessions (1500), not the full 3000. Inscription fees are **never** refundable/cashback-eligible under any circumstance.
- **Group payments page** (the per-group student payment table, reached via Phase 11's merged payment flow):
  - Remove the "consumed lessons" column and the "autre branche" (other branch) column from the table.
  - The inscription-fee column becomes a status badge (same badge style as paid/unpaid), reflecting: paid for this group / not paid / already paid via the 3-enrollment threshold (§2.1) so waived.
  - Remove the separate "payment records" column. Its content moves entirely into the existing "show modification records" button, which now lists every payment, cashback, and virement (partial-payment) entry together as one combined list (as it already partially does).
  - This page's filter tabs and table must use the same shared filter-tab and table components as the rest of the app (per Phase 1's DataTable/filter primitives) — no page-specific styling.

### 7.9 Voucher numbers page — removal (amends Phase 11)
- The standalone "voucher numbers" list page is fully superseded by Phase 11 (vouchers surfaced only through student/group views) but the page itself was never deleted. Delete the page and its nav entry now.

### 7.10 Announcements — owner sees all + bilingual metadata (amends §1.7, Phase 12)
- Regardless of an announcement's targeting (a specific branch or the whole school), the **owner** sees every announcement in the announcements panel and can edit or delete any of them. Branch admins keep seeing only announcements targeted to their branch or to the whole school, as today.
- Every announcement's publishing date, author name, and destination (branch/whole-school) badges must render in both French and Arabic — no exceptions, no leftover hardcoded single-language labels.

### 7.11 Daily branch ledger page (new — extends §1.1)
- A new page, available to branch admins (and the owner), showing **only today's money for that admin's own branch** — a cash-count aid for reconciling the physical caisse.
- Filtered breakdown by fee type: inscription fees, book fees, lesson/tuition fees, formation/dawarat fees (same fee-type typing as the existing revenue ledger in §1.1 — this page is a same-day, single-branch, cash-facing slice of that same ledger, not a new data source).
- Branch admin gets exactly this read-only view of their own branch's today — no additional permission beyond it (no historical range, no other-branch access, no edit actions). The owner can view any branch's daily ledger the same way, per the existing owner all-branches pattern.

### 7.12 Owner configuration panel (new)
- A new owner-only page for two things:
  1. **Account management**: view/create/edit login accounts (username + password) stored in the database — this is direct credential administration for admin/owner accounts, not a self-service profile page.
  2. **Branch management**: create a new branch (name, and whatever minimum fields a branch already requires elsewhere in the app).
- **Classroom name management** (amends the Rooms concept from §1.4/build-order step 5): the same panel lets the owner view/create/edit each branch's classroom (room) names.
- Not visible to branch admins, same nav-hiding rule as Finance/Teacher-profile (§ access model, Phase 3).

### 7.13 Timetable — single centralized view for every lesson type (amends Phase 9)
- Every scheduled lesson — normal, extra, catch-up, free, formation, and dawarat/workshop — appears in the one main timetable/schedule page. No separate calendar per lesson type. Existing filters (branch filter, etc.) stay as already built.
- Each lesson card's "take attendance" button follows the same same-day-only visibility rule already built (Phase 9), and routes to whichever take-attendance page already correctly handles that lesson's type (regular take-attendance page, or the dawarat/formation equivalents) — no new attendance pages are created for this.
- Each lesson's info card additionally shows which branch that lesson is scheduled at.

### 7.14 Dawarat (workshops) — registration form + chair numbers (amends §1.6)
- Workshop student registration form: remove the email field; add a gender dropdown (required).
- Workshop student list table: add an auto-assigned "chair number" column.
  - Numbering is a simple continuous counter starting at 1, **kept separately per gender**: boys are numbered 1, 2, 3… and girls are numbered 1, 2, 3… independently of each other.
  - Boys' chair numbers display in blue; girls' in pink.
  - Counting resets to 1 (for each gender) at the start of every new workshop — it does not carry over between workshops.

### 7.15 Formations — remove hours linkage, manual level completion, book fees (amends §1.8, §2.8, Phase 13)
- Formation levels are no longer tied to an hours-required field/count. Remove that linkage.
- Add a "finish level" button on each level, which the admin triggers manually to mark that level's cycle complete (replacing any hours-based automatic completion).
- The level-test pass/fail and retake-on-fail logic (§2.8) is unchanged.
- Formation student registration form must use the same shared form components/layout as the rest of the app (Phase 1's form primitives) — no bespoke styling.
- Formation payment-recording form: add the book-fee field (per §2.8/Phase 13's already-planned optional book-fee support — this addendum is the instruction to actually build it now), and bring this form onto the same shared form components as the rest of the app.
- Dawarat and Formation payments/vouchers must follow the exact same voucher logic, numbering, and display format already defined for the main payment system (§1.2, §2.3) — no parallel/divergent voucher behavior for these two modules.

### 7.16 Notifications — universal, bilingual toast coverage
- Every server action in the app (create, update, delete — everywhere, not just the pages touched in this round) must trigger the existing success/failure toast notification pattern. Audit for any action currently missing it.
- Every notification message, in both the success and failure case, must be bilingual (French/Arabic, matching the app's existing i18n setup) with no exceptions/hardcoded single-language strings.

### 7.17 Small fixes batch
- The payment-record "modify" button currently renders white/low-contrast; change it to black (or the design system's equivalent high-contrast solid variant from Phase 1) so its function is visually obvious.
- The lessons-transfer form must be rebuilt using the shared form components from Phase 1/2, matching every other form in the app.
- Payments page group cards, the attendance page's filter tabs, and the group-payments page's filters/table must all use the same shared Card/DataTable/filter-tab components as the rest of the app — no page-specific one-off styling left anywhere.

### 7.18 Student payer-status flag — non-payer / school-fees-only (new)
- Add a student-level status, set via action buttons on the student profile page, with three states:
  1. **Normal** (default — nothing selected): student pays exactly as today, no change.
  2. **Non-payer**: student is exempt from lesson fees.
  3. **New student / school-fees-only**: applies to students given a privilege by a teacher, where normally a session's fee splits between teacher payroll (`TeacherPayRate.percentageOfSessionFee`, §2.9) and the school's remaining share — this status makes the student pay **only the school's percentage share**, skipping the teacher's cut, instead of the full session fee.
- Only one status applies at a time; selecting one is a toggle on the profile, and clearing it returns the student to Normal.
- **Flag for Wassim to confirm with Antigravity**: "non-payer" needs one clarifying decision before this is built — does the student still consume session credit like normal (just at 0 cost, so payroll/reporting still reflect the session happening), or do their sessions not count against credit/attendance billing at all? Pick whichever matches how you already think about it and tell Antigravity explicitly; the addendum assumes credit still consumes normally but at zero fee, since that keeps attendance/teacher-payroll numbers accurate.

### 7.19 Take-attendance page — button styling + quick book handout (amends Phase 17)
- Visual-only refinement to the existing buttons: restyle Present / Absent / Not-defined to be cleaner and more visually distinct (clear color/state separation, consistent with the design system's button variants) — no change to their click behavior or the underlying attendance logic.
- **Quick book handout, in the same flow**: for a lesson whose group's teacher+level has any book(s) added in the active trimester (§7.20), each student row shows a small, unobtrusive book indicator *only when that student has at least one not-yet-received entitled book*. One tap marks it received — if the student is entitled to exactly one outstanding book, a single tap marks it received directly; if more than one is outstanding, the tap opens a tiny checklist (book titles only) to tick off which one(s) were just handed out. This is deliberately separate from the Present/Absent/Not-defined action — marking a student present does not automatically mark a book received, since not every present student needs a book that day (already has it, isn't entitled yet, etc.) — but both actions live on the same row so an admin can do both in two taps without leaving the page.
- This control only ever appears for students who are currently entitled (per §7.20's live fee-paid check) and only while something is outstanding — a student with nothing pending shows no book indicator at all, so the page stays uncluttered on lessons/groups with no book activity.

### 7.20 Trimestrial book tracking system (new)

**Trimester as a first-class school-wide state**
- Add a `Trimester` concept: `label` (T1/T2/T3) and `status` (not_started / active / finished). Exactly one trimester is `active` at a time.
- Owner-only controls on the configuration panel (§7.12): a **Start** action (advances to the next trimester — T1 → T2 → T3) and a **Finish** action for whichever trimester is currently active. Starting the next trimester auto-finishes the previous one if it wasn't already finished.
- Finishing a trimester freezes its books and received data as read-only history — nothing is deleted, but no further edits happen against a finished trimester. All book activity described below always applies to whichever trimester is currently `active`.

**Books are owned by teacher + level, not by a single group**
- A `Book` belongs to a **teacher + level + trimester** (e.g. "the books Teacher X brought for Level 2 students this trimester"), not to one specific group. A teacher can bring several different books in the same trimester. Because it's scoped to teacher+level, a book added from any one of that teacher's groups at that level is automatically visible and applicable across every sibling group he runs at that same level — no need to re-add it per group.
- Fields: title, the teacher, the level, the trimester it belongs to, date added.

**Entitlement is driven by the existing book-fee payment — now trimester-scoped**
- The app already tracks whether a student has paid their book fee (the existing `hasBooks`/book-fee flag from §1.2/§2.8). This flag must now carry a **trimester** reference — a book fee paid for T1 only covers T1's books; a returning/continuing student needs to pay again once T2 starts to stay entitled to T2's books.
- A student is entitled to a copy of **every** book their teacher has brought at their level in the current trimester, as soon as (and for as long as) their book fee is marked paid for that trimester — this is computed live, not a one-time snapshot:
  - Paying the book fee mid-trimester immediately grants access to every book already added so far that trimester, not just future ones.
  - A new student who joins the group mid-trimester and later pays their book fee is likewise immediately entitled to every book already added.
- What's tracked per (student, book) is only whether they've **received** their physical copy yet — a single boolean, shared by both surfaces below (there is exactly one record per student+book, not two separate ones).

**Two surfaces, one underlying record — rush-hour and catch-up**
- **Rush-hour path**: the quick handout control directly on the take-attendance page (§7.19) — for handing a book to a student the moment they show up to class.
- **Catch-up path**: a **"Books" tab on each group's page** (reachable by branch admins, like the group's other tabs) for anyone who gets their copy outside of a lesson — e.g. picked up at the front desk, or the admin is catching up on a backlog after rush hour. It shows, for the currently active trimester: every book that group's teacher has brought at that group's level, and a table of that group's currently fee-paid-and-entitled students × books, with a tap-to-toggle "received" checkbox per cell. Membership in this table is live, same rule as above.
- Marking "received" from either surface updates the same underlying record — a book handed out during attendance immediately shows as received on the group's Books tab, and vice versa.
- Adding a new book (when the teacher physically brings one) is a small form — title + level, defaulting to the current group's level — reachable from the Books tab; it then appears identically (and immediately available for quick handout during attendance) on every sibling group at that level for that teacher.
