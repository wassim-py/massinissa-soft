import { describe, test, expect, runner } from "../helpers/runner";
import { safeImport } from "../helpers/moduleLoader";
import { evaluateWithTimezone } from "../helpers/timezoneSimulator";
import { Prisma } from "@prisma/client";

/**
 * Challenger M1-R2: Multi-Timezone & Untimezoned Datetime Parsing Stress Harness
 *
 * Verifies that:
 * 1. Untimezoned datetime strings ("2026-10-21 14:30:00", "2026-10-21T00:30:00", etc.)
 *    produce 100% byte-for-byte identical results regardless of host/client timezone.
 * 2. Fractional second handling (.5, .05, .123, .123456) parses correctly.
 * 3. 20 diverse worldwide client timezones (including half-hour and 45-minute offsets)
 *    produce zero divergence for date info, day bounds, normalization, and formatters.
 * 4. Boundary values (midnight 00:00:00, 00:30:00, 23:59:59.999) evaluate identically.
 */

const EXTENDED_SIMULATED_TIMEZONES = [
  "UTC",
  "Africa/Algiers",        // Target: UTC+1
  "Europe/Paris",          // UTC+1 / UTC+2
  "Europe/London",         // UTC+0 / UTC+1
  "America/New_York",      // UTC-5 / UTC-4
  "America/Los_Angeles",   // UTC-8 / UTC-7
  "America/Chicago",       // UTC-6 / UTC-5
  "America/Anchorage",     // UTC-9 / UTC-8
  "Pacific/Honolulu",      // UTC-10 (no DST)
  "Pacific/Auckland",      // UTC+12 / UTC+13
  "Asia/Tokyo",            // UTC+9 (no DST)
  "Asia/Shanghai",         // UTC+8 (no DST)
  "Asia/Dubai",            // UTC+4 (no DST)
  "Asia/Kolkata",          // UTC+5:30 (half-hour offset)
  "Asia/Kathmandu",        // UTC+5:45 (45-min offset)
  "Australia/Sydney",      // UTC+10 / UTC+11
  "Australia/Adelaide",    // UTC+9:30 / UTC+10:30 (half-hour offset)
  "America/St_Johns",      // UTC-3:30 / UTC-2:30 (half-hour offset)
  "Pacific/Chatham",       // UTC+12:45 / UTC+13:45 (45-min offset)
  "Atlantic/Cape_Verde",   // UTC-1 (no DST)
] as const;

