/**
 * Core billing and payer-status calculations per Architecture §7.18.
 *
 * Statuses:
 * 1. NORMAL: Student pays full session/cycle tuition.
 * 2. NON_PAYER: Student is exempt from lesson fees (0 DZD fee).
 *    Sessions still consume credit and count in attendance/payroll normally.
 * 3. SCHOOL_FEES_ONLY: Student pays only the school's percentage share:
 *    (100% - TeacherPayRate.percentageOfSessionFee), skipping teacher's cut.
 *    Teacher payroll for the session is unaffected (teacher earns normal percentage -> 0 for SFO).
 * 4. DISCOUNTED: Owner-configured tuition discount per enrollment
 *    (PERCENT, FIXED_AMOUNT, or CUSTOM_PRICE). Teacher & school share the discount proportionally.
 */

export type DiscountType = "PERCENT" | "FIXED_AMOUNT" | "CUSTOM_PRICE";

export type StudentPayerStatus = "NORMAL" | "NON_PAYER" | "SCHOOL_FEES_ONLY" | "DISCOUNTED";

export interface EnrollmentPayerHistoryEntry {
  id?: number;
  payerStatus: string;
  discountType?: string | null;
  discountValue?: any;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
}

export interface PaidSessionSlot {
  voucherId?: number;
  unitPrice: number;
  teacherPayWeight: number;
  appliedPayerStatus: StudentPayerStatus;
  source: "VOUCHER" | "TRANSFER";
}

export interface PaidSessionSlotSchedule {
  slots: PaidSessionSlot[];
  purchasedSlots: PaidSessionSlot[];
  totalPaidTuition: number;
  crossPriceTransferAmount: number;
  samePriceTransferredSessions: number;
  purchasedSessions: number;
  transferredIn: number;
  transferredOut: number;
  unconvertedPartialCashDzd: number;
  partialTransferPaidDzd?: number;
  partialTransferRemainderDzd?: number;
  unlimitedFreeClass: boolean;
}

export interface SessionFeeCalculation {
  baseSessionFee: number;
  baseCycleFee: number;
  teacherPercentage: number;
  schoolPercentage: number;
  studentSessionFee: number;
  studentCycleFee: number;
  teacherCut: number;
  schoolCut: number;
  payerStatus: StudentPayerStatus;
  isSiblingWaived: boolean;
  siblingDiscountPercentage?: number;
  isDiscounted: boolean;
  discountType?: DiscountType | null;
  discountValue?: number | null;
  discountAmountPerCycle?: number;
  effectiveDiscountPercent?: number;
  teacherPayWeight: number;
}

export function normalizeDiscountType(discountType?: string | null): DiscountType | null {
  if (discountType === "PERCENT") return "PERCENT";
  if (discountType === "FIXED_AMOUNT") return "FIXED_AMOUNT";
  if (discountType === "CUSTOM_PRICE") return "CUSTOM_PRICE";
  return null;
}

export function normalizePayerStatus(status?: string | null): StudentPayerStatus {
  if (status === "NON_PAYER") return "NON_PAYER";
  if (status === "SCHOOL_FEES_ONLY") return "SCHOOL_FEES_ONLY";
  if (status === "DISCOUNTED") return "DISCOUNTED";
  return "NORMAL";
}

/**
 * Computes the discounted cycle/formation price given base fee and discount config.
 */
export function computeDiscountedCycleFee({
  baseCycleFee,
  discountType,
  discountValue,
}: {
  baseCycleFee: number;
  discountType?: string | null;
  discountValue?: any;
}): {
  studentCycleFee: number;
  discountAmountPerCycle: number;
  effectiveDiscountPercent: number;
  normalizedType: DiscountType | null;
  normalizedValue: number | null;
} {
  const base = Math.max(0, Number(baseCycleFee || 0));
  const normType = normalizeDiscountType(discountType);
  const parsedVal = discountValue !== undefined && discountValue !== null && discountValue !== ""
    ? Number(discountValue)
    : null;

  if (!normType || parsedVal === null || !Number.isFinite(parsedVal) || parsedVal < 0) {
    return {
      studentCycleFee: Math.round(base * 100) / 100,
      discountAmountPerCycle: 0,
      effectiveDiscountPercent: 0,
      normalizedType: normType,
      normalizedValue: parsedVal,
    };
  }

  let studentCycleFee = base;
  if (normType === "PERCENT") {
    const pct = Math.max(0, Math.min(100, parsedVal));
    studentCycleFee = Math.round(base * (1 - pct / 100) * 100) / 100;
  } else if (normType === "FIXED_AMOUNT") {
    const off = base > 0 ? Math.min(base, parsedVal) : 0;
    studentCycleFee = Math.max(0, Math.round((base - off) * 100) / 100);
  } else if (normType === "CUSTOM_PRICE") {
    const custom = base > 0 ? Math.min(base, parsedVal) : parsedVal;
    studentCycleFee = Math.max(0, Math.round(custom * 100) / 100);
  }

  const discountAmountPerCycle = Math.max(0, Math.round((base - studentCycleFee) * 100) / 100);
  const effectiveDiscountPercent =
    base > 0
      ? Math.round((discountAmountPerCycle / base) * 10000) / 100
      : studentCycleFee === 0
      ? 100
      : 0;

  return {
    studentCycleFee,
    discountAmountPerCycle,
    effectiveDiscountPercent,
    normalizedType: normType,
    normalizedValue: parsedVal,
  };
}

/**
 * Formats a concise human-readable discount badge label across French and Arabic UIs.
 */
export function formatDiscountBadgeLabel(
  discountType?: string | null,
  discountValue?: any,
  locale: "fr" | "ar" = "fr"
): string {
  const normType = normalizeDiscountType(discountType);
  const val = Number(discountValue ?? 0);
  if (!normType || !Number.isFinite(val)) {
    return locale === "ar" ? "تخفيض" : "Remise";
  }
  const currency = locale === "ar" ? "دج" : "DA";
  const formattedVal = Math.round(val).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ");
  if (normType === "PERCENT") {
    return `-${val}%`;
  }
  if (normType === "FIXED_AMOUNT") {
    return `-${formattedVal} ${currency}`;
  }
  return `${formattedVal} ${currency}`;
}

/**
 * Resolves the active payer status & discount configuration at a given lesson timestamp.
 */
export function resolvePayerPeriodAtDate(
  date: Date | string,
  payerHistory?: EnrollmentPayerHistoryEntry[] | null,
  fallbackStatus?: string | null,
  fallbackDiscountType?: string | null,
  fallbackDiscountValue?: any
): {
  payerStatus: StudentPayerStatus;
  discountType: DiscountType | null;
  discountValue: number | null;
} {
  if (!payerHistory || payerHistory.length === 0) {
    return {
      payerStatus: normalizePayerStatus(fallbackStatus),
      discountType: normalizeDiscountType(fallbackDiscountType),
      discountValue:
        fallbackDiscountValue !== undefined && fallbackDiscountValue !== null
          ? Number(fallbackDiscountValue)
          : null,
    };
  }

  const targetMs = new Date(date).getTime();
  if (!Number.isFinite(targetMs)) {
    const latest = payerHistory[payerHistory.length - 1];
    return {
      payerStatus: normalizePayerStatus(latest.payerStatus),
      discountType: normalizeDiscountType(latest.discountType),
      discountValue:
        latest.discountValue !== undefined && latest.discountValue !== null
          ? Number(latest.discountValue)
          : null,
    };
  }

  const sorted = [...payerHistory].sort((a, b) => {
    const diff = new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime();
    if (diff !== 0) return diff;
    return Number(a.id || 0) - Number(b.id || 0);
  });

  // 1. Exact half-open window [effectiveFrom, effectiveTo) match
  for (let i = sorted.length - 1; i >= 0; i--) {
    const entry = sorted[i];
    const fromMs = new Date(entry.effectiveFrom).getTime();
    const toMs = entry.effectiveTo ? new Date(entry.effectiveTo).getTime() : Infinity;
    if (targetMs >= fromMs && targetMs < toMs) {
      return {
        payerStatus: normalizePayerStatus(entry.payerStatus),
        discountType: normalizeDiscountType(entry.discountType),
        discountValue:
          entry.discountValue !== undefined && entry.discountValue !== null
            ? Number(entry.discountValue)
            : null,
      };
    }
  }

  // 2. If lesson happened before earliest recorded effectiveFrom (e.g. same-day grace window), use earliest entry
  const firstFromMs = new Date(sorted[0].effectiveFrom).getTime();
  if (targetMs < firstFromMs) {
    return {
      payerStatus: normalizePayerStatus(sorted[0].payerStatus),
      discountType: normalizeDiscountType(sorted[0].discountType),
      discountValue:
        sorted[0].discountValue !== undefined && sorted[0].discountValue !== null
          ? Number(sorted[0].discountValue)
          : null,
    };
  }

  // 3. Fallback: latest entry with effectiveFrom <= targetMs (or final entry)
  for (let i = sorted.length - 1; i >= 0; i--) {
    const entry = sorted[i];
    if (new Date(entry.effectiveFrom).getTime() <= targetMs) {
      return {
        payerStatus: normalizePayerStatus(entry.payerStatus),
        discountType: normalizeDiscountType(entry.discountType),
        discountValue:
          entry.discountValue !== undefined && entry.discountValue !== null
            ? Number(entry.discountValue)
            : null,
      };
    }
  }

  const last = sorted[sorted.length - 1];
  return {
    payerStatus: normalizePayerStatus(last.payerStatus),
    discountType: normalizeDiscountType(last.discountType),
    discountValue:
      last.discountValue !== undefined && last.discountValue !== null
        ? Number(last.discountValue)
        : null,
  };
}

/**
 * Computes the financial breakdown for a student's session and cycle tuition.
 */
/**
 * Resolves the effective sibling discount percentage after applying formation/owner-discount
 * precedence and payer-activity gating. Full 100% waivers require `isPayerActiveAndPaid`;
 * partial discounts (< 100%, e.g. 50%) stay active whenever the payer sibling is actively
 * enrolled in the class so cycle-renewal boundaries never revoke the sibling rate.
 */
function resolveEffectiveSiblingDiscountPct({
  isFormation,
  isDiscounted = false,
  siblingDiscountPercentage,
  isSiblingWaived = false,
  waivedDefaultPct = 100,
  isPayerActiveAndPaid = true,
}: {
  isFormation: boolean;
  isDiscounted?: boolean;
  siblingDiscountPercentage?: number | null;
  isSiblingWaived?: boolean;
  waivedDefaultPct?: number;
  isPayerActiveAndPaid?: boolean | null;
}): number {
  if (isFormation || isDiscounted) return 0;
  const rawPct =
    siblingDiscountPercentage !== undefined && siblingDiscountPercentage !== null
      ? Number(siblingDiscountPercentage)
      : isSiblingWaived
      ? waivedDefaultPct
      : 0;
  if (rawPct <= 0) return 0;
  if (rawPct >= 100 && !(isPayerActiveAndPaid ?? true)) return 0;
  return rawPct;
}

export function computeStudentSessionFee({
  payerStatus,
  discountType,
  discountValue,
  pricePerCycle,
  teacherPercentage,
  isSiblingWaived = false,
  siblingDiscountPercentage,
  isFormation = false,
  isPayerActiveAndPaid = true,
}: {
  payerStatus?: string | null;
  discountType?: string | null;
  discountValue?: any;
  pricePerCycle: number;
  teacherPercentage?: number | null;
  isSiblingWaived?: boolean;
  siblingDiscountPercentage?: number | null;
  isFormation?: boolean | null;
  isPayerActiveAndPaid?: boolean | null;
}): SessionFeeCalculation {
  const normStatus = normalizePayerStatus(payerStatus);
  const baseCycleFee = Math.max(0, Number(pricePerCycle || 0));
  const baseSessionFee = isFormation ? baseCycleFee : (baseCycleFee > 0 ? baseCycleFee / 4 : 0);

  // Teacher percentage (defaults to 0 if not set, capped between 0 and 100)
  const tPercent = Math.max(0, Math.min(100, Number(teacherPercentage || 0)));
  const sPercent = Math.max(0, 100 - tPercent);

  const normalTeacherCut = (baseSessionFee * tPercent) / 100;
  const schoolCut = (baseSessionFee * sPercent) / 100;

  // 1. Non-payer status: 0 student fee (§7.18)
  if (normStatus === "NON_PAYER") {
    return {
      baseSessionFee,
      baseCycleFee,
      teacherPercentage: tPercent,
      schoolPercentage: sPercent,
      studentSessionFee: 0,
      studentCycleFee: 0,
      teacherCut: 0,
      schoolCut: 0,
      payerStatus: normStatus,
      isSiblingWaived: false,
      siblingDiscountPercentage: 0,
      isDiscounted: false,
      discountType: null,
      discountValue: null,
      discountAmountPerCycle: 0,
      effectiveDiscountPercent: 0,
      teacherPayWeight: 0,
    };
  }

  // 2. Owner-configured Enrollment Discount (takes precedence over Sibling Discount to avoid double discounting)
  if (normStatus === "DISCOUNTED") {
    const disc = computeDiscountedCycleFee({
      baseCycleFee,
      discountType,
      discountValue,
    });
    const studentCycleFee = disc.studentCycleFee;
    const studentSessionFee = isFormation ? studentCycleFee : studentCycleFee / 4;
    const teacherCut = Math.round(((studentSessionFee * tPercent) / 100) * 100) / 100;
    const discSchoolCut = Math.max(0, Math.round((studentSessionFee - teacherCut) * 100) / 100);
    const teacherPayWeight =
      baseSessionFee > 0 ? Math.max(0, Math.min(1, studentSessionFee / baseSessionFee)) : 0;

    return {
      baseSessionFee,
      baseCycleFee,
      teacherPercentage: tPercent,
      schoolPercentage: sPercent,
      studentSessionFee,
      studentCycleFee,
      teacherCut,
      schoolCut: discSchoolCut,
      payerStatus: normStatus,
      isSiblingWaived: false,
      siblingDiscountPercentage: 0,
      isDiscounted: true,
      discountType: disc.normalizedType,
      discountValue: disc.normalizedValue,
      discountAmountPerCycle: disc.discountAmountPerCycle,
      effectiveDiscountPercent: disc.effectiveDiscountPercent,
      teacherPayWeight,
    };
  }

  // 3. Sibling discount (percentage discount, default 50% / half-price)
  const effectiveDiscount = resolveEffectiveSiblingDiscountPct({
    isFormation: Boolean(isFormation),
    isDiscounted: false,
    siblingDiscountPercentage,
    isSiblingWaived,
    waivedDefaultPct: 50,
    isPayerActiveAndPaid,
  });

  if (effectiveDiscount >= 100) {
    return {
      baseSessionFee,
      baseCycleFee,
      teacherPercentage: tPercent,
      schoolPercentage: sPercent,
      studentSessionFee: 0,
      studentCycleFee: 0,
      teacherCut: 0,
      schoolCut: 0,
      payerStatus: normStatus,
      isSiblingWaived: true,
      siblingDiscountPercentage: 100,
      isDiscounted: false,
      discountType: null,
      discountValue: null,
      discountAmountPerCycle: 0,
      effectiveDiscountPercent: 0,
      teacherPayWeight: 0,
    };
  }

  if (effectiveDiscount > 0) {
    const discountRate = effectiveDiscount / 100;
    const studentCycleFee = baseCycleFee * (1 - discountRate);
    const studentSessionFee = baseSessionFee * (1 - discountRate);
    // Proportional split: Teacher and school share the sibling discount proportionally
    const discountedTeacherCut = (studentSessionFee * tPercent) / 100;
    const discountedSchoolCut = (studentSessionFee * sPercent) / 100;

    return {
      baseSessionFee,
      baseCycleFee,
      teacherPercentage: tPercent,
      schoolPercentage: sPercent,
      studentSessionFee,
      studentCycleFee,
      teacherCut: discountedTeacherCut,
      schoolCut: discountedSchoolCut,
      payerStatus: normStatus,
      isSiblingWaived: false,
      siblingDiscountPercentage: effectiveDiscount,
      isDiscounted: false,
      discountType: null,
      discountValue: null,
      discountAmountPerCycle: 0,
      effectiveDiscountPercent: 0,
      teacherPayWeight: Math.max(0, Math.min(1, 1 - discountRate)),
    };
  }

  // 4. School-fees-only (§7.18):
  // Charge ONLY the school's percentage share (100% - TeacherPayRate.percentageOfSessionFee)
  // Teacher does NOT get paid for school-fees-only students
  if (normStatus === "SCHOOL_FEES_ONLY") {
    const studentSessionFee = schoolCut;
    const studentCycleFee = (baseCycleFee * sPercent) / 100;
    return {
      baseSessionFee,
      baseCycleFee,
      teacherPercentage: tPercent,
      schoolPercentage: sPercent,
      studentSessionFee,
      studentCycleFee,
      teacherCut: 0,
      schoolCut,
      payerStatus: normStatus,
      isSiblingWaived: false,
      isDiscounted: false,
      discountType: null,
      discountValue: null,
      discountAmountPerCycle: 0,
      effectiveDiscountPercent: 0,
      teacherPayWeight: 0,
    };
  }

  // 5. Normal (§7.18): Standard tuition
  return {
    baseSessionFee,
    baseCycleFee,
    teacherPercentage: tPercent,
    schoolPercentage: sPercent,
    studentSessionFee: baseSessionFee,
    studentCycleFee: baseCycleFee,
    teacherCut: normalTeacherCut,
    schoolCut,
    payerStatus: normStatus,
    isSiblingWaived: false,
    siblingDiscountPercentage: 0,
    isDiscounted: false,
    discountType: null,
    discountValue: null,
    discountAmountPerCycle: 0,
    effectiveDiscountPercent: 0,
    teacherPayWeight: 1,
  };
}

