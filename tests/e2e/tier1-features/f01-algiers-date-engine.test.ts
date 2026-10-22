import { describe, test, expect, runner } from "../helpers/runner";
import { safeImport } from "../helpers/moduleLoader";

export async function runF01Tests() {
  await describe("F1: Centralized Algiers Date/Time Engine (Contract src/lib/algiersDate.ts)", async () => {
    const { module: algiersDate, error } = await safeImport<any>("@/lib/algiersDate");

    test("F1-01: Module src/lib/algiersDate.ts exists and exports ALGIERS_TIMEZONE", () => {
      if (!algiersDate) {
        throw new Error(`[M1 Pending] src/lib/algiersDate.ts not implemented yet: ${error}`);
      }
      expect(algiersDate.ALGIERS_TIMEZONE).toBe("Africa/Algiers");
    });

    test("F1-02: getAlgiersDateInfo correctly maps UTC 23:30Z to local 00:30 on the next calendar day", () => {
      if (!algiersDate) {
        throw new Error("[M1 Pending] src/lib/algiersDate.ts not implemented");
      }
      // Input: 2026-10-20T23:30:00.000Z -> Local Algiers: 2026-10-21 00:30:00
      const input = new Date("2026-10-20T23:30:00.000Z");
      const info = algiersDate.getAlgiersDateInfo(input);

      expect(info.year).toBe(2026);
      expect(info.month).toBe(10);
      expect(info.day).toBe(21);
      expect(info.hour).toBe(0);
      expect(info.minute).toBe(30);
      expect(info.dateStr).toBe("2026-10-21");
      expect(info.timeStr).toBe("00:30");
    });

    test("F1-03: getAlgiersTodayDateString returns valid YYYY-MM-DD matching Algiers local date", () => {
      if (!algiersDate) {
        throw new Error("[M1 Pending] src/lib/algiersDate.ts not implemented");
      }
      const todayStr = algiersDate.getAlgiersTodayDateString();
      expect(typeof todayStr).toBe("string");
      expect(todayStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("F1-04: getAlgiersDayBounds returns exact UTC coordinates (D-1 23:00Z to D 22:59:59.999Z)", () => {
      if (!algiersDate) {
        throw new Error("[M1 Pending] src/lib/algiersDate.ts not implemented");
      }
      const bounds = algiersDate.getAlgiersDayBounds("2026-10-21");
      expect(bounds.dateStr).toBe("2026-10-21");
      expect(bounds.startUtc.toISOString()).toBe("2026-10-20T23:00:00.000Z");
      expect(bounds.endUtc.toISOString()).toBe("2026-10-21T22:59:59.999Z");
      expect(bounds.normalizedUtcMidnight.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    });

    test("F1-05: normalizeDateToAlgiersStartOfDay maps midnight-window timestamp to current day UTC midnight", () => {
      if (!algiersDate) {
        throw new Error("[M1 Pending] src/lib/algiersDate.ts not implemented");
      }
      // 00:15 AM on Oct 21 in Algeria is 2026-10-20T23:15:00.000Z in UTC
      const normalized = algiersDate.normalizeDateToAlgiersStartOfDay("2026-10-20T23:15:00.000Z");
      expect(normalized.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    });

    test("F1-06: formatAlgiersDateTime produces deterministic string across locales", () => {
      if (!algiersDate) {
        throw new Error("[M1 Pending] src/lib/algiersDate.ts not implemented");
      }
      const dt = new Date("2026-10-21T14:30:00.000Z"); // 15:30 in Algiers
      const formattedFr = algiersDate.formatAlgiersDateTime(dt, "fr-FR");
      expect(formattedFr).toContain("15:30");
      expect(formattedFr).toContain("21");
    });
  });
}

if (process.argv[1]?.endsWith("f01-algiers-date-engine.test.ts")) {
  runF01Tests().then(async () => {
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
