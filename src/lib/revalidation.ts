import { revalidatePath } from "next/cache";

/**
 * Targets for granular financial cache revalidation.
 */
export interface FinancialRevalidationTargets {
  classId?: number | null;
  studentId?: string | number | null;
  workshopId?: number | null;
  branchId?: number | null;
}

/**
 * Active application locales defined in src/i18n/routing.ts.
 */
const LOCALES: readonly string[] = ["fr", "ar"];

/**
 * Core financial routes that must be revalidated upon any financial mutation
 * (payment, voucher creation/void/edit, refund, expense, fee waiver).
 */
const CORE_FINANCIAL_ROUTES: readonly string[] = [
  "/list/daily-ledger",
  "/list/revenue",
  "/list/finance",
  "/list/payments",
  "/dashboard",
  "/admin",
];

/**
 * Safely executes revalidatePath, gracefully catching invariant errors
 * when invoked outside an active Next.js request context (e.g. CLI scripts, unit/E2E test runners).
 */
function safeRevalidate(path: string, type?: "page" | "layout"): void {
  try {
    if (type) {
      revalidatePath(path, type);
    } else {
      revalidatePath(path);
    }
  } catch {
    // Outside active Next.js request context (e.g. Invariant: static generation store missing)
  }
}

/**
 * Revalidates a path across canonical, parameterized [locale], and specific language prefixes.
 */
function revalidateLocalizedPath(path: string, type?: "page" | "layout"): void {
  safeRevalidate(path, type);
  safeRevalidate(`/[locale]${path}`, type || "page");
  for (const locale of LOCALES) {
    safeRevalidate(`/${locale}${path}`, type);
  }
}

/**
 * Safely parses and validates a positive numeric ID (ignoring null, undefined, <=0, NaN).
 */
function parsePositiveNumericId(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const num = typeof val === "number" ? val : Number(val);
  if (Number.isFinite(num) && num > 0) {
    return Math.floor(num);
  }
  return null;
}

/**
 * Safely parses and validates a student ID (supporting numeric IDs and alphanumeric UUIDs).
 */
function parseStudentId(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (
    str.length === 0 ||
    str === "null" ||
    str === "undefined" ||
    str === "NaN" ||
    str === "[object Object]"
  ) {
    return null;
  }
  return str;
}

/**
 * Centralized financial cache revalidation helper (Feature F9 / R5).
 * Purges static and route caches across daily ledger, revenue, finance, and payment views.
 *
 * @param targets Optional dynamic targets (classId, studentId, workshopId, branchId).
 */
export async function revalidateFinancialRoutes(
  targets?: FinancialRevalidationTargets
): Promise<void> {
  // 1. Revalidate all core financial routes across all supported locales
  for (const route of CORE_FINANCIAL_ROUTES) {
    revalidateLocalizedPath(route);
  }

  // 2. Revalidate root layout to refresh cashier headers and shared indicators
  safeRevalidate("/", "layout");

  if (!targets) {
    return;
  }

  // 3. Conditional class-specific revalidations
  const validClassId = parsePositiveNumericId(targets.classId);
  if (validClassId !== null) {
    revalidateLocalizedPath(`/list/classes/${validClassId}`);
    revalidateLocalizedPath(`/list/payments/class/${validClassId}`);
  }

  // 4. Conditional student-specific revalidations
  const validStudentId = parseStudentId(targets.studentId);
  if (validStudentId !== null) {
    revalidateLocalizedPath(`/list/students/${encodeURIComponent(validStudentId)}`);
    revalidateLocalizedPath("/list/students");
  }

  // 5. Conditional workshop-specific revalidations
  const validWorkshopId = parsePositiveNumericId(targets.workshopId);
  if (validWorkshopId !== null) {
    revalidateLocalizedPath(`/list/workshops/${validWorkshopId}`);
    revalidateLocalizedPath("/list/workshops");
  }

  // 6. Branch target check (core routes cover branch ledger views)
  const validBranchId = parsePositiveNumericId(targets.branchId);
  if (validBranchId !== null) {
    // Core routes already cover daily-ledger, revenue, finance, and payments
  }
}
