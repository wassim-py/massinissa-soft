import * as fs from "fs";
import * as path from "path";
import { describe, test, expect, runner } from "./helpers/runner";
import {
  classifyStudentAttendanceHistory,
  computePostRevisionEnrollmentGapInfo,
  computeStudentConsumedSessions,
  computeStudentConsecutiveAbsences,
  computeStudentCreditAndSessions,
  buildPaidSessionSlotSchedule,
  isLessonApplicableToEnrollment,
} from "@/lib/studentBilling";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/massinissa_test";
}

export async function runRevisionEnrollmentGapTests() {
  const { computeTeacherPayrollFromData } = await import("@/lib/payroll");

  await describe("Post-Revision Enrollment Gap: Core Billing, Payroll & UI", async () => {
    const lessons = [
      { id: 101, startsAt: new Date("2026-10-01T14:00:00Z"), isFree: false, isTeacherAbsent: false },
      { id: 102, startsAt: new Date("2026-10-08T14:00:00Z"), isFree: false, isTeacherAbsent: false }, // Revision visit
      { id: 103, startsAt: new Date("2026-10-15T14:00:00Z"), isFree: false, isTeacherAbsent: false }, // Gap 1
      { id: 104, startsAt: new Date("2026-10-22T14:00:00Z"), isFree: false, isTeacherAbsent: false }, // Gap 2
      { id: 105, startsAt: new Date("2026-10-29T14:00:00Z"), isFree: false, isTeacherAbsent: false }, // Post-enrollment 1
      { id: 106, startsAt: new Date("2026-11-05T14:00:00Z"), isFree: false, isTeacherAbsent: false }, // Post-enrollment 2
    ];

    test("REG-01: Revision visit + unrecorded gap + real enrollment charges ONLY post-enrollment attended sessions", () => {
      const enrolledAt = new Date("2026-10-26T10:00:00Z");

      const credit = computeStudentCreditAndSessions({
        pricePerCycle: 1600,
        isFormation: false,
        payerStatus: "NORMAL",
        tuitionVouchers: [
          // Even if caller passes REVISION_SESSION alongside TUITION_4SESSION, only TUITION_4SESSION counts as cycle credit
          { id: 1, amount: 500, paymentType: "REVISION_SESSION", issuedAt: new Date("2026-10-08T13:50:00Z") },
          { id: 2, amount: 1600, paymentType: "TUITION_4SESSION", issuedAt: enrolledAt },
        ],
        attendances: [
          { lessonId: 102, status: "PRESENT", isRevisionVisitor: true, lesson: lessons[1] },
          { lessonId: 105, status: "PRESENT", isRevisionVisitor: false, lesson: lessons[4] },
        ],
        lessons,
        enrolledAt,
        enrollmentStatus: "ACTIVE",
      });

      expect(credit.purchasedSessions).toBe(4);
      expect(credit.attendedSessions).toBe(1);
      expect(credit.netSessions).toBe(3);
      expect(credit.refundableSessions).toBe(3);
      expect(credit.status).toBe("PAID");
    });

    test("REG-02: Marked ABSENT records inside the revision-to-enrollment gap NEVER become INTERLEAVED_ABSENCE", () => {
      const enrolledAt = new Date("2026-10-26T10:00:00Z");

      const history = classifyStudentAttendanceHistory({
        lessons,
        attendances: [
          { lessonId: 102, status: "PRESENT", isRevisionVisitor: true },
          { lessonId: 103, status: "ABSENT" },
          { lessonId: 104, status: "ABSENT" },
          { lessonId: 105, status: "PRESENT" },
        ],
        enrolledAt,
      });

      const byLesson = new Map(history.map((h) => [h.lessonId, h]));
      expect(byLesson.get(101)?.classification).toBe("PRE_START_ABSENCE");
      expect(byLesson.get(101)?.isConsumedCredit).toBe(false);

      expect(byLesson.get(102)?.classification).toBe("REVISION_VISITOR");
      expect(byLesson.get(102)?.isConsumedCredit).toBe(false);
      expect(byLesson.get(102)?.isTeacherPayable).toBe(false);

      expect(byLesson.get(103)?.classification).toBe("PRE_START_ABSENCE");
      expect(byLesson.get(103)?.isConsumedCredit).toBe(false);
      expect(byLesson.get(103)?.isTeacherPayable).toBe(false);

      expect(byLesson.get(104)?.classification).toBe("PRE_START_ABSENCE");
      expect(byLesson.get(104)?.isConsumedCredit).toBe(false);
      expect(byLesson.get(104)?.isTeacherPayable).toBe(false);

      expect(byLesson.get(105)?.classification).toBe("PRESENT");
      expect(byLesson.get(105)?.isConsumedCredit).toBe(true);
      expect(byLesson.get(105)?.isTeacherPayable).toBe(true);
    });

    test("REG-03: Re-enrollment after earlier stint + revision visit still protects the revision-to-enrollment gap", () => {
      const reEnrolledAt = new Date("2026-10-26T10:00:00Z");

      const history = classifyStudentAttendanceHistory({
        lessons,
        attendances: [
          { lessonId: 101, status: "PRESENT", isRevisionVisitor: false }, // Old September/early-October stint
          { lessonId: 102, status: "PRESENT", isRevisionVisitor: true }, // Came as revision visitor while unenrolled
          { lessonId: 103, status: "ABSENT" }, // Gap
          { lessonId: 104, status: "ABSENT" }, // Gap
          { lessonId: 105, status: "PRESENT", isRevisionVisitor: false }, // Returned after re-enrollment
        ],
        enrolledAt: reEnrolledAt,
      });

      const byLesson = new Map(history.map((h) => [h.lessonId, h]));
      expect(byLesson.get(101)?.isConsumedCredit).toBe(true);
      expect(byLesson.get(102)?.isConsumedCredit).toBe(false);
      expect(byLesson.get(103)?.classification).toBe("PRE_START_ABSENCE");
      expect(byLesson.get(103)?.isConsumedCredit).toBe(false);
      expect(byLesson.get(104)?.classification).toBe("PRE_START_ABSENCE");
      expect(byLesson.get(104)?.isConsumedCredit).toBe(false);
      expect(byLesson.get(105)?.isConsumedCredit).toBe(true);
    });

    test("REG-04: Multiple revision visits before official enrollment exempts the entire pre-enrollment span", () => {
      const enrolledAt = new Date("2026-10-28T09:00:00Z");
      const gapInfo = computePostRevisionEnrollmentGapInfo({
        lessons,
        attendances: [
          { lessonId: 102, status: "PRESENT", isRevisionVisitor: true, date: lessons[1].startsAt },
          { lessonId: 104, status: "PRESENT", isRevisionVisitor: true, date: lessons[3].startsAt },
          { lessonId: 105, status: "PRESENT", isRevisionVisitor: false, date: lessons[4].startsAt },
        ],
        enrolledAt,
      });

      expect(gapInfo.hasPriorRevisionInGroup).toBe(true);
      expect(gapInfo.priorRevisionCount).toBe(2);
      // Lesson 103 is in the gap between revision 102 and enrollment (104 was itself a paid revision visit)
      expect(gapInfo.gapLessonIds).toEqual([103]);
      expect(gapInfo.gapLessonsCount).toBe(1);

      const consumed = computeStudentConsumedSessions({
        lessons: lessons.slice(0, 5),
        attendances: [
          { lessonId: 102, status: "PRESENT", isRevisionVisitor: true },
          { lessonId: 103, status: "ABSENT" },
          { lessonId: 104, status: "PRESENT", isRevisionVisitor: true },
          { lessonId: 105, status: "PRESENT", isRevisionVisitor: false },
        ],
        enrolledAt,
      });
      expect(consumed).toBe(1);
    });

    test("REG-05: Same-day desk enrollment 30 minutes into Lesson 105 counts Lesson 105 while keeping 103 & 104 as gap", () => {
      // Lesson 105 starts at 14:00; student enrolls at 14:30 (within 2h grace window) and attends 105
      const enrolledDuringLesson105 = new Date("2026-10-29T14:30:00Z");
      const gapInfo = computePostRevisionEnrollmentGapInfo({
        lessons,
        attendances: [
          { lessonId: 102, status: "PRESENT", isRevisionVisitor: true, date: lessons[1].startsAt },
          { lessonId: 105, status: "PRESENT", isRevisionVisitor: false, date: lessons[4].startsAt },
        ],
        enrolledAt: enrolledDuringLesson105,
      });

      expect(gapInfo.gapLessonIds).toEqual([103, 104]);
      expect(gapInfo.gapLessonsCount).toBe(2);

      const credit = computeStudentCreditAndSessions({
        pricePerCycle: 1600,
        tuitionVouchers: [{ id: 10, amount: 1600, paymentType: "TUITION_4SESSION", issuedAt: enrolledDuringLesson105 }],
        attendances: [
          { lessonId: 102, status: "PRESENT", isRevisionVisitor: true, lesson: lessons[1] },
          { lessonId: 105, status: "PRESENT", isRevisionVisitor: false, lesson: lessons[4] },
        ],
        lessons: lessons.slice(0, 5),
        enrolledAt: enrolledDuringLesson105,
      });
      expect(credit.attendedSessions).toBe(1);
      expect(credit.netSessions).toBe(3);
    });

    test("REG-06: Consecutive absence counter ignores revision visits and pre-enrollment gap lessons", () => {
      const enrolledAt = new Date("2026-10-26T10:00:00Z");

      // Paid cycle student who enrolled after revision and missed first post-enrollment lesson (hasn't started yet)
      const consecPaid = computeStudentConsecutiveAbsences({
        lessons: lessons.slice(0, 5),
        attendances: [
          { lessonId: 102, status: "PRESENT", isRevisionVisitor: true },
          { lessonId: 103, status: "ABSENT" },
          { lessonId: 104, status: "ABSENT" },
          { lessonId: 105, status: "ABSENT" },
        ],
        hasPaidCycle: true,
        enrolledAt,
      });
      expect(consecPaid).toBe(0);

      // Unpaid student who enrolled on Oct 26 and missed Oct 29 (only 1 post-enrollment absence, NOT 3!)
      const consecUnpaid = computeStudentConsecutiveAbsences({
        lessons: lessons.slice(0, 5),
        attendances: [
          { lessonId: 102, status: "PRESENT", isRevisionVisitor: true },
          { lessonId: 105, status: "ABSENT" },
        ],
        hasPaidCycle: false,
        enrolledAt,
      });
      expect(consecUnpaid).toBe(1);
    });

    test("REG-07: Transfer-in enrollment after a revision visit does not treat revision as pre-transfer regular presence", () => {
      const transferredInAt = new Date("2026-10-26T10:00:00Z");
      const appRev = isLessonApplicableToEnrollment(
        { id: 102, classId: 1, startsAt: lessons[1].startsAt, status: "PRESENT", isRevisionVisitor: true } as any,
        1,
        { status: "ACTIVE", enrolledAt: transferredInAt, transfersTo: [{ transferredAt: transferredInAt }] }
      );
      expect(appRev).toBe(false);

      const schedule = buildPaidSessionSlotSchedule({
        pricePerCycle: 1600,
        tuitionVouchers: [
          { id: 1, amount: 500, paymentType: "REVISION_SESSION", issuedAt: lessons[1].startsAt },
        ],
        transfersIn: [{ transferredSessions: 3, transferredAt: transferredInAt }],
      });
      expect(schedule.purchasedSessions).toBe(0);
      expect(schedule.transferredIn).toBe(3);
    });

    test("REG-08: Teacher Payroll pays REVISION_SESSION voucher once and pays 0 DZD on gap lessons", async () => {
      const enrolledAt = new Date("2026-10-26T10:00:00Z");
      const classId = 77;
      const branchId = 1;
      const studentId = "stu_rev_then_enr";

      const teacher = {
        id: "tch_1",
        name: "Prof Massi",
        TeacherPayRate: [{ percentageOfSessionFee: 70, effectiveFrom: new Date("2026-01-01T00:00:00Z") }],
        TeacherBranch: [{ branchId, payRate: null, Branch: { id: branchId, name: "Siège" } }],
        teacherClassRates: [],
      };

      const classInfo = {
        id: classId,
        name: "4AM Math G1",
        branchId,
        pricePerCycle: 1600, // 400 DA / normal session -> teacher 70% = 280 DA
        isFormation: false,
        enrollments: [
          {
            id: 501,
            studentId,
            classId,
            status: "ACTIVE",
            payerStatus: "NORMAL",
            enrolledAt,
            creditResetOffset: 0,
            transfersTo: [],
            transfersFrom: [],
            payerHistory: [],
            student: { id: studentId, family: null },
          },
        ],
      };

      // Period covers Oct 1 .. Nov 10:
      // Lesson 102 (Oct 8): Revision visitor (paid 500 DA -> teacher 70% = 350 DA)
      // Lesson 103 (Oct 15): Gap (0 DA)
      // Lesson 104 (Oct 22): Gap (0 DA)
      // Lesson 105 (Oct 29): Regular enrolled PRESENT (400 DA -> teacher 70% = 280 DA)
      const periodLessons = [
        {
          ...lessons[1],
          classId,
          branchId,
          isExtra: false,
          isCatchUp: false,
          branch: { name: "Siège" },
          class: classInfo,
          attendances: [{ studentId, lessonId: 102, status: "PRESENT", isRevisionVisitor: true }],
          vouchers: [
            {
              id: 9001,
              studentId,
              classId,
              lessonId: 102,
              paymentType: "REVISION_SESSION",
              amount: 500,
              isVoided: false,
              isRefund: false,
              refunds: [],
            },
          ],
        },
        {
          ...lessons[2],
          classId,
          branchId,
          isExtra: false,
          isCatchUp: false,
          branch: { name: "Siège" },
          class: classInfo,
          attendances: [],
          vouchers: [],
        },
        {
          ...lessons[3],
          classId,
          branchId,
          isExtra: false,
          isCatchUp: false,
          branch: { name: "Siège" },
          class: classInfo,
          attendances: [],
          vouchers: [],
        },
        {
          ...lessons[4],
          classId,
          branchId,
          isExtra: false,
          isCatchUp: false,
          branch: { name: "Siège" },
          class: classInfo,
          attendances: [{ studentId, lessonId: 105, status: "PRESENT", isRevisionVisitor: false }],
          vouchers: [],
        },
      ];

      const classHistoryMap = new Map<number, any>([
        [
          classId,
          {
            lessons: periodLessons.map((l) => ({
              id: l.id,
              classId,
              branchId,
              startsAt: l.startsAt,
              isFree: false,
              isTeacherAbsent: false,
            })),
            // Regular attendances only (as filtered by payroll.ts query isRevisionVisitor: false)
            attendances: [{ lessonId: 105, studentId, status: "PRESENT" }],
            catchUps: [],
            classInfo,
            vouchers: [
              {
                id: 9002,
                studentId,
                classId,
                paymentType: "TUITION_4SESSION",
                amount: 1600,
                issuedAt: enrolledAt,
                isVoided: false,
                isRefund: false,
                refunds: [],
              },
            ],
          },
        ],
      ]);

      const lessonByIdMap = new Map(periodLessons.map((l) => [l.id, l]));

      const payroll = await computeTeacherPayrollFromData({
        startDate: new Date("2026-10-01T00:00:00Z"),
        endDate: new Date("2026-11-10T23:59:59Z"),
        groupFilter: "all",
        teacher,
        lessons: periodLessons,
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

      expect(payroll !== null).toBe(true);
      const detailsByLesson = new Map(payroll!.sessionDetails!.map((s) => [s.lessonId, s]));
      // Lesson 102: 70% of 500 DA = 350 DA
      expect(detailsByLesson.get(102)?.lessonAmount).toBeCloseTo(350, 0.01);
      // Gap lessons 103 & 104: 0 DA
      expect(detailsByLesson.get(103)?.lessonAmount).toBe(0);
      expect(detailsByLesson.get(104)?.lessonAmount).toBe(0);
      // Lesson 105: 70% of 400 DA = 280 DA
      expect(detailsByLesson.get(105)?.lessonAmount).toBeCloseTo(280, 0.01);
      // Total gross = 350 + 0 + 0 + 280 = 630 DA (NOT double-charging 102 or charging 103/104!)
      expect(payroll!.grossAmount).toBeCloseTo(630, 0.01);
    });

    test("REG-09: Source-code invariants across AttendanceGrid, EnrollExistingStudentTab, PaymentGrid & StudentPaymentDetails", () => {
      const readRepo = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
      const grid = readRepo("src/components/AttendanceGrid.tsx");
      const classAttPage = readRepo("src/app/[locale]/(dashboard)/list/attendance/class/[id]/page.tsx");
      const enrollTab = readRepo("src/components/forms/EnrollExistingStudentTab.tsx");
      const paymentGrid = readRepo("src/components/PaymentGrid.tsx");
      const studentDetails = readRepo("src/components/StudentPaymentDetails.tsx");

      expect(classAttPage.includes("computePostRevisionEnrollmentGapInfo")).toBe(true);
      expect(grid.includes("isUnrecordedRevisionGap")).toBe(true);
      expect(grid.includes("record.isRevisionGap")).toBe(true);
      expect(grid.includes("enrollVisitorModal")).toBe(true);
      expect(grid.includes('t("legendRevisionGap")')).toBe(true);
      expect(enrollTab.includes("priorRevisionInfo")).toBe(true);
      expect(paymentGrid.includes("revisionGapInfo")).toBe(true);
      expect(studentDetails.includes("revisionGapInfo")).toBe(true);
    });

    test("REG-10: Teacher Payroll protects revision-to-reenrollment gap even when student had an earlier Sept stint", async () => {
      const reEnrolledAt = new Date("2026-10-26T10:00:00Z");
      const classId = 78;
      const branchId = 1;
      const studentId = "stu_reenroll_after_rev";

      const teacher = {
        id: "tch_2",
        name: "Prof Karim",
        TeacherPayRate: [{ percentageOfSessionFee: 70, effectiveFrom: new Date("2026-01-01T00:00:00Z") }],
        TeacherBranch: [{ branchId, payRate: null, Branch: { id: branchId, name: "Siège" } }],
        teacherClassRates: [],
      };

      const classInfo = {
        id: classId,
        name: "3AS Physique G1",
        branchId,
        pricePerCycle: 1600, // 400 DA / session -> 70% = 280 DA
        isFormation: false,
        enrollments: [
          {
            id: 502,
            studentId,
            classId,
            status: "ACTIVE",
            payerStatus: "NORMAL",
            enrolledAt: reEnrolledAt,
            creditResetOffset: 0,
            transfersTo: [],
            transfersFrom: [],
            payerHistory: [],
            student: { id: studentId, family: null },
          },
        ],
      };

      // Sept 15 (lesson 201): earlier enrolled stint PRESENT (paid via Sept voucher)
      // Oct 8 (lesson 202): came as revision visitor while unenrolled (paid 500 DA -> teacher 350 DA)
      // Oct 15 (lesson 203): gap (marked ABSENT -> MUST be 0 DA, NOT INTERLEAVED_ABSENCE!)
      // Oct 22 (lesson 204): gap (marked ABSENT -> MUST be 0 DA, NOT INTERLEAVED_ABSENCE!)
      // Oct 26: re-enrolled + paid 1600 DA cycle
      // Oct 29 (lesson 205): post-reenrollment PRESENT (teacher 280 DA)
      const allLessons = [
        { id: 201, startsAt: new Date("2026-09-15T14:00:00Z"), isFree: false, isTeacherAbsent: false },
        { id: 202, startsAt: new Date("2026-10-08T14:00:00Z"), isFree: false, isTeacherAbsent: false },
        { id: 203, startsAt: new Date("2026-10-15T14:00:00Z"), isFree: false, isTeacherAbsent: false },
        { id: 204, startsAt: new Date("2026-10-22T14:00:00Z"), isFree: false, isTeacherAbsent: false },
        { id: 205, startsAt: new Date("2026-10-29T14:00:00Z"), isFree: false, isTeacherAbsent: false },
      ];

      const octPeriodLessons = [
        {
          ...allLessons[1],
          classId,
          branchId,
          isExtra: false,
          isCatchUp: false,
          branch: { name: "Siège" },
          class: classInfo,
          attendances: [{ studentId, lessonId: 202, status: "PRESENT", isRevisionVisitor: true }],
          vouchers: [
            {
              id: 9101,
              studentId,
              classId,
              lessonId: 202,
              paymentType: "REVISION_SESSION",
              amount: 500,
              isVoided: false,
              isRefund: false,
              refunds: [],
            },
          ],
        },
        {
          ...allLessons[2],
          classId,
          branchId,
          isExtra: false,
          isCatchUp: false,
          branch: { name: "Siège" },
          class: classInfo,
          attendances: [{ studentId, lessonId: 203, status: "ABSENT", isRevisionVisitor: false }],
          vouchers: [],
        },
        {
          ...allLessons[3],
          classId,
          branchId,
          isExtra: false,
          isCatchUp: false,
          branch: { name: "Siège" },
          class: classInfo,
          attendances: [{ studentId, lessonId: 204, status: "ABSENT", isRevisionVisitor: false }],
          vouchers: [],
        },
        {
          ...allLessons[4],
          classId,
          branchId,
          isExtra: false,
          isCatchUp: false,
          branch: { name: "Siège" },
          class: classInfo,
          attendances: [{ studentId, lessonId: 205, status: "PRESENT", isRevisionVisitor: false }],
          vouchers: [],
        },
      ];

      const classHistoryMap = new Map<number, any>([
        [
          classId,
          {
            lessons: allLessons.map((l) => ({
              id: l.id,
              classId,
              branchId,
              startsAt: l.startsAt,
              isFree: false,
              isTeacherAbsent: false,
            })),
            attendances: [
              { lessonId: 201, studentId, status: "PRESENT", isRevisionVisitor: false },
              { lessonId: 202, studentId, status: "PRESENT", isRevisionVisitor: true },
              { lessonId: 203, studentId, status: "ABSENT", isRevisionVisitor: false },
              { lessonId: 204, studentId, status: "ABSENT", isRevisionVisitor: false },
              { lessonId: 205, studentId, status: "PRESENT", isRevisionVisitor: false },
            ],
            catchUps: [],
            classInfo,
            vouchers: [
              {
                id: 9100,
                studentId,
                classId,
                paymentType: "TUITION_4SESSION",
                amount: 1600,
                issuedAt: new Date("2026-09-15T10:00:00Z"),
                isVoided: false,
                isRefund: false,
                refunds: [],
              },
              {
                id: 9102,
                studentId,
                classId,
                paymentType: "TUITION_4SESSION",
                amount: 1600,
                issuedAt: reEnrolledAt,
                isVoided: false,
                isRefund: false,
                refunds: [],
              },
            ],
          },
        ],
      ]);

      const lessonByIdMap = new Map(
        allLessons.map((l) => [
          l.id,
          { ...l, classId, branchId, branch: { name: "Siège" }, class: classInfo },
        ])
      );

      const payroll = await computeTeacherPayrollFromData({
        startDate: new Date("2026-10-01T00:00:00Z"),
        endDate: new Date("2026-10-31T23:59:59Z"),
        groupFilter: "all",
        teacher,
        lessons: octPeriodLessons,
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

      expect(payroll !== null).toBe(true);
      const detailsByLesson = new Map(payroll!.sessionDetails!.map((s) => [s.lessonId, s]));
      // Lesson 202 (Revision): 70% of 500 DA = 350 DA
      expect(detailsByLesson.get(202)?.lessonAmount).toBeCloseTo(350, 0.01);
      // Gap lessons 203 & 204 MUST be 0 DA despite earlier Sept presence on lesson 201!
      expect(detailsByLesson.get(203)?.lessonAmount).toBe(0);
      expect(detailsByLesson.get(204)?.lessonAmount).toBe(0);
      // Lesson 205 (post-reenrollment): 70% of 400 DA = 280 DA
      expect(detailsByLesson.get(205)?.lessonAmount).toBeCloseTo(280, 0.01);
      // Total gross = 350 + 0 + 0 + 280 = 630 DA
      expect(payroll!.grossAmount).toBeCloseTo(630, 0.01);
    });
  });

  await runner.runQueuedTests();
}

if (process.argv[1]?.endsWith("revision-enrollment-gap.test.ts")) {
  runRevisionEnrollmentGapTests().then(() => {
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
