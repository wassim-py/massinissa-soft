import { describe, test, expect } from "../helpers/runner";
import { safeImport, readSourceFile } from "../helpers/moduleLoader";

export async function runF06Tests() {
  await describe("F6: Ledger 00:00–01:00 AM Boundary Normalization (R3)", async () => {
    const { module: ledger } = await safeImport<any>("@/lib/ledger");

    test("F6-01: normalizeDateToStartOfDay maps 00:30 AM Algiers (UTC 23:30Z prev day) to current day midnight", () => {
      if (!ledger?.normalizeDateToStartOfDay) {
        throw new Error("normalizeDateToStartOfDay not found in src/lib/ledger.ts");
      }
      // 00:30 AM on Oct 21 in Algeria is 2026-10-20T23:30:00.000Z
      const input = new Date("2026-10-20T23:30:00.000Z");
      const normalized = ledger.normalizeDateToStartOfDay(input);
      const iso = normalized.toISOString();

      if (iso === "2026-10-20T00:00:00.000Z") {
        throw new Error("Defect in src/lib/ledger.ts: normalizeDateToStartOfDay erroneously shifted 00:30 AM transaction to previous day 2026-10-20");
      }
      expect(iso).toBe("2026-10-21T00:00:00.000Z");
    });

    test("F6-02: normalizeDateToStartOfDay maps sharp midnight 00:00:00 Algiers (UTC 23:00Z) to current day midnight", () => {
      if (!ledger?.normalizeDateToStartOfDay) {
        throw new Error("normalizeDateToStartOfDay not found in src/lib/ledger.ts");
      }
      const sharpMidnight = new Date("2026-10-20T23:00:00.000Z");
      const normalized = ledger.normalizeDateToStartOfDay(sharpMidnight);
      expect(normalized.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    });

    test("F6-03: normalizeDateToStartOfDay attributes 23:59:59 Algiers to that same calendar day", () => {
      if (!ledger?.normalizeDateToStartOfDay) {
        throw new Error("normalizeDateToStartOfDay not found in src/lib/ledger.ts");
      }
      // 23:59:59 on Oct 21 in Algiers is 22:59:59Z in UTC
      const lateEvening = new Date("2026-10-21T22:59:59.000Z");
      const normalized = ledger.normalizeDateToStartOfDay(lateEvening);
      expect(normalized.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    });

    test("F6-04: scripts/sync-database-payments.js does not use naive getUTCDate() for ledger normalization", () => {
      const source = readSourceFile("scripts/sync-database-payments.js");
      const hasNaiveUtcDate = /d\.getUTCDate\(\)/.test(source);
      if (hasNaiveUtcDate) {
        throw new Error("Defect in scripts/sync-database-payments.js: Uses naive d.getUTCDate() causing midnight payments to sync to wrong ledger day");
      }
      expect(hasNaiveUtcDate).toBe(false);
    });

    test("F6-05: syncDailyLedgerFromVouchers uses Algiers-anchored date keys", () => {
      const source = readSourceFile("src/lib/ledger.ts");
      // Must not rely on raw getUTCDate or toISOString without timezone
      const usesAlgiersDate = /getAlgiersDateInfo|normalizeDateToAlgiers|algiersDate/.test(source);
      if (!usesAlgiersDate) {
        throw new Error("Defect in src/lib/ledger.ts: Does not reference Algiers date engine for ledger sync");
      }
      expect(usesAlgiersDate).toBe(true);
    });
  });
}

if (process.argv[1]?.endsWith("f06-ledger-midnight-boundary.test.ts")) {
  runF06Tests().then(async () => {
    const { runner } = require("../helpers/runner");
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
