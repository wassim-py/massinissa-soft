import { describe, test, expect, runner } from "./helpers/runner";
import { can } from "@/lib/permissions";
import { enrollmentDiscountSchema } from "@/lib/formValidationSchemas";
import {
  computeDiscountedCycleFee,
  computeStudentSessionFee,
  formatDiscountBadgeLabel,
  resolvePayerPeriodAtDate,
  buildVoucherBillingSnapshot,
  buildPaidSessionSlotSchedule,
  classifyStudentAttendanceHistory,
  computeStudentCreditAndSessions,
  computeEnrollmentInscriptionStatus,
  resolvePayerCredit,
} from "@/lib/studentBilling";

// Guard Prisma initialization if DATABASE_URL isn't present in an offline test environment
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/massinissa_test";
}

export async function runDiscountedPaymentTypeTests() {
  const { computeTeacherPayrollFromData } = await import("@/lib/payroll");

  await describe("DISCOUNTED Payment Type: Fee Math, Precedence & Scope", async () => {
    test("DP-01: PERCENT discount computes cycle, session, proportional teacher/school split & weight", () => {
      const res = computeStudentSessionFee({
        payerStatus: "DISCOUNTED",
        discountType: "PERCENT",
        discountValue: 25,
        pricePerCycle: 2000,
        teacherPercentage: 70,
      });

      expect(res.isDiscounted).toBe(true);
      expect(res.payerStatus).toBe("DISCOUNTED");
      expect(res.baseCycleFee).toBe(2000);
      expect(res.baseSessionFee).toBe(500);
      expect(res.studentCycleFee).toBe(1500);
      expect(res.studentSessionFee).toBe(375);
      expect(res.teacherCut).toBeCloseTo(262.5, 0.01);
      expect(res.schoolCut).toBeCloseTo(112.5, 0.01);
      expect(res.teacherCut + res.schoolCut).toBeCloseTo(res.studentSessionFee, 0.01);
      expect(res.teacherPayWeight).toBeCloseTo(0.75, 0.0001);
    });

    test("DP-02: FIXED_AMOUNT and CUSTOM_PRICE discounts clamp safely and keep proportional split", () => {
      const fixed = computeStudentSessionFee({
        payerStatus: "DISCOUNTED",
        discountType: "FIXED_AMOUNT",
        discountValue: 600,
        pricePerCycle: 2000,
        teacherPercentage: 65,
      });
      expect(fixed.studentCycleFee).toBe(1400);
      expect(fixed.studentSessionFee).toBe(350);
      expect(fixed.teacherPayWeight).toBeCloseTo(0.7, 0.0001);
      expect(fixed.teacherCut).toBeCloseTo(227.5, 0.01);
      expect(fixed.schoolCut).toBeCloseTo(122.5, 0.01);

      // Over-discount clamped to 0
      const clampedFixed = computeStudentSessionFee({
        payerStatus: "DISCOUNTED",
        discountType: "FIXED_AMOUNT",
        discountValue: 5000,
        pricePerCycle: 2000,
        teacherPercentage: 70,
      });
      expect(clampedFixed.studentCycleFee).toBe(0);
      expect(clampedFixed.teacherPayWeight).toBe(0);

      // Custom price capped at basePrice
      const custom = computeStudentSessionFee({
        payerStatus: "DISCOUNTED",
        discountType: "CUSTOM_PRICE",
        discountValue: 1200,
        pricePerCycle: 2000,
        teacherPercentage: 60,
      });
      expect(custom.studentCycleFee).toBe(1200);
      expect(custom.studentSessionFee).toBe(300);
      expect(custom.teacherPayWeight).toBeCloseTo(0.6, 0.0001);
      expect(custom.teacherCut).toBe(180);
      expect(custom.schoolCut).toBe(120);
    });

    test("DP-03: 100% DISCOUNTED yields 0 DZD tuition, 0 teacher/school cut, without auto-waiving Inscription", () => {
      const fee100 = computeStudentSessionFee({
        payerStatus: "DISCOUNTED",
        discountType: "PERCENT",
        discountValue: 100,
        pricePerCycle: 2000,
        teacherPercentage: 70,
      });
      expect(fee100.studentCycleFee).toBe(0);
      expect(fee100.studentSessionFee).toBe(0);
      expect(fee100.teacherCut).toBe(0);
      expect(fee100.schoolCut).toBe(0);
      expect(fee100.teacherPayWeight).toBe(0);

      // Inscription fee remains UNPAID for DISCOUNTED (only NON_PAYER / 3-groups / explicit feeOverriddenByOwner waives inscription)
      const inscStatus = computeEnrollmentInscriptionStatus({
        enrollment: { id: 1, payerStatus: "DISCOUNTED", discountType: "PERCENT", discountValue: 100 },
        classData: { id: 10, isFormation: false },
        vouchers: [],
        paidInscClassIds: new Set<number>(),
      });
      expect(inscStatus.status).toBe("UNPAID");
      expect(inscStatus.isInscriptionWaived).toBe(false);
    });

    test("DP-04: Owner DISCOUNTED takes strict precedence over automatic Sibling Discount (no double discount)", () => {
      const fee = computeStudentSessionFee({
        payerStatus: "DISCOUNTED",
        discountType: "CUSTOM_PRICE",
        discountValue: 1800,
        pricePerCycle: 2000,
        teacherPercentage: 70,
        siblingDiscountPercentage: 50,
        isSiblingWaived: false,
        isPayerActiveAndPaid: true,
      });
      expect(fee.isDiscounted).toBe(true);
      expect(fee.isSiblingWaived).toBe(false);
      expect(fee.siblingDiscountPercentage).toBe(0);
      expect(fee.studentCycleFee).toBe(1800);

      // Even if sibling discount is 100%, explicit Owner DISCOUNTED overrides it on that enrollment
      const feeVs100Sibling = computeStudentSessionFee({
        payerStatus: "DISCOUNTED",
        discountType: "PERCENT",
        discountValue: 30,
        pricePerCycle: 2000,
        teacherPercentage: 70,
        siblingDiscountPercentage: 100,
        isSiblingWaived: true,
        isPayerActiveAndPaid: true,
      });
      expect(feeVs100Sibling.isDiscounted).toBe(true);
      expect(feeVs100Sibling.isSiblingWaived).toBe(false);
      expect(feeVs100Sibling.studentCycleFee).toBe(1400);
    });

    test("DP-05: Formation lump-sum fee applies DISCOUNTED accurately", () => {
      const formFee = computeStudentSessionFee({
        payerStatus: "DISCOUNTED",
        discountType: "PERCENT",
        discountValue: 25,
        pricePerCycle: 24000,
        teacherPercentage: 50,
        isFormation: true,
      });
      expect(formFee.studentCycleFee).toBe(18000);
      expect(formFee.studentSessionFee).toBe(18000);
      expect(formFee.teacherCut).toBe(9000);
      expect(formFee.schoolCut).toBe(9000);
      expect(formFee.teacherPayWeight).toBeCloseTo(0.75, 0.0001);
    });

    test("DP-06: computeDiscountedCycleFee & formatDiscountBadgeLabel formatting", () => {
      const d = computeDiscountedCycleFee({
        baseCycleFee: 2500,
        discountType: "FIXED_AMOUNT",
        discountValue: 500,
      });
      expect(d.studentCycleFee).toBe(2000);
      expect(d.discountAmountPerCycle).toBe(500);
      expect(d.effectiveDiscountPercent).toBe(20);

      expect(formatDiscountBadgeLabel("PERCENT", 25, "fr")).toBe("-25%");
      expect(formatDiscountBadgeLabel("FIXED_AMOUNT", 500, "fr")).toContain("-500");
      expect(formatDiscountBadgeLabel("CUSTOM_PRICE", 1500, "ar")).toContain("دج");
    });
  });

  await describe("DISCOUNTED Payment Type: RBAC & Validation", async () => {
    test("DP-07: Only OWNER can create, update, delete, or view student_discounts", () => {
      expect(can("owner", "create", "student_discounts")).toBe(true);
      expect(can("owner", "update", "student_discounts")).toBe(true);
      expect(can("owner", "delete", "student_discounts")).toBe(true);
      expect(can("owner", "view", "student_discounts")).toBe(true);

      expect(can("branch_admin", "create", "student_discounts")).toBe(false);
      expect(can("branch_admin", "update", "student_discounts")).toBe(false);
      expect(can("branch_admin", "delete", "student_discounts")).toBe(false);
      expect(can("branch_admin", "view", "student_discounts")).toBe(false);

      expect(can("teacher", "update", "student_discounts")).toBe(false);
      expect(can("admin", "create", "student_discounts")).toBe(true); // legacy owner role alias
    });

    test("DP-08: enrollmentDiscountSchema validates modes and rejects negative/unknown inputs", () => {
      const ok = enrollmentDiscountSchema.safeParse({
        studentId: "stu-1",
        enrollmentId: 42,
        discountType: "PERCENT",
        discountValue: 30,
        reason: "Bourse",
      });
      expect(ok.success).toBe(true);

      const badNegative = enrollmentDiscountSchema.safeParse({
        studentId: "stu-1",
        enrollmentId: 42,
        discountType: "FIXED_AMOUNT",
        discountValue: -100,
      });
      expect(badNegative.success).toBe(false);

      const badType = enrollmentDiscountSchema.safeParse({
        studentId: "stu-1",
        enrollmentId: 42,
        discountType: "SIBLING",
        discountValue: 50,
      });
      expect(badType.success).toBe(false);
    });
  });

  await describe("DISCOUNTED Payment Type: Snapshots, Credit & Future Transitions", async () => {
    test("DP-09: Voucher billing snapshot captures exact applied rate and weight", () => {
      const snapDisc = buildVoucherBillingSnapshot({
        payerStatus: "DISCOUNTED",
        discountType: "PERCENT",
        discountValue: 40,
        pricePerCycle: 2000,
        teacherPercentage: 70,
      });
      expect(snapDisc.appliedPayerStatus).toBe("DISCOUNTED");
      expect(snapDisc.baseCyclePrice).toBe(2000);
      expect(snapDisc.effectiveCyclePrice).toBe(1200);
      expect(snapDisc.effectiveSessionPrice).toBe(300);
      expect(snapDisc.discountType).toBe("PERCENT");
      expect(snapDisc.discountValue).toBe(40);
      expect(snapDisc.teacherPayWeight).toBeCloseTo(0.6, 0.0001);

      const snapSfo = buildVoucherBillingSnapshot({
        payerStatus: "SCHOOL_FEES_ONLY",
        pricePerCycle: 2000,
        teacherPercentage: 70,
      });
      expect(snapSfo.appliedPayerStatus).toBe("SCHOOL_FEES_ONLY");
      expect(snapSfo.effectiveCyclePrice).toBe(600);
      expect(snapSfo.effectiveSessionPrice).toBe(150);
      expect(snapSfo.teacherPayWeight).toBe(0);
    });

    test("DP-10: DISCOUNTED -> delete discount (NORMAL) preserves prepaid discounted session credits & mixed refund cap", () => {
      const t1 = new Date("2026-10-01T10:00:00Z");
      const t2 = new Date("2026-10-08T10:00:00Z");
      const t3 = new Date("2026-10-15T10:00:00Z");
      const t4 = new Date("2026-10-20T10:00:00Z");

      // Voucher 1 issued while 50% DISCOUNTED (1000 DZD = 4 sessions @ 250)
      const v1 = {
        id: 101,
        amount: 1000,
        issuedAt: t1,
        appliedPayerStatus: "DISCOUNTED",
        baseCyclePrice: 2000,
        effectiveCyclePrice: 1000,
        effectiveSessionPrice: 250,
        discountType: "PERCENT",
        discountValue: 50,
        teacherPayWeight: 0.5,
        refunds: [],
      };

      // After 2 attended sessions, enrollment is now switched to NORMAL (base 2000 DZD = 500/ses)
      const afterSwitchNoNewVoucher = computeStudentCreditAndSessions({
        pricePerCycle: 2000,
        payerStatus: "NORMAL",
        teacherPercentage: 70,
        tuitionVouchers: [v1],
        lessons: [
          { id: 1, startsAt: t1 },
          { id: 2, startsAt: t2 },
        ],
        attendances: [
          { lessonId: 1, status: "PRESENT" },
          { lessonId: 2, status: "PRESENT" },
        ],
      });

      // Must STILL have 2 remaining sessions worth 250 each = 500 DZD refundable!
      expect(afterSwitchNoNewVoucher.purchasedSessions).toBe(4);
      expect(afterSwitchNoNewVoucher.netSessions).toBe(2);
      expect(afterSwitchNoNewVoucher.refundableAmount).toBe(500);

      // Now student buys Voucher 2 under NORMAL (2000 DZD = 4 sessions @ 500)
      const v2 = {
        id: 102,
        amount: 2000,
        issuedAt: t4,
        appliedPayerStatus: "NORMAL",
        baseCyclePrice: 2000,
        effectiveCyclePrice: 2000,
        effectiveSessionPrice: 500,
        discountType: null,
        discountValue: null,
        teacherPayWeight: 1,
        refunds: [],
      };

      const afterSecondVoucher = computeStudentCreditAndSessions({
        pricePerCycle: 2000,
        payerStatus: "NORMAL",
        teacherPercentage: 70,
        tuitionVouchers: [v1, v2],
        lessons: [
          { id: 1, startsAt: t1 },
          { id: 2, startsAt: t2 },
          { id: 3, startsAt: t3 },
        ],
        attendances: [
          { lessonId: 1, status: "PRESENT" },
          { lessonId: 2, status: "PRESENT" },
        ],
      });

      expect(afterSecondVoucher.purchasedSessions).toBe(8);
      expect(afterSecondVoucher.netSessions).toBe(6);
      // Remaining 2 slots @ 250 (500) + 4 slots @ 500 (2000) = 2500 DZD
      expect(afterSecondVoucher.refundableAmount).toBe(2500);
      expect(afterSecondVoucher.slotSchedule.slots[0].teacherPayWeight).toBe(0.5);
      expect(afterSecondVoucher.slotSchedule.slots[4].teacherPayWeight).toBe(1);
    });

    test("DP-11: Partial payment under DISCOUNTED computes discounted cycleRemainingFee cleanly", () => {
      // Base 2000, Owner discount CUSTOM_PRICE = 1200/cycle (300/ses), student pays 600 DZD (2 sessions)
      const metrics = computeStudentCreditAndSessions({
        pricePerCycle: 2000,
        payerStatus: "DISCOUNTED",
        discountType: "CUSTOM_PRICE",
        discountValue: 1200,
        teacherPercentage: 70,
        tuitionVouchers: [
          {
            id: 201,
            amount: 600,
            issuedAt: new Date("2026-10-01T10:00:00Z"),
            appliedPayerStatus: "DISCOUNTED",
            baseCyclePrice: 2000,
            effectiveCyclePrice: 1200,
            effectiveSessionPrice: 300,
            discountType: "CUSTOM_PRICE",
            discountValue: 1200,
            teacherPayWeight: 0.6,
            refunds: [],
          },
        ],
        lessons: [],
        attendances: [],
      });

      expect(metrics.purchasedSessions).toBe(2);
      expect(metrics.netSessions).toBe(2);
      expect(metrics.effectiveCycleFee).toBe(1200);
      expect(metrics.effectiveLessonPrice).toBe(300);
      expect(metrics.cycleRemainingFee).toBe(600);
    });

    test("DP-12: NON_PAYER -> DISCOUNTED transition via payerHistory does NOT turn historical lessons into debt", () => {
      const l1Date = new Date("2026-10-01T10:00:00Z");
      const l2Date = new Date("2026-10-08T10:00:00Z");
      const switchDate = new Date("2026-10-12T10:00:00Z");
      const l3Date = new Date("2026-10-15T10:00:00Z");

      const payerHistory = [
        {
          id: 1,
          payerStatus: "NON_PAYER",
          effectiveFrom: new Date("2026-09-25T00:00:00Z"),
          effectiveTo: switchDate,
        },
        {
          id: 2,
          payerStatus: "DISCOUNTED",
          discountType: "PERCENT",
          discountValue: 50,
          effectiveFrom: switchDate,
          effectiveTo: null,
        },
      ];

      expect(resolvePayerPeriodAtDate(l1Date, payerHistory).payerStatus).toBe("NON_PAYER");
      expect(resolvePayerPeriodAtDate(l3Date, payerHistory).payerStatus).toBe("DISCOUNTED");

      const classified = classifyStudentAttendanceHistory({
        lessons: [
          { id: 1, startsAt: l1Date },
          { id: 2, startsAt: l2Date },
          { id: 3, startsAt: l3Date },
        ],
        attendances: [
          { lessonId: 1, status: "PRESENT" },
          { lessonId: 2, status: "PRESENT" },
          { lessonId: 3, status: "PRESENT" },
        ],
        payerHistory,
      });

      expect(classified[0].classification).toBe("NON_PAYER_EXEMPT");
      expect(classified[0].isConsumedCredit).toBe(false);
      expect(classified[1].classification).toBe("NON_PAYER_EXEMPT");
      expect(classified[2].classification).toBe("PRESENT");
      expect(classified[2].isConsumedCredit).toBe(true);

      // Student buys 1 cycle (1000 DZD) at switchDate and attends l3Date -> netSessions should be 4 - 1 = 3!
      const metrics = computeStudentCreditAndSessions({
        pricePerCycle: 2000,
        payerStatus: "DISCOUNTED",
        discountType: "PERCENT",
        discountValue: 50,
        payerHistory,
        tuitionVouchers: [
          {
            id: 301,
            amount: 1000,
            issuedAt: switchDate,
            appliedPayerStatus: "DISCOUNTED",
            baseCyclePrice: 2000,
            effectiveCyclePrice: 1000,
            effectiveSessionPrice: 250,
            discountType: "PERCENT",
            discountValue: 50,
            teacherPayWeight: 0.5,
            refunds: [],
          },
        ],
        lessons: [
          { id: 1, startsAt: l1Date },
          { id: 2, startsAt: l2Date },
          { id: 3, startsAt: l3Date },
        ],
        attendances: [
          { lessonId: 1, status: "PRESENT" },
          { lessonId: 2, status: "PRESENT" },
          { lessonId: 3, status: "PRESENT" },
        ],
      });

      expect(metrics.attendedSessions).toBe(1);
      expect(metrics.netSessions).toBe(3);
    });

    test("DP-13: Transfer from DISCOUNTED group (250/ses) to NORMAL group (500/ses) converts exact cash value", () => {
      // 4 sessions @ 250 = 1000 DZD transferred to NORMAL class where 1 session = 500 DZD -> yields 2 sessions!
      const destSchedule = buildPaidSessionSlotSchedule({
        pricePerCycle: 2000,
        payerStatus: "NORMAL",
        teacherPercentage: 70,
        transfersIn: [
          {
            transferredSessions: 4,
            amount: 1000,
            notes: "[PRICE_DIFF_VIREMENT] Transféré depuis Groupe Remisé",
            transferredAt: new Date("2026-10-10T10:00:00Z"),
            fromEnrollment: {
              payerStatus: "DISCOUNTED",
              discountType: "PERCENT",
              discountValue: 50,
              class: { pricePerCycle: 2000 },
            },
          },
        ],
      });

      expect(destSchedule.slots.length).toBe(2);
      expect(destSchedule.slots[0].unitPrice).toBe(500);
      expect(destSchedule.slots[0].teacherPayWeight).toBe(1);
      expect(destSchedule.partialTransferPaidDzd).toBe(1000);
      expect(destSchedule.partialTransferRemainderDzd).toBe(1000);
    });

    test("DP-14: Zero-fee 100% DISCOUNTED reports PAID status & satisfies resolvePayerCredit", () => {
      const metrics = computeStudentCreditAndSessions({
        pricePerCycle: 2000,
        payerStatus: "DISCOUNTED",
        discountType: "PERCENT",
        discountValue: 100,
        teacherPercentage: 70,
        tuitionVouchers: [],
        lessons: [{ id: 1, startsAt: new Date("2026-10-01T10:00:00Z") }],
        attendances: [{ lessonId: 1, status: "PRESENT" }],
      });

      expect(metrics.isDiscounted).toBe(true);
      expect(metrics.isZeroFeeDiscount).toBe(true);
      expect(metrics.status).toBe("PAID");
      expect(metrics.netSessions).toBe(0);

      const payerRes = resolvePayerCredit({
        payerStudent: {
          enrollments: [
            {
              classId: 10,
              status: "ACTIVE",
              payerStatus: "DISCOUNTED",
              discountType: "PERCENT",
              discountValue: 100,
              class: { id: 10, pricePerCycle: 2000, isFormation: false },
            },
          ],
          vouchers: [],
          attendances: [],
          catchUpAttendances: [],
        },
        classId: 10,
        classPricePerCycle: 2000,
        isFormation: false,
      });
      expect(payerRes.isPayerActiveAndPaid).toBe(true);
    });
  });

  await describe("DISCOUNTED Payment Type: Teacher Payroll Proportional Split & Transitions", async () => {
    const startDate = new Date("2026-10-01T00:00:00Z");
    const endDate = new Date("2026-10-31T23:59:59Z");

    test("DP-15: Payroll weights NORMAL, DISCOUNTED (50%, 25%, 100%), and SCHOOL_FEES_ONLY per student accurately", async () => {
      const l1Start = new Date("2026-10-05T10:00:00Z");
      const branch = { id: 1, name: "Centre" };

      // Class base: 2000/cycle -> 500/ses; teacher 70% -> 350 DZD full cut, 150 DZD school cut
      const enrollments = [
        { studentId: "s-norm", status: "ACTIVE", payerStatus: "NORMAL", creditResetOffset: 0, transfersFrom: [], transfersTo: [], payerHistory: [] },
        { studentId: "s-d50", status: "ACTIVE", payerStatus: "DISCOUNTED", discountType: "PERCENT", discountValue: 50, creditResetOffset: 0, transfersFrom: [], transfersTo: [], payerHistory: [] },
        { studentId: "s-d25", status: "ACTIVE", payerStatus: "DISCOUNTED", discountType: "FIXED_AMOUNT", discountValue: 500, creditResetOffset: 0, transfersFrom: [], transfersTo: [], payerHistory: [] },
        { studentId: "s-d100", status: "ACTIVE", payerStatus: "DISCOUNTED", discountType: "PERCENT", discountValue: 100, creditResetOffset: 0, transfersFrom: [], transfersTo: [], payerHistory: [] },
        { studentId: "s-sfo", status: "ACTIVE", payerStatus: "SCHOOL_FEES_ONLY", creditResetOffset: 0, transfersFrom: [], transfersTo: [], payerHistory: [] },
      ];

      const classObj = {
        id: 50,
        name: "Maths 1AS",
        pricePerCycle: 2000,
        isFormation: false,
        branchId: 1,
        branch,
        enrollments,
      };

      const vouchers = [
        { id: 1, studentId: "s-norm", classId: 50, paymentType: "TUITION_4SESSION", amount: 2000, issuedAt: l1Start, isVoided: false, isRefund: false, appliedPayerStatus: "NORMAL", effectiveSessionPrice: 500, teacherPayWeight: 1, refunds: [] },
        { id: 2, studentId: "s-d50", classId: 50, paymentType: "TUITION_4SESSION", amount: 1000, issuedAt: l1Start, isVoided: false, isRefund: false, appliedPayerStatus: "DISCOUNTED", effectiveSessionPrice: 250, teacherPayWeight: 0.5, refunds: [] },
        { id: 3, studentId: "s-d25", classId: 50, paymentType: "TUITION_4SESSION", amount: 1500, issuedAt: l1Start, isVoided: false, isRefund: false, appliedPayerStatus: "DISCOUNTED", effectiveSessionPrice: 375, teacherPayWeight: 0.75, refunds: [] },
        { id: 4, studentId: "s-sfo", classId: 50, paymentType: "TUITION_4SESSION", amount: 600, issuedAt: l1Start, isVoided: false, isRefund: false, appliedPayerStatus: "SCHOOL_FEES_ONLY", effectiveSessionPrice: 150, teacherPayWeight: 0, refunds: [] },
      ];

      const attendances = enrollments.map((e) => ({
        lessonId: 5001,
        studentId: e.studentId,
        status: "PRESENT",
      }));

      const lesson = {
        id: 5001,
        classId: 50,
        branchId: 1,
        startsAt: l1Start,
        isFree: false,
        isExtra: false,
        isCatchUp: false,
        isTeacherAbsent: false,
        branch,
        class: classObj,
        attendances,
        vouchers,
        lessonGroups: [],
      };

      const classHistoryMap = new Map([
        [
          50,
          {
            lessons: [lesson],
            attendances,
            catchUps: [],
            classInfo: classObj,
            vouchers,
          },
        ],
      ]);

      const calc = await computeTeacherPayrollFromData({
        startDate,
        endDate,
        groupFilter: "normal",
        teacher: {
          id: "t-1",
          name: "Prof Karim",
          TeacherPayRate: [{ effectiveFrom: new Date("2026-01-01"), ratePerSession: null, fixedMonthly: null, percentageOfSessionFee: 70 }],
          TeacherBranch: [],
          teacherClassRates: [],
        },
        lessons: [lesson],
        teacherClasses: [{ id: 50, isFormation: false }],
        salaryAdvancesList: [],
        photocopyChargesList: [],
        catchUpVisitors: [],
        catchUpsForMissedLessons: [],
        bookVouchers: [],
        formationClasses: [],
        prefetchedFormationData: [[], []],
        classHistoryMap,
        lessonByIdMap: new Map([[5001, lesson]]),
      });

      expect(calc).notToBe(null);
      // Weights: 1.0 + 0.5 + 0.75 + 0 + 0 = 2.25
      // Teacher cut = 2.25 * 350 = 787.50 DZD
      // Tuition gross = 2.25 * 500 = 1125 DZD (teacher 787.5 + school 337.5)
      expect(calc!.grossAmount).toBeCloseTo(787.5, 0.01);
      expect(calc!.totalTuitionGross).toBeCloseTo(1125, 0.01);
      expect(calc!.schoolGrossAmount).toBeCloseTo(337.5, 0.01);
      expect(calc!.sessionDetails![0].payingCount).toBeCloseTo(2.25, 0.01);
      expect(calc!.sessionDetails![0].presentCount).toBe(5);
    });

    test("DP-16: Mid-cycle transition (DISCOUNTED -> deleted to NORMAL -> new voucher) pays snapshot weights per slot", async () => {
      const branch = { id: 1, name: "Centre" };
      const d1 = new Date("2026-10-02T10:00:00Z");
      const d2 = new Date("2026-10-09T10:00:00Z");
      const switchAt = new Date("2026-10-12T10:00:00Z");
      const d3 = new Date("2026-10-16T10:00:00Z");
      const d4 = new Date("2026-10-23T10:00:00Z");
      const d5 = new Date("2026-10-30T10:00:00Z");

      // Student currently NORMAL (discount deleted on Oct 12), but Cycle 1 paid while 50% discounted (slots 1..4 w=0.5)
      // Cycle 2 paid after Oct 12 as NORMAL (slots 5..8 w=1.0)
      const enrollments = [
        {
          studentId: "s-trans",
          status: "ACTIVE",
          payerStatus: "NORMAL",
          creditResetOffset: 0,
          transfersFrom: [],
          transfersTo: [],
          payerHistory: [
            { id: 1, payerStatus: "DISCOUNTED", discountType: "PERCENT", discountValue: 50, effectiveFrom: new Date("2026-10-01T00:00:00Z"), effectiveTo: switchAt },
            { id: 2, payerStatus: "NORMAL", effectiveFrom: switchAt, effectiveTo: null },
          ],
        },
      ];

      const classObj = {
        id: 51,
        name: "Physique 2AS",
        pricePerCycle: 2000,
        isFormation: false,
        branchId: 1,
        branch,
        enrollments,
      };

      const vouchers = [
        { id: 11, studentId: "s-trans", classId: 51, paymentType: "TUITION_4SESSION", amount: 1000, issuedAt: d1, isVoided: false, isRefund: false, appliedPayerStatus: "DISCOUNTED", effectiveSessionPrice: 250, teacherPayWeight: 0.5, refunds: [] },
        { id: 12, studentId: "s-trans", classId: 51, paymentType: "TUITION_4SESSION", amount: 2000, issuedAt: d3, isVoided: false, isRefund: false, appliedPayerStatus: "NORMAL", effectiveSessionPrice: 500, teacherPayWeight: 1, refunds: [] },
      ];

      const lessonSpecs = [
        { id: 5101, startsAt: d1 },
        { id: 5102, startsAt: d2 },
        { id: 5103, startsAt: d3 },
        { id: 5104, startsAt: d4 },
        { id: 5105, startsAt: d5 },
      ];

      const allAttendances = lessonSpecs.map((ls) => ({
        lessonId: ls.id,
        studentId: "s-trans",
        status: "PRESENT",
      }));

      const lessons = lessonSpecs.map((ls) => ({
        id: ls.id,
        classId: 51,
        branchId: 1,
        startsAt: ls.startsAt,
        isFree: false,
        isExtra: false,
        isCatchUp: false,
        isTeacherAbsent: false,
        branch,
        class: classObj,
        attendances: [{ lessonId: ls.id, studentId: "s-trans", status: "PRESENT" }],
        vouchers,
        lessonGroups: [],
      }));

      const classHistoryMap = new Map([
        [
          51,
          {
            lessons,
            attendances: allAttendances,
            catchUps: [],
            classInfo: classObj,
            vouchers,
          },
        ],
      ]);

      const calc = await computeTeacherPayrollFromData({
        startDate,
        endDate,
        groupFilter: "normal",
        teacher: {
          id: "t-1",
          name: "Prof Karim",
          TeacherPayRate: [{ effectiveFrom: new Date("2026-01-01"), ratePerSession: null, fixedMonthly: null, percentageOfSessionFee: 70 }],
          TeacherBranch: [],
          teacherClassRates: [],
        },
        lessons,
        teacherClasses: [{ id: 51, isFormation: false }],
        salaryAdvancesList: [],
        photocopyChargesList: [],
        catchUpVisitors: [],
        catchUpsForMissedLessons: [],
        bookVouchers: [],
        formationClasses: [],
        prefetchedFormationData: [[], []],
        classHistoryMap,
        lessonByIdMap: new Map(lessons.map((l) => [l.id, l])),
      });

      // Lessons 1..4 consume Cycle 1 slots (0.5 * 350 = 175 each -> 700), Lesson 5 consumes Cycle 2 slot 5 (1.0 * 350 = 350) -> Total = 1050
      expect(calc!.sessionDetails![0].lessonAmount).toBeCloseTo(175, 0.01);
      expect(calc!.sessionDetails![2].lessonAmount).toBeCloseTo(175, 0.01);
      expect(calc!.sessionDetails![3].lessonAmount).toBeCloseTo(175, 0.01);
      expect(calc!.sessionDetails![4].lessonAmount).toBeCloseTo(350, 0.01);
      expect(calc!.grossAmount).toBeCloseTo(1050, 0.01);
    });

    test("DP-17: Formation 2-month cycle split uses DISCOUNTED level price and 50% cap cleanly", async () => {
      const branch = { id: 1, name: "Centre" };
      // Formation Level: 20,000 DZD base, student has 25% DISCOUNTED -> 15,000 DZD effective fee.
      // Student pays 10,000 DZD in Month 1 (Oct). Half cap = 7,500 DZD. Teacher rate = 50%.
      const fClass = {
        id: 90,
        name: "Anglais A1",
        pricePerCycle: 20000,
        isFormation: true,
        branchId: 1,
        branch,
        FormationLevel: { lumpSumPrice: 20000 },
        enrollments: [
          {
            studentId: "s-form-disc",
            status: "ACTIVE",
            payerStatus: "DISCOUNTED",
            discountType: "PERCENT",
            discountValue: 25,
            student: { id: "s-form-disc", name: "Amira" },
          },
        ],
      };

      const fLessons = [
        { id: 9001, classId: 90, startsAt: new Date("2026-10-03T10:00:00Z"), isTeacherAbsent: false, isFree: false },
      ];
      const fVouchers = [
        {
          id: 991,
          studentId: "s-form-disc",
          classId: 90,
          paymentType: "FORMATION",
          amount: 10000,
          issuedAt: new Date("2026-10-03T09:00:00Z"),
          isVoided: false,
          isRefund: false,
          appliedPayerStatus: "DISCOUNTED",
          baseCyclePrice: 20000,
          effectiveCyclePrice: 15000,
          effectiveSessionPrice: 15000,
          teacherPayWeight: 0.75,
          refunds: [],
        },
      ];

      // Month 1 (Oct 2026): Capped at 7,500 DZD -> Teacher 3,750 / School 3,750
      const calcMonth1 = await computeTeacherPayrollFromData({
        startDate: new Date("2026-10-01T00:00:00Z"),
        endDate: new Date("2026-10-31T23:59:59Z"),
        groupFilter: "formation",
        teacher: {
          id: "t-form",
          name: "Prof Sara",
          TeacherPayRate: [{ effectiveFrom: new Date("2026-01-01"), ratePerSession: null, fixedMonthly: null, percentageOfSessionFee: 50 }],
          TeacherBranch: [],
          teacherClassRates: [],
        },
        lessons: [],
        teacherClasses: [{ id: 90, isFormation: true }],
        salaryAdvancesList: [],
        photocopyChargesList: [],
        catchUpVisitors: [],
        catchUpsForMissedLessons: [],
        bookVouchers: [],
        formationClasses: [fClass],
        prefetchedFormationData: [fLessons, fVouchers],
        classHistoryMap: new Map(),
        lessonByIdMap: new Map(),
      });

      expect(calcMonth1!.formationStudentBreakdown!.length).toBe(1);
      expect(calcMonth1!.formationStudentBreakdown![0].totalLevelPrice).toBe(15000);
      expect(calcMonth1!.formationStudentBreakdown![0].cycleRecognizedBase).toBe(7500);
      expect(calcMonth1!.grossAmount).toBe(3750);
      expect(calcMonth1!.schoolGrossAmount).toBe(3750);

      // Month 2 (Nov 2026): Remaining 2,500 DZD out of the 10,000 paid -> Teacher 1,250 / School 1,250
      const calcMonth2 = await computeTeacherPayrollFromData({
        startDate: new Date("2026-11-01T00:00:00Z"),
        endDate: new Date("2026-11-30T23:59:59Z"),
        groupFilter: "formation",
        teacher: {
          id: "t-form",
          name: "Prof Sara",
          TeacherPayRate: [{ effectiveFrom: new Date("2026-01-01"), ratePerSession: null, fixedMonthly: null, percentageOfSessionFee: 50 }],
          TeacherBranch: [],
          teacherClassRates: [],
        },
        lessons: [],
        teacherClasses: [{ id: 90, isFormation: true }],
        salaryAdvancesList: [],
        photocopyChargesList: [],
        catchUpVisitors: [],
        catchUpsForMissedLessons: [],
        bookVouchers: [],
        formationClasses: [fClass],
        prefetchedFormationData: [fLessons, fVouchers],
        classHistoryMap: new Map(),
        lessonByIdMap: new Map(),
      });

      expect(calcMonth2!.formationStudentBreakdown![0].cycleNumber).toBe(2);
      expect(calcMonth2!.formationStudentBreakdown![0].cycleRecognizedBase).toBe(2500);
      expect(calcMonth2!.grossAmount).toBe(1250);
      expect(calcMonth2!.schoolGrossAmount).toBe(1250);
    });

    test("DP-18: Retroactive held trailing absence unlocks in Month 2 using original voucher snapshot weight", async () => {
      const branch = { id: 1, name: "Centre" };
      const oct1 = new Date("2026-10-05T10:00:00Z");
      const oct2 = new Date("2026-10-26T10:00:00Z");
      const novSwitch = new Date("2026-11-01T00:00:00Z");
      const nov1 = new Date("2026-11-02T10:00:00Z");

      const enrollments = [
        {
          studentId: "s-retro",
          status: "ACTIVE",
          payerStatus: "NORMAL",
          creditResetOffset: 0,
          transfersFrom: [],
          transfersTo: [],
          payerHistory: [
            { id: 1, payerStatus: "DISCOUNTED", discountType: "PERCENT", discountValue: 50, effectiveFrom: new Date("2026-10-01T00:00:00Z"), effectiveTo: novSwitch },
            { id: 2, payerStatus: "NORMAL", effectiveFrom: novSwitch, effectiveTo: null },
          ],
        },
      ];

      const classObj = {
        id: 52,
        name: "Chimie 3AS",
        pricePerCycle: 2000,
        isFormation: false,
        branchId: 1,
        branch,
        enrollments,
      };

      // Paid 1000 DZD while DISCOUNTED 50% (slots 1..4 w=0.5, 250 DZD/ses, teacher 70% = 175 DZD/ses)
      const vouchers = [
        {
          id: 521,
          studentId: "s-retro",
          classId: 52,
          paymentType: "TUITION_4SESSION",
          amount: 1000,
          issuedAt: oct1,
          isVoided: false,
          isRefund: false,
          appliedPayerStatus: "DISCOUNTED",
          effectiveSessionPrice: 250,
          teacherPayWeight: 0.5,
          refunds: [],
        },
      ];

      const allAttendances = [
        { lessonId: 5201, studentId: "s-retro", status: "PRESENT" },
        { lessonId: 5202, studentId: "s-retro", status: "ABSENT" },
        { lessonId: 5203, studentId: "s-retro", status: "PRESENT" },
      ];

      const allLessons = [
        { id: 5201, classId: 52, branchId: 1, startsAt: oct1, isFree: false, isExtra: false, isCatchUp: false, isTeacherAbsent: false, branch, class: classObj, attendances: [allAttendances[0]], vouchers, lessonGroups: [] },
        { id: 5202, classId: 52, branchId: 1, startsAt: oct2, isFree: false, isExtra: false, isCatchUp: false, isTeacherAbsent: false, branch, class: classObj, attendances: [allAttendances[1]], vouchers, lessonGroups: [] },
        { id: 5203, classId: 52, branchId: 1, startsAt: nov1, isFree: false, isExtra: false, isCatchUp: false, isTeacherAbsent: false, branch, class: classObj, attendances: [allAttendances[2]], vouchers, lessonGroups: [] },
      ];

      const classHistoryMap = new Map([
        [
          52,
          {
            lessons: allLessons,
            attendances: allAttendances,
            catchUps: [],
            classInfo: classObj,
            vouchers,
          },
        ],
      ]);

      // November payroll unlocks oct2 retroactively (0.5 * 350 = 175) + nov1 (0.5 * 350 = 175) = 350 DZD
      const calcNov = await computeTeacherPayrollFromData({
        startDate: new Date("2026-11-01T00:00:00Z"),
        endDate: new Date("2026-11-30T23:59:59Z"),
        groupFilter: "normal",
        teacher: {
          id: "t-1",
          name: "Prof Karim",
          TeacherPayRate: [{ effectiveFrom: new Date("2026-01-01"), ratePerSession: null, fixedMonthly: null, percentageOfSessionFee: 70 }],
          TeacherBranch: [],
          teacherClassRates: [],
        },
        lessons: [allLessons[2]],
        teacherClasses: [{ id: 52, isFormation: false }],
        salaryAdvancesList: [],
        photocopyChargesList: [],
        catchUpVisitors: [],
        catchUpsForMissedLessons: [],
        bookVouchers: [],
        formationClasses: [],
        prefetchedFormationData: [[], []],
        classHistoryMap,
        lessonByIdMap: new Map(allLessons.map((l) => [l.id, l])),
      });

      expect(calcNov!.grossAmount).toBeCloseTo(350, 0.01);
      const retroRow = calcNov!.sessionDetails!.find((s) => s.isRetroactive && s.lessonId === 5202);
      expect(retroRow).toBeDefined();
      expect(retroRow!.lessonAmount).toBeCloseTo(175, 0.01);
    });

    test("DP-19: NON_PAYER -> DISCOUNTED transition pays 0 on historical NON_PAYER lessons and discounted cut afterwards", async () => {
      const branch = { id: 1, name: "Centre" };
      const oct1 = new Date("2026-10-05T10:00:00Z");
      const octSwitch = new Date("2026-10-12T00:00:00Z");
      const oct2 = new Date("2026-10-15T10:00:00Z");

      const enrollments = [
        {
          studentId: "s-np-disc",
          status: "ACTIVE",
          payerStatus: "DISCOUNTED",
          discountType: "PERCENT",
          discountValue: 50,
          creditResetOffset: 0,
          transfersFrom: [],
          transfersTo: [],
          payerHistory: [
            { id: 1, payerStatus: "NON_PAYER", effectiveFrom: new Date("2026-10-01T00:00:00Z"), effectiveTo: octSwitch },
            { id: 2, payerStatus: "DISCOUNTED", discountType: "PERCENT", discountValue: 50, effectiveFrom: octSwitch, effectiveTo: null },
          ],
        },
      ];

      const classObj = {
        id: 53,
        name: "Sciences 2AS",
        pricePerCycle: 2000,
        isFormation: false,
        branchId: 1,
        branch,
        enrollments,
      };

      const vouchers = [
        {
          id: 531,
          studentId: "s-np-disc",
          classId: 53,
          paymentType: "TUITION_4SESSION",
          amount: 1000,
          issuedAt: oct2,
          isVoided: false,
          isRefund: false,
          appliedPayerStatus: "DISCOUNTED",
          effectiveSessionPrice: 250,
          teacherPayWeight: 0.5,
          refunds: [],
        },
      ];

      const allAttendances = [
        { lessonId: 5301, studentId: "s-np-disc", status: "PRESENT" },
        { lessonId: 5302, studentId: "s-np-disc", status: "PRESENT" },
      ];

      const lessons = [
        { id: 5301, classId: 53, branchId: 1, startsAt: oct1, isFree: false, isExtra: false, isCatchUp: false, isTeacherAbsent: false, branch, class: classObj, attendances: [allAttendances[0]], vouchers, lessonGroups: [] },
        { id: 5302, classId: 53, branchId: 1, startsAt: oct2, isFree: false, isExtra: false, isCatchUp: false, isTeacherAbsent: false, branch, class: classObj, attendances: [allAttendances[1]], vouchers, lessonGroups: [] },
      ];

      const calc = await computeTeacherPayrollFromData({
        startDate,
        endDate,
        groupFilter: "normal",
        teacher: {
          id: "t-1",
          name: "Prof Karim",
          TeacherPayRate: [{ effectiveFrom: new Date("2026-01-01"), ratePerSession: null, fixedMonthly: null, percentageOfSessionFee: 70 }],
          TeacherBranch: [],
          teacherClassRates: [],
        },
        lessons,
        teacherClasses: [{ id: 53, isFormation: false }],
        salaryAdvancesList: [],
        photocopyChargesList: [],
        catchUpVisitors: [],
        catchUpsForMissedLessons: [],
        bookVouchers: [],
        formationClasses: [],
        prefetchedFormationData: [[], []],
        classHistoryMap: new Map([
          [53, { lessons, attendances: allAttendances, catchUps: [], classInfo: classObj, vouchers }],
        ]),
        lessonByIdMap: new Map(lessons.map((l) => [l.id, l])),
      });

      expect(calc!.sessionDetails![0].lessonAmount).toBe(0);
      expect(calc!.sessionDetails![1].lessonAmount).toBeCloseTo(175, 0.01);
      expect(calc!.grossAmount).toBeCloseTo(175, 0.01);
    });
  });

  await runner.runQueuedTests();
}

if (process.argv[1]?.endsWith("discounted-payment-type.test.ts")) {
  runDiscountedPaymentTypeTests().then(() => {
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