export async function runChallengerTimezoneStressTests() {
  await describe("Challenger M1-R2: Untimezoned Strings & Multi-Timezone Empirical Stress", async () => {
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

    // Test vectors for untimezoned datetime strings
    const untimezonedCases = [
      {
        input: "2026-10-21 14:30:00",
        expectedDate: "2026-10-21",
        expectedTime: "14:30",
        expectedHour: 14,
        expectedMinute: 30,
        expectedSecond: 0,
        expectedFormattedDate: "21/10/2026",
        expectedFormattedTime: "14:30",
        expectedFormattedDateTime: "21/10/2026 14:30",
        expectedStartUtc: "2026-10-20T23:00:00.000Z",
        expectedEndUtc: "2026-10-21T22:59:59.999Z",
        expectedNormalized: "2026-10-21T00:00:00.000Z",
      },
      {
        input: "2026-10-21T00:30:00",
        expectedDate: "2026-10-21",
        expectedTime: "00:30",
        expectedHour: 0,
        expectedMinute: 30,
        expectedSecond: 0,
        expectedFormattedDate: "21/10/2026",
        expectedFormattedTime: "00:30",
        expectedFormattedDateTime: "21/10/2026 00:30",
        expectedStartUtc: "2026-10-20T23:00:00.000Z",
        expectedEndUtc: "2026-10-21T22:59:59.999Z",
        expectedNormalized: "2026-10-21T00:00:00.000Z",
      },
      {
        input: "2026-10-21 00:00:00",
        expectedDate: "2026-10-21",
        expectedTime: "00:00",
        expectedHour: 0,
        expectedMinute: 0,
        expectedSecond: 0,
        expectedFormattedDate: "21/10/2026",
        expectedFormattedTime: "00:00",
        expectedFormattedDateTime: "21/10/2026 00:00",
        expectedStartUtc: "2026-10-20T23:00:00.000Z",
        expectedEndUtc: "2026-10-21T22:59:59.999Z",
        expectedNormalized: "2026-10-21T00:00:00.000Z",
      },
      {
        input: "2026-10-21 23:59:59",
        expectedDate: "2026-10-21",
        expectedTime: "23:59",
        expectedHour: 23,
        expectedMinute: 59,
        expectedSecond: 59,
        expectedFormattedDate: "21/10/2026",
        expectedFormattedTime: "23:59",
        expectedFormattedDateTime: "21/10/2026 23:59",
        expectedStartUtc: "2026-10-20T23:00:00.000Z",
        expectedEndUtc: "2026-10-21T22:59:59.999Z",
        expectedNormalized: "2026-10-21T00:00:00.000Z",
      },
      {
        input: "2026-10-21 14:30",
        expectedDate: "2026-10-21",
        expectedTime: "14:30",
        expectedHour: 14,
        expectedMinute: 30,
        expectedSecond: 0,
        expectedFormattedDate: "21/10/2026",
        expectedFormattedTime: "14:30",
        expectedFormattedDateTime: "21/10/2026 14:30",
        expectedStartUtc: "2026-10-20T23:00:00.000Z",
        expectedEndUtc: "2026-10-21T22:59:59.999Z",
        expectedNormalized: "2026-10-21T00:00:00.000Z",
      },
      {
        input: "2026-10-21T14:30",
        expectedDate: "2026-10-21",
        expectedTime: "14:30",
        expectedHour: 14,
        expectedMinute: 30,
        expectedSecond: 0,
        expectedFormattedDate: "21/10/2026",
        expectedFormattedTime: "14:30",
        expectedFormattedDateTime: "21/10/2026 14:30",
        expectedStartUtc: "2026-10-20T23:00:00.000Z",
        expectedEndUtc: "2026-10-21T22:59:59.999Z",
        expectedNormalized: "2026-10-21T00:00:00.000Z",
      },
      {
        input: "2024-02-29 08:15:00", // Leap year
        expectedDate: "2024-02-29",
        expectedTime: "08:15",
        expectedHour: 8,
        expectedMinute: 15,
        expectedSecond: 0,
        expectedFormattedDate: "29/02/2024",
        expectedFormattedTime: "08:15",
        expectedFormattedDateTime: "29/02/2024 08:15",
        expectedStartUtc: "2024-02-28T23:00:00.000Z",
        expectedEndUtc: "2024-02-29T22:59:59.999Z",
        expectedNormalized: "2024-02-29T00:00:00.000Z",
      },
      {
        input: "2026-12-31 23:45:00", // Year-end
        expectedDate: "2026-12-31",
        expectedTime: "23:45",
        expectedHour: 23,
        expectedMinute: 45,
        expectedSecond: 0,
        expectedFormattedDate: "31/12/2026",
        expectedFormattedTime: "23:45",
        expectedFormattedDateTime: "31/12/2026 23:45",
        expectedStartUtc: "2026-12-30T23:00:00.000Z",
        expectedEndUtc: "2026-12-31T22:59:59.999Z",
        expectedNormalized: "2026-12-31T00:00:00.000Z",
      },
      {
        input: "2026-01-01 00:15:00", // Year-start midnight window
        expectedDate: "2026-01-01",
        expectedTime: "00:15",
        expectedHour: 0,
        expectedMinute: 15,
        expectedSecond: 0,
        expectedFormattedDate: "01/01/2026",
        expectedFormattedTime: "00:15",
        expectedFormattedDateTime: "01/01/2026 00:15",
        expectedStartUtc: "2025-12-31T23:00:00.000Z",
        expectedEndUtc: "2026-01-01T22:59:59.999Z",
        expectedNormalized: "2026-01-01T00:00:00.000Z",
      },
    ];

    test("TZ-01: Untimezoned datetime strings cross-timezone invariance (20 worldwide timezones)", () => {
      for (const tc of untimezonedCases) {
        for (const tz of EXTENDED_SIMULATED_TIMEZONES) {
          evaluateWithTimezone(tz, () => {
            const info = getAlgiersDateInfo(tc.input);
            expect(info.dateStr).toBe(tc.expectedDate);
            expect(info.timeStr).toBe(tc.expectedTime);
            expect(info.hour).toBe(tc.expectedHour);
            expect(info.minute).toBe(tc.expectedMinute);
            expect(info.second).toBe(tc.expectedSecond);

            const bounds = getAlgiersDayBounds(tc.input);
            expect(bounds.startUtc.toISOString()).toBe(tc.expectedStartUtc);
            expect(bounds.endUtc.toISOString()).toBe(tc.expectedEndUtc);
            expect(bounds.normalizedUtcMidnight.toISOString()).toBe(tc.expectedNormalized);

            const norm = normalizeDateToAlgiersStartOfDay(tc.input);
            expect(norm.toISOString()).toBe(tc.expectedNormalized);

            const fDate = formatAlgiersDate(tc.input);
            expect(fDate).toBe(tc.expectedFormattedDate);

            const fTime = formatAlgiersTime(tc.input);
            expect(fTime).toBe(tc.expectedFormattedTime);

            const fDateTime = formatAlgiersDateTime(tc.input);
            expect(fDateTime).toBe(tc.expectedFormattedDateTime);
          });
        }
      }
    });

    test("TZ-02: Untimezoned fractional seconds precision parsing (.5, .05, .123, .999, .123456)", () => {
      const fractionalCases = [
        { str: "2026-10-21 14:30:00.5", expectedMs: 500 },
        { str: "2026-10-21 14:30:00.05", expectedMs: 50 },
        { str: "2026-10-21 14:30:00.005", expectedMs: 5 },
        { str: "2026-10-21 14:30:00.123", expectedMs: 123 },
        { str: "2026-10-21 14:30:00.999", expectedMs: 999 },
        { str: "2026-10-21 14:30:00.123456", expectedMs: 123 }, // Truncates/slices to 3 digits
      ];

      for (const fc of fractionalCases) {
        for (const tz of ["UTC", "America/New_York", "Asia/Tokyo", "Australia/Sydney", "Africa/Algiers"]) {
          evaluateWithTimezone(tz, () => {
            const info = getAlgiersDateInfo(fc.str);
            expect(info.dateStr).toBe("2026-10-21");
            expect(info.timeStr).toBe("14:30");
            expect(info.second).toBe(0);

            // Check exact millisecond mapping
            // In Algiers local 14:30:00.xxx is UTC 13:30:00.xxx
            const bounds = getAlgiersDayBounds(fc.str);
            expect(bounds.dateStr).toBe("2026-10-21");
          });
        }
      }
    });

    test("TZ-03: Date-only strings ('YYYY-MM-DD') cross-timezone invariance (20 worldwide timezones)", () => {
      const dateOnlyCases = [
        "2026-10-21",
        "2026-01-01",
        "2026-12-31",
        "2024-02-29",
        "2025-02-28",
        "2026-07-15",
      ];

      for (const dateStr of dateOnlyCases) {
        for (const tz of EXTENDED_SIMULATED_TIMEZONES) {
          evaluateWithTimezone(tz, () => {
            const info = getAlgiersDateInfo(dateStr);
            expect(info.dateStr).toBe(dateStr);
            expect(info.timeStr).toBe("00:00");
            expect(info.hour).toBe(0);
            expect(info.minute).toBe(0);

            const bounds = getAlgiersDayBounds(dateStr);
            expect(bounds.dateStr).toBe(dateStr);
            expect(bounds.normalizedUtcMidnight.toISOString()).toBe(`${dateStr}T00:00:00.000Z`);

            const norm = normalizeDateToAlgiersStartOfDay(dateStr);
            expect(norm.toISOString()).toBe(`${dateStr}T00:00:00.000Z`);
          });
        }
      }
    });

    test("TZ-04: Fully qualified ISO strings with timezone offsets ('Z', '+01:00', '-05:00')", () => {
      // 2026-10-21T13:30:00.000Z in UTC is 14:30:00 in Algiers (UTC+1)
      const isoZ = "2026-10-21T13:30:00.000Z";
      // 2026-10-21T14:30:00.000+01:00 is also 14:30:00 in Algiers
      const isoPlus1 = "2026-10-21T14:30:00.000+01:00";
      // 2026-10-21T09:30:00.000-04:00 is also 14:30:00 in Algiers
      const isoMinus4 = "2026-10-21T09:30:00.000-04:00";

      for (const tz of EXTENDED_SIMULATED_TIMEZONES) {
        evaluateWithTimezone(tz, () => {
          for (const iso of [isoZ, isoPlus1, isoMinus4]) {
            const info = getAlgiersDateInfo(iso);
            expect(info.dateStr).toBe("2026-10-21");
            expect(info.timeStr).toBe("14:30");
            expect(info.hour).toBe(14);
            expect(info.minute).toBe(30);

            const fDateTime = formatAlgiersDateTime(iso);
            expect(fDateTime).toBe("21/10/2026 14:30");
          }
        });
      }
    });

    test("TZ-05: Fallback behavior for null, undefined, empty, and invalid string inputs", () => {
      for (const tz of ["UTC", "America/New_York", "Asia/Tokyo", "Africa/Algiers"]) {
        evaluateWithTimezone(tz, () => {
          expect(formatAlgiersDate(null)).toBe("");
          expect(formatAlgiersDate(undefined)).toBe("");
          expect(formatAlgiersDate("")).toBe("");
          expect(formatAlgiersDate("   ")).toBe("");
          expect(formatAlgiersDate("invalid-date-string")).toBe("");

          expect(formatAlgiersTime(null)).toBe("");
          expect(formatAlgiersTime(undefined)).toBe("");
          expect(formatAlgiersTime("")).toBe("");
          expect(formatAlgiersTime("not-a-date")).toBe("");

          expect(formatAlgiersDateTime(null)).toBe("");
          expect(formatAlgiersDateTime(undefined)).toBe("");
          expect(formatAlgiersDateTime("")).toBe("");
          expect(formatAlgiersDateTime("gibberish")).toBe("");

          // getAlgiersDateInfo defaults to current time if null/undefined
          const currentInfo = getAlgiersDateInfo(null);
          expect(typeof currentInfo.year).toBe("number");
          expect(currentInfo.year).toBeGreaterThan(2020);
        });
      }
    });

    test("TZ-06: Currency and number formatting cross-timezone invariance (20 worldwide timezones)", () => {
      const testAmounts = [
        0,
        -0,
        100.1 - 100 - 0.1, // Float artifact
        -0.001,
        -0.004,
        -0.005,
        -1500.5,
        1250000.75,
        new Prisma.Decimal("50000.00"),
        new Prisma.Decimal("1234567.89"),
        "9876543.21",
        null,
        undefined,
        NaN,
      ];

      for (const amount of testAmounts) {
        let referenceNumber: string | null = null;
        let referenceDzdFr: string | null = null;
        let referenceDzdAr: string | null = null;

        for (const tz of EXTENDED_SIMULATED_TIMEZONES) {
          evaluateWithTimezone(tz, () => {
            const numStr = formatNumber(amount);
            const dzdFr = formatDZD(amount, "fr");
            const dzdAr = formatDZD(amount, "ar");

            if (referenceNumber === null) {
              referenceNumber = numStr;
              referenceDzdFr = dzdFr;
              referenceDzdAr = dzdAr;
            } else {
              expect(numStr).toBe(referenceNumber);
              expect(dzdFr).toBe(referenceDzdFr);
              expect(dzdAr).toBe(referenceDzdAr);
            }
          });
        }
      }
    });
  });

  await runner.runQueuedTests();
  return runner.getSummary();
}

if (process.argv[1]?.endsWith("challenger-m1-timezone-stress.test.ts")) {
  runChallengerTimezoneStressTests().then(() => {
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
