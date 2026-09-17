/**
 * Voucher Display & Formatting Utility
 *
 * Implements docs/architecture.md §1.2 & §2.3 and Phase 16 specifications:
 * Format: "BRANCH [LEVEL] BON NUMBER (DATE)"
 * Example: "ANNEX 4AM BON 155 (15/05/2026)"
 *
 * - BRANCH: The branch where the payment was made (issuing branch)
 * - LEVEL: The grade/level of the student making the payment (e.g. 4AM, 1AS, BAC)
 * - BON: Literal uppercase string "BON"
 * - NUMBER: Sequential voucher number within its series
 * - (DATE): Date of the day the payment occurred, formatted as (DD/MM/YYYY)
 */

export interface VoucherDisplayData {
  id?: number | string;
  number: number | string;
  issuedAt?: Date | string | null;
  paymentType?: string;
  workshopId?: number | null;
  issuingBranchId?: number | null;
  targetBranchId?: number | null;
  issuingBranch?: { name?: string | null } | null;
  targetBranch?: { name?: string | null } | null;
  class?: {
    name?: string | null;
    isFormation?: boolean | null;
    level?: { name?: string | null } | null;
    branch?: { name?: string | null } | null;
  } | null;
  series?: {
    scope?: string | null;
    level?: { name?: string | null } | null;
    issuingBranch?: { name?: string | null } | null;
    targetBranch?: { name?: string | null } | null;
  } | null;
  student?: {
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
}

const BRANCH_NAME_MAP: Record<number, string> = {
  1: "ECOLE",
  2: "ANNEX",
  3: "AMPHI",
};

/**
 * Formats a date into (DD/MM/YYYY) format.
 */
export function formatVoucherDate(dateInput?: Date | string | null): string {
  if (!dateInput) return "(01/01/2026)";
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return "(01/01/2026)";

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `(${day}/${month}/${year})`;
}

/**
 * Resolves the branch where the payment happened (issuing branch).
 */
export function resolvePaymentBranch(
  voucher: VoucherDisplayData,
  fallbackBranchName?: string
): string {
  if (voucher.branchName) return voucher.branchName.trim().toUpperCase();

  // 1. Explicit issuing branch name
  if (voucher.issuingBranch?.name) {
    return voucher.issuingBranch.name.trim().toUpperCase();
  }

  // 2. Series issuing branch name
  if (voucher.series?.issuingBranch?.name) {
    return voucher.series.issuingBranch.name.trim().toUpperCase();
  }

  // 3. Issuing branch ID lookup
  if (voucher.issuingBranchId && BRANCH_NAME_MAP[voucher.issuingBranchId]) {
    return BRANCH_NAME_MAP[voucher.issuingBranchId];
  }

  // 4. Fallback to target branch if same as local
  if (voucher.targetBranch?.name) {
    return voucher.targetBranch.name.trim().toUpperCase();
  }
  if (voucher.class?.branch?.name) {
    return voucher.class.branch.name.trim().toUpperCase();
  }
  if (voucher.targetBranchId && BRANCH_NAME_MAP[voucher.targetBranchId]) {
    return BRANCH_NAME_MAP[voucher.targetBranchId];
  }

  // 5. Student registered branch
  if (voucher.student?.registeredBranch?.name) {
    return voucher.student.registeredBranch.name.trim().toUpperCase();
  }

  if (fallbackBranchName) {
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
  if (voucher.levelName) return voucher.levelName.trim().toUpperCase();

  // 1. Series level (e.g. 4AM)
  if (voucher.series?.level?.name) {
    return voucher.series.level.name.trim().toUpperCase();
  }

  // 2. Class level
  if (voucher.class?.level?.name) {
    return voucher.class.level.name.trim().toUpperCase();
  }

  // 3. Student's enrollment level
  if (voucher.student?.enrollments && voucher.student.enrollments.length > 0) {
    for (const enr of voucher.student.enrollments) {
      if (enr.class?.level?.name) {
        return enr.class.level.name.trim().toUpperCase();
      }
    }
  }

  if (fallbackLevelName) {
    return fallbackLevelName.trim().toUpperCase();
  }

  return "";
}

/**
 * Renders every voucher as "BRANCH [LEVEL|DAWARAT|FORMATION] BON NUMBER (DATE)"
 * Examples:
 * - Regular school: "ANNEX 4AM BON 155 (15/05/2026)"
 * - Dawarat (Workshops): "ECOLE DAWARAT BON 15 (16/09/2026)"
 * - Formations: "ECOLE FORMATION BON 12 (16/09/2026)"
 */
export function formatVoucherDisplay(
  voucher: VoucherDisplayData | null | undefined,
  fallbackContext?: {
    branchName?: string;
    levelName?: string;
    paymentType?: string;
    isWorkshop?: boolean;
    isFormation?: boolean;
  }
): string {
  if (!voucher) return "BON 0 (01/01/2026)";

  const branch = resolvePaymentBranch(voucher, fallbackContext?.branchName);
  const dateStr = formatVoucherDate(voucher.issuedAt);
  const num = voucher.number;

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

  const segmentPart = middleSegment ? ` ${middleSegment}` : "";
  return `${branch}${segmentPart} BON ${num} ${dateStr}`;
}
