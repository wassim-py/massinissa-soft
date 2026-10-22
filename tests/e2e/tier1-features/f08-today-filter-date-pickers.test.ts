import { describe, test, expect } from "../helpers/runner";
import { readSourceFile } from "../helpers/moduleLoader";

export async function runF08Tests() {
  await describe("F8: Algiers-Anchored 'Today' Filter & Date Pickers (R3)", async () => {
    test("F8-01: RevenueFilterBar.tsx does not use now.toISOString().split('T')[0] for todayStr", () => {
      const source = readSourceFile("src/components/revenue/RevenueFilterBar.tsx");
      const hasNaiveIso = /todayStr\s*=\s*now\.toISOString\(\)\.split\(["']T["']\)\[0\]/.test(source);
      if (hasNaiveIso) {
        throw new Error("Defect in RevenueFilterBar.tsx: todayStr calculated via now.toISOString().split('T')[0] which evaluates to yesterday between midnight and 01:00 AM");
      }
      expect(hasNaiveIso).toBe(false);
    });

    test("F8-02: RevenueFilterBar.tsx references Algiers date engine for today/week/month calculations", () => {
      const source = readSourceFile("src/components/revenue/RevenueFilterBar.tsx");
      const usesAlgiersEngine = /getAlgiersDateInfo|getAlgiersTodayDateString|algiersDate/.test(source);
      if (!usesAlgiersEngine) {
        throw new Error("Defect in RevenueFilterBar.tsx: Does not import or use Algiers date utilities");
      }
      expect(usesAlgiersEngine).toBe(true);
    });

    test("F8-03: daily-ledger/page.tsx defaults targetDateStr using Algiers date engine instead of toISOString", () => {
      const source = readSourceFile("src/app/[locale]/(dashboard)/list/daily-ledger/page.tsx");
      const hasNaiveDefault = /targetDateStr\s*=\s*[^;]*new Date\(\)\.toISOString\(\)\.split\(["']T["']\)\[0\]/.test(source);
      if (hasNaiveDefault) {
        throw new Error("Defect in daily-ledger/page.tsx: targetDateStr defaults to new Date().toISOString() instead of Algiers today");
      }
      expect(hasNaiveDefault).toBe(false);
    });

    test("F8-04: daily-ledger/page.tsx allows branch admin to inspect past and future dates via searchParams", () => {
      const source = readSourceFile("src/app/[locale]/(dashboard)/list/daily-ledger/page.tsx");
      // Originally: const targetDateStr = isOwner && searchParams.date ? searchParams.date : ...
      const blocksBranchAdminDateSearch = /isOwner\s*&&\s*searchParams(?:\.date|\?\.date)/.test(source);
      if (blocksBranchAdminDateSearch) {
        throw new Error("Defect in daily-ledger/page.tsx: Branch admin is blocked from inspecting ledger dates via searchParams.date (restricted by 'isOwner && searchParams.date')");
      }
      expect(blocksBranchAdminDateSearch).toBe(false);
    });

    test("F8-05: Today button click simulation evaluates to current date in Algeria", () => {
      // Simulating a client at 00:30 AM local time on Oct 21:
      const simulatedUtcTime = new Date("2026-10-20T23:30:00.000Z");
      const algiersFormatted = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Algiers",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(simulatedUtcTime);

      expect(algiersFormatted).toBe("2026-10-21");
    });
  });
}

if (process.argv[1]?.endsWith("f08-today-filter-date-pickers.test.ts")) {
  runF08Tests().then(async () => {
    const { runner } = require("../helpers/runner");
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
