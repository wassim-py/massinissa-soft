import { describe, test, expect, runner } from "../helpers/runner";
import { safeImport } from "../helpers/moduleLoader";
import { evaluateWithTimezone, SIMULATED_TIMEZONES } from "../helpers/timezoneSimulator";
import { Prisma } from "@prisma/client";

/**
 * Challenger M1-1: Comprehensive Empirical Date/Time Stress Harness & Oracles
 *
 * Stress-tests:
 * 1. Millisecond traversal across midnight boundary (22:59:59Z vs 23:00:00Z vs 23:59:59Z vs 00:00:00Z)
 * 2. Leap year transitions (2024, 2028 leap vs 2025 non-leap, 2000 vs 2100)
 * 3. Daylight Saving Time immunity across full annual calendar
 * 4. Month-end rollovers across all 12 calendar months and year-end (Dec 31 -> Jan 1)
 * 5. Monte Carlo synthetic fuzzing against Intl oracle (10,000 timestamps)
 * 6. DayBounds partitioning: no gaps, no overlaps, exact 86,400,000ms duration
 * 7. formatDZD edge cases (cancellation artifacts, negative zero, extreme values)
 */
export async function runChallengerM1StressTests() {
  await describe("Challenger M1-1: Empirical Date Engine Stress & Oracle Verification", async () => {
    const { module: algiersDate, error } = await safeImport<any>("@/lib/algiersDate");

    if (!algiersDate) {
      throw new Error(`Failed to load algiersDate module: ${error}`);
    }

    const {
      getAlgiersDateInfo,
      getAlgiersDayBounds,
      normalizeDateToAlgiersStartOfDay,
      formatAlgiersDate,
      formatAlgiersTime,
      formatAlgiersDateTime,
      formatDZD,
      formatNumber,
    } = algiersDate;

    // =========================================================================
    // SECTION 1: MILLISECOND-BY-MILLISECOND MIDNIGHT TRAVERSAL (2,001 ms sweep)
    // =========================================================================
    test("CHALLENGE-01: Micro-traversal across local midnight (22:59:59.000Z to 23:00:01.000Z)", () => {
      // 2026-10-20T22:59:59.000Z is 1000ms before Algiers midnight
      // 2026-10-20T23:00:00.000Z is exact Algiers midnight of 2026-10-21
      const baseMs = new Date("2026-10-20T23:00:00.000Z").getTime();

      let preCount = 0;
      let postCount = 0;

      for (let offset = -1000; offset <= 1000; offset++) {
        const t = new Date(baseMs + offset);
        const info = getAlgiersDateInfo(t);
        const bounds = getAlgiersDayBounds(t);
        const normalized = normalizeDateToAlgiersStartOfDay(t);

        if (offset < 0) {
          preCount++;
          // Must belong to 2026-10-20
          if (info.dateStr !== "2026-10-20" || info.hour !== 23 || info.minute !== 59) {
            throw new Error(`Pre-midnight mismatch at offset ${offset}ms: got dateStr=${info.dateStr}, timeStr=${info.timeStr}`);
          }
          if (bounds.dateStr !== "2026-10-20") {
            throw new Error(`Pre-midnight DayBounds dateStr mismatch at offset ${offset}ms: got ${bounds.dateStr}`);
          }
          if (normalized.toISOString() !== "2026-10-20T00:00:00.000Z") {
            throw new Error(`Pre-midnight normalize mismatch at offset ${offset}ms: got ${normalized.toISOString()}`);
          }
        } else {
          postCount++;
          // Must belong to 2026-10-21
          if (info.dateStr !== "2026-10-21" || info.hour !== 0 || info.minute !== 0) {
            throw new Error(`Post-midnight mismatch at offset ${offset}ms: got dateStr=${info.dateStr}, timeStr=${info.timeStr}`);
          }
          if (bounds.dateStr !== "2026-10-21") {
            throw new Error(`Post-midnight DayBounds dateStr mismatch at offset ${offset}ms: got ${bounds.dateStr}`);
          }
          if (normalized.toISOString() !== "2026-10-21T00:00:00.000Z") {
            throw new Error(`Post-midnight normalize mismatch at offset ${offset}ms: got ${normalized.toISOString()}`);
          }
        }
      }

      expect(preCount).toBe(1000);
      expect(postCount).toBe(1001); // 0 to 1000 ms inclusive
    });

    test("CHALLENGE-02: Micro-traversal across UTC midnight (23:59:59.000Z to 00:00:01.000Z)", () => {
      // In Algiers (UTC+1), 23:59:59Z is 00:59:59 local, and 00:00:00Z is 01:00:00 local.
      // Both MUST belong to the SAME Algiers calendar day!
      const baseMs = new Date("2026-10-21T00:00:00.000Z").getTime();

      for (let offset = -1000; offset <= 1000; offset++) {
        const t = new Date(baseMs + offset);
        const info = getAlgiersDateInfo(t);
        const bounds = getAlgiersDayBounds(t);
        const normalized = normalizeDateToAlgiersStartOfDay(t);

        // Entire window must be anchored to 2026-10-21 in Algiers
        if (info.dateStr !== "2026-10-21") {
          throw new Error(`UTC midnight shift failure at offset ${offset}ms: got ${info.dateStr}`);
        }
        if (bounds.dateStr !== "2026-10-21") {
          throw new Error(`UTC midnight DayBounds failure at offset ${offset}ms: got ${bounds.dateStr}`);
        }
        if (normalized.toISOString() !== "2026-10-21T00:00:00.000Z") {
          throw new Error(`UTC midnight normalize failure at offset ${offset}ms: got ${normalized.toISOString()}`);
        }

        if (offset < 0) {
          if (info.hour !== 0 || info.minute !== 59) {
            throw new Error(`Expected 00:59 local, got ${info.timeStr}`);
          }
        } else {
          if (info.hour !== 1 || info.minute !== 0) {
            throw new Error(`Expected 01:00 local, got ${info.timeStr}`);
          }
        }
      }
    });

    // =========================================================================
    // SECTION 2: LEAP YEARS & CENTURY BOUNDARIES
    // =========================================================================
    test("CHALLENGE-03: Leap year 2024 transition (Feb 28 23:00Z -> Feb 29)", () => {
      // Leap year 2024 has Feb 29
      const feb28Late = new Date("2024-02-28T22:59:59.999Z");
      const feb29Start = new Date("2024-02-28T23:00:00.000Z");
      const feb29Late = new Date("2024-02-29T22:59:59.999Z");
      const mar01Start = new Date("2024-02-29T23:00:00.000Z");

      expect(getAlgiersDateInfo(feb28Late).dateStr).toBe("2024-02-28");
      expect(getAlgiersDateInfo(feb29Start).dateStr).toBe("2024-02-29");
      expect(getAlgiersDateInfo(feb29Late).dateStr).toBe("2024-02-29");
      expect(getAlgiersDateInfo(mar01Start).dateStr).toBe("2024-03-01");

      const b29 = getAlgiersDayBounds("2024-02-29");
      expect(b29.startUtc.toISOString()).toBe("2024-02-28T23:00:00.000Z");
      expect(b29.endUtc.toISOString()).toBe("2024-02-29T22:59:59.999Z");
      expect(b29.normalizedUtcMidnight.toISOString()).toBe("2024-02-29T00:00:00.000Z");

      const bMar1 = getAlgiersDayBounds("2024-03-01");
      expect(bMar1.startUtc.toISOString()).toBe("2024-02-29T23:00:00.000Z");
      expect(bMar1.endUtc.toISOString()).toBe("2024-03-01T22:59:59.999Z");
    });

    test("CHALLENGE-04: Non-leap year 2025 transition (Feb 28 23:00Z -> Mar 01)", () => {
      // 2025 is NOT a leap year: Feb 28 rolls directly into Mar 01
      const feb28Late = new Date("2025-02-28T22:59:59.999Z");
      const mar01Start = new Date("2025-02-28T23:00:00.000Z");

      expect(getAlgiersDateInfo(feb28Late).dateStr).toBe("2025-02-28");
      expect(getAlgiersDateInfo(mar01Start).dateStr).toBe("2025-03-01");

      const bMar1 = getAlgiersDayBounds("2025-03-01");
      expect(bMar1.startUtc.toISOString()).toBe("2025-02-28T23:00:00.000Z");
      expect(bMar1.endUtc.toISOString()).toBe("2025-03-01T22:59:59.999Z");
      expect(bMar1.normalizedUtcMidnight.toISOString()).toBe("2025-03-01T00:00:00.000Z");
    });

    test("CHALLENGE-05: Century leap year 2000 vs century non-leap year 2100", () => {
      // 2000 is divisible by 400 -> LEAP
      const y2000_feb29 = new Date("2000-02-28T23:00:00.000Z");
      expect(getAlgiersDateInfo(y2000_feb29).dateStr).toBe("2000-02-29");
      const b2000 = getAlgiersDayBounds("2000-02-29");
      expect(b2000.startUtc.toISOString()).toBe("2000-02-28T23:00:00.000Z");

      // 2100 is NOT divisible by 400 -> NON-LEAP
      const y2100_mar01 = new Date("2100-02-28T23:00:00.000Z");
      expect(getAlgiersDateInfo(y2100_mar01).dateStr).toBe("2100-03-01");
      const b2100 = getAlgiersDayBounds("2100-03-01");
      expect(b2100.startUtc.toISOString()).toBe("2100-02-28T23:00:00.000Z");
    });

    // =========================================================================
    // SECTION 3: MONTH-END ROLLOVERS ACROSS ALL 12 CALENDAR MONTHS & YEAR-END
    // =========================================================================
    test("CHALLENGE-06: Month-end rollovers across all 12 calendar months in 2026", () => {
      const monthDays = [
        { month: 1, days: 31, nextMonthStr: "2026-02-01", lastDayStr: "2026-01-31" },
        { month: 2, days: 28, nextMonthStr: "2026-03-01", lastDayStr: "2026-02-28" },
        { month: 3, days: 31, nextMonthStr: "2026-04-01", lastDayStr: "2026-03-31" },
        { month: 4, days: 30, nextMonthStr: "2026-05-01", lastDayStr: "2026-04-30" },
        { month: 5, days: 31, nextMonthStr: "2026-06-01", lastDayStr: "2026-05-31" },
        { month: 6, days: 30, nextMonthStr: "2026-07-01", lastDayStr: "2026-06-30" },
        { month: 7, days: 31, nextMonthStr: "2026-08-01", lastDayStr: "2026-07-31" },
        { month: 8, days: 31, nextMonthStr: "2026-09-01", lastDayStr: "2026-08-31" },
        { month: 9, days: 30, nextMonthStr: "2026-10-01", lastDayStr: "2026-09-30" },
        { month: 10, days: 31, nextMonthStr: "2026-11-01", lastDayStr: "2026-10-31" },
        { month: 11, days: 30, nextMonthStr: "2026-12-01", lastDayStr: "2026-11-30" },
        { month: 12, days: 31, nextMonthStr: "2027-01-01", lastDayStr: "2026-12-31" },
      ];

      for (const m of monthDays) {
        // Last millisecond of current month: D 22:59:59.999Z
        const lastMs = new Date(`${m.lastDayStr}T22:59:59.999Z`);
        const firstMs = new Date(`${m.lastDayStr}T23:00:00.000Z`);

        const infoLast = getAlgiersDateInfo(lastMs);
        expect(infoLast.dateStr).toBe(m.lastDayStr);
        expect(infoLast.hour).toBe(23);
        expect(infoLast.minute).toBe(59);

        const infoFirst = getAlgiersDateInfo(firstMs);
        expect(infoFirst.dateStr).toBe(m.nextMonthStr);
        expect(infoFirst.hour).toBe(0);
        expect(infoFirst.minute).toBe(0);

        // Verify DayBounds for next month day 1
        const bounds = getAlgiersDayBounds(m.nextMonthStr);
        expect(bounds.startUtc.toISOString()).toBe(`${m.lastDayStr}T23:00:00.000Z`);
        expect(bounds.normalizedUtcMidnight.toISOString()).toBe(`${m.nextMonthStr}T00:00:00.000Z`);
      }
    });

    test("CHALLENGE-07: Year-end rollover (Dec 31 23:30 local -> Jan 1)", () => {
      // Dec 31 23:30 local is 2026-12-31T22:30:00.000Z
      const dec31Night = new Date("2026-12-31T22:30:00.000Z");
      const infoDec = getAlgiersDateInfo(dec31Night);
      expect(infoDec.year).toBe(2026);
      expect(infoDec.month).toBe(12);
      expect(infoDec.day).toBe(31);
      expect(infoDec.hour).toBe(23);
      expect(infoDec.minute).toBe(30);

      // 31 minutes later is 2027-01-01 00:01 local -> 2026-12-31T23:01:00.000Z
      const jan1Morning = new Date("2026-12-31T23:01:00.000Z");
      const infoJan = getAlgiersDateInfo(jan1Morning);
      expect(infoJan.year).toBe(2027);
      expect(infoJan.month).toBe(1);
      expect(infoJan.day).toBe(1);
      expect(infoJan.hour).toBe(0);
      expect(infoJan.minute).toBe(1);

      const bJan1 = getAlgiersDayBounds("2027-01-01");
      expect(bJan1.startUtc.toISOString()).toBe("2026-12-31T23:00:00.000Z");
      expect(bJan1.endUtc.toISOString()).toBe("2027-01-01T22:59:59.999Z");
      expect(bJan1.normalizedUtcMidnight.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    });

    // =========================================================================
    // SECTION 4: DAYLIGHT SAVING TIME IMMUNITY & YEAR-ROUND OFFSET
    // =========================================================================
    test("CHALLENGE-08: Full 365-day annual sweep: offset strictly +1 hour every single day", () => {
      // Step through all 365 days of 2026 at 12:00:00Z UTC
      const startMs = new Date("2026-01-01T12:00:00.000Z").getTime();
      const oneDayMs = 86400000;

      for (let day = 0; day < 365; day++) {
        const instant = new Date(startMs + day * oneDayMs);
        const info = getAlgiersDateInfo(instant);
        // UTC 12:00:00 must ALWAYS be local 13:00:00 (strictly UTC+1, no summer shifts)
        if (info.hour !== 13 || info.minute !== 0 || info.second !== 0) {
          throw new Error(`DST distortion detected on day ${day} (${instant.toISOString()}): got hour=${info.hour}`);
        }
      }
    });

    test("CHALLENGE-09: Host timezone simulation: European DST switch dates (March & October)", () => {
      // European DST begins last Sunday in March (2026-03-29), ends last Sunday in October (2026-10-25)
      const dstTransitionDates = [
        "2026-03-29T01:59:59.000Z",
        "2026-03-29T02:00:00.000Z",
        "2026-03-29T03:00:00.000Z",
        "2026-10-25T01:59:59.000Z",
        "2026-10-25T02:00:00.000Z",
        "2026-10-25T03:00:00.000Z",
      ];

      for (const iso of dstTransitionDates) {
        const targetDate = new Date(iso);
        for (const tz of SIMULATED_TIMEZONES) {
          evaluateWithTimezone(tz, () => {
            const info = getAlgiersDateInfo(targetDate);
            const utcHours = targetDate.getUTCHours();
            const expectedAlgiersHours = (utcHours + 1) % 24;
            expect(info.hour).toBe(expectedAlgiersHours);
          });
        }
      }
    });

    // =========================================================================
    // SECTION 5: DAYBOUNDS PARTITIONING & MATHEMATICAL INVARIANTS
    // =========================================================================
    test("CHALLENGE-10: DayBounds strictly partition time (no gaps, no overlaps, exact 86.4M ms)", () => {
      // Check 30 consecutive days from 2026-10-01 to 2026-10-31
      for (let d = 1; d <= 30; d++) {
        const d1Str = `2026-10-${String(d).padStart(2, "0")}`;
        const d2Str = `2026-10-${String(d + 1).padStart(2, "0")}`;

        const b1 = getAlgiersDayBounds(d1Str);
        const b2 = getAlgiersDayBounds(d2Str);

        // Invariant 1: Duration of each day must be exactly 86,400,000 ms
        const dur1 = b1.endUtc.getTime() - b1.startUtc.getTime() + 1;
        expect(dur1).toBe(86400000);

        // Invariant 2: Exactly 1 ms between end of day N and start of day N+1
        const gap = b2.startUtc.getTime() - b1.endUtc.getTime();
        expect(gap).toBe(1);

        // Invariant 3: normalizedUtcMidnight is exactly at 00:00:00.000Z
        expect(b1.normalizedUtcMidnight.getUTCHours()).toBe(0);
        expect(b1.normalizedUtcMidnight.getUTCMinutes()).toBe(0);
        expect(b1.normalizedUtcMidnight.getUTCSeconds()).toBe(0);
        expect(b1.normalizedUtcMidnight.getUTCMilliseconds()).toBe(0);
      }
    });

    // =========================================================================
    // SECTION 6: MONTE CARLO STRESS TEST AGAINST INTL ORACLE (10,000 TIMESTAMPS)
    // =========================================================================
    test("CHALLENGE-11: 10,000 synthetic timestamps fuzzing against Intl oracle", () => {
      const minEpoch = new Date("2020-01-01T00:00:00.000Z").getTime();
      const maxEpoch = new Date("2035-12-31T23:59:59.999Z").getTime();
      const range = maxEpoch - minEpoch;

      const intlDateOracle = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Algiers",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

      const intlTimeOracle = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Algiers",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        const randMs = minEpoch + Math.floor(Math.random() * range);
        const dateObj = new Date(randMs);

        const info = getAlgiersDateInfo(dateObj);
        const bounds = getAlgiersDayBounds(dateObj);
        const normalized = normalizeDateToAlgiersStartOfDay(dateObj);

        // Oracle verification
        const oracleDateStr = intlDateOracle.format(dateObj);
        const oracleTimeStr = intlTimeOracle.format(dateObj);

        if (info.dateStr !== oracleDateStr) {
          throw new Error(`Oracle divergence at ${dateObj.toISOString()}: info.dateStr=${info.dateStr} vs oracle=${oracleDateStr}`);
        }
        if (info.timeStr !== oracleTimeStr) {
          throw new Error(`Oracle time divergence at ${dateObj.toISOString()}: info.timeStr=${info.timeStr} vs oracle=${oracleTimeStr}`);
        }

        // Encapsulation invariant: dateObj must lie strictly between bounds.startUtc and bounds.endUtc
        if (dateObj.getTime() < bounds.startUtc.getTime() || dateObj.getTime() > bounds.endUtc.getTime()) {
          throw new Error(`Bounds encapsulation failure: ${dateObj.toISOString()} not in [${bounds.startUtc.toISOString()}, ${bounds.endUtc.toISOString()}]`);
        }

        // Idempotence invariant
        if (normalized.toISOString() !== bounds.normalizedUtcMidnight.toISOString()) {
          throw new Error(`Normalized mismatch: ${normalized.toISOString()} vs ${bounds.normalizedUtcMidnight.toISOString()}`);
        }
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(3000); // 10,000 iterations in under 3s
    });

    // =========================================================================
    // SECTION 7: ADVERSARIAL FORMATTING & EDGE CASES (formatDZD, formatNumber)
    // =========================================================================
    test("CHALLENGE-12: formatDZD negative zero and float cancellation stress", () => {
      // Cancellation error: 1.0 - 0.9 - 0.1 = -2.7755575615628914e-17
      const cancellationZero = 1.0 - 0.9 - 0.1;
      const formattedCancel = formatDZD(cancellationZero);
      
      // Strict check: float cancellation must NOT produce "-0 DZD"
      expect(formattedCancel).toBe("0 DZD");
      expect(formatDZD(-0.001)).toBe("0 DZD");

      // Hard check: basic 0 should be "0 DZD"
      expect(formatDZD(0)).toBe("0 DZD");
      expect(formatDZD("0")).toBe("0 DZD");
      expect(formatDZD(null)).toBe("0 DZD");
      expect(formatDZD(undefined)).toBe("0 DZD");
      expect(formatDZD(NaN)).toBe("0 DZD");
    });

    test("CHALLENGE-13: formatDZD and formatNumber with Prisma.Decimal and large values", () => {
      const decimalVal = new Prisma.Decimal("1250000.75");
      expect(formatDZD(decimalVal)).toBe("1 250 000,75 DZD");
      expect(formatDZD(decimalVal, "ar")).toBe("1 250 000,75 د.ج");

      const wholeDecimal = new Prisma.Decimal("3500.00");
      expect(formatDZD(wholeDecimal)).toBe("3 500 DZD");

      const negativeVal = -45000;
      expect(formatDZD(negativeVal)).toBe("-45 000 DZD");
    });
  });

  await runner.runQueuedTests();
  return runner.getSummary();
}

if (process.argv[1]?.endsWith("challenger-m1-date-stress.test.ts")) {
  runChallengerM1StressTests().then(() => {
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
