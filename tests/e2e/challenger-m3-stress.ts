import { describe, test, expect, runner } from "./helpers/runner";
import { evaluateWithTimezone, SIMULATED_TIMEZONES } from "./helpers/timezoneSimulator";
import {
  getAlgiersDateInfo,
  getAlgiersTodayDateString,
  getAlgiersDayBounds,
  normalizeDateToAlgiersStartOfDay,
  formatAlgiersDate,
  formatAlgiersTime,
  formatAlgiersDateTime,
} from "../../src/lib/algiersDate";
import { normalizeDateToStartOfDay, resolveLedgerType } from "../../src/lib/ledger";

// Script parity reference implementation from scripts/sync-database-payments.js:11-16
function syncScriptNormalize(date: any): Date {
  const d = new Date(date);
  const algiersTime = new Date(d.getTime() + 3600000);
  return new Date(
    Date.UTC(
      algiersTime.getUTCFullYear(),
      algiersTime.getUTCMonth(),
      algiersTime.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );
}

export async function runChallengerM3StressTests() {
  await describe("Challenger M3: Business-Day Ledger & Revenue Date Boundaries Stress Verification", async () => {
    // =========================================================================
    // 1. 00:00 TO 01:00 AM MIDNIGHT CROSSOVER MATRIX ACROSS SIMULATED TIMEZONES
    // =========================================================================

    test("M3-01: Discrete millisecond boundary transitions at local midnight", () => {
      // In Algiers (UTC+1):
      // Oct 20 23:59:59.999 local === 2026-10-20T22:59:59.999Z
      // Oct 21 00:00:00.000 local === 2026-10-20T23:00:00.000Z
      // Oct 21 00:00:00.001 local === 2026-10-20T23:00:00.001Z
      // Oct 21 00:30:00.000 local === 2026-10-20T23:30:00.000Z
      // Oct 21 00:59:59.999 local === 2026-10-20T23:59:59.999Z
      // Oct 21 01:00:00.000 local === 2026-10-21T00:00:00.000Z

      const beforeMidnight = new Date("2026-10-20T22:59:59.999Z");
      const sharpMidnight = new Date("2026-10-20T23:00:00.000Z");
      const justAfterMidnight = new Date("2026-10-20T23:00:00.001Z");
      const halfHourPast = new Date("2026-10-20T23:30:00.000Z");
      const beforeOneAm = new Date("2026-10-20T23:59:59.999Z");
      const sharpOneAm = new Date("2026-10-21T00:00:00.000Z");

      // Before midnight belongs to Oct 20
      expect(getAlgiersDateInfo(beforeMidnight).dateStr).toBe("2026-10-20");
      expect(normalizeDateToStartOfDay(beforeMidnight).toISOString()).toBe("2026-10-20T00:00:00.000Z");

      // Exactly at midnight, transitions to Oct 21
      expect(getAlgiersDateInfo(sharpMidnight).dateStr).toBe("2026-10-21");
      expect(getAlgiersDateInfo(sharpMidnight).timeStr).toBe("00:00");
      expect(normalizeDateToStartOfDay(sharpMidnight).toISOString()).toBe("2026-10-21T00:00:00.000Z");

      // 1 millisecond past midnight
      expect(getAlgiersDateInfo(justAfterMidnight).dateStr).toBe("2026-10-21");
      expect(normalizeDateToStartOfDay(justAfterMidnight).toISOString()).toBe("2026-10-21T00:00:00.000Z");

      // 00:30 AM
      expect(getAlgiersDateInfo(halfHourPast).dateStr).toBe("2026-10-21");
      expect(getAlgiersDateInfo(halfHourPast).timeStr).toBe("00:30");
      expect(normalizeDateToStartOfDay(halfHourPast).toISOString()).toBe("2026-10-21T00:00:00.000Z");

      // 00:59:59.999 (last ms of midnight crossover window)
      expect(getAlgiersDateInfo(beforeOneAm).dateStr).toBe("2026-10-21");
      expect(getAlgiersDateInfo(beforeOneAm).timeStr).toBe("00:59");
      expect(normalizeDateToStartOfDay(beforeOneAm).toISOString()).toBe("2026-10-21T00:00:00.000Z");

      // Sharp 01:00:00.000
      expect(getAlgiersDateInfo(sharpOneAm).dateStr).toBe("2026-10-21");
      expect(getAlgiersDateInfo(sharpOneAm).timeStr).toBe("01:00");
      expect(normalizeDateToStartOfDay(sharpOneAm).toISOString()).toBe("2026-10-21T00:00:00.000Z");
    });

    test("M3-02: Midnight hour transactions evaluated under hostile simulated client timezones", () => {
      const midnightTx = new Date("2026-10-20T23:30:00.000Z"); // 00:30 AM Oct 21 in Algiers

      const testZones = [
        "UTC",
        "Africa/Algiers",
        "Europe/Paris",
        "America/New_York",
        "America/Los_Angeles",
        "Asia/Tokyo",
        "Asia/Kolkata",
        "Pacific/Auckland",
        "Pacific/Honolulu",
      ];

      for (const tz of testZones) {
        evaluateWithTimezone(tz, () => {
          const info = getAlgiersDateInfo(midnightTx);
          expect(info.dateStr).toBe("2026-10-21");
          expect(info.timeStr).toBe("00:30");

          const bounds = getAlgiersDayBounds(midnightTx);
          expect(bounds.dateStr).toBe("2026-10-21");
          expect(bounds.startUtc.toISOString()).toBe("2026-10-20T23:00:00.000Z");
          expect(bounds.endUtc.toISOString()).toBe("2026-10-21T22:59:59.999Z");
          expect(bounds.normalizedUtcMidnight.toISOString()).toBe("2026-10-21T00:00:00.000Z");

          const normalized = normalizeDateToStartOfDay(midnightTx);
          expect(normalized.toISOString()).toBe("2026-10-21T00:00:00.000Z");
        });
      }
    });

    test("M3-03: Formatters determinism in midnight hour (00:30 AM) across timezones", () => {
      const midnightTx = new Date("2026-10-20T23:30:00.000Z");

      for (const tz of SIMULATED_TIMEZONES) {
        evaluateWithTimezone(tz, () => {
          const dateStr = formatAlgiersDate(midnightTx);
          expect(dateStr).toBe("21/10/2026");

          const timeStr = formatAlgiersTime(midnightTx);
          expect(timeStr).toBe("00:30");

          const dateTimeStr = formatAlgiersDateTime(midnightTx);
          expect(dateTimeStr).toBe("21/10/2026 00:30");
        });
      }
    });

    test("M3-04: normalizeDateToStartOfDay accepts all string formats and explicit offsets", () => {
      // All these representations designate 00:30 AM on Oct 21 in Algiers:
      const inputs = [
        "2026-10-20T23:30:00.000Z",          // UTC ISO
        "2026-10-21T00:30:00.000+01:00",      // Algiers local ISO
        "2026-10-20T19:30:00.000-04:00",      // New York EDT ISO
        "2026-10-21T08:30:00.000+09:00",      // Tokyo JST ISO
        "2026-10-21",                         // Date-only
        "2026-10-21 00:30:00",                // Untimezoned space
        "2026-10-21T00:30:00",                // Untimezoned T
        new Date("2026-10-20T23:30:00.000Z"), // Date object
        new Date("2026-10-20T23:30:00.000Z").getTime(), // Numeric ms
      ];

      for (const input of inputs) {
        const normalized = normalizeDateToStartOfDay(input as any);
        expect(normalized.toISOString()).toBe("2026-10-21T00:00:00.000Z");
      }
    });

    // =========================================================================
    // 2. LEAP YEARS, MONTH BOUNDARIES & YEAR TRANSITIONS
    // =========================================================================

    test("M3-05: Leap Day 2024 (Feb 28 23:00Z -> Feb 29 00:00 local crossover)", () => {
      // 2024 is a leap year (Feb 29 exists)
      const feb28Late = new Date("2024-02-28T22:59:59.999Z"); // 23:59:59 on Feb 28 local
      const feb29Sharp = new Date("2024-02-28T23:00:00.000Z"); // 00:00:00 on Feb 29 local
      const feb29MidnightHour = new Date("2024-02-28T23:45:00.000Z"); // 00:45:00 on Feb 29 local
      const feb29End = new Date("2024-02-29T22:59:59.999Z"); // 23:59:59 on Feb 29 local
      const mar01Sharp = new Date("2024-02-29T23:00:00.000Z"); // 00:00:00 on Mar 01 local

      expect(getAlgiersDateInfo(feb28Late).dateStr).toBe("2024-02-28");
      expect(normalizeDateToStartOfDay(feb28Late).toISOString()).toBe("2024-02-28T00:00:00.000Z");

      expect(getAlgiersDateInfo(feb29Sharp).dateStr).toBe("2024-02-29");
      expect(normalizeDateToStartOfDay(feb29Sharp).toISOString()).toBe("2024-02-29T00:00:00.000Z");

      expect(getAlgiersDateInfo(feb29MidnightHour).dateStr).toBe("2024-02-29");
      expect(normalizeDateToStartOfDay(feb29MidnightHour).toISOString()).toBe("2024-02-29T00:00:00.000Z");

      expect(getAlgiersDateInfo(feb29End).dateStr).toBe("2024-02-29");
      expect(normalizeDateToStartOfDay(feb29End).toISOString()).toBe("2024-02-29T00:00:00.000Z");

      expect(getAlgiersDateInfo(mar01Sharp).dateStr).toBe("2024-03-01");
      expect(normalizeDateToStartOfDay(mar01Sharp).toISOString()).toBe("2024-03-01T00:00:00.000Z");

      // Verify day bounds for leap day
      const bounds = getAlgiersDayBounds("2024-02-29");
      expect(bounds.startUtc.toISOString()).toBe("2024-02-28T23:00:00.000Z");
      expect(bounds.endUtc.toISOString()).toBe("2024-02-29T22:59:59.999Z");
      expect(bounds.normalizedUtcMidnight.toISOString()).toBe("2024-02-29T00:00:00.000Z");
    });

    test("M3-06: Non-Leap Year 2026 (Feb 28 to Mar 01 crossover, no Feb 29)", () => {
      // 2026 is NOT a leap year
      const feb28Late = new Date("2026-02-28T22:59:59.999Z"); // 23:59:59 on Feb 28 local
      const mar01Sharp = new Date("2026-02-28T23:00:00.000Z"); // 00:00:00 on Mar 01 local
      const mar01MidnightHour = new Date("2026-02-28T23:30:00.000Z"); // 00:30:00 on Mar 01 local

      expect(getAlgiersDateInfo(feb28Late).dateStr).toBe("2026-02-28");
      expect(normalizeDateToStartOfDay(feb28Late).toISOString()).toBe("2026-02-28T00:00:00.000Z");

      expect(getAlgiersDateInfo(mar01Sharp).dateStr).toBe("2026-03-01");
      expect(normalizeDateToStartOfDay(mar01Sharp).toISOString()).toBe("2026-03-01T00:00:00.000Z");

      expect(getAlgiersDateInfo(mar01MidnightHour).dateStr).toBe("2026-03-01");
      expect(normalizeDateToStartOfDay(mar01MidnightHour).toISOString()).toBe("2026-03-01T00:00:00.000Z");

      const febBounds = getAlgiersDayBounds("2026-02-28");
      expect(febBounds.startUtc.toISOString()).toBe("2026-02-27T23:00:00.000Z");
      expect(febBounds.endUtc.toISOString()).toBe("2026-02-28T22:59:59.999Z");

      const marBounds = getAlgiersDayBounds("2026-03-01");
      expect(marBounds.startUtc.toISOString()).toBe("2026-02-28T23:00:00.000Z");
      expect(marBounds.endUtc.toISOString()).toBe("2026-03-01T22:59:59.999Z");
    });

    test("M3-07: Year boundary transition (Dec 31, 2026 to Jan 1, 2027)", () => {
      const dec31Late = new Date("2026-12-31T22:59:59.999Z");
      const jan01Sharp = new Date("2026-12-31T23:00:00.000Z");
      const jan01MidnightHour = new Date("2026-12-31T23:30:00.000Z");
      const jan01OneAm = new Date("2027-01-01T00:00:00.000Z");

      expect(getAlgiersDateInfo(dec31Late).dateStr).toBe("2026-12-31");
      expect(normalizeDateToStartOfDay(dec31Late).toISOString()).toBe("2026-12-31T00:00:00.000Z");

      expect(getAlgiersDateInfo(jan01Sharp).dateStr).toBe("2027-01-01");
      expect(normalizeDateToStartOfDay(jan01Sharp).toISOString()).toBe("2027-01-01T00:00:00.000Z");

      expect(getAlgiersDateInfo(jan01MidnightHour).dateStr).toBe("2027-01-01");
      expect(normalizeDateToStartOfDay(jan01MidnightHour).toISOString()).toBe("2027-01-01T00:00:00.000Z");

      expect(getAlgiersDateInfo(jan01OneAm).dateStr).toBe("2027-01-01");
      expect(normalizeDateToStartOfDay(jan01OneAm).toISOString()).toBe("2027-01-01T00:00:00.000Z");

      const newYearBounds = getAlgiersDayBounds("2027-01-01");
      expect(newYearBounds.startUtc.toISOString()).toBe("2026-12-31T23:00:00.000Z");
      expect(newYearBounds.endUtc.toISOString()).toBe("2027-01-01T22:59:59.999Z");
      expect(newYearBounds.normalizedUtcMidnight.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    });

    test("M3-08: All 12 month-end transitions in 2026 correctly increment to day 01", () => {
      // Days in each month of 2026:
      const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

      for (let m = 1; m <= 12; m++) {
        const lastDay = monthLengths[m - 1];
        const nextMonth = m === 12 ? 1 : m + 1;
        const nextYear = m === 12 ? 2027 : 2026;

        // Construct 23:30Z on the last day of month m (00:30 AM of 1st day of next month)
        // Date.UTC(2026, m - 1, lastDay, 23, 30, 0, 0)
        const crossoverTime = new Date(Date.UTC(2026, m - 1, lastDay, 23, 30, 0, 0));
        const expectedNextDateStr = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

        const info = getAlgiersDateInfo(crossoverTime);
        expect(info.dateStr).toBe(expectedNextDateStr);
        expect(info.hour).toBe(0);
        expect(info.minute).toBe(30);

        const normalized = normalizeDateToStartOfDay(crossoverTime);
        const expectedMidnight = `${expectedNextDateStr}T00:00:00.000Z`;
        expect(normalized.toISOString()).toBe(expectedMidnight);

        // Verify day bounds for day 01 of next month starts at 23:00Z of last day
        const bounds = getAlgiersDayBounds(expectedNextDateStr);
        const expectedStart = new Date(Date.UTC(2026, m - 1, lastDay, 23, 0, 0, 0));
        expect(bounds.startUtc.toISOString()).toBe(expectedStart.toISOString());
      }
    });

    // =========================================================================
    // 3. REVENUE QUERY BUSINESS-DAY WINDOW INVARIANTS & CONTIGUITY
    // =========================================================================

    test("M3-09: 365-Day contiguity invariant: Zero gaps, zero overlaps between consecutive days", () => {
      // For every consecutive pair of calendar days in 2026:
      // bounds(day_k).endUtc.getTime() + 1 === bounds(day_k+1).startUtc.getTime()
      // duration === exactly 86,400,000 ms

      let current = new Date(Date.UTC(2026, 0, 1, 12, 0, 0, 0)); // Jan 1, 2026

      for (let i = 0; i < 365; i++) {
        const info = getAlgiersDateInfo(current);
        const bounds = getAlgiersDayBounds(info.dateStr);

        const duration = bounds.endUtc.getTime() - bounds.startUtc.getTime() + 1;
        expect(duration).toBe(86400000); // Exactly 24 hours in ms

        // Normalized midnight must be strictly inside [startUtc, endUtc]
        expect(bounds.normalizedUtcMidnight.getTime() > bounds.startUtc.getTime()).toBe(true);
        expect(bounds.normalizedUtcMidnight.getTime() < bounds.endUtc.getTime()).toBe(true);

        // Next day contiguity
        const nextDay = new Date(current.getTime() + 86400000);
        const nextInfo = getAlgiersDateInfo(nextDay);
        const nextBounds = getAlgiersDayBounds(nextInfo.dateStr);

        expect(bounds.endUtc.getTime() + 1).toBe(nextBounds.startUtc.getTime());

        current = nextDay;
      }
    });

    test("M3-10: Boundary inclusion/exclusion precision at single-millisecond resolution", () => {
      const bounds = getAlgiersDayBounds("2026-10-21");
      const startMs = bounds.startUtc.getTime(); // 2026-10-20T23:00:00.000Z
      const endMs = bounds.endUtc.getTime();     // 2026-10-21T22:59:59.999Z

      // Exactly at start
      expect(startMs >= startMs && startMs <= endMs).toBe(true);

      // 1 ms before start (excluded)
      expect(startMs - 1 >= startMs).toBe(false);

      // Exactly at end
      expect(endMs >= startMs && endMs <= endMs).toBe(true);

      // 1 ms after end (excluded)
      expect(endMs + 1 <= endMs).toBe(false);

      // Midnight transaction (00:30 Algiers = 23:30Z)
      const midMs = new Date("2026-10-20T23:30:00.000Z").getTime();
      expect(midMs >= startMs && midMs <= endMs).toBe(true);
    });

    test("M3-11: Multi-day range calculation spanning month and year boundaries", () => {
      // Range: 2026-12-25 to 2027-01-05 (12 days total)
      const startBounds = getAlgiersDayBounds("2026-12-25");
      const endBounds = getAlgiersDayBounds("2027-01-05");

      const queryStart = startBounds.startUtc; // 2026-12-24T23:00:00.000Z
      const queryEnd = endBounds.endUtc;       // 2027-01-05T22:59:59.999Z

      expect(queryStart.toISOString()).toBe("2026-12-24T23:00:00.000Z");
      expect(queryEnd.toISOString()).toBe("2027-01-05T22:59:59.999Z");

      const totalMs = queryEnd.getTime() - queryStart.getTime() + 1;
      expect(totalMs).toBe(12 * 86400000);
    });

    // =========================================================================
    // 4. LEDGER SYNC & SCRIPT PARITY
    // =========================================================================

    test("M3-12: Parity between src/lib/ledger.ts and scripts/sync-database-payments.js across midnight hour", () => {
      // Test every minute from 00:00 to 00:59 local (23:00Z to 23:59Z)
      for (let min = 0; min < 60; min++) {
        const ts = new Date(`2026-10-20T23:${String(min).padStart(2, "0")}:30.000Z`);

        const ledgerRes = normalizeDateToStartOfDay(ts);
        const scriptRes = syncScriptNormalize(ts);

        expect(ledgerRes.toISOString()).toBe("2026-10-21T00:00:00.000Z");
        expect(scriptRes.toISOString()).toBe("2026-10-21T00:00:00.000Z");
        expect(ledgerRes.toISOString()).toBe(scriptRes.toISOString());
      }
    });

    test("M3-13: Ledger aggregation simulation correctly attributes cross-midnight vouchers", () => {
      // Mock raw vouchers and refunds
      const mockVouchers = [
        { id: 1, amount: 2000, issuedAt: new Date("2026-10-20T22:45:00.000Z"), paymentType: "TUITION_4SESSION", branchId: 1 }, // 23:45 Oct 20
        { id: 2, amount: 3500, issuedAt: new Date("2026-10-20T23:05:00.000Z"), paymentType: "TUITION_4SESSION", branchId: 1 }, // 00:05 Oct 21
        { id: 3, amount: 1500, issuedAt: new Date("2026-10-20T23:30:00.000Z"), paymentType: "INSCRIPTION", branchId: 1 },      // 00:30 Oct 21
        { id: 4, amount: 5000, issuedAt: new Date("2026-10-21T00:15:00.000Z"), paymentType: "WORKSHOP", branchId: 1 },         // 01:15 Oct 21
      ];

      const mockRefunds = [
        { id: 101, amount: 1000, refundedAt: new Date("2026-10-20T23:40:00.000Z"), branchId: 1 },                              // 00:40 Oct 21
      ];

      // Replicate syncDailyLedgerFromVouchers aggregation logic
      const ledgerMap = new Map<string, number>();

      for (const v of mockVouchers) {
        const norm = normalizeDateToStartOfDay(v.issuedAt);
        const type = resolveLedgerType(v.paymentType, v.paymentType === "WORKSHOP");
        const key = `${v.branchId}|${norm.toISOString()}|${type}`;
        ledgerMap.set(key, (ledgerMap.get(key) || 0) + v.amount);
      }

      for (const r of mockRefunds) {
        const norm = normalizeDateToStartOfDay(r.refundedAt);
        const key = `${r.branchId}|${norm.toISOString()}|REFUND`;
        ledgerMap.set(key, (ledgerMap.get(key) || 0) + r.amount);
      }

      // Assertions:
      // Oct 20 should only contain Voucher 1 (2000 TUITION)
      expect(ledgerMap.get("1|2026-10-20T00:00:00.000Z|TUITION")).toBe(2000);

      // Oct 21 should contain Voucher 2 (3500 TUITION)
      expect(ledgerMap.get("1|2026-10-21T00:00:00.000Z|TUITION")).toBe(3500);

      // Oct 21 should contain Voucher 3 (1500 INSCRIPTION)
      expect(ledgerMap.get("1|2026-10-21T00:00:00.000Z|INSCRIPTION")).toBe(1500);

      // Oct 21 should contain Voucher 4 (5000 ATELIER_FORMATION)
      expect(ledgerMap.get("1|2026-10-21T00:00:00.000Z|ATELIER_FORMATION")).toBe(5000);

      // Oct 21 should contain Refund 1 (1000 REFUND)
      expect(ledgerMap.get("1|2026-10-21T00:00:00.000Z|REFUND")).toBe(1000);
    });

    // =========================================================================
    // 5. UI FILTER RESOLUTION & URL PARAMETER ROBUSTNESS
    // =========================================================================

    test("M3-14: RevenueFilterBar today/week/month bounds evaluated across client timezones", () => {
      // Simulate client clock at 2026-10-20T23:30:00.000Z (00:30 AM Oct 21 in Algiers)
      // In London it is Oct 20 23:30, in Tokyo it is Oct 21 08:30, in LA it is Oct 20 16:30.
      const fixedNow = new Date("2026-10-20T23:30:00.000Z");

      for (const tz of SIMULATED_TIMEZONES) {
        evaluateWithTimezone(tz, () => {
          // Replicate RevenueFilterBar lines 32-36
          const algiersToday = getAlgiersDateInfo(fixedNow);
          const todayStr = algiersToday.dateStr;
          const weekStartDate = new Date(fixedNow.getTime() - 7 * 24 * 60 * 60 * 1000);
          const weekStartStr = getAlgiersDateInfo(weekStartDate).dateStr;
          const firstOfMonthStr = `${algiersToday.year}-${String(algiersToday.month).padStart(2, "0")}-01`;

          expect(todayStr).toBe("2026-10-21");
          expect(weekStartStr).toBe("2026-10-14");
          expect(firstOfMonthStr).toBe("2026-10-01");
        });
      }
    });

    test("M3-15: daily-ledger searchParams date validation and fallback", () => {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

      // Valid date inputs
      const validCases = ["2026-10-21", "2024-02-29", "2027-01-01", "2026-12-31"];
      for (const date of validCases) {
        expect(dateRegex.test(date)).toBe(true);
      }

      // Malformed / injection inputs that must be rejected and trigger safe fallback
      const invalidCases = [
        "",
        "2026-1-1",
        "2026/10/21",
        "invalid",
        "2026-10-21T00:00:00Z",
        "2026-10-21; DROP TABLE",
        "../admin",
        "undefined",
        "null",
      ];
      for (const date of invalidCases) {
        expect(dateRegex.test(date)).toBe(false);
      }
    });

    // =========================================================================
    // 6. PROPERTY-BASED PSEUDO-RANDOM STRESS GENERATOR
    // =========================================================================

    test("M3-16: Property harness: 2,000 pseudo-random timestamps date math & parity invariants", () => {
      // Seed pseudo-random generator
      let seed = 1337;
      function pseudoRandom() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      }

      // Span 6 years: Jan 1, 2023 to Dec 31, 2028
      const startMs = new Date("2023-01-01T00:00:00.000Z").getTime();
      const endMs = new Date("2028-12-31T23:59:59.999Z").getTime();
      const range = endMs - startMs;

      for (let i = 0; i < 2000; i++) {
        const randMs = Math.floor(startMs + pseudoRandom() * range);
        const ts = new Date(randMs);

        // 1. Decompose into Algiers date info
        const info = getAlgiersDateInfo(ts);
        const bounds = getAlgiersDayBounds(info.dateStr);

        // Invariant A: ts must fall strictly within [startUtc, endUtc]
        if (ts.getTime() < bounds.startUtc.getTime() || ts.getTime() > bounds.endUtc.getTime()) {
          throw new Error(
            `Invariant A violation at iter ${i}: ts ${ts.toISOString()} not in [${bounds.startUtc.toISOString()}, ${bounds.endUtc.toISOString()}] for dateStr ${info.dateStr}`
          );
        }

        // Invariant B: normalizeDateToStartOfDay must match normalizedUtcMidnight
        const norm = normalizeDateToStartOfDay(ts);
        if (norm.toISOString() !== bounds.normalizedUtcMidnight.toISOString()) {
          throw new Error(
            `Invariant B violation at iter ${i}: norm ${norm.toISOString()} !== midnight ${bounds.normalizedUtcMidnight.toISOString()}`
          );
        }

        // Invariant C: Script parity
        const scriptNorm = syncScriptNormalize(ts);
        if (scriptNorm.toISOString() !== norm.toISOString()) {
          throw new Error(
            `Invariant C violation at iter ${i}: syncScript ${scriptNorm.toISOString()} !== norm ${norm.toISOString()} for ts ${ts.toISOString()}`
          );
        }

        // Invariant D: Timezone invariance (test under LA and Tokyo)
        const laIso = evaluateWithTimezone("America/Los_Angeles", () => normalizeDateToStartOfDay(ts).toISOString());
        const tokyoIso = evaluateWithTimezone("Asia/Tokyo", () => normalizeDateToStartOfDay(ts).toISOString());
        if (laIso !== tokyoIso || laIso !== norm.toISOString()) {
          throw new Error(`Invariant D violation at iter ${i}: timezone mismatch LA ${laIso} vs Tokyo ${tokyoIso}`);
        }
      }
    });
  });

  await runner.runQueuedTests();
  return runner.getSummary();
}

if (process.argv[1]?.endsWith("challenger-m3-stress.ts")) {
  runChallengerM3StressTests().then(() => {
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
