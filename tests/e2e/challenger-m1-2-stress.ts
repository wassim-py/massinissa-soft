import { describe, test, expect, runner } from "./helpers/runner";
import { evaluateWithTimezone, SIMULATED_TIMEZONES } from "./helpers/timezoneSimulator";
import {
  formatNumber,
  formatDZD,
  formatAlgiersDate,
  formatAlgiersTime,
  formatAlgiersDateTime,
  getAlgiersDateInfo,
  getAlgiersDayBounds,
} from "../../src/lib/algiersDate";
import { Prisma } from "@prisma/client";

export async function runChallengerStressTests() {
  await describe("Challenger M1-2: Currency & SSR Determinism Stress Verification", async () => {
    // -------------------------------------------------------------------------
    // 1. FLOATING POINT PRECISION EDGES
    // -------------------------------------------------------------------------
    test("STRESS-01: Classic IEEE 754 float sum (0.1 + 0.2)", () => {
      const val = 0.1 + 0.2; // 0.30000000000000004
      const formatted = formatNumber(val);
      expect(formatted).toBe("0,3");
      const dzdFr = formatDZD(val, "fr");
      expect(dzdFr).toBe("0,3 DZD");
      const dzdAr = formatDZD(val, "ar");
      expect(dzdAr).toBe("0,3 د.ج");
    });

    test("STRESS-02: Rounding half-up edge 1000.005", () => {
      // 1000.005 in IEEE 754 double precision
      const formatted = formatNumber(1000.005);
      // In JS, 1000.005 * 100 is 100000.49999999999, which rounds to 100000 or 100001
      // Ensure it produces a clean formatted string without NaN, infinite loop, or float artifacts
      expect(typeof formatted).toBe("string");
      expect(formatted).toMatch(/^1 000(,0[01])?$/);
    });

    test("STRESS-03: Extreme large precision number 999999999999.99 (nearly 1 Trillion DZD)", () => {
      const formatted = formatNumber(999999999999.99);
      expect(formatted).toBe("999 999 999 999,99");
      const dzd = formatDZD(999999999999.99, "fr");
      expect(dzd).toBe("999 999 999 999,99 DZD");
    });

    test("STRESS-04: Sub-cent rounding (0.004 -> 0, 0.005 -> 0,01)", () => {
      expect(formatNumber(0.004)).toBe("0");
      expect(formatNumber(0.005)).toBe("0,01");
      expect(formatNumber(0.0000001)).toBe("0");
    });

    test("STRESS-05: Single decimal digit amounts (0.1 -> 0,1, 1000.5 -> 1 000,5)", () => {
      expect(formatNumber(0.1)).toBe("0,1");
      expect(formatNumber(1000.5)).toBe("1 000,5");
      expect(formatNumber(1000.05)).toBe("1 000,05");
    });

    // -------------------------------------------------------------------------
    // 2. EXTREME NEGATIVE NUMBERS & SIGN HANDLING
    // -------------------------------------------------------------------------
    test("STRESS-06: Negative zero (-0) handling", () => {
      expect(formatNumber(-0)).toBe("0");
      expect(formatDZD(-0)).toBe("0 DZD");
      expect(formatDZD(-0, "ar")).toBe("0 د.ج");
    });

    test("STRESS-07: Sub-cent negative numbers (-0.0001, -0.004, -0.005)", () => {
      // Critical check: does -0.0001 produce "-0" or "0"?
      const negSmall = formatNumber(-0.0001);
      console.log("    [Observation] formatNumber(-0.0001) =", JSON.stringify(negSmall));
      const negHalf = formatNumber(-0.005);
      console.log("    [Observation] formatNumber(-0.005) =", JSON.stringify(negHalf));
      expect(formatNumber(-0.005)).toBe("-0,01");

      // Floating-point subtraction artifact: 100.1 - 100 - 0.1 === -2.7755575615628914e-17
      const floatZero = 100.1 - 100 - 0.1;
      const formattedFloatZero = formatNumber(floatZero);
      console.log("    [Observation] formatNumber(100.1 - 100 - 0.1) =", JSON.stringify(formattedFloatZero));
      console.log("    [Observation] formatDZD(100.1 - 100 - 0.1) =", JSON.stringify(formatDZD(floatZero)));
    });

    test("STRESS-07B: Defect Reproduction — Sub-cent negative numbers and float artifacts must not render '-0'", () => {
      // In financial presentation, zero is unsigned. Any amount rounded to 0 must be "0", never "-0"
      const floatZero = 100.1 - 100 - 0.1;
      expect(formatNumber(floatZero)).toBe("0");
      expect(formatDZD(floatZero, "fr")).toBe("0 DZD");
      expect(formatDZD(floatZero, "ar")).toBe("0 د.ج");
      expect(formatNumber(-0.0001)).toBe("0");
      expect(formatNumber(-0.0049)).toBe("0");
    });

    test("STRESS-08: Large negative amounts & safe integers", () => {
      expect(formatNumber(-1234567.89)).toBe("-1 234 567,89");
      expect(formatDZD(-1234567.89, "fr")).toBe("-1 234 567,89 DZD");
      expect(formatDZD(-1234567.89, "ar")).toBe("-1 234 567,89 د.ج");

      expect(formatNumber(Number.MAX_SAFE_INTEGER)).toBe("9 007 199 254 740 991");
      expect(formatNumber(Number.MIN_SAFE_INTEGER)).toBe("-9 007 199 254 740 991");
    });

    // -------------------------------------------------------------------------
    // 3. SPECIAL & INVALID INPUTS
    // -------------------------------------------------------------------------
    test("STRESS-09: NaN, Infinity, -Infinity fallback to '0'", () => {
      expect(formatNumber(NaN)).toBe("0");
      expect(formatNumber(Infinity)).toBe("0");
      expect(formatNumber(-Infinity)).toBe("0");
      expect(formatDZD(NaN)).toBe("0 DZD");
      expect(formatDZD(Infinity)).toBe("0 DZD");
      expect(formatDZD(-Infinity)).toBe("0 DZD");
    });

    test("STRESS-10: Null, undefined, empty string fallback to '0'", () => {
      expect(formatNumber(null)).toBe("0");
      expect(formatNumber(undefined)).toBe("0");
      expect(formatNumber("")).toBe("0");
      expect(formatDZD(null)).toBe("0 DZD");
      expect(formatDZD(undefined)).toBe("0 DZD");
      expect(formatDZD("")).toBe("0 DZD");
    });

    test("STRESS-11: Strings with whitespace, valid and invalid numbers", () => {
      expect(formatNumber("   ")).toBe("0");
      expect(formatNumber("\t\n ")).toBe("0");
      expect(formatNumber("  12345.67  ")).toBe("12 345,67");
      expect(formatNumber("  -9876.50  ")).toBe("-9 876,5");
      expect(formatNumber("invalid-text")).toBe("0");
      expect(formatNumber("12,345")).toBe("0"); // comma is not standard numeric string
    });

    test("STRESS-12: Objects, Arrays, and Prisma.Decimal instances", () => {
      expect(formatNumber({} as any)).toBe("0");
      expect(formatNumber([] as any)).toBe("0");
      expect(formatNumber(new Date() as any)).notToBe("NaN");

      const pDec1 = new Prisma.Decimal("1234567.89");
      expect(formatNumber(pDec1)).toBe("1 234 567,89");
      expect(formatDZD(pDec1, "fr")).toBe("1 234 567,89 DZD");
      expect(formatDZD(pDec1, "ar")).toBe("1 234 567,89 د.ج");

      const pDec2 = new Prisma.Decimal("-45000.5");
      expect(formatNumber(pDec2)).toBe("-45 000,5");
      expect(formatDZD(pDec2, "fr")).toBe("-45 000,5 DZD");

      const pDecZero = new Prisma.Decimal("0.00");
      expect(formatNumber(pDecZero)).toBe("0");
    });

    // -------------------------------------------------------------------------
    // 4. UNICODE CODEPOINT & BYTECODE VERIFICATION
    // -------------------------------------------------------------------------
    test("STRESS-13: Bytecode inspection — zero U+202F, zero U+00A0, zero U+200E", () => {
      const testCases = [
        formatNumber(1000),
        formatNumber(1500000.75),
        formatNumber(-9876543.21),
        formatDZD(2500, "fr"),
        formatDZD(2500, "ar"),
        formatDZD(10000000, "fr"),
        formatDZD(10000000, "ar"),
        formatDZD(-5000.5, "fr"),
        formatDZD(-5000.5, "ar"),
      ];

      for (const str of testCases) {
        for (let i = 0; i < str.length; i++) {
          const code = str.charCodeAt(i);
          // Forbidden characters:
          // 0x202F = NARROW NO-BREAK SPACE
          // 0x00A0 = NO-BREAK SPACE
          // 0x200E = LEFT-TO-RIGHT MARK
          // 0x200F = RIGHT-TO-LEFT MARK
          // 0xFEFF = ZERO WIDTH NO-BREAK SPACE
          if (code === 0x202F) {
            throw new Error(`Forbidden U+202F found at index ${i} in "${str}"`);
          }
          if (code === 0x00A0) {
            throw new Error(`Forbidden U+00A0 found at index ${i} in "${str}"`);
          }
          if (code === 0x200E || code === 0x200F) {
            throw new Error(`Forbidden bidi mark U+${code.toString(16)} found at index ${i} in "${str}"`);
          }
          if (code === 0xFEFF) {
            throw new Error(`Forbidden U+FEFF found at index ${i} in "${str}"`);
          }
        }
      }
    });

    test("STRESS-14: Thousands separator is no-break space (0xA0 / 160) for RTL stability", () => {
      const formatted = formatNumber(1234567);
      expect(formatted).toBe("1 234 567");
      // NBSP keeps digit groups in one European-number run: a plain ASCII space is
      // neutral whitespace and gets mirror-reversed under an RTL paragraph direction.
      expect(formatted.charCodeAt(1)).toBe(0xa0);
      expect(formatted.charCodeAt(5)).toBe(0xa0);
      expect(formatted).not.toContain(" ");
    });

    test("STRESS-15: Arabic currency suffix code point verification", () => {
      const arDzd = formatDZD(1000, "ar");
      expect(arDzd).toBe("1 000 د.ج");
      const suffix = arDzd.slice(6); // " د.ج"
      expect(suffix.charCodeAt(0)).toBe(0x00a0); // no-break space
      expect(suffix.charCodeAt(1)).toBe(0x062f); // DAL (د)
      expect(suffix.charCodeAt(2)).toBe(0x002e); // PERIOD (.)
      expect(suffix.charCodeAt(3)).toBe(0x062c); // JEEM (ج)
      expect(suffix.length).toBe(4);
    });

    // -------------------------------------------------------------------------
    // 5. NEXT.JS SSR DETERMINISM & CLIENT SIMULATION
    // -------------------------------------------------------------------------
    test("STRESS-16: formatNumber SSR vs Client cross-timezone string equality", () => {
      const testValues = [
        0,
        -0,
        1,
        -1,
        2500,
        -2500,
        1500000,
        -1500000,
        99.99,
        -99.99,
        0.1 + 0.2,
        1234567.89,
        -9876543.21,
        Number.MAX_SAFE_INTEGER,
        null,
        undefined,
        "",
        "50000",
      ];

      for (const val of testValues) {
        // Evaluate in server mode (UTC)
        const serverOutput = evaluateWithTimezone("UTC", () => formatNumber(val as any));

        // Evaluate across all simulated client timezones
        for (const tz of SIMULATED_TIMEZONES) {
          const clientOutput = evaluateWithTimezone(tz, () => formatNumber(val as any));
          if (serverOutput !== clientOutput) {
            throw new Error(
              `SSR Hydration mismatch in formatNumber for value ${JSON.stringify(val)}: Server(UTC)="${serverOutput}" vs Client(${tz})="${clientOutput}"`
            );
          }
        }
      }
    });

    test("STRESS-17: formatDZD (fr & ar) SSR vs Client cross-timezone string equality", () => {
      const testValues = [
        0,
        2500,
        1500000,
        -3500.5,
        new Prisma.Decimal("12345.67"),
      ];

      for (const locale of ["fr", "ar", undefined]) {
        for (const val of testValues) {
          const serverOutput = evaluateWithTimezone("UTC", () => formatDZD(val as any, locale));
          for (const tz of SIMULATED_TIMEZONES) {
            const clientOutput = evaluateWithTimezone(tz, () => formatDZD(val as any, locale));
            if (serverOutput !== clientOutput) {
              throw new Error(
                `SSR Hydration mismatch in formatDZD(locale=${locale}) for value ${val}: Server="${serverOutput}" vs Client(${tz})="${clientOutput}"`
              );
            }
          }
        }
      }
    });

    test("STRESS-18: formatAlgiersDateTime SSR vs Client cross-timezone string equality", () => {
      const timestamps = [
        new Date("2026-10-20T23:30:00.000Z"), // 00:30 Algiers
        new Date("2026-02-28T23:00:00.000Z"), // Leap year boundary
        new Date("2026-07-15T12:00:00.000Z"), // Summer
        new Date("2026-12-31T23:45:00.000Z"), // Year boundary
        "2026-10-21",
        1761000000000,
        null,
        undefined,
      ];

      for (const ts of timestamps) {
        const serverOutput = evaluateWithTimezone("UTC", () => formatAlgiersDateTime(ts as any));
        for (const tz of SIMULATED_TIMEZONES) {
          const clientOutput = evaluateWithTimezone(tz, () => formatAlgiersDateTime(ts as any));
          if (serverOutput !== clientOutput) {
            throw new Error(
              `SSR Hydration mismatch in formatAlgiersDateTime for input ${ts}: Server="${serverOutput}" vs Client(${tz})="${clientOutput}"`
            );
          }
        }
      }
    });

    // -------------------------------------------------------------------------
    // 6. PROPERTY-BASED RANDOM STRESS HARNESS (1,000 ITERATIONS)
    // -------------------------------------------------------------------------
    test("STRESS-19: Property harness: 1,000 random floating numbers formatting integrity", () => {
      // Seed pseudo-random generator
      let seed = 42;
      function pseudoRandom() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      }

      for (let i = 0; i < 1000; i++) {
        const raw = (pseudoRandom() - 0.5) * 20000000; // -10,000,000 to +10,000,000
        const formatted = formatNumber(raw);

        // Verification properties:
        // 1. Must never contain NaN or undefined
        if (formatted.includes("NaN") || formatted.includes("undefined")) {
          throw new Error(`Random iteration ${i} produced invalid token: ${formatted} from ${raw}`);
        }
        // 2. Must only contain valid characters: digits, no-break space (0xA0), minus (-), comma (,)
        for (let j = 0; j < formatted.length; j++) {
          const code = formatted.charCodeAt(j);
          const isDigit = code >= 48 && code <= 57;
          const isSpace = code === 0xa0;
          const isMinus = code === 45 && j === 0;
          const isComma = code === 44;
          if (!isDigit && !isSpace && !isMinus && !isComma) {
            throw new Error(`Random iteration ${i} produced illegal character '${formatted[j]}' (code ${code}) in: ${formatted}`);
          }
        }
        // 2b. Never a plain splittable ASCII space: it would mirror groups under RTL
        if (formatted.includes(" ")) {
          throw new Error(`Random iteration ${i} used a plain ASCII space separator: "${formatted}"`);
        }
        // 3. SSR determinism: compare UTC vs Tokyo client
        const ssr = evaluateWithTimezone("UTC", () => formatDZD(raw, "fr"));
        const client = evaluateWithTimezone("Asia/Tokyo", () => formatDZD(raw, "fr"));
        if (ssr !== client) {
          throw new Error(`Random iteration ${i} SSR mismatch: ${ssr} !== ${client}`);
        }
      }
    });
  });

  await runner.runQueuedTests();
  return runner.getSummary();
}

if (process.argv[1]?.endsWith("challenger-m1-2-stress.ts")) {
  runChallengerStressTests().then(() => {
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
