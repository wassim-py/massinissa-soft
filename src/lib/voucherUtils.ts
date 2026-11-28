import { Prisma } from "@prisma/client";
import {
  formatAlgiersDate,
  formatAlgiersTime,
  formatAlgiersDateTime,
  formatDZD,
} from "@/lib/algiersDate";

/**
 * Voucher Display & Formatting Utility
 *
 * Implements docs/architecture.md §1.2 & §2.3:
 * Format: "BRANCH [LEVEL] BON NUMBER (DATE)"
 *
 * - BRANCH: The branch where the payment was made (issuing branch)
 * - LEVEL: The grade/level of the student making the payment (e.g. 4AM, 1AS, BAC)
 * - BON: Literal uppercase string "BON" (or "BON REMBOURSEMENT" for refunds)
 * - NUMBER: Sequential voucher number within its series
 * - (DATE): Date of the day the payment occurred, formatted as (DD/MM/YYYY)
 *   strictly anchored to Africa/Algiers timezone without hardcoded fallback dates.
 */

export interface VoucherDisplayData {
  id?: number | string | null;
  number?: number | string | null;
  issuedAt?: Date | string | number | null;
  paymentType?: string | null;
  isRefund?: boolean | null;
  refundForVoucherId?: number | null;
  workshopId?: number | null;
  issuingBranchId?: number | null;
  targetBranchId?: number | null;
  issuingBranch?: { name?: string | null } | null;
  targetBranch?: { name?: string | null } | null;
  class?: {
    id?: number | string;
    name?: string | null;
    isFormation?: boolean | null;
    level?: { name?: string | null } | null;
    branch?: { name?: string | null } | null;
  } | null;
  lessonId?: number | null;
  lesson?: {
    id?: number | string;
    startsAt?: Date | string | number | null;
    endsAt?: Date | string | number | null;
    isExtra?: boolean | null;
  } | null;
  series?: {
    id?: number | string;
    prefix?: string | null;
    name?: string | null;
    code?: string | null;
    scope?: string | null;
    level?: { name?: string | null } | null;
    classLevel?: { name?: string | null } | null;
    issuingBranch?: { name?: string | null } | null;
    branch?: { name?: string | null } | null;
    targetBranch?: { name?: string | null } | null;
  } | null;
  student?: {
    id?: string | null;
    name?: string | null;
    registeredBranch?: { name?: string | null } | null;
    enrollments?: Array<{
      class?: {
        level?: { name?: string | null } | null;
        branch?: { name?: string | null } | null;
      } | null;
    }> | null;
  } | null;
  levelName?: string | null;
  branchName?: string | null;
  amount?: number | string | Prisma.Decimal | null;
  isVoided?: boolean | null;
  status?: string | null;
}

export interface VoucherDisplayFallbackContext {
  branchName?: string;
  branchMap?: Record<number, string>;
  levelName?: string;
  paymentType?: string;
  isWorkshop?: boolean;
  isFormation?: boolean;
  isRefund?: boolean;
}

export interface VoucherTotalsResult {
  grossAmount: number;
  refundAmount: number;
  netAmount: number;
  formattedGross: string;
  formattedRefund: string;
  formattedNet: string;
}

const BRANCH_NAME_MAP: Record<number, string> = {
  1: "ECOLE",
  2: "ANNEX",
  3: "AMPHI",
};

/**
 * Formats a payment date strictly as DD/MM/YYYY in the school's Africa/Algiers timezone.
 * Returns "" (empty string) if dateInput is missing, null, undefined, empty, or invalid.
 * Never returns a fabricated hardcoded fallback date.
 */
export function formatPaymentDate(
  dateInput?: Date | string | number | null
): string {
  return formatAlgiersDate(dateInput);
}

/**
 * Formats a payment time strictly as HH:mm in the school's Africa/Algiers timezone.
 * Returns "" (empty string) if dateInput is missing, null, undefined, empty, or invalid.
 */
export function formatPaymentTime(
  dateInput?: Date | string | number | null
): string {
  return formatAlgiersTime(dateInput);
}