/**
 * Computes the total amount a student owes for an arbitrary number of consumed sessions.
 */
export function computeStudentOwedForSessions({
  payerStatus,
  discountType,
  discountValue,
  pricePerCycle,
  teacherPercentage,
  sessionCount,
  isSiblingWaived = false,
  siblingDiscountPercentage,
}: {
  payerStatus?: string | null;
  discountType?: string | null;
  discountValue?: any;
  pricePerCycle: number;
  teacherPercentage?: number | null;
  sessionCount: number;
  isSiblingWaived?: boolean;
  siblingDiscountPercentage?: number | null;
}): number {
  if (sessionCount <= 0) return 0;
  const { studentSessionFee } = computeStudentSessionFee({
    payerStatus,
    discountType,
    discountValue,
    pricePerCycle,
    teacherPercentage,
    isSiblingWaived,
    siblingDiscountPercentage,
  });
  return studentSessionFee * sessionCount;
}

export interface VoucherBillingSnapshot {
  appliedPayerStatus: StudentPayerStatus;
  baseCyclePrice: number;
  effectiveCyclePrice: number;
  effectiveSessionPrice: number;
  discountType: string | null;
  discountValue: number | null;
  teacherPayWeight: number;
}

/**
 * Computes the immutable billing snapshot saved onto a Voucher at issuance time
 * so future payer-type edits or discount deletions never corrupt historical credits or payroll.
 */
export function buildVoucherBillingSnapshot({
  payerStatus,
  discountType,
  discountValue,
  pricePerCycle,
  teacherPercentage,
  isFormation = false,
  isSiblingWaived = false,
  siblingDiscountPercentage,
  isPayerActiveAndPaid = true,
}: {
  payerStatus?: string | null;
  discountType?: string | null;
  discountValue?: any;
  pricePerCycle: number;
  teacherPercentage?: number | null;
  isFormation?: boolean;
  isSiblingWaived?: boolean;
  siblingDiscountPercentage?: number | null;
  isPayerActiveAndPaid?: boolean;
}): VoucherBillingSnapshot {
  const feeCalc = computeStudentSessionFee({
    payerStatus,
    discountType,
    discountValue,
    pricePerCycle,
    teacherPercentage,
    isFormation,
    isSiblingWaived,
    siblingDiscountPercentage,
    isPayerActiveAndPaid,
  });

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const round4 = (n: number) => Math.round(n * 10000) / 10000;

  let snapDiscountType: string | null = null;
  let snapDiscountValue: number | null = null;

  if (feeCalc.isDiscounted) {
    snapDiscountType = feeCalc.discountType ?? null;
    snapDiscountValue =
      feeCalc.discountValue !== undefined && feeCalc.discountValue !== null
        ? Number(feeCalc.discountValue)
        : null;
  } else if (
    feeCalc.payerStatus === "NORMAL" &&
    (feeCalc.siblingDiscountPercentage ?? 0) > 0
  ) {
    snapDiscountType = "SIBLING";
    snapDiscountValue = Number(feeCalc.siblingDiscountPercentage);
  }

  return {
    appliedPayerStatus: feeCalc.payerStatus,
    baseCyclePrice: round2(feeCalc.baseCycleFee),
    effectiveCyclePrice: round2(feeCalc.studentCycleFee),
    effectiveSessionPrice: round2(
      isFormation ? feeCalc.studentCycleFee : feeCalc.studentSessionFee
    ),
    discountType: snapDiscountType,
    discountValue: snapDiscountValue,
    teacherPayWeight: round4(feeCalc.teacherPayWeight),
  };
}

export type AttendanceClassification =
  | "PRESENT"
  | "NOT_DEFINED"
  | "CAUGHT_UP_ABSENCE"
  | "PRE_START_ABSENCE"
  | "REVISION_VISITOR"
  | "INTERLEAVED_ABSENCE"
  | "TRAILING_ABSENCE_HELD"
  | "FORFEITED_DROPOUT"
  | "TEACHER_ABSENT"
  | "SUSPENDED_ABSENCE"
  | "NON_PAYER_EXEMPT";

export interface PostRevisionEnrollmentGapInfo {
  hasPriorRevisionInGroup: boolean;
  priorRevisionCount: number;
  earliestRevisionAt: string | null;
  latestRevisionAt: string | null;
  enrolledAt: string | null;
  gapLessonIds: number[];
  gapLessonsCount: number;
}

/**
 * Computes metadata about a student's prior revision visit(s) in a group and the
 * non-billable gap lessons between their earliest revision visit and official enrollment.
 */
export function computePostRevisionEnrollmentGapInfo({
  lessons = [],
  attendances = [],
  enrolledAt = null,
}: {
  lessons?: Array<{ id: number; startsAt: Date | string; isFree?: boolean; isTeacherAbsent?: boolean }>;
  attendances?: Array<{
    lessonId: number;
    status?: string | null;
    isRevisionVisitor?: boolean | null;
    date?: Date | string | null;
    lesson?: { id?: number; startsAt?: Date | string | null; isFree?: boolean } | null;
  }>;
  enrolledAt?: Date | string | null;
}): PostRevisionEnrollmentGapInfo {
  const lessonTimeById = new Map<number, number>();
  for (const l of lessons || []) {
    const ms = new Date(l.startsAt).getTime();
    if (!isNaN(ms)) {
      lessonTimeById.set(l.id, ms);
    }
  }

  const revisionLessonIds = new Set<number>();
  const regularPresentLessonIds = new Set<number>();
  const revisionTimes: number[] = [];

  for (const a of attendances || []) {
    const lid = Number(a.lessonId ?? a.lesson?.id);
    if (a.isRevisionVisitor) {
      if (!isNaN(lid)) revisionLessonIds.add(lid);
      const rawDate = a.lesson?.startsAt ?? a.date ?? (lid ? lessonTimeById.get(lid) : undefined);
      if (rawDate !== undefined && rawDate !== null) {
        const ms = new Date(rawDate).getTime();
        if (!isNaN(ms)) revisionTimes.push(ms);
      }
    } else if (a.status === "PRESENT" && !isNaN(lid)) {
      regularPresentLessonIds.add(lid);
    }
  }

  revisionTimes.sort((a, b) => a - b);
  const enrolledMs = enrolledAt ? new Date(enrolledAt).getTime() : NaN;
  const hasValidEnrolled = !isNaN(enrolledMs);
  // 2-hour grace margin for same-day desk enrollment during an ongoing lesson
  const enrolledThresholdMs = hasValidEnrolled ? enrolledMs - 2 * 60 * 60 * 1000 : NaN;

  const priorRevisions = hasValidEnrolled
    ? revisionTimes.filter((ms) => ms < enrolledThresholdMs)
    : revisionTimes;

  if (priorRevisions.length === 0) {
    return {
      hasPriorRevisionInGroup: revisionTimes.length > 0,
      priorRevisionCount: revisionTimes.length,
      earliestRevisionAt: revisionTimes.length > 0 ? new Date(revisionTimes[0]).toISOString() : null,
      latestRevisionAt:
        revisionTimes.length > 0 ? new Date(revisionTimes[revisionTimes.length - 1]).toISOString() : null,
      enrolledAt: hasValidEnrolled ? new Date(enrolledMs).toISOString() : null,
      gapLessonIds: [],
      gapLessonsCount: 0,
    };
  }

  const earliestRevisionMs = priorRevisions[0];
  const latestRevisionMs = priorRevisions[priorRevisions.length - 1];
  const gapLessonIds: number[] = [];

  if (hasValidEnrolled) {
    for (const l of lessons || []) {
      if (l.isFree || l.isTeacherAbsent) continue;
      if (revisionLessonIds.has(l.id) || regularPresentLessonIds.has(l.id)) continue;
      const ms = new Date(l.startsAt).getTime();
      if (isNaN(ms)) continue;
      if (ms > earliestRevisionMs && ms < enrolledThresholdMs) {
        gapLessonIds.push(l.id);
      }
    }
  }

  return {
    hasPriorRevisionInGroup: true,
    priorRevisionCount: revisionTimes.length,
    earliestRevisionAt: new Date(earliestRevisionMs).toISOString(),
    latestRevisionAt: new Date(latestRevisionMs).toISOString(),
    enrolledAt: hasValidEnrolled ? new Date(enrolledMs).toISOString() : null,
    gapLessonIds,
    gapLessonsCount: gapLessonIds.length,
  };
}

export interface StudentAttendanceHistoryItem {
  lessonId: number;
  startsAt: Date;
  status: "PRESENT" | "ABSENT" | "NOT_DEFINED";
  isCatchUp: boolean;
  bothPresentAndCaughtUp?: boolean;
  classification: AttendanceClassification;
  isConsumedCredit: boolean;
  isTeacherPayable: boolean;
  isRefundable: boolean;
  isHeld: boolean;
}

/**
 * Classifies a student's full attendance history in a class according to Massinissa School rules:
 * 1. PRESENT: Consumed credit, teacher paid.
 * 2. NOT_DEFINED: Justified absence (0 credit deducted, 0 teacher pay).
 * 3. CAUGHT_UP_ABSENCE: Missed session that was caught up in the same group (0 credit deducted from missed slot, 0 teacher pay).
 * 4. PRE_START_ABSENCE: Absences in brand new group before student's first presence (0 credit, 0 teacher pay).
 * 5. INTERLEAVED_ABSENCE: Absence followed by subsequent presence (consumed credit, teacher paid, non-refundable).
 * 6. TRAILING_ABSENCE_HELD: Absence at the end with <60 calendar days elapsed (held pending, 0 teacher pay this month, refundable if student leaves).
 * 7. FORFEITED_DROPOUT: Student missed >=60 calendar days (2 months) without attending (money retained 100% by school, 0 teacher pay, non-refundable).
 * 8. TEACHER_ABSENT: Teacher marked absent for lesson (0 credit deducted, student credit untouched, 0 teacher pay).
 * 9. SUSPENDED_ABSENCE: Absence during student suspension / debt clearance period (0 teacher pay, forgiven past debts).
 * 10. NON_PAYER_EXEMPT: Lesson attended/missed while enrollment was NON_PAYER (0 credit consumed, 0 teacher pay).
 */
