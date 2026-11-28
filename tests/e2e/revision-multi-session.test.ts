import * as fs from "fs";
import * as path from "path";
import { describe, test, expect, runner } from "./helpers/runner";
import {
  buildRevisionLessonOptions,
  splitTotalAcrossSessions,
} from "@/lib/revisionSchedule";
import { buildVoucherBundleForPrint } from "@/lib/voucherUtils";
import {
  computeStudentCreditAndSessions,
  computePostRevisionEnrollmentGapInfo,
  computeStudentConsecutiveAbsences,
} from "@/lib/studentBilling";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/massinissa_test";
}

export async function runRevisionMultiSessionTests() {
  const { computeTeacherPayrollFromData } = await import("@/lib/payroll");

  await describe("Multi-Session Revision Payments & Pre-Paid Check-In", async () => {
    test("REV-M01: buildRevisionLessonOptions merges materialized extra/recurring lessons and virtual future dates without duplicates", () => {
      // Saturday 2026-11-28 09:00 Algiers (08:00Z)
      const now = new Date("2026-11-28T08:00:00Z");

      const options = buildRevisionLessonOptions({
        now,
        currentLessonId: 1346,
        weeksAhead: 3,
        bookedLessonIds: [1347],
        lessons: [
          // Materialized recurring lesson TODAY (Sat 28/11 06:00-08:00 Algiers)
          {
            id: 1346,
            classId: 247,
            branchId: 4,
            branch: { id: 4, name: "Local4" },
            startsAt: new Date("2026-11-28T05:00:00Z"),
            endsAt: new Date("2026-11-28T07:00:00Z"),
            isExtra: false,
            isCatchUp: false,
            isFree: false,
            isTeacherAbsent: false,
            isSingleOccurrence: false,
          },
          // Already materialized recurring lesson NEXT SATURDAY (05/12)
          {
            id: 1347,
            classId: 247,
            branchId: 4,
            branch: { id: 4, name: "Local4" },
            startsAt: new Date("2026-12-05T05:00:00Z"),
            endsAt: new Date("2026-12-05T07:00:00Z"),
            isExtra: false,
            isCatchUp: false,
            isFree: false,
            isTeacherAbsent: false,
            isSingleOccurrence: false,
          },
          // One-off extra revision lesson on Tuesday 01/12
          {
            id: 1390,
            classId: 247,
            branchId: 4,
            branch: { id: 4, name: "Local4" },
            startsAt: new Date("2026-12-01T13:00:00Z"),
            endsAt: new Date("2026-12-01T15:00:00Z"),
            isExtra: true,
            isCatchUp: false,
            isFree: false,
            isTeacherAbsent: false,
            isSingleOccurrence: false,
          },
          // Free lesson (must be excluded)
          {
            id: 1391,
            classId: 247,
            branchId: 4,
            branch: { id: 4, name: "Local4" },
            startsAt: new Date("2026-12-02T13:00:00Z"),
            endsAt: new Date("2026-12-02T15:00:00Z"),
            isExtra: false,
            isCatchUp: false,
            isFree: true,
            isTeacherAbsent: false,
            isSingleOccurrence: false,
          },
        ],
      });

      // Expected chronological dates:
      // 1. 2026-11-28 (materialized #1346, current, isTodayOrPast=true)
      // 2. 2026-12-01 (materialized extra #1390, future)
      // 3. 2026-12-05 (materialized #1347, NOT duplicated by virtual projection!, alreadyBooked=true)
      // 4. 2026-12-12 (virtual projection from recurring template #1347)
      // 5. 2026-12-19 (virtual projection from recurring template #1347)
      expect(options.length).toBe(5);
      expect(options.map((o) => o.targetDateStr)).toEqual([
        "2026-11-28",
        "2026-12-01",
        "2026-12-05",
        "2026-12-12",
        "2026-12-19",
      ]);

      expect(options[0].lessonId).toBe(1346);
      expect(options[0].isCurrentLesson).toBe(true);
      expect(options[0].isTodayOrPast).toBe(true);
      expect(options[0].isAlreadyBookedByStudent).toBe(false);

      expect(options[1].lessonId).toBe(1390);
      expect(options[1].isExtra).toBe(true);
      expect(options[1].isTodayOrPast).toBe(false);

      expect(options[2].lessonId).toBe(1347);
      expect(options[2].isAlreadyBookedByStudent).toBe(true);

      expect(options[3].lessonId).toBe(null);
      expect(options[3].templateLessonId).toBe(1347);
      expect(options[3].isTodayOrPast).toBe(false);
    });

    test("REV-M02: buildVoucherBundleForPrint combines 2 revision vouchers sharing one BON # chronologically with lesson dates", () => {
      const issuedAt = new Date("2026-11-28T08:08:00Z");
      const v2 = {
        id: 9202,
        seriesId: 37,
        number: 158,
        studentId: "stu_1",
        classId: 247,
        lessonId: 1347,
        paymentType: "REVISION_SESSION",
        amount: 600,
        issuedAt,
        isVoided: false,
        isRefund: false,
        status: "ACTIVE",
        lesson: { id: 1347, startsAt: new Date("2026-12-05T05:00:00Z") },
        refunds: [],
      };
      const v1 = {
        id: 9201,
        seriesId: 37,
        number: 158,
        studentId: "stu_1",
        classId: 247,
        lessonId: 1346,
        paymentType: "REVISION_SESSION",
        amount: 600,
        issuedAt,
        isVoided: false,
        isRefund: false,
        status: "ACTIVE",
        lesson: { id: 1346, startsAt: new Date("2026-11-28T05:00:00Z") },
        refunds: [],
      };

      // Pass v2 as primary (out of chronological order) to verify sorting by lesson.startsAt
      const bundle: any = buildVoucherBundleForPrint(v2, [v2, v1]);
      expect(bundle.totalAmount).toBe(1200);
      expect(bundle.revisionSessionsCount).toBe(2);
      expect(bundle.items.length).toBe(2);
      expect(bundle.items[0].lessonDate).toBe("28/11/2026");
      expect(bundle.items[0].labelAr).toBe("حصة مراجعة — 28/11/2026");
      expect(bundle.items[0].labelFr).toBe("Séance de révision — 28/11/2026");
      expect(bundle.items[1].lessonDate).toBe("05/12/2026");
      expect(bundle.items[1].amount).toBe(600);

      // Verify bundle total splitting helper
      expect(splitTotalAcrossSessions(1200, 2)).toEqual([600, 600]);
      expect(splitTotalAcrossSessions(1000, 3)).toEqual([333.34, 333.33, 333.33]);
    });

    test("REV-M03: Teacher payroll pays ONLY checked-in revision sessions across different payroll months (0 DZD while PREPAID)", async () => {
      const classId = 247;
      const branchId = 4;
      const studentId = "stu_prepaid_rev";

      const teacher = {
        id: "tch_rev",
        name: "Prof Karima",
        TeacherPayRate: [{ percentageOfSessionFee: 70, effectiveFrom: new Date("2026-01-01T00:00:00Z") }],
        TeacherBranch: [{ branchId, payRate: null, Branch: { id: branchId, name: "Local4" } }],
        teacherClassRates: [],
      };

      const classInfo = {
        id: classId,
        name: "الانجليزية الاولى ثانوي",
        branchId,
        pricePerCycle: 2000,
        isFormation: false,
        enrollments: [],
      };

      const lessonNov28 = {
        id: 1346,
        classId,
        branchId,
        startsAt: new Date("2026-11-28T05:00:00Z"),
        endsAt: new Date("2026-11-28T07:00:00Z"),
        isFree: false,
        isExtra: false,
        isCatchUp: false,
        isTeacherAbsent: false,
        branch: { name: "Local4" },
        class: classInfo,
        attendances: [{ studentId, lessonId: 1346, status: "PRESENT", isRevisionVisitor: true }],
        vouchers: [
          {
            id: 9201,
            studentId,
            classId,
            lessonId: 1346,
            paymentType: "REVISION_SESSION",
            amount: 600,
            isVoided: false,
            isRefund: false,
            refunds: [],
          },
        ],
      };

      // Dec 5 BEFORE check-in: active voucher exists, NO Attendance row yet -> must pay 0 DZD!
      const lessonDec5Prepaid = {
        id: 1347,
        classId,
        branchId,
        startsAt: new Date("2026-12-05T05:00:00Z"),
        endsAt: new Date("2026-12-05T07:00:00Z"),
        isFree: false,
        isExtra: false,
        isCatchUp: false,
        isTeacherAbsent: false,
        branch: { name: "Local4" },
        class: classInfo,
        attendances: [],
        vouchers: [
          {
            id: 9202,
            studentId,
            classId,
            lessonId: 1347,
            paymentType: "REVISION_SESSION",
            amount: 600,
            isVoided: false,
            isRefund: false,
            refunds: [],
          },
        ],
      };

      const classHistoryMap = new Map<number, any>([
        [
          classId,
          {
            lessons: [lessonNov28, lessonDec5Prepaid].map((l) => ({
              id: l.id,
              classId,
              branchId,
              startsAt: l.startsAt,
              isFree: false,
              isTeacherAbsent: false,
            })),
            attendances: [],
            catchUps: [],
            classInfo,
            vouchers: [],
          },
        ],
      ]);

      const lessonByIdMap = new Map<number, any>([
        [1346, lessonNov28],
        [1347, lessonDec5Prepaid],
      ]);

      const payrollBeforeCheckIn = await computeTeacherPayrollFromData({
        startDate: new Date("2026-11-01T00:00:00Z"),
        endDate: new Date("2026-12-31T23:59:59Z"),
        groupFilter: "all",
        teacher,
        lessons: [lessonNov28, lessonDec5Prepaid],
        teacherClasses: [{ id: classId, isFormation: false }],
        salaryAdvancesList: [],
        photocopyChargesList: [],
        catchUpVisitors: [],
        catchUpsForMissedLessons: [],
        bookVouchers: [],
        formationClasses: [],
        prefetchedFormationData: [[], []],
        classHistoryMap,
        lessonByIdMap,
      });

      const detailsBefore = new Map(payrollBeforeCheckIn!.sessionDetails!.map((s) => [s.lessonId, s]));
      // Nov 28 (checked in): 70% of 600 = 420 DZD
      expect(detailsBefore.get(1346)?.lessonAmount).toBeCloseTo(420, 0.01);
      // Dec 5 (PREPAID only, not checked in): 0 DZD!
      expect(detailsBefore.get(1347)?.lessonAmount).toBe(0);
      expect(payrollBeforeCheckIn!.grossAmount).toBeCloseTo(420, 0.01);

      // Now simulate admin clicking "Confirm Presence" on Dec 5!
      const lessonDec5CheckedIn = {
        ...lessonDec5Prepaid,
        attendances: [{ studentId, lessonId: 1347, status: "PRESENT", isRevisionVisitor: true }],
      };
      lessonByIdMap.set(1347, lessonDec5CheckedIn);

      const payrollDecOnly = await computeTeacherPayrollFromData({
        startDate: new Date("2026-12-01T00:00:00Z"),
        endDate: new Date("2026-12-31T23:59:59Z"),
        groupFilter: "all",
        teacher,
        lessons: [lessonDec5CheckedIn],
        teacherClasses: [{ id: classId, isFormation: false }],
        salaryAdvancesList: [],
        photocopyChargesList: [],
        catchUpVisitors: [],
        catchUpsForMissedLessons: [],
        bookVouchers: [],
        formationClasses: [],
        prefetchedFormationData: [[], []],
        classHistoryMap,
        lessonByIdMap,
      });

      const detailsDec = new Map(payrollDecOnly!.sessionDetails!.map((s) => [s.lessonId, s]));
      // Dec 5 after check-in: 70% of 600 = 420 DZD
      expect(detailsDec.get(1347)?.lessonAmount).toBeCloseTo(420, 0.01);
      expect(payrollDecOnly!.grossAmount).toBeCloseTo(420, 0.01);
    });

    test("REV-M04: Pre-paid future revision without Attendance does not distort billing credits, gaps, or consecutive absences", () => {
      const lessons = [
        { id: 301, startsAt: new Date("2026-11-28T05:00:00Z"), isFree: false, isTeacherAbsent: false },
        { id: 302, startsAt: new Date("2026-12-05T05:00:00Z"), isFree: false, isTeacherAbsent: false },
        { id: 303, startsAt: new Date("2026-12-12T05:00:00Z"), isFree: false, isTeacherAbsent: false },
      ];
      const enrolledAt = new Date("2026-12-10T10:00:00Z");

      // Only lesson 301 was attended as revision; 302 was prepaid and later refunded/unused (no Attendance row).
      const credit = computeStudentCreditAndSessions({
        pricePerCycle: 2000,
        isFormation: false,
        payerStatus: "NORMAL",
        tuitionVouchers: [
          { id: 1, amount: 600, paymentType: "REVISION_SESSION", issuedAt: lessons[0].startsAt },
          { id: 2, amount: 600, paymentType: "REVISION_SESSION", issuedAt: lessons[0].startsAt },
          { id: 3, amount: 2000, paymentType: "TUITION_4SESSION", issuedAt: enrolledAt },
        ],
        attendances: [
          { lessonId: 301, status: "PRESENT", isRevisionVisitor: true, lesson: lessons[0] },
          { lessonId: 303, status: "PRESENT", isRevisionVisitor: false, lesson: lessons[2] },
        ],
        lessons,
        enrolledAt,
        enrollmentStatus: "ACTIVE",
      });

      expect(credit.purchasedSessions).toBe(4);
      expect(credit.attendedSessions).toBe(1);
      expect(credit.netSessions).toBe(3);

      const gapInfo = computePostRevisionEnrollmentGapInfo({
        lessons,
        attendances: [
          { lessonId: 301, status: "PRESENT", isRevisionVisitor: true, date: lessons[0].startsAt },
          { lessonId: 303, status: "PRESENT", isRevisionVisitor: false, date: lessons[2].startsAt },
        ],
        enrolledAt,
      });
      expect(gapInfo.priorRevisionCount).toBe(1);
      expect(gapInfo.gapLessonIds).toEqual([302]);

      const consec = computeStudentConsecutiveAbsences({
        lessons,
        attendances: [
          { lessonId: 301, status: "PRESENT", isRevisionVisitor: true },
        ],
        hasPaidCycle: true,
        enrolledAt,
      });
      expect(consec).toBe(0);
    });

    test("REV-M05: Source-code invariants across actions, modals, roster, grid, and attendance pages", () => {
      const readRepo = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
      const actions = readRepo("src/lib/actions.ts");
      const modal = readRepo("src/components/forms/RevisionVisitorModal.tsx");
      const roster = readRepo("src/components/forms/AttendanceRoster.tsx");
      const takePage = readRepo("src/app/[locale]/(dashboard)/list/attendance/take/[id]/page.tsx");
      const attPage = readRepo("src/app/[locale]/(dashboard)/list/attendance/page.tsx");
      const classAttPage = readRepo("src/app/[locale]/(dashboard)/list/attendance/class/[id]/page.tsx");
      const grid = readRepo("src/components/AttendanceGrid.tsx");
      const ticket = readRepo("src/components/printable/PaymentTicket.tsx");

      // Server actions
      expect(actions.includes("export async function getRevisionClassOptionsAction")).toBe(true);
      expect(actions.includes("export async function getClassRevisionLessonOptionsAction")).toBe(true);
      expect(actions.includes("export async function checkInPrepaidRevisionVisitorAction")).toBe(true);
      expect(actions.includes("export async function undoRevisionVisitorCheckInAction")).toBe(true);
      expect(actions.includes("export async function reschedulePrepaidRevisionAction")).toBe(true);
      expect(actions.includes("REVISION_VISITOR_MULTI_RECORDED")).toBe(true);
      expect(actions.includes("REVISION_VISITOR_RESCHEDULED")).toBe(true);

      // Modal & quick entry points
      expect(modal.includes("getClassRevisionLessonOptionsAction")).toBe(true);
      expect(modal.includes("splitTotalAcrossSessions")).toBe(true);
      expect(attPage.includes("QuickRevisionButton")).toBe(true);
      expect(classAttPage.includes("QuickRevisionButton")).toBe(true);

      // Roster pre-paid workflow & modal stay-open fix
      expect(roster.includes("checkInPrepaidRevisionVisitorAction")).toBe(true);
      expect(roster.includes("undoRevisionVisitorCheckInAction")).toBe(true);
      expect(roster.includes("reschedulePrepaidRevisionAction")).toBe(true);
      expect(roster.includes("isRevisionPrepaidPending")).toBe(true);
      expect(takePage.includes("buildVoucherBundleForPrint")).toBe(true);

      // Grid & Ticket
      expect(grid.includes("isPrepaidRevision")).toBe(true);
      expect(grid.includes("isPrepaidOnlyFutureColumn")).toBe(true);
      expect(ticket.includes("revisionSessionsCount")).toBe(true);
    });
  });

  await runner.runQueuedTests();
}

if (process.argv[1]?.endsWith("revision-multi-session.test.ts")) {
  runRevisionMultiSessionTests().then(() => {
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