/**
 * Formats date and time strictly as "DD/MM/YYYY HH:mm" in the school's Africa/Algiers timezone.
 * Returns "" (empty string) if dateInput is missing, null, undefined, empty, or invalid.
 * Never returns a fabricated hardcoded fallback date.
 */
export function formatPaymentDateTime(
  dateInput?: Date | string | number | null
): string {
  return formatAlgiersDateTime(dateInput);
}

/**
 * Formats a date into (DD/MM/YYYY) format in the school's Africa/Algiers timezone.
 * Returns "" (empty string) if dateInput is missing, null, undefined, empty, or invalid.
 * Never returns empty parentheses or a hardcoded fallback.
 */
export function formatVoucherDate(
  dateInput?: Date | string | number | null
): string {
  const formatted = formatAlgiersDate(dateInput);
  return formatted ? `(${formatted})` : "";
}

/**
 * Formats a date and time into (DD/MM/YYYY HH:mm) format in Africa/Algiers timezone.
 * Returns "" if missing, null, undefined, empty, or invalid.
 */
export function formatVoucherDateTime(
  dateInput?: Date | string | number | null
): string {
  const formatted = formatAlgiersDateTime(dateInput);
  return formatted ? `(${formatted})` : "";
}

/**
 * Resolves the branch where the payment happened (issuing branch).
 */
export function resolvePaymentBranch(
  voucher: VoucherDisplayData,
  fallbackBranchName?: string,
  branchMap?: Record<number, string>
): string {
  if (voucher.branchName?.trim()) return voucher.branchName.trim().toUpperCase();

  // 1. Explicit issuing branch name
  if (voucher.issuingBranch?.name?.trim()) {
    return voucher.issuingBranch.name.trim().toUpperCase();
  }

  // 2. Series issuing branch name / series branch name
  if (voucher.series?.issuingBranch?.name?.trim()) {
    return voucher.series.issuingBranch.name.trim().toUpperCase();
  }
  if (voucher.series?.branch?.name?.trim()) {
    return voucher.series.branch.name.trim().toUpperCase();
  }

  // 3. Issuing branch ID lookup (custom map first, then static map)
  if (voucher.issuingBranchId && branchMap?.[voucher.issuingBranchId]?.trim()) {
    return branchMap[voucher.issuingBranchId].trim().toUpperCase();
  }
  if (voucher.issuingBranchId && BRANCH_NAME_MAP[voucher.issuingBranchId]) {
    return BRANCH_NAME_MAP[voucher.issuingBranchId];
  }

  // 4. Target branch / class branch
  if (voucher.targetBranch?.name?.trim()) {
    return voucher.targetBranch.name.trim().toUpperCase();
  }
  if (voucher.class?.branch?.name?.trim()) {
    return voucher.class.branch.name.trim().toUpperCase();
  }
  if (voucher.targetBranchId && branchMap?.[voucher.targetBranchId]?.trim()) {
    return branchMap[voucher.targetBranchId].trim().toUpperCase();
  }
  if (voucher.targetBranchId && BRANCH_NAME_MAP[voucher.targetBranchId]) {
    return BRANCH_NAME_MAP[voucher.targetBranchId];
  }

  // 5. Student registered branch
  if (voucher.student?.registeredBranch?.name?.trim()) {
    return voucher.student.registeredBranch.name.trim().toUpperCase();
  }

  if (fallbackBranchName?.trim()) {
    return fallbackBranchName.trim().toUpperCase();
  }

  return "ECOLE";
}

/**
 * Resolves the level of the student making the payment.
 */
export function resolveStudentLevel(
  voucher: VoucherDisplayData,
  fallbackLevelName?: string
): string {
  if (voucher.levelName?.trim()) return voucher.levelName.trim().toUpperCase();

  // 1. Series level (e.g. 4AM)
  if (voucher.series?.level?.name?.trim()) {
    return voucher.series.level.name.trim().toUpperCase();
  }
  if (voucher.series?.classLevel?.name?.trim()) {
    return voucher.series.classLevel.name.trim().toUpperCase();
  }

  // 2. Class level
  if (voucher.class?.level?.name?.trim()) {
    return voucher.class.level.name.trim().toUpperCase();
  }

  // 3. Student's enrollment level
  if (voucher.student?.enrollments && voucher.student.enrollments.length > 0) {
    for (const enr of voucher.student.enrollments) {
      if (enr.class?.level?.name?.trim()) {
        return enr.class.level.name.trim().toUpperCase();
      }
    }
  }

  if (fallbackLevelName?.trim()) {
    return fallbackLevelName.trim().toUpperCase();
  }

  return "";
}