export function classifyStudentAttendanceHistory({
  lessons,
  attendances,
  catchUps = [],
  referenceDate = new Date(),
  creditResetOffset = 0,
  postTransferStartAfter = null,
  payerHistory = null,
  enrolledAt = null,
  revisionLessonStartsAt = null,
}: {
  lessons: Array<{ id: number; startsAt: Date | string; isFree?: boolean; isTeacherAbsent?: boolean }>;
  attendances: Array<{ lessonId: number; status: string; isRevisionVisitor?: boolean | null }>;
  catchUps?: Array<{
    missedLessonId: number;
    catchUpLessonId?: number;
    recordedAt?: Date | string;
    recordedBy?: string | null;
    isTransferCatchUp?: boolean;
  }>;
  referenceDate?: Date;
  creditResetOffset?: number;
  postTransferStartAfter?: Date | string | null;
  payerHistory?: EnrollmentPayerHistoryEntry[] | null;
  enrolledAt?: Date | string | null;
  revisionLessonStartsAt?: Array<Date | string | number> | null;
}): StudentAttendanceHistoryItem[] {
  // Sort lessons chronologically
  const sortedLessons = [...lessons]
    .filter((l) => !l.isFree)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const revisionVisitorLessonIds = new Set<number>();
  const attendanceMap = new Map<number, string>();
  attendances.forEach((a) => {
    if (a.isRevisionVisitor) {
      revisionVisitorLessonIds.add(a.lessonId);
    } else {
      attendanceMap.set(a.lessonId, a.status);
    }
  });

  // Collect timestamps of any prior revision visits so lessons in the gap between
  // a revision visit and official enrollment (`enrolledAt`) never charge the student.
  const enrolledThresholdMs =
    enrolledAt && !isNaN(new Date(enrolledAt).getTime())
      ? new Date(enrolledAt).getTime() - 2 * 60 * 60 * 1000
      : null;

  const allRevisionMs: number[] = [];
  if (revisionVisitorLessonIds.size > 0) {
    sortedLessons.forEach((l) => {
      if (revisionVisitorLessonIds.has(l.id)) {
        const ms = new Date(l.startsAt).getTime();
        if (!isNaN(ms)) allRevisionMs.push(ms);
      }
    });
  }
  if (Array.isArray(revisionLessonStartsAt)) {
    revisionLessonStartsAt.forEach((d) => {
      const ms = typeof d === "number" ? d : new Date(d).getTime();
      if (!isNaN(ms)) allRevisionMs.push(ms);
    });
  }
  const preEnrollmentRevisions =
    enrolledThresholdMs !== null
      ? allRevisionMs.filter((ms) => ms < enrolledThresholdMs)
      : [];
  const earliestPreEnrollmentRevisionMs =
    preEnrollmentRevisions.length > 0 ? Math.min(...preEnrollmentRevisions) : null;

  const isLessonInRevisionEnrollmentGap = (lessonMs: number): boolean =>
    earliestPreEnrollmentRevisionMs !== null &&
    enrolledThresholdMs !== null &&
    lessonMs >= earliestPreEnrollmentRevisionMs &&
    lessonMs < enrolledThresholdMs;

  const catchUpSet = new Set<number>();
  const transferCatchUpSet = new Set<number>();
  const missedToCatchUpMap = new Map<number, number>();
  const catchUpToMissedMap = new Map<number, number>();
  (catchUps || []).forEach((c) => {
    if (c.missedLessonId) {
      catchUpSet.add(c.missedLessonId);
      if (c.isTransferCatchUp || c.recordedBy === "transfer") {
        transferCatchUpSet.add(c.missedLessonId);
      }
      if (c.catchUpLessonId) {
        missedToCatchUpMap.set(c.missedLessonId, c.catchUpLessonId);
        catchUpToMissedMap.set(c.catchUpLessonId, c.missedLessonId);
      }
    }
  });

  const lessonIdSet = new Set(sortedLessons.map((l) => l.id));

  // If the student transferred into this group, any lesson on or after the transfer timestamp
  // (with a 2-hour grace window for a lesson already in progress when transferring at the desk)
  // immediately counts toward attendance/absence tracking without waiting for a first PRESENT.
  const transferStartThresholdMs = postTransferStartAfter
    ? new Date(postTransferStartAfter).getTime() - 2 * 60 * 60 * 1000
    : null;

  // Determine presence at each lesson (teacher absent lessons and revision visitor lessons are never treated as cycle-starting or cycle-consuming presence)
  const presenceArray: boolean[] = sortedLessons.map((l) => {
    if (l.isTeacherAbsent || revisionVisitorLessonIds.has(l.id)) return false;
    const rawStatus = attendanceMap.get(l.id);
    const hasCatchUp = catchUpSet.has(l.id);
    return rawStatus === "PRESENT" || hasCatchUp;
  });

  const firstPresenceIndex = presenceArray.findIndex((p) => p === true);
  const lastPresenceIndex = presenceArray.findLastIndex ? presenceArray.findLastIndex((p) => p === true) : (function() {
    for (let i = presenceArray.length - 1; i >= 0; i--) {
      if (presenceArray[i]) return i;
    }
    return -1;
  })();

  const lastPresenceDate =
    lastPresenceIndex >= 0
      ? new Date(sortedLessons[lastPresenceIndex].startsAt)
      : postTransferStartAfter
      ? new Date(postTransferStartAfter)
      : null;

  // Count trailing unexcused absences from lastPresenceIndex to end (excluding teacher absent lessons)
  const trailingAbsenceCount =
    lastPresenceIndex >= 0
      ? sortedLessons.slice(lastPresenceIndex + 1).filter((l) => {
          if (l.isTeacherAbsent) return false;
          const st = attendanceMap.get(l.id);
          return st === "ABSENT";
        }).length
      : sortedLessons.filter((l) => !l.isTeacherAbsent && attendanceMap.get(l.id) === "ABSENT").length;

  const daysSinceLastPresence = lastPresenceDate
    ? Math.floor((referenceDate.getTime() - lastPresenceDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Forfeited dropout is triggered strictly on 2 calendar months (60 calendar days) of absence since last presence:
  const isForfeitedDropout = lastPresenceDate !== null && daysSinceLastPresence >= 60;

  // Identify non-paid suspension absences cleared by debt clearance / creditResetOffset:
  // When an admin reinstates a student with debt clearance, creditResetOffset represents the count of
  // past unexcused absences during the suspension period whose debt was effaced.
  // Working backwards from the student's return presence (or the latest lesson if not yet returned),
  // up to `creditResetOffset` unexcused absences that occurred after the student's first presence
  // are identified as SUSPENDED_ABSENCE so that the teacher is not payable for them.
  const suspendedLessonIdSet = new Set<number>();
  if (creditResetOffset && creditResetOffset > 0) {
    let scanStartIndex = sortedLessons.length - 1;
    // If student returned after an absence gap, start scan immediately before the return presence
    for (let i = sortedLessons.length - 1; i > Math.max(0, firstPresenceIndex); i--) {
      if (presenceArray[i] && !presenceArray[i - 1]) {
        scanStartIndex = i - 1;
        break;
      }
    }

    let remaining = creditResetOffset;
    for (let i = scanStartIndex; i >= 0 && remaining > 0; i--) {
      const l = sortedLessons[i];
      if (l.isTeacherAbsent) continue;
      const rawStatus = attendanceMap.get(l.id);
      const hasCatchUp = catchUpSet.has(l.id);
      const isPresent = rawStatus === "PRESENT" || hasCatchUp;
      const isPostTransfer =
        transferStartThresholdMs !== null &&
        new Date(l.startsAt).getTime() >= transferStartThresholdMs;

      // Only evaluate lessons on or after first presence (or post-transfer start)
      if ((firstPresenceIndex !== -1 && i > firstPresenceIndex) || isPostTransfer) {
        if (!isPresent && rawStatus === "ABSENT") {
          suspendedLessonIdSet.add(l.id);
          remaining--;
        }
      }
    }
  }

  const history: StudentAttendanceHistoryItem[] = [];

  for (let i = 0; i < sortedLessons.length; i++) {
    const lesson = sortedLessons[i];
    const startsAt = new Date(lesson.startsAt);
    const rawStatus = attendanceMap.get(lesson.id) || "ABSENT";
    const hasCatchUp = catchUpSet.has(lesson.id);

    // Rule: When teacher is absent, student credits are untouched (0 credit deducted)
    // even if attendance was taken, and teacher is not paid for this lesson.
    if (lesson.isTeacherAbsent) {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: (rawStatus as any) || "ABSENT",
        isCatchUp: false,
        classification: "TEACHER_ABSENT",
        isConsumedCredit: false,
        isTeacherPayable: false,
        isRefundable: false,
        isHeld: false,
      });
      continue;
    }

    // Rule: Revision visitor attendance was already settled via its dedicated REVISION_SESSION voucher.
    // It never consumes cycle credit and never triggers subsequent absence deductions.
    if (revisionVisitorLessonIds.has(lesson.id)) {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "PRESENT",
        isCatchUp: false,
        classification: "REVISION_VISITOR",
        isConsumedCredit: false,
        isTeacherPayable: false,
        isRefundable: false,
        isHeld: false,
      });
      continue;
    }

    // Visiting student attending a catch-up in this host class from a different group (§2.12):
    // Does NOT consume credit in this host class (0 credit deducted in host class).
    // Only if they weren't regularly PRESENT as an enrolled member of this class.
    const missedLessonForVisitor = catchUpToMissedMap.get(lesson.id);
    if (missedLessonForVisitor && !lessonIdSet.has(missedLessonForVisitor) && rawStatus !== "PRESENT") {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "ABSENT",
        isCatchUp: true,
        classification: "PRE_START_ABSENCE",
        isConsumedCredit: false,
        isTeacherPayable: false,
        isRefundable: false,
        isHeld: false,
      });
      continue;
    }

    // Lessons occurring during a NON_PAYER period consume 0 credit and generate 0 teacher pay,
    // preserving clean accounting if the student later transitions to DISCOUNTED or NORMAL.
    if (payerHistory && payerHistory.length > 0) {
      const periodAtLesson = resolvePayerPeriodAtDate(startsAt, payerHistory);
      if (periodAtLesson.payerStatus === "NON_PAYER") {
        history.push({
          lessonId: lesson.id,
          startsAt,
          status: (rawStatus as any) || "ABSENT",
          isCatchUp: hasCatchUp,
          classification: "NON_PAYER_EXEMPT",
          isConsumedCredit: false,
          isTeacherPayable: false,
          isRefundable: false,
          isHeld: false,
        });
        continue;
      }
    }

    if (hasCatchUp) {
      if (transferCatchUpSet.has(lesson.id)) {
        // Transferred from another group: this attendance was completed in the source group.
        // It is displayed as a catch-up in this new group, but does NOT consume session credit
        // in this new group (the remaining balance transferred via tIn is preserved),
        // and the target group teacher is NOT paid for it.
        history.push({
          lessonId: lesson.id,
          startsAt,
          status: "PRESENT",
          isCatchUp: true,
          classification: "PRESENT",
          isConsumedCredit: false,
          isTeacherPayable: false,
          isRefundable: false,
          isHeld: false,
        });
        continue;
      }

      const cLessonId = missedToCatchUpMap.get(lesson.id);
      const isCatchUpInThisList = Boolean(cLessonId && lessonIdSet.has(cLessonId));
      const catchUpAttStatus = isCatchUpInThisList && cLessonId ? attendanceMap.get(cLessonId) : null;
      const isCatchUpAttendedInThisList = isCatchUpInThisList && catchUpAttStatus === "PRESENT";

      if (isCatchUpAttendedInThisList && rawStatus !== "PRESENT") {
        // In-group catch-up attended (and student was absent on the original lesson):
        // The catch-up lesson will consume 1 credit when its iteration runs.
        // This missed lesson is neutralized (0 credit deducted, teacher not paid twice).
        history.push({
          lessonId: lesson.id,
          startsAt,
          status: "ABSENT",
          isCatchUp: true,
          classification: "CAUGHT_UP_ABSENCE",
          isConsumedCredit: false,
          isTeacherPayable: false,
          isRefundable: false,
          isHeld: false,
        });
        continue;
      }

      // If student did an anticipatory catch-up AND ALSO attended the original lesson (rawStatus === "PRESENT"):
      // For in-group: both lesson.id and cLessonId have rawStatus === "PRESENT" in sortedLessons, so each consumes 1 credit (2 total).
      // For cross-group (!isCatchUpInThisList): lesson.id consumes 1 credit as PRESENT AND 1 extra credit for the cross-group catch-up visit (bothPresentAndCaughtUp: true => 2 total).
      if (rawStatus === "PRESENT") {
        history.push({
          lessonId: lesson.id,
          startsAt,
          status: "PRESENT",
          isCatchUp: true,
          bothPresentAndCaughtUp: !isCatchUpInThisList,
          classification: "PRESENT",
          isConsumedCredit: true,
          isTeacherPayable: true,
          isRefundable: false,
          isHeld: false,
        });
        continue;
      }

      // Standard Scenario A or B: student missed this lesson and caught it up in the other group:
      // The student consumes 1 session credit in this home class package.
      // But teacher is NOT payable on this missed lesson (teacher is paid in the attended catch-up lesson).
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "ABSENT",
        isCatchUp: true,
        classification: "CAUGHT_UP_ABSENCE",
        isConsumedCredit: true,
        isTeacherPayable: false,
        isRefundable: false,
        isHeld: false,
      });
      continue;
    }

    if (rawStatus === "NOT_DEFINED") {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "NOT_DEFINED",
        isCatchUp: false,
        classification: "NOT_DEFINED",
        isConsumedCredit: false,
        isTeacherPayable: false,
        isRefundable: false,
        isHeld: false,
      });
      continue;
    }

    if (rawStatus === "PRESENT") {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "PRESENT",
        isCatchUp: false,
        classification: "PRESENT",
        isConsumedCredit: true,
        isTeacherPayable: true,
        isRefundable: false,
        isHeld: false,
      });
      continue;
    }

    // Otherwise, rawStatus === "ABSENT"
    // 0. Lessons in the gap between a student's revision attendance and their real enrollment
    //    never charge the student (0 credit consumed, 0 teacher pay).
    if (isLessonInRevisionEnrollmentGap(startsAt.getTime())) {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "ABSENT",
        isCatchUp: false,
        classification: "PRE_START_ABSENCE",
        isConsumedCredit: false,
        isTeacherPayable: false,
        isRefundable: true,
        isHeld: false,
      });
      continue;
    }

    // 1. Check if this absence is before student's very first presence in this group
    //    (UNLESS the student transferred into this group and the lesson is on/after the transfer timestamp)
    const isPostTransferLesson =
      transferStartThresholdMs !== null && startsAt.getTime() >= transferStartThresholdMs;

    if (
      (!isPostTransferLesson && transferStartThresholdMs !== null) ||
      (!isPostTransferLesson && (firstPresenceIndex === -1 || i < firstPresenceIndex))
    ) {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "ABSENT",
        isCatchUp: false,
        classification: "PRE_START_ABSENCE",
        isConsumedCredit: false,
        isTeacherPayable: false,
        isRefundable: true,
        isHeld: false,
      });
      continue;
    }

    // 2. Check if this absence is an unpaid absence during suspension cleared by creditResetOffset
    if (suspendedLessonIdSet.has(lesson.id)) {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: (rawStatus as any) || "ABSENT",
        isCatchUp: false,
        classification: "SUSPENDED_ABSENCE",
        isConsumedCredit: true, // Retained for student balance math (neutralized by creditResetOffset)
        isTeacherPayable: false, // Non-paid absence during suspension is NEVER payable to teacher
        isRefundable: false,
        isHeld: false,
      });
      continue;
    }

    // 3. Check if student attended any subsequent lesson (regular or catch-up)
    const hasSubsequentPresence = presenceArray.slice(i + 1).some((p) => p === true);

    if (hasSubsequentPresence) {
      // Interleaved absence: confirmed consumed, teacher is paid, student cannot refund
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "ABSENT",
        isCatchUp: false,
        classification: "INTERLEAVED_ABSENCE",
        isConsumedCredit: true,
        isTeacherPayable: true,
        isRefundable: false,
        isHeld: false,
      });
      continue;
    }

    // 4. Trailing absence: check if forfeited or held
    if (isForfeitedDropout) {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "ABSENT",
        isCatchUp: false,
        classification: "FORFEITED_DROPOUT",
        isConsumedCredit: true, // Retained by school
        isTeacherPayable: false, // Teacher not paid
        isRefundable: false, // Forfeited by student
        isHeld: false,
      });
    } else {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "ABSENT",
        isCatchUp: false,
        classification: "TRAILING_ABSENCE_HELD",
        isConsumedCredit: true, // Consumes student session credit per §7.22
        isTeacherPayable: false, // Held back from this month's payroll
        isRefundable: true, // Refundable if student drops out
        isHeld: true,
      });
    }
  }

  return history;
}

