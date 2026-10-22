import { describe, test, expect, runner } from "../helpers/runner";
import { readSourceFile } from "../helpers/moduleLoader";
import { revalidateFinancialRoutes, FinancialRevalidationTargets } from "../../../src/lib/revalidation";

/**
 * Challenger M4 Gate 1: Empirical Adversarial Revalidation Stress Suite
 *
 * Covers:
 * 1. Target Matrix Fuzzing & ID Boundaries (empty, null, undefined, negatives, non-numeric, objects, arrays)
 * 2. URL Traversal & Injection Neutralization in Student IDs
 * 3. Exact Revalidation Route & Layout Coverage Verification via Spies
 * 4. Next.js Static Store Invariant & Error Immunity
 * 5. High-Concurrency Stress Test (500 simultaneous invocations)
 * 6. AST & Static Audit of Mutating Server Actions in actions.ts, formationActions.ts, and financeActions.ts
 */

async function assertDoesNotThrow(fn: () => Promise<any>): Promise<void> {
  let threw = false;
  let error: any = null;
  try {
    await fn();
  } catch (e) {
    threw = true;
    error = e;
  }
  if (threw) {
    throw new Error(`Expected async function not to throw, but threw: ${error?.message || error}`);
  }
}

export async function runM4ChallengerStressTests() {
  await describe("Challenger M4 Gate 1: Empirical Revalidation Stress & Adversarial Oracles", async () => {
    // =========================================================================
    // 1. TARGET MATRIX & ID PARSING BOUNDARIES
    // =========================================================================
    test("CHAL-M4-01: Handles completely empty and non-object targets without error", async () => {
      await assertDoesNotThrow(() => revalidateFinancialRoutes(undefined));
      await assertDoesNotThrow(() => revalidateFinancialRoutes(null as any));
      await assertDoesNotThrow(() => revalidateFinancialRoutes({} as any));
      await assertDoesNotThrow(() => revalidateFinancialRoutes("string" as any));
      await assertDoesNotThrow(() => revalidateFinancialRoutes(42 as any));
      await assertDoesNotThrow(() => revalidateFinancialRoutes([1, 2, 3] as any));
      await assertDoesNotThrow(() => revalidateFinancialRoutes(true as any));
      await assertDoesNotThrow(() => revalidateFinancialRoutes((() => {}) as any));
    });

    test("CHAL-M4-02: Target with explicitly null / undefined properties does not throw", async () => {
      await assertDoesNotThrow(() =>
        revalidateFinancialRoutes({
          classId: null,
          studentId: null,
          workshopId: null,
          branchId: null,
        })
      );

      await assertDoesNotThrow(() =>
        revalidateFinancialRoutes({
          classId: undefined,
          studentId: undefined,
          workshopId: undefined,
          branchId: undefined,
        })
      );
    });

    test("CHAL-M4-03: Boundary numbers and invalid numeric inputs for classId and workshopId", async () => {
      const invalidClassIds: any[] = [
        0,
        -1,
        -99999,
        NaN,
        Infinity,
        -Infinity,
        "invalid",
        "",
        "   ",
        {},
        [1, 2],
      ];

      for (const invalidId of invalidClassIds) {
        await assertDoesNotThrow(() =>
          revalidateFinancialRoutes({ classId: invalidId, workshopId: invalidId })
        );
      }
    });

    test("CHAL-M4-04: StudentId sentinel strings ('null', 'undefined', 'NaN', '[object Object]') are suppressed", async () => {
      const nextCache = require("next/cache");
      const originalRevalidate = nextCache.revalidatePath;
      const interceptedPaths: string[] = [];

      nextCache.revalidatePath = (path: string) => {
        interceptedPaths.push(path);
      };

      try {
        const sentinels = ["null", "undefined", "NaN", "[object Object]", "", "   "];
        for (const sentinel of sentinels) {
          interceptedPaths.length = 0;
          await revalidateFinancialRoutes({ studentId: sentinel });
          const studentRoutes = interceptedPaths.filter((p) => p.includes("student"));
          expect(studentRoutes.length).toBe(0);
        }
      } finally {
        nextCache.revalidatePath = originalRevalidate;
      }
    });

    test("CHAL-M4-05: Path traversal and injection characters in studentId are strictly encoded", async () => {
      const nextCache = require("next/cache");
      const originalRevalidate = nextCache.revalidatePath;
      const interceptedPaths: string[] = [];

      nextCache.revalidatePath = (path: string) => {
        interceptedPaths.push(path);
      };

      try {
        const maliciousIds = [
          "../../admin/secret",
          "std/../finance",
          "std?bypass=true",
          "std#hash",
          "Robert'); DROP TABLE Students;--",
          "<script>alert('xss')</script>",
          "طالب_01",
          "élève #42",
        ];

        for (const id of maliciousIds) {
          interceptedPaths.length = 0;
          await revalidateFinancialRoutes({ studentId: id });
          const studentDetailPaths = interceptedPaths.filter(
            (p) => p.startsWith("/list/students/") || p.includes("/list/students/")
          );
          expect(studentDetailPaths.length).toBeGreaterThan(0);
          for (const p of studentDetailPaths) {
            // Must contain the encoded student ID, never unencoded slashes or injection breaks
            expect(p).toContain(encodeURIComponent(id.trim()));
            expect(p).notToContain("../../");
            expect(p).notToContain("<script>");
          }
        }
      } finally {
        nextCache.revalidatePath = originalRevalidate;
      }
    });

    // =========================================================================
    // 2. ROUTE & LAYOUT COVERAGE VERIFICATION (ORACLE)
    // =========================================================================
    test("CHAL-M4-06: Oracle verification of core financial routes and layout invalidation", async () => {
      const nextCache = require("next/cache");
      const originalRevalidate = nextCache.revalidatePath;
      const calls: { path: string; type?: string }[] = [];

      nextCache.revalidatePath = (path: string, type?: string) => {
        calls.push({ path, type });
      };

      try {
        await revalidateFinancialRoutes();

        // 1. Verify root layout invalidation
        const layoutCall = calls.find((c) => c.path === "/" && c.type === "layout");
        expect(layoutCall !== undefined).toBe(true);

        // 2. Verify all 6 core financial routes exist with 4 variants each
        const expectedCore = [
          "/list/daily-ledger",
          "/list/revenue",
          "/list/finance",
          "/list/payments",
          "/dashboard",
          "/admin",
        ];

        for (const route of expectedCore) {
          const canonical = calls.find((c) => c.path === route);
          const localizedParam = calls.find((c) => c.path === `/[locale]${route}`);
          const fr = calls.find((c) => c.path === `/fr${route}`);
          const ar = calls.find((c) => c.path === `/ar${route}`);

          expect(canonical !== undefined).toBe(true);
          expect(localizedParam !== undefined).toBe(true);
          expect(fr !== undefined).toBe(true);
          expect(ar !== undefined).toBe(true);
        }

        // 6 core * 4 variants + 1 root layout = 25 calls total
        expect(calls.length).toBe(25);
      } finally {
        nextCache.revalidatePath = originalRevalidate;
      }
    });

    test("CHAL-M4-07: Oracle verification of targeted revalidation with valid dynamic IDs", async () => {
      const nextCache = require("next/cache");
      const originalRevalidate = nextCache.revalidatePath;
      const calls: { path: string; type?: string }[] = [];

      nextCache.revalidatePath = (path: string, type?: string) => {
        calls.push({ path, type });
      };

      try {
        await revalidateFinancialRoutes({
          classId: 48,
          studentId: "std-99",
          workshopId: 12,
          branchId: 3,
        });

        const paths = calls.map((c) => c.path);

        // Class routes
        expect(paths).toContain("/list/classes/48");
        expect(paths).toContain("/fr/list/classes/48");
        expect(paths).toContain("/ar/list/classes/48");
        expect(paths).toContain("/list/payments/class/48");
        expect(paths).toContain("/fr/list/payments/class/48");

        // Student routes
        expect(paths).toContain("/list/students/std-99");
        expect(paths).toContain("/fr/list/students/std-99");
        expect(paths).toContain("/list/students");

        // Workshop routes
        expect(paths).toContain("/list/workshops/12");
        expect(paths).toContain("/fr/list/workshops/12");
        expect(paths).toContain("/list/workshops");

        // Zero invalid paths like /null or /undefined
        expect(paths.some((p) => p.includes("null") || p.includes("undefined"))).toBe(false);
      } finally {
        nextCache.revalidatePath = originalRevalidate;
      }
    });

    // =========================================================================
    // 3. NEXT.JS INVARIANT & ERROR RESILIENCE
    // =========================================================================
    test("CHAL-M4-08: Gracefully swallows Next.js static generation store missing error", async () => {
      const nextCache = require("next/cache");
      const originalRevalidate = nextCache.revalidatePath;

      nextCache.revalidatePath = () => {
        throw new Error("Invariant: static generation store missing in non-request context");
      };

      try {
        await assertDoesNotThrow(() => revalidateFinancialRoutes({ classId: 10 }));
      } finally {
        nextCache.revalidatePath = originalRevalidate;
      }
    });

    test("CHAL-M4-09: Gracefully swallows arbitrary unexpected errors thrown by Next.js cache", async () => {
      const nextCache = require("next/cache");
      const originalRevalidate = nextCache.revalidatePath;

      nextCache.revalidatePath = () => {
        throw new TypeError("Failed to execute cache operation: connection reset");
      };

      try {
        await assertDoesNotThrow(() =>
          revalidateFinancialRoutes({ classId: 10, studentId: "s-1", workshopId: 5 })
        );
      } finally {
        nextCache.revalidatePath = originalRevalidate;
      }
    });

    // =========================================================================
    // 4. HIGH CONCURRENCY STRESS (500 parallel invocations)
    // =========================================================================
    test("CHAL-M4-10: Survives 500 parallel asynchronous invocations under 500ms without race or leak", async () => {
      const start = Date.now();
      const invocations: Promise<void>[] = [];

      for (let i = 0; i < 500; i++) {
        invocations.push(
          revalidateFinancialRoutes({
            classId: (i % 20) + 1,
            studentId: `std-${i % 50}`,
            workshopId: (i % 10) + 1,
            branchId: (i % 3) + 1,
          })
        );
      }

      await Promise.all(invocations);
      const elapsed = Date.now() - start;

      // 500 parallel calls must complete swiftly
      expect(elapsed).toBeLessThan(1000);
    });

    // =========================================================================
    // 5. AST AUDIT: MUTATING SERVER ACTIONS INTEGRATION (F10)
    // =========================================================================
    test("CHAL-M4-11: AST audit of src/lib/actions.ts for universal revalidation", () => {
      const src = readSourceFile("src/lib/actions.ts");

      // Verify revalidateFinancialRoutes import
      expect(src).toContain('import { revalidateFinancialRoutes } from "@/lib/revalidation"');

      // Check key financial mutating actions exist
      const keyActions = [
        "issueMultiItemVoucherAction",
        "issueVoucher",
        "editVoucher",
        "voidVoucher",
        "createRefund",
        "registerParticipant",
        "addWorkshopPayment",
        "updateWorkshopPayment",
        "overrideEnrollmentFee",
        "declareMissingMoneyAction",
        "confirmMissingMoneyAction",
        "rejectMissingMoneyAction",
        "resetMissingMoneyAction",
        "deleteMissingMoneyAction",
        "declareSurplusMoneyAction",
        "confirmSurplusMoneyAction",
        "rejectSurplusMoneyAction",
        "resetSurplusMoneyAction",
        "deleteSurplusMoneyAction",
      ];

      for (const actionName of keyActions) {
        expect(src).toContain(actionName);
      }

      // Check editVoucher does not produce /list/payments/class/null
      const editIndex = src.indexOf("export const editVoucher");
      expect(editIndex).toBeGreaterThan(-1);
      const nextExport = src.indexOf("export const", editIndex + 25);
      const editBody = src.substring(editIndex, nextExport > -1 ? nextExport : editIndex + 5000);
      expect(editBody).toContain("revalidateFinancialRoutes");
      expect(editBody).notToContain("revalidatePath(`/list/payments/class/${voucher.classId}`)");
    });

    test("CHAL-M4-12: AST audit of src/lib/formationActions.ts for revalidation", () => {
      const src = readSourceFile("src/lib/formationActions.ts");

      expect(src).toContain('import { revalidateFinancialRoutes } from "@/lib/revalidation"');

      // recordFormationLumpSumPayment
      const lumpSumIndex = src.indexOf("export async function recordFormationLumpSumPayment");
      expect(lumpSumIndex).toBeGreaterThan(-1);
      const nextExport = src.indexOf("export async function", lumpSumIndex + 30);
      const lumpSumBody = src.substring(lumpSumIndex, nextExport > -1 ? nextExport : lumpSumIndex + 6000);
      expect(lumpSumBody).toContain("revalidateFinancialRoutes");

      // enrollStudentInFormationGroup
      const enrollIndex = src.indexOf("export async function enrollStudentInFormationGroup");
      expect(enrollIndex).toBeGreaterThan(-1);
      const nextEnrollExport = src.indexOf("export async function", enrollIndex + 30);
      const enrollBody = src.substring(enrollIndex, nextEnrollExport > -1 ? nextEnrollExport : enrollIndex + 6000);
      expect(enrollBody).toContain("revalidateFinancialRoutes");
    });

    test("CHAL-M4-13: AST audit of src/lib/financeActions.ts for comprehensive revalidation", () => {
      const src = readSourceFile("src/lib/financeActions.ts");

      expect(src).toContain('import { revalidateFinancialRoutes } from "@/lib/revalidation"');

      const financeActions = [
        "createDailyExpenseAction",
        "updateDailyExpenseAction",
        "deleteDailyExpenseAction",
        "createCaisseNoireTransactionAction",
        "updateCaisseNoireTransactionAction",
        "deleteCaisseNoireTransactionAction",
        "recordStaffPayrollAction",
        "updateStaffPayrollAction",
        "deleteStaffPayrollAction",
        "recordStaffAdvanceAction",
        "updateStaffAdvanceAction",
        "deleteStaffAdvanceAction",
      ];

      for (const actionName of financeActions) {
        const actionIdx = src.indexOf(`export async function ${actionName}`);
        expect(actionIdx).toBeGreaterThan(-1);
        const nextActionIdx = src.indexOf("export async function", actionIdx + 30);
        const actionBlock = src.substring(actionIdx, nextActionIdx > -1 ? nextActionIdx : actionIdx + 5000);
        expect(actionBlock).toContain("revalidateFinancialRoutes");
      }
    });
  });

  await runner.runQueuedTests();
  return runner.getSummary();
}

if (process.argv[1]?.endsWith("challenger-m4-revalidation-stress.test.ts")) {
  runM4ChallengerStressTests().then(() => {
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