/**
 * Renders every voucher as "[SERIES_PREFIX | BRANCH [LEVEL|DAWARAT|FORMATION]] BON [REMBOURSEMENT] NUMBER [(DATE)]"
 * Examples:
 * - Regular school: "ANNEX 4AM BON 155 (15/05/2026)"
 * - Dawarat (Workshops): "ECOLE DAWARAT BON 15 (16/09/2026)"
 * - Formations: "ECOLE FORMATION BON 12 (16/09/2026)"
 * - Custom series prefix: "ECOLE-PRINCIPALE-SECTION-LANGUES-INTENSIVES BON 999"
 * - Arabic series prefix: "فرع 1 4متوسط BON 12"
 * - Refund: "ANNEX 4AM BON REMBOURSEMENT 155 (15/05/2026)"
 * - Missing date: "ANNEX 4AM BON 155" (no fake fallback date)
 * - Null voucher: "BON 0" (safe deterministic output)
 */
export function formatVoucherDisplay(
  voucher: VoucherDisplayData | null | undefined,
  fallbackContext?: VoucherDisplayFallbackContext
): string {
  if (!voucher) {
    const parts: string[] = [];
    if (fallbackContext?.branchName?.trim()) {
      parts.push(fallbackContext.branchName.trim().toUpperCase());
    }
    if (fallbackContext?.levelName?.trim()) {
      parts.push(fallbackContext.levelName.trim().toUpperCase());
    }
    parts.push("BON 0");
    return parts.join(" ");
  }

  // Resolve sequential voucher number
  const num =
    voucher.number !== undefined && voucher.number !== null
      ? voucher.number
      : voucher.id !== undefined && voucher.id !== null
      ? voucher.id
      : 0;

  // Resolve refund status
  const isRefund = Boolean(
    voucher.isRefund ||
      (voucher as any).status === "REFUND" ||
      fallbackContext?.isRefund
  );
  const bonKeyword = isRefund ? "BON REMBOURSEMENT" : "BON";

  // Check if series.prefix is explicitly provided and non-empty
  const rawPrefix = voucher.series?.prefix;
  const hasExplicitPrefix =
    typeof rawPrefix === "string" && rawPrefix.trim().length > 0;

  let prefixPart: string;
  if (hasExplicitPrefix) {
    prefixPart = rawPrefix!.trim();
  } else {
    const branch = resolvePaymentBranch(
      voucher,
      fallbackContext?.branchName,
      fallbackContext?.branchMap
    );

    const isDawarat =
      voucher.paymentType === "WORKSHOP" ||
      Boolean((voucher as any).workshopId) ||
      fallbackContext?.isWorkshop ||
      fallbackContext?.paymentType === "WORKSHOP";

    const isFormation =
      voucher.paymentType === "FORMATION" ||
      Boolean(voucher.class?.isFormation) ||
      fallbackContext?.isFormation ||
      fallbackContext?.paymentType === "FORMATION";

    let middleSegment = "";
    if (isDawarat) {
      middleSegment = "DAWARAT";
    } else if (isFormation) {
      middleSegment = "FORMATION";
    } else {
      middleSegment = resolveStudentLevel(voucher, fallbackContext?.levelName);
    }

    prefixPart = [branch, middleSegment].filter(Boolean).join(" ");
  }

  // Format date: only append if valid, never leak hardcoded dates or empty ()
  const formattedDate = formatPaymentDate(voucher.issuedAt);
  const dateSuffix = formattedDate ? ` (${formattedDate})` : "";

  return `${prefixPart ? `${prefixPart} ` : ""}${bonKeyword} ${num}${dateSuffix}`.trim();
}

/**
 * Calculates aggregated gross, refunds, and net totals for a collection of vouchers,
 * with deterministic localized DZD currency formatting.
 */