/**
 * Computes the total number of consumed sessions for a student in a class.
 * Accounts for Massinissa School rules:
 * - Free lessons (isFree: true) consume 0 credit.
 * - Excused absences (NOT_DEFINED) consume 0 credit.
 * - Absences before student's very first presence in the group (PRE_START_ABSENCE) consume 0 credit.
 * - Presences and unexcused absences on/after first presence consume 1 credit each.
 */
export function computeStudentConsumedSessions({
  lessons,
  attendances,
  catchUps = [],
  payerHistory = null,
  enrolledAt = null,
}: {
  lessons: Array<{ id: number; startsAt: Date | string; isFree?: boolean }>;
  attendances: Array<{ lessonId: number; status: string; isRevisionVisitor?: boolean | null }>;
  catchUps?: Array<{
    missedLessonId: number;
    catchUpLessonId?: number;
    recordedAt?: Date | string;
    recordedBy?: string | null;
    isTransferCatchUp?: boolean;
  }>;
  payerHistory?: EnrollmentPayerHistoryEntry[] | null;
  enrolledAt?: Date | string | null;
}): number {
  const nonRevisionAttendances = (attendances || []).filter((a) => !a.isRevisionVisitor);
  if (!lessons || lessons.length === 0 || nonRevisionAttendances.length === 0) {
    const validCatchUps = (catchUps || []).filter(
      (c: any) => !c.isTransferCatchUp && c.recordedBy !== "transfer"
    );
    return validCatchUps.length;
  }
  const history = classifyStudentAttendanceHistory({
    lessons,
    attendances,
    catchUps,
    payerHistory,
    enrolledAt,
  });
  const accountedCatchUps = new Set(history.filter((h) => h.isCatchUp).map((h) => h.lessonId));
  const lessonIds = new Set(lessons.map((l) => l.id));
  let extraCatchUp = history.filter((h) => h.bothPresentAndCaughtUp).length;
  (catchUps || []).forEach((c: any) => {
    if (c.isTransferCatchUp || c.recordedBy === "transfer") {
      return;
    }
    // Visiting student attending catch-up in this host class from another group:
    // Does NOT consume credit in this host class.
    if (c.catchUpLessonId && lessonIds.has(c.catchUpLessonId) && !lessonIds.has(c.missedLessonId)) {
      return;
    }
    const missedAccounted = accountedCatchUps.has(c.missedLessonId);
    const catchUpAccounted = c.catchUpLessonId ? accountedCatchUps.has(c.catchUpLessonId) : false;
    const catchUpInLessons = c.catchUpLessonId ? lessonIds.has(c.catchUpLessonId) : false;
    if (!missedAccounted && !catchUpAccounted && !catchUpInLessons) {
      accountedCatchUps.add(c.missedLessonId);
      extraCatchUp += 1;
    }
  });
  return history.filter((h) => h.isConsumedCredit).length + extraCatchUp;
}

/**
 * Computes consumption breakdown for student cycle credit accounting.
 */
export function computeStudentCycleConsumption({
  totalPurchasedSessions,
  history,
}: {
  totalPurchasedSessions: number;
  history: StudentAttendanceHistoryItem[];
}) {
  const consumedSessions = history.filter((h) => h.isConsumedCredit).length;
  const heldSessions = history.filter((h) => h.isHeld).length;
  const forfeitedSessions = history.filter((h) => h.classification === "FORFEITED_DROPOUT").length;
  const remainingSessions = Math.max(0, totalPurchasedSessions - consumedSessions);
  // Held sessions (unresolved trailing absences where teacher was NOT paid) remain refund-eligible per Rule 5 & §7.22
  const refundableSessions = Math.min(totalPurchasedSessions, remainingSessions + heldSessions);
  const transferableSessions = refundableSessions;

  return {
    totalPurchasedSessions,
    consumedSessions,
    heldSessions,
    forfeitedSessions,
    remainingSessions,
    refundableSessions,
    transferableSessions,
  };
}

/**
 * Computes the exact refundable sessions count for a student in a cycle.
 */
export function computeStudentRefundableSessions({
  totalPurchasedSessions,
  history,
}: {
  totalPurchasedSessions: number;
  history: StudentAttendanceHistoryItem[];
}) {
  const consumedSessions = history.filter((h) => h.isConsumedCredit).length;
  const heldSessions = history.filter((h) => h.isHeld).length;
  const remainingSessions = Math.max(0, totalPurchasedSessions - consumedSessions);
  const refundableSessions = Math.min(totalPurchasedSessions, remainingSessions + heldSessions);
  const transferableSessions = refundableSessions;

  return {
    remainingSessions,
    heldSessions,
    refundableSessions,
    transferableSessions,
  };
}

/**
 * Computes the number of consecutive unexcused trailing absences for a student.
 * Breaks on PRESENT or CatchUp attendance. Passes through NOT_DEFINED.
 *
 * Rules:
 * 1. For students who have started attending (at least one PRESENT or CatchUp),
 *    consecutive trailing absences are counted backwards from the latest lesson.
 * 2. For non-starting students who have made a cycle payment (hasPaidCycle: true),
 *    they are not marked as suspended because they have prepaid credit.
 * 3. For non-starting students who only paid inscription fees (or no cycle payment, hasPaidCycle: false)
 *    and didn't show up, lessons on/after enrollment where they are absent accumulate
 *    consecutive absences toward auto-suspension (>= 4 unexcused absences).
 */
export function computeStudentConsecutiveAbsences({
  lessons,
  attendances,
  catchUps = [],
  hasPaidCycle = false,
  enrolledAt,
}: {
  lessons: Array<{ id: number; startsAt: Date | string; isFree?: boolean; isTeacherAbsent?: boolean }>;
  attendances: Array<{ lessonId: number; status: string; isRevisionVisitor?: boolean | null }>;
  catchUps?: Array<{ missedLessonId: number }>;
  hasPaidCycle?: boolean;
  enrolledAt?: Date | string | null;
}): number {
  if (!lessons || lessons.length === 0) {
    return 0;
  }
  const sortedLessons = [...lessons]
    .filter((l) => !l.isFree && !l.isTeacherAbsent)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const revisionLessonIds = new Set<number>();
  const attendanceMap = new Map<number, string>();
  (attendances || []).forEach((a) => {
    if (a.isRevisionVisitor) {
      revisionLessonIds.add(a.lessonId);
    } else {
      attendanceMap.set(a.lessonId, a.status);
    }
  });
  const catchUpSet = new Set<number>();
  (catchUps || []).forEach((c) => catchUpSet.add(c.missedLessonId));

  // If the student attended a revision before enrolling, never count gap lessons prior to enrolledAt
  const enrolledTimeMs = enrolledAt
    ? new Date(enrolledAt).getTime() - 2 * 60 * 60 * 1000
    : 0;
  const hasPriorRevision =
    enrolledTimeMs > 0 &&
    sortedLessons.some(
      (l) => revisionLessonIds.has(l.id) && new Date(l.startsAt).getTime() < enrolledTimeMs
    );

  // Determine if the student has started attending as an enrolled student in this group
  const hasStarted = sortedLessons.some((l) => {
    if (revisionLessonIds.has(l.id)) return false;
    if (hasPriorRevision && new Date(l.startsAt).getTime() < enrolledTimeMs) return false;
    const status = attendanceMap.get(l.id);
    return status === "PRESENT" || catchUpSet.has(l.id);
  });

  // Non-starting students who prepaid for a cycle are waiting to start and not marked suspended.
  // But non-starting students who ONLY paid inscription fees (hasPaidCycle: false) and didn't show up
  // accumulate consecutive absences for lessons held after enrollment.
  if (!hasStarted) {
    if (hasPaidCycle) {
      return 0;
    }

    let consecutiveAbsences = 0;
    for (let i = sortedLessons.length - 1; i >= 0; i--) {
      const l = sortedLessons[i];
      if (enrolledTimeMs > 0 && new Date(l.startsAt).getTime() < enrolledTimeMs) {
        break; // Stop at lessons held prior to student's enrollment
      }
      if (revisionLessonIds.has(l.id)) continue;
      const status = attendanceMap.get(l.id);
      if (status === "NOT_DEFINED") continue;
      if (status === "PRESENT" || catchUpSet.has(l.id)) {
        break;
      }
      // If status is "ABSENT" or past lesson without presence
      if (status === "ABSENT" || !status) {
        consecutiveAbsences++;
      }
    }
    return consecutiveAbsences;
  }

  let consecutiveAbsences = 0;
  for (let i = sortedLessons.length - 1; i >= 0; i--) {
    const l = sortedLessons[i];
    if (revisionLessonIds.has(l.id)) continue;
    if (hasPriorRevision && new Date(l.startsAt).getTime() < enrolledTimeMs) {
      break;
    }
    const status = attendanceMap.get(l.id);
    if (!status) continue;
    if (status === "NOT_DEFINED") continue;
    if (status === "PRESENT" || catchUpSet.has(l.id)) {
      break;
    }
    if (status === "ABSENT") {
      consecutiveAbsences++;
    }
  }
  return consecutiveAbsences;
}

export interface ComputeStudentCreditParams {
  pricePerCycle: number;
  isFormation?: boolean;
  payerStatus?: string | null;
  discountType?: string | null;
  discountValue?: any;
  payerHistory?: EnrollmentPayerHistoryEntry[] | null;
  siblingDiscountPercentage?: number | null;
  isSiblingWaived?: boolean;
  isPayerSiblingPaid?: boolean;
  isPayerActiveAndPaid?: boolean | null;
  teacherPercentage?: number | null;
  tuitionVouchers?: Array<{
    id?: number;
    amount?: any;
    paymentType?: string | null;
    isVoided?: boolean;
    isRefund?: boolean;
    status?: string | null;
    issuedAt?: Date | string | null;
    appliedPayerStatus?: string | null;
    baseCyclePrice?: any;
    effectiveCyclePrice?: any;
    effectiveSessionPrice?: any;
    discountType?: string | null;
    discountValue?: any;
    teacherPayWeight?: any;
    refunds?: Array<{ amount?: any; createdAt?: Date | string | null; refundedAt?: Date | string | null }>;
  }>;
  transfersIn?: Array<{
    transferredSessions: number;
    amount?: any;
    notes?: string | null;
    transferredAt?: Date | string | null;
    fromEnrollment?: any;
  }> | number;
  transfersOut?: Array<{
    transferredSessions: number;
    amount?: any;
    notes?: string | null;
    transferredAt?: Date | string | null;
    toEnrollment?: any;
    fromEnrollment?: any;
  }> | number;
  creditResetOffset?: number | null;
  attendances?: Array<{
    lessonId: number;
    status: string;
    isRevisionVisitor?: boolean | null;
    lesson?: { id: number; startsAt?: Date | string; isFree?: boolean; isTeacherAbsent?: boolean } | null;
  }>;
  lessons?: Array<{ id: number; startsAt: Date | string; isFree?: boolean; isTeacherAbsent?: boolean }>;
  catchUps?: Array<{
    missedLessonId: number;
    catchUpLessonId?: number;
    recordedAt?: Date | string;
    recordedBy?: string;
    isTransferCatchUp?: boolean;
    missedLesson?: any;
    catchUpLesson?: any;
  }>;
  payerRemainingCredit?: number | null;
  enrolledAt?: Date | string | null;
  enrollmentStatus?: string | null;
}

export interface StudentCreditResult {
  purchasedSessions: number;
  transferredIn: number;
  transferredOut: number;
  attendedSessions: number;
  creditResetOffset: number;
  netSessions: number;
  effectiveLessonPrice: number;
  effectiveCycleFee: number;
  cycleRemainingFee: number;
  totalPaidTuition: number;
  netRefundableSessions: number;
  refundableSessions: number;
  transferableSessions: number;
  openEndedHeldSessions: number;
  refundableAmount: number;
  partialTransferPaidDzd?: number;
  partialTransferRemainderDzd?: number;
  isFormation: boolean;
  isNonPayer: boolean;
  isSiblingWaived: boolean;
  isSchoolFeesOnly: boolean;
  isDiscounted: boolean;
  discountType?: DiscountType | null;
  discountValue?: number | null;
  isZeroFeeDiscount: boolean;
  teacherPayWeight: number;
  slotSchedule: PaidSessionSlotSchedule;
  status: "PAID" | "EXPIRING" | "UNPAID" | "SIBLING_WAIVED" | "NON_PAYER";
}

export interface InscriptionStatusResult {
  status: "PAID" | "WAIVED_3GROUPS" | "WAIVED_OWNER" | "WAIVED_NON_PAYER" | "UNPAID";
  isInscriptionPaid: boolean;
  isInscriptionWaived: boolean;
  isTransferred: boolean;
  fromClassName?: string;
  totalPaid: number;
}

/**
 * Computes enrollment inscription fee status with transfer awareness and 3-groups exemption verification.
 * Prevents phantom waivers on transferred enrollments while honoring genuine 3-group exemptions.
 */
