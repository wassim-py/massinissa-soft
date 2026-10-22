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
  fallbackBranchName?: string
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

  // 3. Issuing branch ID lookup
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
    const branch = resolvePaymentBranch(voucher, fallbackContext?.branchName);

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