export function calculateVoucherTotals(
  vouchers: Array<{
    amount: number | string | Prisma.Decimal | null | undefined;
    isRefund?: boolean | null;
    isVoided?: boolean | null;
  }>,
  locale?: string
): VoucherTotalsResult {
  let gross = 0;
  let refunds = 0;

  if (Array.isArray(vouchers)) {
    for (const v of vouchers) {
      if (v.isVoided) continue;
      const amt =
        typeof v.amount === "number" ? v.amount : Number(v.amount) || 0;
      if (v.isRefund) {
        refunds += Math.abs(amt);
      } else {
        gross += amt;
      }
    }
  }

  const net = gross - refunds;
  return {
    grossAmount: gross,
    refundAmount: refunds,
    netAmount: net,
    formattedGross: formatDZD(gross, locale),
    formattedRefund: formatDZD(refunds, locale),
    formattedNet: formatDZD(net, locale),
  };
}

export const PAYMENT_TYPE_LABELS: Record<string, { ar: string; fr: string }> = {
  INSCRIPTION: { ar: "حقوق التسجيل", fr: "Frais d'inscription" },
  TUITION_4SESSION: { ar: "اشتراك دراسي", fr: "Cycle d'études (4 séances)" },
  TUITION: { ar: "الدراسة", fr: "Études" },
  BOOK: { ar: "رسوم الكتب المدرسية", fr: "Frais des livres" },
  EXTRA_SESSION: { ar: "حصة إضافية", fr: "Séance supplémentaire" },
  CATCHUP: { ar: "حصة استدراكية", fr: "Séance de rattrapage" },
  REVISION_SESSION: { ar: "حصة مراجعة (زائر)", fr: "Séance de révision (Visiteur)" },
  FORMATION: { ar: "دفع التكوين اللغوي", fr: "Formation linguistique" },
  WORKSHOP: { ar: "دفع الورشة / الدورة", fr: "Atelier / Formation courte" },
  MULTI_ITEM: { ar: "دفع مجمّع", fr: "Paiement combiné" },
};

/**
 * Returns a bilingual (Arabic / French) display label for a voucher payment type.
 */
export function getPaymentTypeLabel(
  paymentType: string | null | undefined,
  locale: string = "ar"
): string {
  if (!paymentType) return "";
  const entry = PAYMENT_TYPE_LABELS[paymentType];
  if (!entry) return paymentType;
  return locale === "ar" ? entry.ar : entry.fr;
}

export type VoucherTicketStatusInfo = {
  isVoided: boolean;
  isRefundVoucher: boolean;
  isRefunded: boolean;
  isPartiallyRefunded: boolean;
  isPartialPayment: boolean;
  totalRefunded: number;
  effectiveAmount: number;
  restToCompleteCycle: number | undefined;
};

/**
 * Resolves unified display badges (Refund, Refunded, Partially Refunded, Voided, Partial)
 * and remaining balance / 1-cycle fee completion amounts for thermal tickets.
 * Guardrail: When a voucher is PARTIALLY_REFUNDED, `voucher.remainingBalance` tracks
 * unrefunded money in DB and must NOT be treated as an unpaid tuition balance.
 */