export function computeEnrollmentInscriptionStatus({
  enrollment,
  classData,
  vouchers = [],
  paidInscClassIds,
  allEnrollments,
  visitedEnrollmentIds,
}: {
  enrollment?: any;
  classData: { id: number; isFormation?: boolean; inscriptionFee?: any };
  vouchers?: any[];
  paidInscClassIds: Set<number>;
  allEnrollments?: any[];
  visitedEnrollmentIds?: Set<number>;
}): InscriptionStatusResult {
  const visited = visitedEnrollmentIds ?? new Set<number>();
  if (enrollment?.id != null) {
    if (visited.has(enrollment.id)) {
      return {
        status: "UNPAID",
        isInscriptionPaid: false,
        isInscriptionWaived: false,
        isTransferred: false,
        totalPaid: 0,
      };
    }
    visited.add(enrollment.id);
  }

  const classId = classData.id;
  const isFormation = Boolean(classData.isFormation);

  // 1. Direct payment in this class
  let totalPaidThisClass = 0;
  const inscVouchersThisClass = (vouchers || []).filter(
    (v: any) =>
      v.paymentType === "INSCRIPTION" &&
      !v.isVoided &&
      !v.isRefund &&
      (v.classId === classId || v.class?.id === classId)
  );
  inscVouchersThisClass.forEach((v: any) => {
    const vAmount = Number(v.amount || 0);
    const vRefunded = (v.refunds || []).reduce(
      (sum: number, r: any) => sum + Number(r.amount || 0),
      0
    );
    totalPaidThisClass += Math.max(0, vAmount - vRefunded);
  });

  if (totalPaidThisClass > 0) {
    return {
      status: "PAID",
      isInscriptionPaid: true,
      isInscriptionWaived: false,
      isTransferred: false,
      totalPaid: totalPaidThisClass,
    };
  }

  // 2. Transferred payment from prior enrollment (Rule: Paid inscription transfers with seat)
  const incomingTransfers = enrollment?.transfersTo || [];
  for (const t of incomingTransfers) {
    const fromClassId = t.fromEnrollment?.classId ?? t.fromEnrollment?.class?.id;
    if (fromClassId && paidInscClassIds.has(fromClassId)) {
      const fromVouchers = (vouchers || []).filter(
        (v: any) =>
          v.paymentType === "INSCRIPTION" &&
          !v.isVoided &&
          !v.isRefund &&
          (v.classId === fromClassId || v.class?.id === fromClassId)
      );
      let fromPaid = 0;
      fromVouchers.forEach((v: any) => {
        const vAmt = Number(v.amount || 0);
        const vRef = (v.refunds || []).reduce(
          (sum: number, r: any) => sum + Number(r.amount || 0),
          0
        );
        fromPaid += Math.max(0, vAmt - vRef);
      });
      return {
        status: "PAID",
        isInscriptionPaid: true,
        isInscriptionWaived: false,
        isTransferred: true,
        fromClassName: t.fromEnrollment?.class?.name,
        totalPaid: fromPaid > 0 ? fromPaid : 1000,
      };
    }

    // Check recursive parent enrollment if allEnrollments provided
    if (allEnrollments && t.fromEnrollmentId && !visited.has(t.fromEnrollmentId)) {
      const parentEnr = allEnrollments.find((e: any) => e.id === t.fromEnrollmentId);
      if (parentEnr) {
        const parentRes = computeEnrollmentInscriptionStatus({
          enrollment: parentEnr,
          classData: {
            id: parentEnr.classId ?? parentEnr.class?.id,
            isFormation: Boolean(parentEnr.class?.isFormation),
          },
          vouchers,
          paidInscClassIds,
          allEnrollments,
          visitedEnrollmentIds: visited,
        });
        if (parentRes.isInscriptionPaid) {
          return {
            status: "PAID",
            isInscriptionPaid: true,
            isInscriptionWaived: false,
            isTransferred: true,
            fromClassName: parentRes.fromClassName || parentEnr.class?.name,
            totalPaid: parentRes.totalPaid,
          };
        }
      }
    }
  }

  // 3. Explicit owner override exemption
  if (enrollment?.feeOverriddenByOwner && !enrollment?.inscriptionFeeCharged) {
    return {
      status: "WAIVED_OWNER",
      isInscriptionPaid: false,
      isInscriptionWaived: true,
      isTransferred: false,
      totalPaid: 0,
    };
  }

  // 4. Non-payer student exemption (§7.18)
  const payerStatus = enrollment?.payerStatus || "NORMAL";
  if (payerStatus === "NON_PAYER") {
    return {
      status: "WAIVED_NON_PAYER",
      isInscriptionPaid: false,
      isInscriptionWaived: true,
      isTransferred: false,
      totalPaid: 0,
    };
  }

  // 5. 3-Group exemption rule (regular classes only)
  // Strictly applies ONLY if student has actually paid inscription in 3 distinct regular groups!
  if (!isFormation && paidInscClassIds.size >= 3) {
    return {
      status: "WAIVED_3GROUPS",
      isInscriptionPaid: false,
      isInscriptionWaived: true,
      isTransferred: false,
      totalPaid: 0,
    };
  }

  // 6. Default: UNPAID (No phantom waivers!)
  return {
    status: "UNPAID",
    isInscriptionPaid: false,
    isInscriptionWaived: false,
    isTransferred: false,
    totalPaid: 0,
  };
}

/**
 * Resolves remaining credit and active/paid status for a student whose sibling is designated payer.
 * Checks whether the payer sibling has an active enrollment and at least one paid cycle (netSessions >= 1).
 */
export function resolvePayerCredit({
  payerStudent,
  classId,
  classPricePerCycle,
  isFormation,
}: {
  payerStudent: any;
  classId?: number | null;
  classPricePerCycle?: number | null;
  isFormation?: boolean | null;
}): {
  isPayerActiveAndPaid: boolean;
  netSessions: number;
  status: "PAID" | "EXPIRING" | "UNPAID";
  hasMatchingClass: boolean;
} {
  if (!payerStudent) {
    return { isPayerActiveAndPaid: false, netSessions: 0, status: "UNPAID", hasMatchingClass: false };
  }

  const activeEnrs = (payerStudent.enrollments || []).filter(
    (e: any) => e.status === "ACTIVE" || !e.status
  );

  let hasAnyPaidActiveEnrollment = false;
  let matchingClassNetSessions = 0;
  let hasMatchingClass = false;
  let isMatchingClassPaid = false;

  for (const enr of activeEnrs) {
    const cId = enr.classId;
    const isEnrFormation = Boolean(enr.class?.isFormation || (enr.class as any)?.FormationLevel || (enr.class as any)?.formationLevelId);
    const vouchers = (payerStudent.vouchers || []).filter(
      (v: any) =>
        (v.classId === cId || v.class?.id === cId || !v.classId) &&
        !v.isVoided &&
        !v.isRefund &&
        (isEnrFormation ? v.paymentType === "FORMATION" : v.paymentType === "TUITION_4SESSION")
    );

    const atts = (payerStudent.attendances || []).filter((a: any) => {
      if (!a.lesson || a.lesson.isFree || a.isRevisionVisitor) return false;
      return (
        a.lesson.classId === cId ||
        a.lesson.lessonGroups?.some((lg: any) => lg.classId === cId)
      );
    });

    const cus = (payerStudent.catchUpAttendances || []).filter((cu: any) => {
      if (!cu.missedLesson) return false;
      return (
        cu.missedLesson.classId === cId ||
        cu.missedLesson.lessonGroups?.some((lg: any) => lg.classId === cId)
      );
    });

    const enrTeacherId = enr.class?.teacherId || enr.class?.teacher?.id;
    const enrTeacherOverride = (enr.class as any)?.teacherClassRates?.find(
      (tcr: any) => tcr.teacherId === enrTeacherId
    )?.percentage;
    const enrTeacherPercentage = enrTeacherOverride != null
      ? Number(enrTeacherOverride)
      : (enr.class?.teacher as any)?.TeacherPayRate?.[0]?.percentageOfSessionFee
        ? Number((enr.class?.teacher as any).TeacherPayRate[0].percentageOfSessionFee)
        : null;

    const metrics = computeStudentCreditAndSessions({
      pricePerCycle: Number(enr.class?.pricePerCycle || 0),
      isFormation: isEnrFormation,
      payerStatus: enr.payerStatus || payerStudent.payerStatus || "NORMAL",
      discountType: enr.discountType,
      discountValue: enr.discountValue,
      payerHistory: enr.payerHistory,
      teacherPercentage: enrTeacherPercentage,
      tuitionVouchers: vouchers,
      transfersIn: enr.transfersTo || [],
      transfersOut: enr.transfersFrom || [],
      creditResetOffset: enr.creditResetOffset || 0,
      enrolledAt: enr.enrolledAt,
      enrollmentStatus: enr.status,
      attendances: atts,
      catchUps: cus,
    });

    let isThisEnrollmentPaid = false;
    if (isEnrFormation) {
      const lumpSum = Number((enr.class as any)?.FormationLevel?.lumpSumPrice ?? enr.class?.pricePerCycle ?? 0);
      const effectiveFormationFee = computeStudentSessionFee({
        payerStatus: enr.payerStatus || payerStudent.payerStatus || "NORMAL",
        discountType: enr.discountType,
        discountValue: enr.discountValue,
        pricePerCycle: lumpSum,
        teacherPercentage: enrTeacherPercentage,
        isFormation: true,
      }).studentCycleFee;
      const paid = vouchers.reduce((sum: number, v: any) => sum + Number(v.amount || 0), 0);
      if (effectiveFormationFee <= 0 || paid >= effectiveFormationFee) {
        hasAnyPaidActiveEnrollment = true;
        isThisEnrollmentPaid = true;
      }
    } else {
      if (metrics.netSessions >= 1 || metrics.isZeroFeeDiscount) {
        hasAnyPaidActiveEnrollment = true;
        isThisEnrollmentPaid = true;
      }
    }

    if (classId && cId === classId) {
      hasMatchingClass = true;
      matchingClassNetSessions = metrics.netSessions;
      isMatchingClassPaid = isThisEnrollmentPaid;
    }
  }

  // Fallback: If no enrollments exist, check if payer has active vouchers with positive balance
  if (!hasAnyPaidActiveEnrollment && activeEnrs.length === 0) {
    const allTuitionVouchers = (payerStudent.vouchers || []).filter(
      (v: any) => v.paymentType === "TUITION_4SESSION" && !v.isVoided && !v.isRefund
    );
    if (allTuitionVouchers.length > 0) {
      hasAnyPaidActiveEnrollment = true;
    }
  }

  if (classId != null) {
    return {
      isPayerActiveAndPaid: hasMatchingClass && isMatchingClassPaid,
      netSessions: hasMatchingClass ? matchingClassNetSessions : 0,
      status: !hasMatchingClass || !isMatchingClassPaid ? "UNPAID" : "PAID",
      hasMatchingClass,
    };
  }

  return {
    isPayerActiveAndPaid: hasAnyPaidActiveEnrollment,
    netSessions: hasMatchingClass ? matchingClassNetSessions : (hasAnyPaidActiveEnrollment ? 1 : 0),
    status: hasAnyPaidActiveEnrollment ? "PAID" : "UNPAID",
    hasMatchingClass,
  };
}

/**
 * Checks if a student is eligible for sibling discount in a specific group/class.
 * Per business rules: sibling discount applies ONLY on groups where the two siblings
 * are enrolled in. If just one of them is enrolled in a group, he pays normally as a
 * normal payer even if he is the waived one.
 */
export function isSiblingDiscountEligibleInClass({
  studentId,
  classId,
  family,
  payerStudent,
  classEnrollments,
}: {
  studentId: string;
  classId: number;
  family?: { payerStudentId?: string | null; discountPercentage?: any } | null;
  payerStudent?: any;
  classEnrollments?: Array<{ studentId?: string; student?: { id: string }; status?: string | null }> | null;
}): boolean {
  if (!family?.payerStudentId || family.payerStudentId === studentId) {
    return false; // Designated payer or student with no designated payer in family pays normally
  }

  const payerId = family.payerStudentId;

  // 1. Check if payer is in classEnrollments (if available)
  if (classEnrollments && classEnrollments.length > 0) {
    return classEnrollments.some((e) => {
      const sid = e.studentId || e.student?.id;
      return sid === payerId && (e.status === "ACTIVE" || !e.status);
    });
  }

  // 2. Check if payer's active enrollments include this class (if payerStudent available)
  if (payerStudent?.enrollments && Array.isArray(payerStudent.enrollments)) {
    return payerStudent.enrollments.some((e: any) => {
      const cId = e.classId || e.class?.id;
      return cId === classId && (e.status === "ACTIVE" || !e.status);
    });
  }

  return false;
}

/**
 * Helper to extract same-teacher held trailing absences carried over via transfer.
 */
export function extractSameTeacherHeldFromTransfers(
  transfersIn?: Array<{
    notes?: string | null;
    fromEnrollment?: any;
  }> | number | null
): number {
  if (!Array.isArray(transfersIn)) return 0;
  let total = 0;
  for (const t of transfersIn) {
    const notes = String(t?.notes || "");
    const match = notes.match(/\[SAME_TEACHER_HELD:(\d+)\]/);
    if (match && match[1]) {
      total += parseInt(match[1], 10);
    }
  }
  return total;
}

/**
 * Determines if a lesson (especially a multi-group lesson) applies to a student's enrollment in a target class.
 *
 * Rules:
 * 1. Any lesson (even a merged multi-group lesson) occurring on or before a transfer-out timestamp belongs
 *    to the source group the student was enrolled in at that time.
 * 2. Lessons occurring in the target group before the student transferred in (with a 2-hour grace window for
 *    an ongoing primary lesson at the moment of transfer) do NOT belong to the post-transfer enrollment.
 * 3. If a student transfers A -> B -> A, lessons in Group A during the away window (between transferring out
 *    to B and transferring back into A) are excluded from Group A.
 */
