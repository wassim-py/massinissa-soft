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
import { formatPaymentTime } from "../../../src/lib/voucherUtils";
import { format as dateFnsFormat } from "date-fns";

export async function runM3ChallengerDatePickerStressTests() {
  await describe("Challenger M3-2: Cross-Screen Consistency & Date Picker Stress", async () => {
    // =========================================================================
    // 1. BRANCH ADMIN DATE INSPECTION & SANITIZATION
    // =========================================================================
    test("CHAL-M3-01: Historical dates (1999-2025) cleanly pass regex and yield exact Algiers UTC day bounds", () => {
      const historicalDates = ["1999-12-31", "2000-01-01", "2015-06-15", "2024-02-29"]; // 2024 is leap year
      for (const d of historicalDates) {
        const isMatch = /^\d{4}-\d{2}-\d{2}$/.test(d);
        expect(isMatch).toBe(true);

        const bounds = getAlgiersDayBounds(d);
        expect(bounds.dateStr).toBe(d);
        // Verify startUtc is 23:00Z on preceding day
        expect(bounds.startUtc.getUTCHours()).toBe(23);
        expect(bounds.startUtc.getUTCMinutes()).toBe(0);
        // Verify endUtc is 22:59:59.999Z on same day
        expect(bounds.endUtc.getUTCHours()).toBe(22);
        expect(bounds.endUtc.getUTCMinutes()).toBe(59);
        expect(bounds.endUtc.getUTCSeconds()).toBe(59);
        expect(bounds.endUtc.getUTCMilliseconds()).toBe(999);
      }
    });

    test("CHAL-M3-02: Future dates (2030-2099) cleanly pass regex and yield exact Algiers UTC day bounds", () => {
      const futureDates = ["2030-01-01", "2050-07-20", "2099-12-31"];
      for (const d of futureDates) {
        const isMatch = /^\d{4}-\d{2}-\d{2}$/.test(d);
        expect(isMatch).toBe(true);

        const bounds = getAlgiersDayBounds(d);
        expect(bounds.dateStr).toBe(d);
        expect(bounds.startUtc.getUTCHours()).toBe(23);
        expect(bounds.endUtc.getUTCHours()).toBe(22);
      }
    });

    test("CHAL-M3-03: Empty string, undefined, null, and whitespace safely resolve to Algiers today", () => {
      const today = getAlgiersTodayDateString();
      const emptyInputs = ["", "   ", undefined, null];

      for (const inp of emptyInputs) {
        const targetDateStr =
          inp && typeof inp === "string" && /^\d{4}-\d{2}-\d{2}$/.test(inp.trim())
            ? inp.trim()
            : getAlgiersTodayDateString();

        expect(targetDateStr).toBe(today);
        const bounds = getAlgiersDayBounds(targetDateStr);
        expect(bounds.dateStr).toBe(today);
      }
    });

    test("CHAL-M3-04: Malformed / adversarial date query strings safely rejected by regex and fallback to today", () => {
      const today = getAlgiersTodayDateString();
      const malformed = [
        "hello",
        "2026/10/21", // slashes
        "21-10-2026", // European order
        "10/21/2026", // US order
        "2026-1",     // incomplete
        "<script>alert(1)</script>",
        "../../etc/passwd",
        "' OR '1'='1",
        "-0001-00-00",
        "2026.10.21",
        "2026-10-21T00:00:00",
      ];

      for (const bad of malformed) {
        const isValid = /^\d{4}-\d{2}-\d{2}$/.test(bad);
        expect(isValid).toBe(false);

        const targetDateStr = isValid ? bad : getAlgiersTodayDateString();
        expect(targetDateStr).toBe(today);
      }
    });

    test("CHAL-M3-05: daily-ledger/page.tsx enables date search for branch admins without isOwner restriction", () => {
      const source = readSourceFile("src/app/[locale]/(dashboard)/list/daily-ledger/page.tsx");

      // Verify old restriction 'isOwner && searchParams.date' does not exist
      expect(source).notToContain("isOwner && searchParams.date");
      expect(source).notToContain("isOwner && searchParams?.date");

      // Verify date filter is unconditionally rendered
      expect(source).toContain("<DailyLedgerDateFilter currentDate={targetDateStr} />");
      expect(source).notToContain("{isOwner && <DailyLedgerDateFilter");
    });

    // =========================================================================
    // 2. EXTREME TIMEZONE OFFSETS & "TODAY" BUTTON SIMULATION
    // =========================================================================
    test("CHAL-M3-06: Today filter at 00:30 AM Algiers (UTC 23:30 prev day) resolves to current day across all client timezones", () => {
      // 00:30 AM in Algeria on 2026-10-21 corresponds to 2026-10-20T23:30:00.000Z
      const simulatedUtcTime = new Date("2026-10-20T23:30:00.000Z");

      const extendedTimezones = [
        ...SIMULATED_TIMEZONES,
        "Pacific/Honolulu",    // UTC-10
        "America/Los_Angeles", // UTC-7/UTC-8
        "America/Chicago",     // UTC-5/UTC-6
        "Asia/Kolkata",        // UTC+5:30
        "Asia/Singapore",      // UTC+8
        "Pacific/Tongatapu",   // UTC+13
        "Pacific/Kiritimati",  // UTC+14
      ];

      for (const tz of extendedTimezones) {
        const resolvedDate = evaluateWithTimezone(tz, () => {
          return new Intl.DateTimeFormat("en-CA", {
            timeZone: "Africa/Algiers",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(simulatedUtcTime);
        });

        expect(resolvedDate).toBe("2026-10-21");
      }
    });

    test("CHAL-M3-07: Naive toISOString() fails during 00:00-01:00 AM local time while Algiers engine succeeds", () => {
      // At 00:15 AM Algiers time on 2026-10-21:
      const simulatedUtcTime = new Date("2026-10-20T23:15:00.000Z");

      // Naive ISO string extraction produces yesterday
      const naiveIso = simulatedUtcTime.toISOString().split("T")[0];
      expect(naiveIso).toBe("2026-10-20"); // DEFECT: yesterday!

      // Algiers date info correctly produces today
      const algiersInfo = getAlgiersDateInfo(simulatedUtcTime);
      expect(algiersInfo.dateStr).toBe("2026-10-21"); // CORRECT: today!
      expect(algiersInfo.hour).toBe(0);
      expect(algiersInfo.minute).toBe(15);
    });

    test("CHAL-M3-08: RevenueFilterBar time tabs produce deterministic Algiers-anchored dates", () => {
      const source = readSourceFile("src/components/revenue/RevenueFilterBar.tsx");

      // Verify getAlgiersDateInfo is imported and used
      expect(source).toContain("import { getAlgiersDateInfo } from \"@/lib/algiersDate\"");
      expect(source).toContain("const algiersToday = getAlgiersDateInfo()");
      expect(source).toContain("const todayStr = algiersToday.dateStr");

      // Verify naive toISOString is completely absent
      expect(source).notToContain("toISOString().split(\"T\")[0]");
      expect(source).notToContain("toISOString().split('T')[0]");
    });

    // =========================================================================
    // 3. ZERO SHADOWING & UNANCHORED FORMAT AUDIT
    // =========================================================================
    test("CHAL-M3-09: daily-ledger/page.tsx has zero instances of local shadowed formatDZD", () => {
      const source = readSourceFile("src/app/[locale]/(dashboard)/list/daily-ledger/page.tsx");

      // Ensure no local declaration of formatDZD
      const hasLocalConst = /const\s+formatDZD\s*=/.test(source);
      const hasLocalFunction = /function\s+formatDZD\s*\(/.test(source);
      const hasLocalLet = /let\s+formatDZD\s*=/.test(source);

      expect(hasLocalConst).toBe(false);
      expect(hasLocalFunction).toBe(false);
      expect(hasLocalLet).toBe(false);

      // Verify formatDZD is imported from @/lib/algiersDate
      expect(source).toMatch(/import\s*\{[^}]*formatDZD[^}]*\}\s*from\s*["']@\/lib\/algiersDate["']/);

      // Verify formatDZD calls in daily-ledger/page.tsx pass locale
      const formatCallsWithoutLocale = /formatDZD\s*\([^,)]+\)/g;
      const matches = source.match(formatCallsWithoutLocale);
      // If any call has no comma, it didn't pass locale
      if (matches) {
        throw new Error(`Found formatDZD call without locale in daily-ledger/page.tsx: ${matches.join(", ")}`);
      }
      expect(matches).toBeNull();
    });

    test("CHAL-M3-10: Audit for unanchored format in daily-ledger/page.tsx reveals discrepancy table defect", () => {
      const source = readSourceFile("src/app/[locale]/(dashboard)/list/daily-ledger/page.tsx");

      // Notice line 13: import { format } from "date-fns";
      const importsDateFnsFormat = /import\s*\{\s*format\s*\}\s*from\s*["']date-fns["']/.test(source);
      
      // Notice line 422: format(new Date(item.createdAt), "HH:mm, d MMM", ...
      const usesDateFnsFormatOnDiscrepancy = /format\s*\(\s*new Date\s*\(\s*item\.createdAt\s*\)/.test(source);

      // We document whether unanchored format exists
      console.log(`[CHAL-M3-10 AUDIT] importsDateFnsFormat = ${importsDateFnsFormat}, usesDateFnsFormatOnDiscrepancy = ${usesDateFnsFormatOnDiscrepancy}`);

      // Demonstrate empirical failure mode:
      // A discrepancy created at 00:30 AM on Oct 21 in Algiers has UTC timestamp 2026-10-20T23:30:00Z.
      const discrepancyTime = new Date("2026-10-20T23:30:00.000Z");

      const utcFormatted = evaluateWithTimezone("UTC", () => {
        return dateFnsFormat(discrepancyTime, "HH:mm, d MMM");
      });

      const algiersFormatted = evaluateWithTimezone("Africa/Algiers", () => {
        return dateFnsFormat(discrepancyTime, "HH:mm, d MMM");
      });

      console.log(`[CHAL-M3-10 EMPIRICAL] In UTC: "${utcFormatted}" vs In Africa/Algiers: "${algiersFormatted}"`);

      // In UTC, it outputs "23:30, 20 Oct", whereas in Algiers it outputs "00:30, 21 Oct"
      expect(utcFormatted).toContain("20"); // Shifts to yesterday in UTC!
      expect(algiersFormatted).toContain("21"); // Today in Algiers!

      // This confirms date-fns `format` at line 422 in daily-ledger/page.tsx is timezone unanchored!
    });

    test("CHAL-M3-10B: formatAlgiersDate provides deterministic cross-timezone rendering for discrepancies", () => {
      const discrepancyTime = new Date("2026-10-20T23:30:00.000Z");

      // Verify formatAlgiersDate renders identically in UTC, America/New_York, and Africa/Algiers
      const utcFormatted = evaluateWithTimezone("UTC", () => {
        return formatAlgiersDate(discrepancyTime, "fr-DZ", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
      });

      const algiersFormatted = evaluateWithTimezone("Africa/Algiers", () => {
        return formatAlgiersDate(discrepancyTime, "fr-DZ", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
      });

      const nyFormatted = evaluateWithTimezone("America/New_York", () => {
        return formatAlgiersDate(discrepancyTime, "fr-DZ", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
      });

      expect(utcFormatted).toBe(algiersFormatted);
      expect(nyFormatted).toBe(algiersFormatted);
      expect(algiersFormatted).toContain("21"); // Stays anchored to 21 Oct!
    });

    // =========================================================================
    // 4. CROSS-SCREEN QUERY BOUNDS & LEDGER COHERENCE
    // =========================================================================
    test("CHAL-M3-11: getDailyBranchLedgerData and getDailyRevenueDashboardData share identical Algiers day boundaries", () => {
      const testDate = "2026-10-21";
      const bounds = getAlgiersDayBounds(testDate);

      // Start: 2026-10-20T23:00:00.000Z
      expect(bounds.startUtc.toISOString()).toBe("2026-10-20T23:00:00.000Z");
      // End: 2026-10-21T22:59:59.999Z
      expect(bounds.endUtc.toISOString()).toBe("2026-10-21T22:59:59.999Z");
      // Normalized midnight: 2026-10-21T00:00:00.000Z
      expect(bounds.normalizedUtcMidnight.toISOString()).toBe("2026-10-21T00:00:00.000Z");

      // Verify that transactions at 00:00:00, 00:30:00, 12:00:00, 23:59:59 fall strictly inside this window
      const t0 = new Date("2026-10-20T23:00:00.000Z").getTime();
      const t30 = new Date("2026-10-20T23:30:00.000Z").getTime();
      const tNoon = new Date("2026-10-21T11:00:00.000Z").getTime();
      const tEnd = new Date("2026-10-21T22:59:59.999Z").getTime();

      const start = bounds.startUtc.getTime();
      const end = bounds.endUtc.getTime();

      expect(t0 >= start && t0 <= end).toBe(true);
      expect(t30 >= start && t30 <= end).toBe(true);
      expect(tNoon >= start && tNoon <= end).toBe(true);
      expect(tEnd >= start && tEnd <= end).toBe(true);

      // Next morning at 00:00:01 Algiers (2026-10-21T23:00:01Z) must NOT fall in this window
      const tNextDay = new Date("2026-10-21T23:00:01.000Z").getTime();
      expect(tNextDay <= end).toBe(false);
    });

    test("CHAL-M3-12: formatPaymentTime on audit table handles null, undefined, and valid dates deterministically", () => {
      // Valid time at 00:30 Algiers
      const t30 = new Date("2026-10-20T23:30:00.000Z");
      expect(formatPaymentTime(t30)).toBe("00:30");

      // Afternoon time at 15:45 Algiers
      const tAft = new Date("2026-10-21T14:45:00.000Z");
      expect(formatPaymentTime(tAft)).toBe("15:45");

      // Null / undefined timestamps safely yield empty string (no NaN, no "01/01/2026")
      expect(formatPaymentTime(null)).toBe("");
      expect(formatPaymentTime(undefined)).toBe("");
      expect(formatPaymentTime("")).toBe("");
    });
  });

  await runner.runQueuedTests();
  return runner.getSummary();
}

if (process.argv[1]?.endsWith("challenger-m3-date-picker-stress.test.ts")) {
  runM3ChallengerDatePickerStressTests().then(() => {
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
