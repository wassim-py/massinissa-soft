import { describe, test, expect } from "../helpers/runner";
import { safeImport } from "../helpers/moduleLoader";

export async function runF09Tests() {
  await describe("F9: Unified Financial Cache Revalidation Helper (R5)", async () => {
    const { module: revalidation, error } = await safeImport<any>("@/lib/revalidation");

    test("F9-01: Module src/lib/revalidation.ts exists and exports revalidateFinancialRoutes", () => {
      if (!revalidation) {
        throw new Error(`[M4 Pending] src/lib/revalidation.ts not implemented yet: ${error}`);
      }
      expect(typeof revalidation.revalidateFinancialRoutes).toBe("function");
    });

    test("F9-02: revalidateFinancialRoutes handles empty target without throwing", async () => {
      if (!revalidation) {
        throw new Error("[M4 Pending] src/lib/revalidation.ts not implemented");
      }
      let threw = false;
      try {
        await revalidation.revalidateFinancialRoutes();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    test("F9-03: revalidateFinancialRoutes accepts classId, studentId, workshopId, branchId", async () => {
      if (!revalidation) {
        throw new Error("[M4 Pending] src/lib/revalidation.ts not implemented");
      }
      let threw = false;
      try {
        await revalidation.revalidateFinancialRoutes({
          classId: 48,
          studentId: "std-001",
          workshopId: 5,
          branchId: 1,
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    test("F9-04: revalidateFinancialRoutes safely handles null or undefined target fields", async () => {
      if (!revalidation) {
        throw new Error("[M4 Pending] src/lib/revalidation.ts not implemented");
      }
      let threw = false;
      try {
        await revalidation.revalidateFinancialRoutes({
          classId: null,
          studentId: undefined,
          workshopId: null,
          branchId: null,
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    test("F9-05: revalidateFinancialRoutes source specifies core financial routes", () => {
      const { readSourceFile } = require("../helpers/moduleLoader");
      let source = "";
      try {
        source = readSourceFile("src/lib/revalidation.ts");
      } catch (e: any) {
        throw new Error(`[M4 Pending] src/lib/revalidation.ts does not exist: ${e.message}`);
      }
      expect(source).toContain("/list/daily-ledger");
      expect(source).toContain("/list/revenue");
      expect(source).toContain("/list/finance");
      expect(source).toContain("/list/payments");
    });
  });
}

if (process.argv[1]?.endsWith("f09-unified-revalidation-helper.test.ts")) {
  runF09Tests().then(async () => {
    const { runner } = require("../helpers/runner");
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