export function isLessonApplicableToEnrollment(
  lesson: {
    id?: number;
    classId?: number;
    startsAt?: Date | string;
    hasExplicitAttendance?: boolean;
    status?: string | null;
    lessonGroups?: Array<{ classId: number }> | null;
    lesson?: {
      id?: number;
      classId?: number;
      startsAt?: Date | string;
      lessonGroups?: Array<{ classId: number }> | null;
      status?: string | null;
    };
  },
  targetClassId: number,
  enrollment?: {
    status?: string | null;
    enrolledAt?: Date | string | null;
    transferredAt?: Date | string | null;
    transferredInAt?: Date | string | null;
    transferredFromClassId?: number | null;
    transfersTo?: Array<{
      transferredAt?: Date | string | null;
      fromEnrollment?: { classId: number; class?: { id: number } } | null;
      fromEnrollmentId?: number;
    }>;
    transfersFrom?: Array<{
      transferredAt?: Date | string | null;
      toEnrollment?: { classId: number; class?: { id: number } } | null;
      toEnrollmentId?: number;
    }>;
    student?: {
      enrollments?: Array<{
        classId?: number;
        class?: { id: number };
        status?: string | null;
      }>;
    };
  } | null
): boolean {
  if (!enrollment) return true;

  const lObj = (lesson as any)?.lesson || lesson;
  const lessonTime = new Date(lObj?.startsAt || (lesson as any)?.date || 0).getTime();
  const classId = lObj?.classId !== undefined ? lObj.classId : (lesson as any)?.classId;
  const lessonGroups = lObj?.lessonGroups !== undefined ? lObj.lessonGroups : (lesson as any)?.lessonGroups;
  const isPrimaryLesson = !classId || classId === targetClassId;
  const isMultiGroupLesson =
    !isPrimaryLesson ||
    (Array.isArray(lessonGroups) &&
      lessonGroups.some((lg) => lg.classId !== targetClassId));

  const rawStatus = (lesson as any)?.status || (lObj as any)?.status || null;
  const isRevVisitor = Boolean((lesson as any)?.isRevisionVisitor || (lObj as any)?.isRevisionVisitor);
  const hasExplicitAttendance = isRevVisitor
    ? false
    : lesson.hasExplicitAttendance !== undefined
    ? Boolean(lesson.hasExplicitAttendance)
    : rawStatus === "PRESENT";
  const lessonStatus = rawStatus;

  // Collect chronological transfer-out and transfer-in timestamps for this enrollment
  const outTimes: number[] = [];
  if (Array.isArray(enrollment.transfersFrom) && enrollment.transfersFrom.length > 0) {
    for (const t of enrollment.transfersFrom) {
      if (t?.transferredAt) {
        const ms = new Date(t.transferredAt).getTime();
        if (!isNaN(ms)) outTimes.push(ms);
      }
    }
  } else if (enrollment.transferredAt) {
    const ms = new Date(enrollment.transferredAt).getTime();
    if (!isNaN(ms)) outTimes.push(ms);
  }
  outTimes.sort((a, b) => a - b);

  const inTimes: number[] = [];
  if (Array.isArray(enrollment.transfersTo) && enrollment.transfersTo.length > 0) {
    for (const t of enrollment.transfersTo) {
      if (t?.transferredAt) {
        const ms = new Date(t.transferredAt).getTime();
        if (!isNaN(ms)) inTimes.push(ms);
      }
    }
  } else if (enrollment.transferredInAt) {
    const ms = new Date(enrollment.transferredInAt).getTime();
    if (!isNaN(ms)) inTimes.push(ms);
  }
  inTimes.sort((a, b) => a - b);

  // 1. Check transfer-out windows FIRST (both final transfer-out and A -> B -> A away windows):
  for (const outTime of outTimes) {
    const returnInTime = inTimes.find((inMs) => inMs > outTime);
    if (returnInTime !== undefined) {
      // Student transferred out at outTime and later transferred back in at returnInTime:
      // Any lesson during the away gap (outTime, returnInTime) does not apply to this group.
      const returnThreshold =
        isPrimaryLesson && !isMultiGroupLesson ? returnInTime - 2 * 60 * 60 * 1000 : returnInTime;
      if (lessonTime > outTime && lessonTime < returnThreshold) {
        return false;
      }
    } else {
      // Student transferred out at outTime and has not transferred back after outTime:
      // Only treat this as a permanent transfer-out if the enrollment is actually TRANSFERRED or UNENROLLED.
      // If the enrollment is ACTIVE (e.g. partial credit transfer to another group), the student is still active!
      const isPermanentlyTransferredOut =
        enrollment.status === "TRANSFERRED" ||
        enrollment.status === "UNENROLLED" ||
        (enrollment.status !== "ACTIVE" &&
          inTimes.length > 0 &&
          inTimes.every((inMs) => inMs <= outTime));

      if (isPermanentlyTransferredOut && lessonTime > outTime) {
        return false;
      }
    }
  }

  // 2. Multi-group lesson rules:
  if (isMultiGroupLesson) {
    if (enrollment.status === "UNENROLLED" || enrollment.status === "INACTIVE") {
      return false;
    }

    // If the student was no longer active in targetClassId and had no transferOut timestamp recorded,
    // fall back to excluding multi-group lessons if status is TRANSFERRED and outTimes is empty.
    if (enrollment.status === "TRANSFERRED" && outTimes.length === 0) {
      return false;
    }

    // If the lesson's primary class is another class and the student is ALSO actively enrolled in that primary class,
    // the lesson belongs to the primary class to avoid double-charging.
    if (!isPrimaryLesson && (enrollment.status === "ACTIVE" || !enrollment.status)) {
      const isStudentActiveInPrimaryClass = enrollment.student?.enrollments?.some(
        (e: any) =>
          (e.classId === classId || e.class?.id === classId) &&
          (e.status === "ACTIVE" || !e.status)
      );
      if (isStudentActiveInPrimaryClass) {
        return false;
      }
    }
  }

  // 3. If the student entered this group via transfer (earliest transfer event is an IN event):
  //    Exclude lessons that took place before the transfer into this group.
  if (inTimes.length > 0 && (outTimes.length === 0 || inTimes[0] < outTimes[0])) {
    const firstInTime = inTimes[0];
    const enrolledAtMs = enrollment.enrolledAt ? new Date(enrollment.enrolledAt).getTime() : null;
    const isAlreadyEnrolledBeforeTransfer =
      enrolledAtMs !== null && !isNaN(enrolledAtMs) && enrolledAtMs < firstInTime - 2 * 60 * 60 * 1000;

    if (!isAlreadyEnrolledBeforeTransfer) {
      if (isMultiGroupLesson) {
        // Multi-group lesson before the transfer into targetClassId belongs to the prior group
        if (lessonTime < firstInTime) {
          return false;
        }
      } else {
        // Single-group primary lesson of targetClassId: allow 2-hour grace window or explicit PRESENT override
        if (lessonTime < firstInTime - 2 * 60 * 60 * 1000) {
          if (hasExplicitAttendance && (!lessonStatus || lessonStatus === "PRESENT")) {
            return true;
          }
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Builds an ordered FIFO schedule of paid session slots from tuition vouchers and transfers,
 * honoring per-voucher billing snapshots (`effectiveSessionPrice`, `teacherPayWeight`, `appliedPayerStatus`)
 * so future payer-status or discount changes never corrupt historical session counts or payroll weights.
 */
export function buildPaidSessionSlotSchedule({
  pricePerCycle,
  isFormation = false,
  payerStatus = "NORMAL",
  discountType,
  discountValue,
  siblingDiscountPercentage,
  isSiblingWaived = false,
  isPayerActiveAndPaid = true,
  teacherPercentage,
  tuitionVouchers = [],
  transfersIn = 0,
  transfersOut = 0,
  referenceDate,
}: {
  pricePerCycle: number;
  isFormation?: boolean;
  payerStatus?: string | null;
  discountType?: string | null;
  discountValue?: any;
  siblingDiscountPercentage?: number | null;
  isSiblingWaived?: boolean;
  isPayerActiveAndPaid?: boolean | null;
  teacherPercentage?: number | null;
  tuitionVouchers?: ComputeStudentCreditParams["tuitionVouchers"];
  transfersIn?: ComputeStudentCreditParams["transfersIn"];
  transfersOut?: ComputeStudentCreditParams["transfersOut"];
  referenceDate?: Date;
}): PaidSessionSlotSchedule {
  const isForm = Boolean(isFormation);
  const normStatus = normalizePayerStatus(payerStatus);
  const isNonPayer = normStatus === "NON_PAYER" || payerStatus === "FREE_ALL" || payerStatus === "FREE_TUITION";
  const isSchoolFeesOnly = normStatus === "SCHOOL_FEES_ONLY";
  const isDiscounted = normStatus === "DISCOUNTED";

  // Owner-configured DISCOUNTED takes precedence over automatic Sibling Discount.
  const siblingDiscountPct = resolveEffectiveSiblingDiscountPct({
    isFormation: isForm,
    isDiscounted,
    siblingDiscountPercentage,
    isSiblingWaived,
    waivedDefaultPct: 100,
    isPayerActiveAndPaid,
  });
  const isSiblingWaived100 = siblingDiscountPct >= 100;

  const cyclePrice = Math.max(0, Number(pricePerCycle || 0));
  const baseLessonPrice = cyclePrice > 0 ? cyclePrice / 4 : 0;

  const NON_CYCLE_PAYMENT_TYPES = new Set([
    "REVISION_SESSION",
    "INSCRIPTION",
    "BOOK",
    "WORKSHOP",
    "EXTRA_SESSION",
  ]);

  const validVouchers = (tuitionVouchers || [])
    .filter((v) => {
      if (v.isVoided || v.isRefund || v.status === "REFUNDED") return false;
      if (v.paymentType && NON_CYCLE_PAYMENT_TYPES.has(v.paymentType)) return false;
      if (referenceDate && v.issuedAt && new Date(v.issuedAt) > referenceDate) return false;
      return true;
    })
    .sort((a, b) => {
      const ta = a.issuedAt ? new Date(a.issuedAt).getTime() : 0;
      const tb = b.issuedAt ? new Date(b.issuedAt).getTime() : 0;
      if (ta !== tb) return ta - tb;
      return Number(a.id || 0) - Number(b.id || 0);
    });

  // Determine current enrollment rate (for transfers & un-snapshotted vouchers)
  let currentEffectiveLessonPrice = baseLessonPrice;
  let currentTeacherPayWeight = baseLessonPrice > 0 ? 1 : 0;
  let isZeroFeeDiscount = false;

  if (isNonPayer || isSiblingWaived100) {
    currentEffectiveLessonPrice = 0;
    currentTeacherPayWeight = 0;
  } else if (isDiscounted) {
    const fee = computeStudentSessionFee({
      payerStatus: "DISCOUNTED",
      discountType,
      discountValue,
      pricePerCycle: cyclePrice,
      teacherPercentage,
      isFormation: isForm,
    });
    currentEffectiveLessonPrice = isForm ? fee.studentCycleFee : fee.studentSessionFee;
    currentTeacherPayWeight = fee.teacherPayWeight;
    isZeroFeeDiscount = fee.studentCycleFee <= 0;
  } else if (isSchoolFeesOnly) {
    currentTeacherPayWeight = 0;
    if (teacherPercentage !== undefined && teacherPercentage !== null) {
      const tPercent = Math.max(0, Math.min(100, Number(teacherPercentage)));
      const sPercent = Math.max(0, 100 - tPercent);
      currentEffectiveLessonPrice = (baseLessonPrice * sPercent) / 100;
    } else {
      const firstPositiveVoucher = validVouchers.find((v) => Number(v.amount || 0) > 0);
      if (firstPositiveVoucher && Number(firstPositiveVoucher.amount) < cyclePrice) {
        currentEffectiveLessonPrice = Number(firstPositiveVoucher.amount) / 4;
      } else {
        currentEffectiveLessonPrice = baseLessonPrice;
      }
    }
  } else if (siblingDiscountPct > 0 && siblingDiscountPct < 100) {
    currentEffectiveLessonPrice = baseLessonPrice * (1 - siblingDiscountPct / 100);
    currentTeacherPayWeight = Math.max(0, Math.min(1, 1 - siblingDiscountPct / 100));
  }

  let totalPaidTuition = 0;
  let crossPriceTransferAmount = 0;
  let samePriceTransferredSessions = 0;
  let unlimitedFreeClass = cyclePrice <= 0 && !isNonPayer && !isDiscounted && !isSiblingWaived100 && !isSchoolFeesOnly;

  type FundingEvent =
    | { kind: "VOUCHER"; ts: number; order: number; voucher: NonNullable<ComputeStudentCreditParams["tuitionVouchers"]>[number] }
    | { kind: "TRANSFER_IN"; ts: number; order: number; transfer: any };

  const events: FundingEvent[] = [];
  validVouchers.forEach((v, idx) => {
    const ts = v.issuedAt ? new Date(v.issuedAt).getTime() : 0;
    events.push({ kind: "VOUCHER", ts: Number.isFinite(ts) ? ts : 0, order: idx, voucher: v });
  });

  if (typeof transfersIn === "number") {
    samePriceTransferredSessions = transfersIn;
  } else if (Array.isArray(transfersIn)) {
    transfersIn.forEach((t, idx) => {
      if (referenceDate && t?.transferredAt && new Date(t.transferredAt) > referenceDate) {
        return;
      }
      const ts = t?.transferredAt ? new Date(t.transferredAt).getTime() : 0;
      events.push({ kind: "TRANSFER_IN", ts: Number.isFinite(ts) ? ts : 0, order: 100000 + idx, transfer: t });
    });
  }

  events.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts;
    return a.order - b.order;
  });

  const cashBuckets = new Map<string, { cash: number; unitPrice: number; weight: number; status: StudentPayerStatus }>();
  const combinedSlots: PaidSessionSlot[] = [];
  const purchasedSlots: PaidSessionSlot[] = [];
  const transferInSlots: PaidSessionSlot[] = [];

  const emitSlotsFromBucket = (
    bucketKey: string,
    unitPrice: number,
    weight: number,
    status: StudentPayerStatus,
    addCash: number,
    source: "VOUCHER" | "TRANSFER",
    voucherId?: number
  ) => {
    let entry = cashBuckets.get(bucketKey);
    if (!entry) {
      entry = { cash: 0, unitPrice, weight, status };
      cashBuckets.set(bucketKey, entry);
    }
    entry.cash += addCash;
    if (unitPrice > 0) {
      const whole = Math.floor((entry.cash + 1e-6) / unitPrice);
      for (let k = 0; k < whole; k++) {
        const slot: PaidSessionSlot = {
          voucherId,
          unitPrice,
          teacherPayWeight: weight,
          appliedPayerStatus: status,
          source,
        };
        combinedSlots.push(slot);
        if (source === "VOUCHER") purchasedSlots.push(slot);
        else transferInSlots.push(slot);
      }
      entry.cash = Math.max(0, entry.cash - whole * unitPrice);
      if (entry.cash < 0.01) entry.cash = 0;
    }
  };

  if (typeof transfersIn === "number" && transfersIn > 0) {
    for (let k = 0; k < transfersIn; k++) {
      const slot: PaidSessionSlot = {
        unitPrice: currentEffectiveLessonPrice,
        teacherPayWeight: currentTeacherPayWeight,
        appliedPayerStatus: normStatus,
        source: "TRANSFER",
      };
      combinedSlots.push(slot);
      transferInSlots.push(slot);
    }
  }

  for (const ev of events) {
    if (ev.kind === "VOUCHER") {
      const v = ev.voucher;
      const vAmount = Number(v.amount || 0);
      const vRefunded = (v.refunds || []).reduce((sum, r) => {
        if (referenceDate) {
          const rDate = r.createdAt || r.refundedAt;
          if (rDate && new Date(rDate) > referenceDate) return sum;
        }
        return sum + Number(r.amount || 0);
      }, 0);
      const vNet = Math.max(0, vAmount - vRefunded);
      totalPaidTuition += vNet;

      if (isForm) continue;

      const hasSnapshot =
        v.appliedPayerStatus !== undefined && v.appliedPayerStatus !== null ||
        (v.effectiveSessionPrice !== undefined && v.effectiveSessionPrice !== null);

      let vStatus: StudentPayerStatus = normStatus;
      let vUnitPrice = currentEffectiveLessonPrice;
      let vWeight = currentTeacherPayWeight;

      if (hasSnapshot) {
        vStatus = normalizePayerStatus(v.appliedPayerStatus || normStatus);
        if (vStatus === "NON_PAYER") {
          vUnitPrice = 0;
          vWeight = 0;
        } else {
          vUnitPrice =
            v.effectiveSessionPrice !== undefined && v.effectiveSessionPrice !== null
              ? Math.max(0, Number(v.effectiveSessionPrice))
              : currentEffectiveLessonPrice;
          if (vStatus === "SCHOOL_FEES_ONLY") {
            vWeight = 0;
          } else if (v.teacherPayWeight !== undefined && v.teacherPayWeight !== null) {
            vWeight = Math.max(0, Math.min(1, Number(v.teacherPayWeight)));
          } else {
            vWeight = baseLessonPrice > 0 ? Math.max(0, Math.min(1, vUnitPrice / baseLessonPrice)) : 0;
          }
        }
      } else if (unlimitedFreeClass) {
        // Legacy class with pricePerCycle = 0: treat each paid voucher as 4 sessions
        const refundedSessions = vAmount > 0 ? Math.floor(vRefunded / (vAmount / 4)) : 0;
        const count = Math.max(0, 4 - refundedSessions);
        const fallbackPrice = vAmount > 0 ? vAmount / 4 : 0;
        for (let k = 0; k < count; k++) {
          const slot: PaidSessionSlot = {
            voucherId: v.id,
            unitPrice: fallbackPrice,
            teacherPayWeight: 1,
            appliedPayerStatus: "NORMAL",
            source: "VOUCHER",
          };
          combinedSlots.push(slot);
          purchasedSlots.push(slot);
        }
        continue;
      }

      if (vUnitPrice > 0 && vNet > 0) {
        const key = `${vUnitPrice.toFixed(2)}|${vWeight.toFixed(4)}|${vStatus}`;
        emitSlotsFromBucket(key, vUnitPrice, vWeight, vStatus, vNet, "VOUCHER", v.id);
      }
    } else {
      const t = ev.transfer;
      if (isForm) continue;
      const notes = String(t?.notes || "");
      const hasPriceDiffTag = notes.includes("[PRICE_DIFF_VIREMENT]");
      const fromCyclePrice =
        t?.fromEnrollment?.class?.pricePerCycle !== undefined &&
        t?.fromEnrollment?.class?.pricePerCycle !== null
          ? Number(t.fromEnrollment.class.pricePerCycle)
          : null;

      let fromEffectiveSessionPrice = fromCyclePrice !== null ? fromCyclePrice / 4 : null;
      if (fromCyclePrice !== null && t?.fromEnrollment?.payerStatus === "DISCOUNTED") {
        fromEffectiveSessionPrice = computeStudentSessionFee({
          payerStatus: "DISCOUNTED",
          discountType: t.fromEnrollment.discountType,
          discountValue: t.fromEnrollment.discountValue,
          pricePerCycle: fromCyclePrice,
          isFormation: false,
        }).studentSessionFee;
      }

      const isDifferentCyclePrice =
        hasPriceDiffTag ||
        (fromCyclePrice !== null &&
          fromCyclePrice > 0 &&
          cyclePrice > 0 &&
          Math.abs(fromCyclePrice - cyclePrice) >= 1) ||
        (fromEffectiveSessionPrice !== null &&
          fromEffectiveSessionPrice > 0 &&
          currentEffectiveLessonPrice > 0 &&
          Math.abs(fromEffectiveSessionPrice - currentEffectiveLessonPrice) >= 1);

      const tAmount = Number(t?.amount || 0);
      if (
        isDifferentCyclePrice &&
        tAmount > 0 &&
        currentEffectiveLessonPrice > 0 &&
        !isNonPayer &&
        !isSiblingWaived100 &&
        !isZeroFeeDiscount
      ) {
        crossPriceTransferAmount += tAmount;
        const key = `${currentEffectiveLessonPrice.toFixed(2)}|${currentTeacherPayWeight.toFixed(4)}|${normStatus}`;
        emitSlotsFromBucket(
          key,
          currentEffectiveLessonPrice,
          currentTeacherPayWeight,
          normStatus,
          tAmount,
          "TRANSFER"
        );
      } else {
        const sessions = Math.max(0, Number(t?.transferredSessions || 0));
        samePriceTransferredSessions += sessions;
        if (!isNonPayer && !isSiblingWaived100 && !isZeroFeeDiscount) {
          for (let k = 0; k < sessions; k++) {
            const slot: PaidSessionSlot = {
              unitPrice: currentEffectiveLessonPrice,
              teacherPayWeight: currentTeacherPayWeight,
              appliedPayerStatus: normStatus,
              source: "TRANSFER",
            };
            combinedSlots.push(slot);
            transferInSlots.push(slot);
          }
        }
      }
    }
  }

  const tOut =
    typeof transfersOut === "number"
      ? transfersOut
      : (transfersOut || [])
          .filter((t) => !referenceDate || !t?.transferredAt || new Date(t.transferredAt) <= referenceDate)
          .reduce((sum, t) => sum + Number(t.transferredSessions || 0), 0);

  const slotsAfterOut =
    tOut > 0 ? combinedSlots.slice(0, Math.max(0, combinedSlots.length - tOut)) : combinedSlots;

  let unconvertedPartialCashDzd = 0;
  cashBuckets.forEach((b) => {
    unconvertedPartialCashDzd += b.cash;
  });
  unconvertedPartialCashDzd = Math.round(unconvertedPartialCashDzd * 100) / 100;

  let partialTransferPaidDzd: number | undefined = undefined;
  let partialTransferRemainderDzd: number | undefined = undefined;
  if (crossPriceTransferAmount > 0 && currentEffectiveLessonPrice > 0 && !isForm && !isNonPayer && !isSiblingWaived100 && !isZeroFeeDiscount) {
    const currentKey = `${currentEffectiveLessonPrice.toFixed(2)}|${currentTeacherPayWeight.toFixed(4)}|${normStatus}`;
    const currentCarry = cashBuckets.get(currentKey)?.cash || 0;
    const effectiveCycleCost = currentEffectiveLessonPrice * 4;
    // Also check modulo of current-tier slots if partial within 4-session cycle
    const currentTierSlotCount = combinedSlots.filter(
      (s) => Math.abs(s.unitPrice - currentEffectiveLessonPrice) < 0.01
    ).length;
    const currentTierCombinedCash = currentTierSlotCount * currentEffectiveLessonPrice + currentCarry;
    if (effectiveCycleCost > 0 && currentTierCombinedCash % effectiveCycleCost !== 0) {
      const mod = currentTierCombinedCash % effectiveCycleCost;
      if (mod >= 1 && Math.abs(mod - effectiveCycleCost) >= 1) {
        partialTransferPaidDzd = Math.round(mod);
        partialTransferRemainderDzd = Math.round(effectiveCycleCost - partialTransferPaidDzd);
      }
    }
  }

  return {
    slots: slotsAfterOut,
    purchasedSlots,
    totalPaidTuition,
    crossPriceTransferAmount,
    samePriceTransferredSessions,
    purchasedSessions: purchasedSlots.length,
    transferredIn: transferInSlots.length,
    transferredOut: tOut,
    unconvertedPartialCashDzd,
    partialTransferPaidDzd,
    partialTransferRemainderDzd,
    unlimitedFreeClass,
  };
}

/**
 * Canonical calculation of student credit and lesson metrics.
 * Ensures strict, identical calculation across all pages:
 * Student Profile, Group Payments Page, Attendance Taking Page, and Dashboard.
 */
export function computeStudentCreditAndSessions({
  pricePerCycle,
  isFormation = false,
  payerStatus = "NORMAL",
  discountType,
  discountValue,
  payerHistory = null,
  siblingDiscountPercentage,
  isSiblingWaived = false,
  isPayerSiblingPaid = true,
  isPayerActiveAndPaid = true,
  teacherPercentage,
  tuitionVouchers = [],
  transfersIn = 0,
  transfersOut = 0,
  creditResetOffset = 0,
  attendances = [],
  lessons,
  catchUps = [],
  payerRemainingCredit,
  enrolledAt,
  enrollmentStatus,
}: ComputeStudentCreditParams): StudentCreditResult {
  const isForm = Boolean(isFormation);
  const normStatus = normalizePayerStatus(payerStatus);
  const isNonPayer = normStatus === "NON_PAYER" || payerStatus === "FREE_ALL" || payerStatus === "FREE_TUITION";
  const isSchoolFeesOnly = normStatus === "SCHOOL_FEES_ONLY";
  const isDiscounted = normStatus === "DISCOUNTED";

  const siblingDiscountPct = resolveEffectiveSiblingDiscountPct({
    isFormation: isForm,
    isDiscounted,
    siblingDiscountPercentage,
    isSiblingWaived,
    waivedDefaultPct: 100,
    isPayerActiveAndPaid,
  });
  const isSiblingWaived100 = siblingDiscountPct >= 100;

  const cyclePrice = Math.max(0, Number(pricePerCycle || 0));
  const feeCalc = computeStudentSessionFee({
    payerStatus: normStatus,
    discountType,
    discountValue,
    pricePerCycle: cyclePrice,
    teacherPercentage,
    isSiblingWaived: siblingDiscountPct >= 100,
    siblingDiscountPercentage: siblingDiscountPct,
    isFormation: isForm,
    isPayerActiveAndPaid,
  });

  const NON_CYCLE_TYPES = new Set([
    "REVISION_SESSION",
    "INSCRIPTION",
    "BOOK",
    "WORKSHOP",
    "EXTRA_SESSION",
  ]);

  const validVouchers = tuitionVouchers.filter(
    (v) =>
      !v.isVoided &&
      !v.isRefund &&
      v.status !== "REFUNDED" &&
      !(v.paymentType && NON_CYCLE_TYPES.has(v.paymentType))
  );

  let effectiveLessonPrice = feeCalc.baseSessionFee;
  if (isNonPayer || isSiblingWaived100) {
    effectiveLessonPrice = 0;
  } else if (isDiscounted) {
    effectiveLessonPrice = feeCalc.studentSessionFee;
  } else if (isSchoolFeesOnly) {
    if (teacherPercentage !== undefined && teacherPercentage !== null) {
      effectiveLessonPrice = feeCalc.studentSessionFee;
    } else {
      const firstPositiveVoucher = validVouchers.find((v) => Number(v.amount || 0) > 0);
      if (firstPositiveVoucher && Number(firstPositiveVoucher.amount) < cyclePrice) {
        effectiveLessonPrice = Number(firstPositiveVoucher.amount) / 4;
      } else {
        effectiveLessonPrice = feeCalc.baseSessionFee;
      }
    }
  } else if (siblingDiscountPct > 0 && siblingDiscountPct < 100) {
    effectiveLessonPrice = feeCalc.studentSessionFee;
  }

  const isZeroFeeDiscount = isDiscounted && feeCalc.studentCycleFee <= 0;

  const slotSchedule = buildPaidSessionSlotSchedule({
    pricePerCycle: cyclePrice,
    isFormation: isForm,
    payerStatus: normStatus,
    discountType,
    discountValue,
    siblingDiscountPercentage,
    isSiblingWaived,
    isPayerActiveAndPaid,
    teacherPercentage,
    tuitionVouchers,
    transfersIn,
    transfersOut,
  });

  const {
    totalPaidTuition,
    crossPriceTransferAmount,
    samePriceTransferredSessions,
    purchasedSessions,
    transferredIn: tIn,
    transferredOut: tOut,
    partialTransferPaidDzd,
    partialTransferRemainderDzd,
  } = slotSchedule;

  let latestTransferInTime: number | null = null;
  let sameTeacherHeldFromTransfers = 0;

  if (Array.isArray(transfersIn)) {
    for (const t of transfersIn) {
      if (t?.transferredAt) {
        const ms = new Date(t.transferredAt).getTime();
        if (!isNaN(ms)) {
          latestTransferInTime = latestTransferInTime === null ? ms : Math.max(latestTransferInTime, ms);
        }
      }
      const notes = String(t?.notes || "");
      const heldMatch = notes.match(/\[SAME_TEACHER_HELD:(\d+)\]/);
      if (heldMatch && heldMatch[1]) {
        sameTeacherHeldFromTransfers += parseInt(heldMatch[1], 10);
      }
    }
  }

  const inTimes: number[] = [];
  if (Array.isArray(transfersIn)) {
    for (const t of transfersIn) {
      if (t?.transferredAt) {
        const ms = new Date(t.transferredAt).getTime();
        if (!isNaN(ms)) inTimes.push(ms);
      }
    }
  }
  inTimes.sort((a, b) => a - b);

  const outTimes: number[] = [];
  if (Array.isArray(transfersOut)) {
    for (const t of transfersOut) {
      if (t?.transferredAt) {
        const ms = new Date(t.transferredAt).getTime();
        if (!isNaN(ms)) outTimes.push(ms);
      }
    }
  }
  outTimes.sort((a, b) => a - b);

  const offset = Number(creditResetOffset || 0);

  // Relevant non-free lessons where this student has an attendance record or a catch-up
  const relevantLessons: Array<{ id: number; startsAt: Date | string; isFree?: boolean; isTeacherAbsent?: boolean }> = [];
  const relevantAttendances: Array<{ lessonId: number; status: string }> = [];

  const lessonStartsLookup = new Map<number, Date | string>();
  if (lessons) {
    lessons.forEach((l) => lessonStartsLookup.set(l.id, l.startsAt));
  }

  const revisionLessonStartsAt: Array<Date | string> = [];
  const regularAttendances = attendances.filter((a) => {
    if (a.isRevisionVisitor) {
      const revDate = a.lesson?.startsAt ?? lessonStartsLookup.get(a.lessonId);
      if (revDate) revisionLessonStartsAt.push(revDate);
      return false;
    }
    return true;
  });

  const attendanceMap = new Map<number, string>();
  regularAttendances.forEach((a) => attendanceMap.set(a.lessonId, a.status));

  const catchUpSet = new Set<number>();
  const nonTransferCatchUpSet = new Set<number>();
  (catchUps || []).forEach((c) => {
    const isTransferCu = Boolean(c.isTransferCatchUp || c.recordedBy === "transfer");
    if (c.missedLessonId) {
      catchUpSet.add(c.missedLessonId);
      if (!isTransferCu) nonTransferCatchUpSet.add(c.missedLessonId);
    }
    if (c.catchUpLessonId) {
      catchUpSet.add(c.catchUpLessonId);
      if (!isTransferCu) nonTransferCatchUpSet.add(c.catchUpLessonId);
    }
  });

  const postTransferThresholdMs =
    latestTransferInTime !== null ? latestTransferInTime - 2 * 60 * 60 * 1000 : null;

  const enrolledAtMs = enrolledAt ? new Date(enrolledAt).getTime() : null;
  const hasValidEnrolledAt = enrolledAtMs !== null && !isNaN(enrolledAtMs);

  const isEntryViaTransfer =
    inTimes.length > 0 && (outTimes.length === 0 || inTimes[0] < outTimes[0]);
  const firstInThresholdMs = isEntryViaTransfer ? inTimes[0] - 2 * 60 * 60 * 1000 : null;
  const hasPriorVouchersBeforeFirstIn =
    firstInThresholdMs !== null &&
    validVouchers.some((v) => v.issuedAt && new Date(v.issuedAt).getTime() < firstInThresholdMs);
  const isAlreadyEnrolledBeforeFirstIn =
    firstInThresholdMs === null ||
    hasPriorVouchersBeforeFirstIn ||
    (hasValidEnrolledAt && enrolledAtMs! < firstInThresholdMs);

  const normEnrollmentStatus = (enrollmentStatus || "").toUpperCase();
  const fromStatus = Array.isArray(transfersOut)
    ? (transfersOut.find((t: any) => t?.fromEnrollment?.status)?.fromEnrollment?.status || "").toUpperCase()
    : "";

  const isPermanentlyTransferredOut =
    normEnrollmentStatus === "TRANSFERRED" ||
    normEnrollmentStatus === "UNENROLLED" ||
    fromStatus === "TRANSFERRED" ||
    fromStatus === "UNENROLLED" ||
    (normEnrollmentStatus !== "ACTIVE" &&
      fromStatus !== "ACTIVE" &&
      inTimes.length > 0 &&
      outTimes.length > 0 &&
      inTimes.every((inMs) => inMs <= outTimes[outTimes.length - 1]));

  const isLessonInTransferOutWindow = (ms: number): boolean => {
    for (const outTime of outTimes) {
      const returnInTime = inTimes.find((inMs) => inMs > outTime);
      if (returnInTime !== undefined) {
        if (ms > outTime && ms < returnInTime - 2 * 60 * 60 * 1000) {
          return true;
        }
      } else {
        if (isPermanentlyTransferredOut && ms > outTime) {
          return true;
        }
      }
    }
    return false;
  };

  const multiGroupLessonIds = new Set<number>();
  if (lessons) {
    lessons.forEach((l: any) => {
      if (Array.isArray(l.lessonGroups) && l.lessonGroups.length > 1) {
        multiGroupLessonIds.add(l.id);
      }
    });
  }
  attendances.forEach((a: any) => {
    if (a.lesson && Array.isArray(a.lesson.lessonGroups) && a.lesson.lessonGroups.length > 1) {
      multiGroupLessonIds.add(a.lessonId || a.lesson.id);
    }
  });

  const isExcludedByTransferWindow = (dateVal?: Date | string | null, lessonId?: number, status?: string) => {
    if (!dateVal) return false;
    const ms = new Date(dateVal).getTime();
    if (isNaN(ms)) return false;

    if (isLessonInTransferOutWindow(ms)) {
      return true;
    }

    if (postTransferThresholdMs !== null && ms < postTransferThresholdMs) {
      const effectiveMembershipStartMs = isAlreadyEnrolledBeforeFirstIn
        ? null
        : firstInThresholdMs ?? postTransferThresholdMs;

      if (effectiveMembershipStartMs !== null && ms < effectiveMembershipStartMs) {
        const resolvedStatus = status ?? (lessonId !== undefined ? attendanceMap.get(lessonId) : undefined);
        const hasRegularCu = lessonId !== undefined && nonTransferCatchUpSet.has(lessonId);
        const isMultiGroup = lessonId !== undefined && multiGroupLessonIds.has(lessonId);
        if (!isMultiGroup && (resolvedStatus === "PRESENT" || hasRegularCu)) {
          return false;
        }
        return true;
      }
    }

    return false;
  };

  if (lessons && lessons.length > 0) {
    lessons.forEach((l) => {
      if (l.isFree) return;
      if (isExcludedByTransferWindow(l.startsAt, l.id)) {
        return;
      }
      const st = attendanceMap.get(l.id);
      const hasCatchUp = catchUpSet.has(l.id);
      if (st || hasCatchUp) {
        relevantLessons.push(l);
        relevantAttendances.push({ lessonId: l.id, status: st || "ABSENT" });
      }
    });
  } else {
    const seenLessonIds = new Set<number>();
    regularAttendances.forEach((a) => {
      if (a.lesson && !a.lesson.isFree) {
        if (isExcludedByTransferWindow(a.lesson.startsAt, a.lessonId || a.lesson.id, a.status)) {
          return;
        }
        if (seenLessonIds.has(a.lesson.id)) return;
        seenLessonIds.add(a.lesson.id);
        relevantLessons.push({
          id: a.lesson.id,
          startsAt: a.lesson.startsAt || new Date(0),
          isFree: a.lesson.isFree,
          isTeacherAbsent: a.lesson.isTeacherAbsent,
        });
        relevantAttendances.push({ lessonId: a.lessonId, status: a.status });
      }
    });
    (catchUps || []).forEach((c: any) => {
      const ml = c.missedLesson;
      const mlId = c.missedLessonId;
      if (c.catchUpLessonId && seenLessonIds.has(c.catchUpLessonId) && !seenLessonIds.has(mlId)) {
        return;
      }
      if (isExcludedByTransferWindow(ml?.startsAt, mlId)) {
        return;
      }
      if (mlId && !seenLessonIds.has(mlId)) {
        seenLessonIds.add(mlId);
        relevantLessons.push({
          id: mlId,
          startsAt: ml?.startsAt || c.recordedAt || new Date(0),
          isFree: ml?.isFree || false,
          isTeacherAbsent: ml?.isTeacherAbsent || false,
        });
        relevantAttendances.push({ lessonId: mlId, status: "ABSENT" });
      }
    });
  }

  const hasAllowedPreTransferPresence =
    postTransferThresholdMs !== null &&
    relevantLessons.some((l) => {
      const ms = new Date(l.startsAt).getTime();
      if (isNaN(ms) || ms >= postTransferThresholdMs || l.isTeacherAbsent) return false;
      return attendanceMap.get(l.id) === "PRESENT" || nonTransferCatchUpSet.has(l.id);
    });

  const history =
    relevantLessons.length > 0 && relevantAttendances.length > 0
      ? classifyStudentAttendanceHistory({
          lessons: relevantLessons,
          attendances: relevantAttendances,
          catchUps,
          creditResetOffset: offset,
          postTransferStartAfter:
            !hasAllowedPreTransferPresence && latestTransferInTime
              ? new Date(latestTransferInTime)
              : null,
          payerHistory,
          enrolledAt,
          revisionLessonStartsAt,
        })
      : [];

  const accountedCatchUps = new Set(history.filter((h) => h.isCatchUp).map((h) => h.lessonId));
  const relevantLessonIds = new Set(relevantLessons.map((l) => l.id));
  let extraCatchUpConsumed = history.filter((h) => h.bothPresentAndCaughtUp).length;
  (catchUps || []).forEach((c: any) => {
    if (c.isTransferCatchUp || c.recordedBy === "transfer") {
      return;
    }
    if (c.catchUpLessonId && relevantLessonIds.has(c.catchUpLessonId) && !relevantLessonIds.has(c.missedLessonId)) {
      return;
    }
    if (isExcludedByTransferWindow(c.missedLesson?.startsAt, c.missedLessonId)) {
      return;
    }
    if (payerHistory && payerHistory.length > 0 && c.missedLesson?.startsAt) {
      const cuPeriod = resolvePayerPeriodAtDate(c.missedLesson.startsAt, payerHistory);
      if (cuPeriod.payerStatus === "NON_PAYER") return;
    }
    const missedAccounted = accountedCatchUps.has(c.missedLessonId);
    const catchUpAccounted = c.catchUpLessonId ? accountedCatchUps.has(c.catchUpLessonId) : false;
    const catchUpInLessons = c.catchUpLessonId ? relevantLessonIds.has(c.catchUpLessonId) : false;
    if (!missedAccounted && !catchUpAccounted && !catchUpInLessons) {
      accountedCatchUps.add(c.missedLessonId);
      extraCatchUpConsumed += 1;
    }
  });

  const hasPostTransferPresence = history.some(
    (h) =>
      h.isConsumedCredit &&
      (h.classification === "PRESENT" || h.classification === "CAUGHT_UP_ABSENCE") &&
      (postTransferThresholdMs === null || h.startsAt.getTime() >= postTransferThresholdMs)
  );
  const resolvedSameTeacherHeld = hasPostTransferPresence ? sameTeacherHeldFromTransfers : 0;
  const pendingSameTeacherHeld = hasPostTransferPresence ? 0 : sameTeacherHeldFromTransfers;

  const attendedSessions =
    history.filter((h) => h.isConsumedCredit).length +
    extraCatchUpConsumed +
    sameTeacherHeldFromTransfers;
  const heldSessions = history.filter((h) => h.isHeld).length + pendingSameTeacherHeld;
  const settledConsumedSessions =
    history.filter(
      (h) =>
        h.isConsumedCredit &&
        (h.classification === "PRESENT" ||
          h.classification === "INTERLEAVED_ABSENCE" ||
          h.classification === "FORFEITED_DROPOUT" ||
          h.classification === "SUSPENDED_ABSENCE" ||
          h.classification === "CAUGHT_UP_ABSENCE")
    ).length +
    extraCatchUpConsumed +
    resolvedSameTeacherHeld;

  const unheldRemainingBeforeTransfer = Math.max(0, (purchasedSessions + tIn) - attendedSessions + offset);
  const transferredExcess = Math.max(0, tOut - unheldRemainingBeforeTransfer);
  const absorbedHeldSessions = Math.min(heldSessions, transferredExcess);
  const effectiveAttendedSessions = attendedSessions - absorbedHeldSessions;

  let calculatedNetSessions = isForm ? 0 : (purchasedSessions + tIn - tOut) - effectiveAttendedSessions + offset;
  if (isNonPayer || isSiblingWaived100 || isZeroFeeDiscount) {
    calculatedNetSessions = 0;
  }
  const netSessions = calculatedNetSessions;
  const netRefundableSessions = isForm
    ? 0
    : (purchasedSessions + tIn - tOut) - settledConsumedSessions + offset;
  const refundableSessions = Math.max(0, Math.min(4, netRefundableSessions));
  const transferableSessions = isForm ? 0 : Math.max(0, netRefundableSessions);

  let refundableAmount = 0;
  if (!isForm && !isNonPayer && !isSiblingWaived100 && !isZeroFeeDiscount) {
    if (slotSchedule.slots.length > 0 || slotSchedule.unconvertedPartialCashDzd > 0) {
      const consumedHead = Math.max(0, settledConsumedSessions - offset);
      if (consumedHead <= slotSchedule.slots.length) {
        const unconsumedTailSlots = slotSchedule.slots.slice(consumedHead);
        const tailValue = unconsumedTailSlots.reduce((sum, s) => sum + s.unitPrice, 0);
        refundableAmount = Math.max(0, Math.round(tailValue + slotSchedule.unconvertedPartialCashDzd));
      } else {
        const deficit = consumedHead - slotSchedule.slots.length;
        const deficitCost = deficit * (effectiveLessonPrice > 0 ? effectiveLessonPrice : 0);
        refundableAmount = Math.max(0, Math.round(slotSchedule.unconvertedPartialCashDzd - deficitCost));
      }
    } else if (effectiveLessonPrice > 0) {
      refundableAmount = Math.max(
        0,
        Math.round(
          totalPaidTuition +
            crossPriceTransferAmount +
            (samePriceTransferredSessions - tOut - settledConsumedSessions + offset) * effectiveLessonPrice
        )
      );
    }
  }

  const effectiveCycleFee =
    !isForm && !isNonPayer && !isSiblingWaived100 && !isZeroFeeDiscount && effectiveLessonPrice > 0
      ? Math.round(effectiveLessonPrice * 4 * 100) / 100
      : 0;

  // Compute remaining money needed to complete 1 full cycle fee against the current rate tier
  let cycleRemainingFee = 0;
  if (effectiveCycleFee > 0) {
    let currentTierVoucherCash = 0;
    let historicalSlotCount = 0;

    validVouchers.forEach((v) => {
      const vAmount = Number(v.amount || 0);
      const vRefunded = (v.refunds || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const vNet = Math.max(0, vAmount - vRefunded);
      const vSnapPrice =
        v.effectiveSessionPrice !== undefined && v.effectiveSessionPrice !== null
          ? Number(v.effectiveSessionPrice)
          : effectiveLessonPrice;
      if (Math.abs(vSnapPrice - effectiveLessonPrice) < 0.01) {
        currentTierVoucherCash += vNet;
      } else if (vSnapPrice > 0) {
        historicalSlotCount += Math.floor((vNet + 1e-6) / vSnapPrice);
      }
    });

    const totalCurrentTierFunded =
      currentTierVoucherCash +
      crossPriceTransferAmount +
      samePriceTransferredSessions * effectiveLessonPrice;

    const isCycleMultiple = (val: number): boolean => {
      if (val <= 0) return true;
      const mod = val % effectiveCycleFee;
      return mod < 1 || Math.abs(mod - effectiveCycleFee) < 1;
    };

    const currentTierConsumed = Math.max(0, effectiveAttendedSessions - historicalSlotCount);

    if (tOut === 0) {
      if (totalCurrentTierFunded > 0 && !isCycleMultiple(totalCurrentTierFunded)) {
        const remainingMoneyCredit =
          totalCurrentTierFunded - currentTierConsumed * effectiveLessonPrice;
        if (remainingMoneyCredit >= effectiveCycleFee - 1 && isCycleMultiple(remainingMoneyCredit)) {
          cycleRemainingFee = 0;
        } else {
          const mod = totalCurrentTierFunded % effectiveCycleFee;
          cycleRemainingFee = Math.max(0, Math.round(effectiveCycleFee - mod));
        }
      }
    } else {
      const hasExplicitPartial =
        partialTransferRemainderDzd !== undefined ||
        validVouchers.some(
          (v) =>
            Boolean((v as any).isPartial) ||
            (Number(v.amount || 0) > 0 && Number(v.amount || 0) < effectiveCycleFee - 1)
        );
      if (hasExplicitPartial) {
        const remainingMoneyCredit = Math.max(
          0,
          totalCurrentTierFunded - (currentTierConsumed + tOut) * effectiveLessonPrice
        );
        if (remainingMoneyCredit > 0 && !isCycleMultiple(remainingMoneyCredit)) {
          const mod = remainingMoneyCredit % effectiveCycleFee;
          cycleRemainingFee = Math.max(0, Math.round(effectiveCycleFee - mod));
        }
      }
    }
  }

  let status: "PAID" | "EXPIRING" | "UNPAID" | "SIBLING_WAIVED" | "NON_PAYER" = "UNPAID";
  if (isForm) {
    status = "PAID";
  } else if (isNonPayer) {
    status = "NON_PAYER";
  } else if (isZeroFeeDiscount) {
    status = "PAID";
  } else if (isSiblingWaived100) {
    status = isPayerSiblingPaid ? "SIBLING_WAIVED" : "UNPAID";
  } else if (netSessions >= 2) {
    status = "PAID";
  } else if (netSessions === 1) {
    status = "EXPIRING";
  } else {
    status = "UNPAID";
  }

  return {
    purchasedSessions,
    transferredIn: tIn,
    transferredOut: tOut,
    attendedSessions,
    creditResetOffset: offset,
    netSessions,
    effectiveLessonPrice,
    effectiveCycleFee,
    cycleRemainingFee,
    totalPaidTuition,
    netRefundableSessions,
    refundableSessions,
    transferableSessions,
    openEndedHeldSessions: heldSessions,
    refundableAmount,
    partialTransferPaidDzd,
    partialTransferRemainderDzd,
    isFormation: isForm,
    isNonPayer,
    isSiblingWaived: isSiblingWaived100,
    isSchoolFeesOnly,
    isDiscounted,
    discountType: isDiscounted ? feeCalc.discountType : null,
    discountValue: isDiscounted ? feeCalc.discountValue : null,
    isZeroFeeDiscount,
    teacherPayWeight: feeCalc.teacherPayWeight,
    slotSchedule,
    status,
  };
}