export function resolveVoucherTicketStatus(
  voucher: any,
  options?: {
    cycleRemainingFee?: number;
    remainingBalance?: number;
    isPartial?: boolean;
  }
): VoucherTicketStatusInfo {
  const rawAmount = Number(
    voucher?.totalAmount !== undefined && voucher?.totalAmount !== null
      ? voucher.totalAmount
      : voucher?.amount ?? 0
  );
  const absAmount = Number.isFinite(rawAmount) ? Math.abs(rawAmount) : 0;
  const status = String(voucher?.status || "").toUpperCase();

  const isVoided = Boolean(voucher?.isVoided || status === "VOIDED");
  const isRefundVoucher = Boolean(voucher?.isRefund || status === "REFUND");

  const refundsArray = Array.isArray(voucher?.refunds) ? voucher.refunds : [];
  const refundsSum = refundsArray.reduce(
    (sum: number, r: any) => sum + Math.abs(Number(r?.amount || 0)),
    0
  );

  let totalRefunded = 0;
  if (!isRefundVoucher) {
    if (status === "REFUNDED") {
      totalRefunded = refundsSum > 0 ? refundsSum : absAmount;
    } else if (status === "PARTIALLY_REFUNDED") {
      if (refundsSum > 0) {
        totalRefunded = refundsSum;
      } else if (
        voucher?.remainingBalance !== null &&
        voucher?.remainingBalance !== undefined
      ) {
        totalRefunded = Math.max(
          0,
          absAmount - Math.abs(Number(voucher.remainingBalance || 0))
        );
      }
    } else if (refundsSum > 0) {
      totalRefunded = refundsSum;
    }
  }

  const isRefunded = Boolean(
    !isRefundVoucher &&
      (status === "REFUNDED" ||
        (absAmount > 0 && totalRefunded >= absAmount - 0.01 && totalRefunded > 0))
  );
  const isPartiallyRefunded = Boolean(
    !isRefundVoucher &&
      !isRefunded &&
      (status === "PARTIALLY_REFUNDED" || totalRefunded > 0)
  );

  const items = Array.isArray(voucher?.items) ? voucher.items : [];
  const paymentType = String(voucher?.paymentType || "");
  const isCycleApplicableType =
    paymentType === "TUITION_4SESSION" ||
    paymentType === "FORMATION" ||
    paymentType === "WORKSHOP" ||
    Boolean(voucher?.class?.isFormation) ||
    items.some(
      (it: any) =>
        it?.type === "TUITION_4SESSION" ||
        it?.type === "FORMATION" ||
        it?.type === "WORKSHOP"
    );

  const explicitCycleFee =
    options?.cycleRemainingFee !== undefined && options?.cycleRemainingFee !== null
      ? Number(options.cycleRemainingFee)
      : undefined;
  const explicitRemainingBalance =
    options?.remainingBalance !== undefined && options?.remainingBalance !== null
      ? Number(options.remainingBalance)
      : undefined;
  const voucherIsPartialFlag = Boolean(voucher?.isPartial);
  const optionIsPartialFlag = options?.isPartial;

  let restToCompleteCycle: number | undefined;
  if (!isVoided && !isRefundVoucher && !isRefunded) {
    if (
      explicitCycleFee !== undefined &&
      explicitCycleFee > 0 &&
      paymentType !== "REVISION_SESSION" &&
      (isCycleApplicableType ||
        voucherIsPartialFlag ||
        Boolean(optionIsPartialFlag) ||
        paymentType === "MULTI_ITEM" ||
        !paymentType)
    ) {
      restToCompleteCycle = Math.round(explicitCycleFee);
    } else if (
      !isPartiallyRefunded &&
      explicitRemainingBalance !== undefined &&
      explicitRemainingBalance > 0
    ) {
      restToCompleteCycle = Math.round(explicitRemainingBalance);
    } else if (
      !isPartiallyRefunded &&
      voucherIsPartialFlag &&
      voucher?.remainingBalance !== null &&
      voucher?.remainingBalance !== undefined &&
      Number(voucher.remainingBalance) > 0
    ) {
      restToCompleteCycle = Math.round(Number(voucher.remainingBalance));
    }
  }

  let isPartialPayment = false;
  if (!isVoided && !isRefundVoucher && !isRefunded && !isPartiallyRefunded) {
    if (optionIsPartialFlag !== undefined) {
      isPartialPayment = Boolean(voucherIsPartialFlag || optionIsPartialFlag);
    } else {
      isPartialPayment = Boolean(
        voucherIsPartialFlag ||
          (restToCompleteCycle !== undefined &&
            restToCompleteCycle > 0 &&
            isCycleApplicableType)
      );
    }
  }

  return {
    isVoided,
    isRefundVoucher,
    isRefunded,
    isPartiallyRefunded,
    isPartialPayment,
    totalRefunded,
    effectiveAmount: absAmount,
    restToCompleteCycle,
  };
}

