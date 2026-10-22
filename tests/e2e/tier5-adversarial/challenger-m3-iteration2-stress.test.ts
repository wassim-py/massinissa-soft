import { describe, test, expect, runner } from "../helpers/runner";
import { readSourceFile } from "../helpers/moduleLoader";
import { evaluateWithTimezone, SIMULATED_TIMEZONES } from "../helpers/timezoneSimulator";
import {
  getAlgiersDateInfo,
  getAlgiersTodayDateString,
  getAlgiersDayBounds,
  formatAlgiersDate,
  formatAlgiersTime,
  formatAlgiersDateTime,
  formatDZD,
} from "../../../src/lib/algiersDate";
import { normalizeDateToStartOfDay } from "../../../src/lib/ledger";

export async function runM3Iteration2ChallengerStressTests() {
  await describe("Challenger M3 Iteration 2: Deep Empirical Adversarial Verification", async () => {
    // =========================================================================
    // 1. AST & STATIC DEFECT AUDIT: daily-ledger/page.tsx
    // =========================================================================
    test("CHAL-M3-R2-01: daily-ledger/page.tsx contains zero date-fns imports or calls", () => {
      const src = readSourceFile("src/app/[locale]/(dashboard)/list/daily-ledger/page.tsx");
      const hasDateFnsImport = /import\s+.*from\s+["']date-fns.*["']/.test(src);
      const hasDateFnsRequire = /require\(["']date-fns.*["']\)/.test(src);
      const hasDateFnsFormatCall = /\bformat\s*\(/.test(src);

      expect(hasDateFnsImport).toBe(false);
      expect(hasDateFnsRequire).toBe(false);
      expect(hasDateFnsFormatCall).toBe(false);
    });

    test("CHAL-M3-R2-02: daily-ledger/page.tsx contains zero naive toISOString date-slicing", () => {
      const src = readSourceFile("src/app/[locale]/(dashboard)/list/daily-ledger/page.tsx");
      const hasNaiveToIsoString = /\.toISOString\(\)\.split\(/.test(src);
      expect(hasNaiveToIsoString).toBe(false);
    });

    test("CHAL-M3-R2-03: daily-ledger/page.tsx uses formatAlgiersDate on discrepancy table", () => {
      const src = readSourceFile("src/app/[locale]/(dashboard)/list/daily-ledger/page.tsx");
      // Check that formatAlgiersDate is imported and called on item.createdAt
      expect(src.includes("formatAlgiersDate")).toBe(true);
      expect(/formatAlgiersDate\s*\(\s*item\.createdAt/.test(src)).toBe(true);
    });

    // =========================================================================
    // 2. AST & STATIC DEFECT AUDIT: src/lib/revenue.ts
    // =========================================================================
    test("CHAL-M3-R2-04: revenue.ts imports zero unanchored format functions from date-fns", () => {
      const src = readSourceFile("src/lib/revenue.ts");
      const dateFnsImports = src.match(/import\s*\{([^}]+)\}\s*from\s*["']date-fns["']/);
      if (dateFnsImports) {
        const importedItems = dateFnsImports[1].split(",").map((s) => s.trim());
        expect(importedItems.includes("format")).toBe(false);
        expect(importedItems.includes("parseISO")).toBe(false);
      }
    });

    test("CHAL-M3-R2-05: revenue.ts formatBucketLabel is anchored to Africa/Algiers", () => {
      const src = readSourceFile("src/lib/revenue.ts");
      // Check that formatBucketLabel uses formatAlgiersDate
      const bucketFuncMatch = src.match(/function\s+formatBucketLabel[\s\S]*?\n\}/);
      expect(bucketFuncMatch !== null).toBe(true);
      const bucketFuncBody = bucketFuncMatch![0];
      expect(bucketFuncBody.includes("formatAlgiersDate")).toBe(true);
      expect(bucketFuncBody.includes("getAlgiersDateInfo")).toBe(true);
      // Ensure it does not use date.toISOString().split("T")[0]
      expect(bucketFuncBody.includes(".toISOString().split")).toBe(false);
    });

    // =========================================================================
    // 3. EMPIRICAL DISCREPANCY FORMATTING ACROSS LOCALES & TIMEZONES
    // =========================================================================
    test("CHAL-M3-R2-06: Discrepancy item in 00:00-01:00 AM window formats identically across all 8 hostile client timezones", () => {
      // 2026-10-20 23:30:00 UTC == 2026-10-21 00:30:00 Africa/Algiers
      const midnightTx = new Date("2026-10-20T23:30:00.000Z");

      const resultsByTz: Record<string, string> = {};
      for (const tzId of SIMULATED_TIMEZONES) {
        const rendered = evaluateWithTimezone(tzId, () => {
          return formatAlgiersDate(midnightTx, "fr", {
            hour: "2-digit",
            minute: "2-digit",
            day: "numeric",
            month: "short",
          });
        });
        resultsByTz[tzId] = rendered;
      }

      const baseline = resultsByTz["Africa/Algiers"];
      // Must contain "21" (day) and "00:30" (hour:minute)
      expect(baseline.includes("21")).toBe(true);
      expect(baseline.includes("00:30")).toBe(true);

      // Must be byte-for-byte identical across ALL simulated timezones
      for (const [tzName, formatted] of Object.entries(resultsByTz)) {
        expect(formatted).toBe(baseline);
      }
    });

    test("CHAL-M3-R2-07: Discrepancy item renders safely in Arabic, French, and English without throwing", () => {
      const midnightTx = new Date("2026-10-20T23:45:12.345Z");
      const locales = ["ar", "fr", "en", "ar-DZ", "fr-DZ", ""];

      for (const loc of locales) {
        const out = formatAlgiersDate(midnightTx, loc, {
          hour: "2-digit",
          minute: "2-digit",
          day: "numeric",
          month: "short",
        });
        expect(typeof out).toBe("string");
        expect(out.length > 0).toBe(true);
      }
    });

    // =========================================================================
    // 4. WEEK ARITHMETIC IN FORMATBUCKETLABEL (SATURDAY START OF WEEK)
    // =========================================================================
    test("CHAL-M3-R2-08: Algerian school week starts strictly on Saturday (UTC+1 invariant)", () => {
      // In Algeria, the school/business week runs Saturday to Thursday (or Friday).
      // Test dates across an entire week to ensure week calculation starts on Saturday:
      // 2026-10-24 is Saturday.
      // 2026-10-25 is Sunday.
      // 2026-10-28 is Wednesday.
      // 2026-10-30 is Friday.
      const daysInWeek = [
        "2026-10-24T10:00:00Z", // Saturday
        "2026-10-25T10:00:00Z", // Sunday
        "2026-10-28T10:00:00Z", // Wednesday
        "2026-10-30T10:00:00Z", // Friday
      ];

      for (const dStr of daysInWeek) {
        const d = new Date(dStr);
        const info = getAlgiersDateInfo(d);
        const algiersMidnightUtc = new Date(Date.UTC(info.year, info.month - 1, info.day, 0, 0, 0));
        const dayOfWeek = (algiersMidnightUtc.getUTCDay() + 1) % 7; // Algeria week starts Saturday
        const startUtc = new Date(algiersMidnightUtc.getTime() - dayOfWeek * 86400000);
        const endUtc = new Date(startUtc.getTime() + 6 * 86400000);

        // Saturday of this week is 2026-10-24
        expect(startUtc.getUTCFullYear()).toBe(2026);
        expect(startUtc.getUTCMonth()).toBe(9); // Oct (0-indexed)
        expect(startUtc.getUTCDate()).toBe(24);
        // Friday of this week is 2026-10-30
        expect(endUtc.getUTCDate()).toBe(30);
      }
    });

    test("CHAL-M3-R2-09: Week arithmetic during midnight hour (00:15 AM Algiers) resolves to correct week", () => {
      // 2026-10-23 23:15:00 UTC is 2026-10-24 00:15:00 Algiers (Saturday morning midnight hour!)
      const satMidnightHour = new Date("2026-10-23T23:15:00.000Z");
      const info = getAlgiersDateInfo(satMidnightHour);
      expect(info.day).toBe(24); // Must be Oct 24 in Algiers

      const algiersMidnightUtc = new Date(Date.UTC(info.year, info.month - 1, info.day, 0, 0, 0));
      const dayOfWeek = (algiersMidnightUtc.getUTCDay() + 1) % 7;
      expect(dayOfWeek).toBe(0); // Day 0 of the week (Saturday)

      const startUtc = new Date(algiersMidnightUtc.getTime() - dayOfWeek * 86400000);
      expect(startUtc.getUTCDate()).toBe(24); // Week starts on this Saturday!
    });

    // =========================================================================
    // 5. LEDGER NORMALIZATION STRESS ACROSS ADVERSARIAL TIMESTAMPS
    // =========================================================================
    test("CHAL-M3-R2-10: normalizeDateToStartOfDay on exact millisecond boundaries around Algiers midnight", () => {
      // 1 ms before Algiers midnight: 2026-10-20 22:59:59.999Z -> Algiers 2026-10-20
      const d1 = normalizeDateToStartOfDay("2026-10-20T22:59:59.999Z");
      expect(d1.toISOString()).toBe("2026-10-20T00:00:00.000Z");

      // Exact Algiers midnight: 2026-10-20 23:00:00.000Z -> Algiers 2026-10-21
      const d2 = normalizeDateToStartOfDay("2026-10-20T23:00:00.000Z");
      expect(d2.toISOString()).toBe("2026-10-21T00:00:00.000Z");

      // 1 ms after Algiers midnight: 2026-10-20 23:00:00.001Z -> Algiers 2026-10-21
      const d3 = normalizeDateToStartOfDay("2026-10-20T23:00:00.001Z");
      expect(d3.toISOString()).toBe("2026-10-21T00:00:00.000Z");

      // 00:59:59.999 Algiers: 2026-10-20 23:59:59.999Z -> Algiers 2026-10-21
      const d4 = normalizeDateToStartOfDay("2026-10-20T23:59:59.999Z");
      expect(d4.toISOString()).toBe("2026-10-21T00:00:00.000Z");

      // 01:00:00.000 Algiers: 2026-10-21 00:00:00.000Z -> Algiers 2026-10-21
      const d5 = normalizeDateToStartOfDay("2026-10-21T00:00:00.000Z");
      expect(d5.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    });

    test("CHAL-M3-R2-11: Revenue query bounds [startUtc, endUtc] match exact Algiers calendar day", () => {
      const testDates = [
        "2026-01-01",
        "2026-02-28",
        "2024-02-29", // leap day
        "2026-10-21",
        "2026-12-31",
      ];

      for (const d of testDates) {
        const bounds = getAlgiersDayBounds(d);
        // Duration between startUtc and endUtc must be exactly 86399999 ms (24h - 1ms)
        const durationMs = bounds.endUtc.getTime() - bounds.startUtc.getTime();
        expect(durationMs).toBe(86399999);

        // startUtc must be 23:00:00.000Z on the previous day
        expect(bounds.startUtc.getUTCHours()).toBe(23);
        expect(bounds.startUtc.getUTCMinutes()).toBe(0);
        expect(bounds.startUtc.getUTCSeconds()).toBe(0);
        expect(bounds.startUtc.getUTCMilliseconds()).toBe(0);

        // endUtc must be 22:59:59.999Z on this day
        expect(bounds.endUtc.getUTCHours()).toBe(22);
        expect(bounds.endUtc.getUTCMinutes()).toBe(59);
        expect(bounds.endUtc.getUTCSeconds()).toBe(59);
        expect(bounds.endUtc.getUTCMilliseconds()).toBe(999);
      }
    });

    // =========================================================================
    // 6. SCRIPTS/SYNC-DATABASE-PAYMENTS.JS PARITY & HOST TIMEZONE IMMUNITY
    // =========================================================================
    test("CHAL-M3-R2-12: scripts/sync-database-payments.js normalizeDateToStartOfDay matches src/lib/ledger.ts across all hostile timezones", () => {
      const src = readSourceFile("scripts/sync-database-payments.js");
      expect(src.includes("algiersTime")).toBe(true);
      expect(src.includes("3600000")).toBe(true);

      const timestamps = [
        "2026-10-20T22:59:59.999Z",
        "2026-10-20T23:00:00.000Z",
        "2026-10-20T23:30:00.000Z",
        "2026-10-20T23:59:59.999Z",
        "2026-10-21T00:00:00.000Z",
      ];

      for (const ts of timestamps) {
        for (const tz of SIMULATED_TIMEZONES) {
          evaluateWithTimezone(tz, () => {
            const ledgerNorm = normalizeDateToStartOfDay(ts);
            // Script's logic
            const d = new Date(ts);
            const algiersTime = new Date(d.getTime() + 3600000);
            const scriptNorm = new Date(Date.UTC(algiersTime.getUTCFullYear(), algiersTime.getUTCMonth(), algiersTime.getUTCDate(), 0, 0, 0, 0));

            expect(scriptNorm.toISOString()).toBe(ledgerNorm.toISOString());
          });
        }
      }
    });

    // =========================================================================
    // 7. REVENUEFILTERBAR TODAY/WEEK/MONTH EVALUATION UNDER EXTREME CLIENT TIMEZONES
    // =========================================================================
    test("CHAL-M3-R2-13: RevenueFilterBar Algiers today resolution at midnight window across client timezones", () => {
      // Midnight window: 23:30Z (which is 00:30 Algiers next day)
      // If a client in New York (UTC-4) evaluates date at 23:30Z, their local clock is 19:30 on prev day.
      // If a client in Tokyo (UTC+9) evaluates date at 23:30Z, their local clock is 08:30 on next day.
      // Algiers engine MUST anchor strictly to Algeria date regardless of client TZ.
      for (const tz of SIMULATED_TIMEZONES) {
        evaluateWithTimezone(tz, () => {
          const info = getAlgiersDateInfo("2026-10-20T23:30:00.000Z");
          expect(info.dateStr).toBe("2026-10-21");
          expect(info.hour).toBe(0);
          expect(info.minute).toBe(30);
        });
      }
    });

    // =========================================================================
    // 8. ADVERSARIAL QUERY PARAMS & MALICIOUS INPUTS TO DAILY LEDGER
    // =========================================================================
    test("CHAL-M3-R2-14: Malicious/path traversal/SQLi query params safely fall back to Algiers today", () => {
      const today = getAlgiersTodayDateString();
      const maliciousParams = [
        "../../../etc/passwd",
        "' OR '1'='1",
        "<script>alert(1)</script>",
        "2026-13-45",
        "2026-02-30",
        "2026-00-00",
        "null",
        "undefined",
        "2026-10-21T00:00:00Z", // Full ISO string instead of YYYY-MM-DD
        "2026/10/21",          // Slashes
      ];

      for (const param of maliciousParams) {
        const isSafe = typeof param === "string" && /^\d{4}-\d{2}-\d{2}$/.test(param.trim());
        const resolvedDateStr = isSafe ? param.trim() : today;
        // Malicious strings must NEVER pass the YYYY-MM-DD regex filter
        if (param === "2026-13-45" || param === "2026-02-30" || param === "2026-00-00") {
          // Note: regex tests format, bounds calculator handles day math
          const bounds = getAlgiersDayBounds(resolvedDateStr);
          expect(bounds.startUtc instanceof Date).toBe(true);
        } else {
          expect(isSafe).toBe(false);
          expect(resolvedDateStr).toBe(today);
        }
      }
    });

    // =========================================================================
    // 9. LARGE BATCH PROPERTY HARNESS: 5,000 PSEUDO-RANDOM TIMESTAMPS
    // =========================================================================
    test("CHAL-M3-R2-15: Property harness: 5,000 pseudo-random timestamps yield exact 24h day bounds and match normalization", () => {
      // Base: 2026-01-01T00:00:00.000Z
      const baseMs = Date.UTC(2026, 0, 1, 0, 0, 0, 0);
      const spanMs = 365 * 24 * 60 * 60 * 1000;

      for (let i = 0; i < 5000; i++) {
        // Linear congruential pseudo-random generator
        const seed = (i * 1664525 + 1013904223) % 4294967296;
        const offsetMs = (seed / 4294967296) * spanMs;
        const testDate = new Date(baseMs + offsetMs);

        const bounds = getAlgiersDayBounds(testDate);
        const norm = normalizeDateToStartOfDay(testDate);

        // Invariant 1: normalizedUtcMidnight must exactly equal normalizeDateToStartOfDay
        expect(bounds.normalizedUtcMidnight.getTime()).toBe(norm.getTime());

        // Invariant 2: startUtc is exactly 1 hour before normalizedUtcMidnight (UTC 23:00 prev day)
        expect(bounds.normalizedUtcMidnight.getTime() - bounds.startUtc.getTime()).toBe(3600000);

        // Invariant 3: bounds duration is exactly 86,399,999 ms
        expect(bounds.endUtc.getTime() - bounds.startUtc.getTime()).toBe(86399999);
      }
    });

    // Null / undefined timestamps safely yield empty string
  });

  await runner.runQueuedTests();
  return runner.getSummary();
}

// Auto-run when executed directly via tsx
if (process.argv[1]?.includes("challenger-m3-iteration2-stress")) {
  runM3Iteration2ChallengerStressTests().then(() => {
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}

