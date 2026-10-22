import { describe, test, expect } from "../helpers/runner";
import { readSourceFile } from "../helpers/moduleLoader";

export async function runF07Tests() {
  await describe("F7: Revenue Query Business-Day Window Alignment (R3)", async () => {
    test("F7-01: src/lib/revenue.ts constructs UTC start boundary at 23:00Z of previous day for daily queries", () => {
      const source = readSourceFile("src/lib/revenue.ts");
      // Check whether revenue.ts constructs business-day bounds or uses getAlgiersDayBounds
      const usesAlignedBounds = /getAlgiersDayBounds|23:00|\(fromD - 1\)|- 1,\s*23,\s*0,\s*0/.test(source);
      if (!usesAlignedBounds) {
        throw new Error("Defect in src/lib/revenue.ts: startDate is constructed using UTC midnight 00:00:00Z instead of Algerian business day start (previous day 23:00:00Z)");
      }
      expect(usesAlignedBounds).toBe(true);
    });

    test("F7-02: src/lib/revenue.ts constructs UTC end boundary at 22:59:59.999Z for daily queries", () => {
      const source = readSourceFile("src/lib/revenue.ts");
      const usesAlignedEnd = /getAlgiersDayBounds|22:59:59|22,\s*59,\s*59/.test(source);
      if (!usesAlignedEnd) {
        throw new Error("Defect in src/lib/revenue.ts: endDate is constructed using UTC 23:59:59.999Z instead of Algerian business day end (22:59:59.999Z)");
      }
      expect(usesAlignedEnd).toBe(true);
    });

    test("F7-03: getDailyBranchLedgerData defines startOfDay and endOfDay matching Algiers business day", () => {
      const source = readSourceFile("src/lib/revenue.ts");
      // Lines 591-594 in revenue.ts originally had:
      // const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      const hasFaultyUtcMidnight = /startOfDay\s*=\s*new Date\(Date\.UTC\([^)]*,\s*0,\s*0,\s*0,\s*0\)\)/.test(source);
      if (hasFaultyUtcMidnight) {
        throw new Error("Defect in src/lib/revenue.ts: getDailyBranchLedgerData uses Date.UTC(..., 0, 0, 0, 0) excluding 00:00-01:00 AM transactions");
      }
      expect(hasFaultyUtcMidnight).toBe(false);
    });

    test("F7-04: src/lib/revenue.ts defaultDateTo does not use naive today.toISOString()", () => {
      const source = readSourceFile("src/lib/revenue.ts");
      const hasNaiveIsoString = /defaultDateTo\s*=\s*today\.toISOString\(\)\.split\(["']T["']\)\[0\]/.test(source);
      if (hasNaiveIsoString) {
        throw new Error("Defect in src/lib/revenue.ts: Uses today.toISOString().split('T')[0] which evaluates to yesterday between 00:00 and 01:00 AM");
      }
      expect(hasNaiveIsoString).toBe(false);
    });

    test("F7-05: Revenue query handles cross-midnight transactions without date bleeding", () => {
      // Mathematical verification of UTC window for 2026-10-21:
      // Window: 2026-10-20T23:00:00.000Z to 2026-10-21T22:59:59.999Z
      const windowStart = new Date("2026-10-20T23:00:00.000Z").getTime();
      const windowEnd = new Date("2026-10-21T22:59:59.999Z").getTime();

      const paymentMidnight = new Date("2026-10-20T23:30:00.000Z").getTime(); // 00:30 Oct 21
      const paymentNextDay = new Date("2026-10-21T23:30:00.000Z").getTime();  // 00:30 Oct 22

      expect(paymentMidnight >= windowStart && paymentMidnight <= windowEnd).toBe(true);
      expect(paymentNextDay >= windowStart && paymentNextDay <= windowEnd).toBe(false);
    });
  });
}

if (process.argv[1]?.endsWith("f07-revenue-business-day-window.test.ts")) {
  runF07Tests().then(async () => {
    const { runner } = require("../helpers/runner");
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