/**
 * Combines sibling non-refund, non-voided vouchers that share the same seriesId,
 * sequential voucher number (> 0), and Algiers payment date into a single multi-item
 * print object while preserving status/refund fields on the primary voucher.
 */
export function buildVoucherBundleForPrint<T extends Record<string, any>>(
  primaryVoucher: T,
  siblingVouchers?: any[]
): T {
  if (!primaryVoucher) return primaryVoucher;
  if (Array.isArray(primaryVoucher.items) && primaryVoucher.items.length > 0) {
    return primaryVoucher;
  }
  if (
    primaryVoucher.isRefund ||
    primaryVoucher.status === "REFUND" ||
    primaryVoucher.isVoided
  ) {
    return primaryVoucher;
  }
  if (!Array.isArray(siblingVouchers) || siblingVouchers.length === 0) {
    return primaryVoucher;
  }

  const num = Number(primaryVoucher.number || 0);
  const seriesId = primaryVoucher.seriesId;
  if (!seriesId || !(num > 0)) {
    return primaryVoucher;
  }

  const primaryDateKey = formatPaymentDate(primaryVoucher.issuedAt);
  const seenIds = new Set<string | number>();
  const matched: any[] = [];

  const pushIfUnique = (v: any) => {
    if (!v) return;
    const key = v.id !== undefined && v.id !== null ? v.id : `${v.paymentType}-${v.amount}`;
    if (seenIds.has(key)) return;
    seenIds.add(key);
    matched.push(v);
  };

  pushIfUnique(primaryVoucher);

  for (const v of siblingVouchers) {
    if (!v) continue;
    if (v.isVoided || v.isRefund || v.status === "REFUND") continue;
    if (v.seriesId !== seriesId || Number(v.number || 0) !== num) continue;
    const vDateKey = formatPaymentDate(v.issuedAt);
    if (primaryDateKey && vDateKey && vDateKey !== primaryDateKey) continue;
    pushIfUnique(v);
  }

  if (matched.length <= 1) {
    return primaryVoucher;
  }

  // Sort revision items chronologically by lesson date so multi-date receipts read cleanly
  const orderedMatched = [...matched].sort((a, b) => {
    if (a.paymentType === "REVISION_SESSION" && b.paymentType === "REVISION_SESSION") {
      const aTime = a.lesson?.startsAt ? new Date(a.lesson.startsAt).getTime() : Number(a.id || 0);
      const bTime = b.lesson?.startsAt ? new Date(b.lesson.startsAt).getTime() : Number(b.id || 0);
      return aTime - bTime;
    }
    return Number(a.id || 0) - Number(b.id || 0);
  });

  const items = orderedMatched.map((v) => {
    const pType = String(v.paymentType || "TUITION_4SESSION");
    const entry = PAYMENT_TYPE_LABELS[pType];
    const lessonDate =
      pType === "REVISION_SESSION" && v.lesson?.startsAt
        ? formatPaymentDate(v.lesson.startsAt)
        : "";
    const baseAr = entry?.ar || pType;
    const baseFr = entry?.fr || pType;
    return {
      type: pType,
      lessonId: v.lessonId ?? v.lesson?.id ?? undefined,
      lessonDate: lessonDate || undefined,
      labelAr: lessonDate ? `حصة مراجعة — ${lessonDate}` : baseAr,
      labelFr: lessonDate ? `Séance de révision — ${lessonDate}` : baseFr,
      label: lessonDate ? `Séance de révision — ${lessonDate}` : baseFr,
      amount: Number(v.amount || 0),
    };
  });

  const totalAmount = items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  const mergedRefunds = orderedMatched.flatMap((v) =>
    Array.isArray(v.refunds) ? v.refunds : []
  );
  const revisionItemsCount = items.filter((it) => it.type === "REVISION_SESSION").length;

  return {
    ...primaryVoucher,
    isPartial:
      Boolean(primaryVoucher.isPartial) || orderedMatched.some((v) => Boolean(v.isPartial)),
    refunds: mergedRefunds.length > 0 ? mergedRefunds : primaryVoucher.refunds,
    items,
    totalAmount,
    ...(revisionItemsCount > 1 ? { revisionSessionsCount: revisionItemsCount } : {}),
  };
}
