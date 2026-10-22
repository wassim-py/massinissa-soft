import { describe, test, expect, runner } from "../helpers/runner";
import { evaluateWithTimezone, SIMULATED_TIMEZONES } from "../helpers/timezoneSimulator";
import { formatNumber, formatDZD } from "../../../src/lib/algiersDate";
import { Prisma } from "@prisma/client";

export async function runDeepAdversarialStressTests() {
  await describe("Challenger M1-2 Deep Adversarial Currency & Negative-Zero Elimination", async () => {
    // -------------------------------------------------------------------------
    // TEST 1: Strict Negative Zero Elimination on Primitives & Strings
    // -------------------------------------------------------------------------
    test("DEEP-01: Direct negative zero primitives and string representations", () => {
      const negativeZeros = [
        -0,
        -0.0,
        "-0",
        "-0.0",
        "-0.00",
        "-0.000",
        "-000.00",
        "-0.000000000",
      ];

      for (const nz of negativeZeros) {
        const numRes = formatNumber(nz as any);
        const dzdFrRes = formatDZD(nz as any, "fr");
        const dzdArRes = formatDZD(nz as any, "ar");

        expect(numRes).toBe("0");
        expect(dzdFrRes).toBe("0 DZD");
        expect(dzdArRes).toBe("0 د.ج");

        // Negative sign must NEVER appear
        expect(numRes.includes("-")).toBe(false);
        expect(dzdFrRes.startsWith("-")).toBe(false);
        expect(dzdArRes.startsWith("-")).toBe(false);
      }
    });

    // -------------------------------------------------------------------------
    // TEST 2: IEEE 754 Floating-Point Cancellations
    // -------------------------------------------------------------------------
    test("DEEP-02: Micro-residual floating point cancellations", () => {
      const cancellations = [
        100.1 - 100 - 0.1,                          // -2.7755575615628914e-17
        0.3 - 0.2 - 0.1,                            // -2.7755575615628914e-17
        0.7 - 0.6 - 0.1,                            // -8.326672684688674e-17
        1.0000000000000002 - 1.0,                   // 2.220446049250313e-16
        (0.1 + 0.2 + 0.3) - 0.6,                    // float artifact
        -Number.EPSILON,                            // -2.220446049250313e-16
        -Number.MIN_VALUE,                          // -5e-324
        -1e-15,
        -1e-50,
        -1e-300,
        1e-15,
        1e-50,
        1e-300,
      ];

      for (const val of cancellations) {
        const numRes = formatNumber(val);
        const dzdRes = formatDZD(val);
        expect(numRes).toBe("0");
        expect(dzdRes).toBe("0 DZD");
        expect(numRes.includes("-")).toBe(false);
        expect(dzdRes.startsWith("-")).toBe(false);
      }
    });

    // -------------------------------------------------------------------------
    // TEST 3: Sub-Cent Boundary Steps [-0.005 to 0.005]
    // -------------------------------------------------------------------------
    test("DEEP-03: Sub-cent rounding boundary steps", () => {
      // Numbers strictly smaller in magnitude than 0.005 must round to 0
      expect(formatNumber(-0.0049999999999999)).toBe("0");
      expect(formatNumber(-0.0049)).toBe("0");
      expect(formatNumber(-0.001)).toBe("0");
      expect(formatNumber(-0.00001)).toBe("0");
      expect(formatNumber(0.0049999999999999)).toBe("0");
      expect(formatNumber(0.0049)).toBe("0");
      expect(formatNumber(0.001)).toBe("0");

      // Numbers with magnitude >= 0.005 round to 0.01
      expect(formatNumber(-0.005)).toBe("-0,01");
      expect(formatNumber(-0.005000001)).toBe("-0,01");
      expect(formatNumber(-0.009)).toBe("-0,01");
      expect(formatNumber(-0.01)).toBe("-0,01");
      expect(formatNumber(0.005)).toBe("0,01");
      expect(formatNumber(0.005000001)).toBe("0,01");
      expect(formatNumber(0.009)).toBe("0,01");
      expect(formatNumber(0.01)).toBe("0,01");
    });

    // -------------------------------------------------------------------------
    // TEST 4: Prisma.Decimal Negative Zero & Sub-Cent Stress
    // -------------------------------------------------------------------------
    test("DEEP-04: Prisma.Decimal sub-cent and negative zero instances", () => {
      const decimalCases = [
        { d: new Prisma.Decimal("-0"), expected: "0" },
        { d: new Prisma.Decimal("-0.00"), expected: "0" },
        { d: new Prisma.Decimal("-0.0000"), expected: "0" },
        { d: new Prisma.Decimal("-0.001"), expected: "0" },
        { d: new Prisma.Decimal("-0.0049"), expected: "0" },
        { d: new Prisma.Decimal("-0.005"), expected: "-0,01" },
        { d: new Prisma.Decimal("-0.01"), expected: "-0,01" },
        { d: new Prisma.Decimal("0.00"), expected: "0" },
        { d: new Prisma.Decimal("0.0049"), expected: "0" },
        { d: new Prisma.Decimal("0.005"), expected: "0,01" },
        { d: new Prisma.Decimal("-1500.50"), expected: "-1 500,5" },
        { d: new Prisma.Decimal("25000000.00"), expected: "25 000 000" },
      ];

      for (const { d, expected } of decimalCases) {
        const res = formatNumber(d);
        expect(res).toBe(expected);
        if (expected === "0") {
          expect(formatDZD(d, "fr")).toBe("0 DZD");
          expect(formatDZD(d, "ar")).toBe("0 د.ج");
        }
      }
    });

    // -------------------------------------------------------------------------
    // TEST 5: Monte Carlo Sub-Cent Negative Float Invariant (50,000 iterations)
    // -------------------------------------------------------------------------
    test("DEEP-05: Monte Carlo 50,000 sub-cent negative floats never emit minus sign", () => {
      let seed = 123456789;
      function nextRand() {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }

      for (let i = 0; i < 50000; i++) {
        // Generates negative numbers strictly between -0.0049999 and -1e-15
        const exp = 3 + nextRand() * 12; // 3 to 15
        const val = -1 * Math.pow(10, -exp) * (0.01 + nextRand() * 4.9);
        const formatted = formatNumber(val);

        if (formatted !== "0") {
          throw new Error(
            `DEEP-05 Failure at iteration ${i}: value ${val} formatted as "${formatted}", expected "0"`
          );
        }

        const dzdFr = formatDZD(val, "fr");
        if (dzdFr !== "0 DZD") {
          throw new Error(
            `DEEP-05 Failure at iteration ${i}: value ${val} formatted as "${dzdFr}", expected "0 DZD"`
          );
        }

        const dzdAr = formatDZD(val, "ar");
        if (dzdAr !== "0 د.ج") {
          throw new Error(
            `DEEP-05 Failure at iteration ${i}: value ${val} formatted as "${dzdAr}", expected "0 د.ج"`
          );
        }
      }
    });

    // -------------------------------------------------------------------------
    // TEST 6: Exact String Match & Absence of Unicode Artefacts
    // -------------------------------------------------------------------------
    test("DEEP-06: Formatted strings never contain unexpected spaces or characters", () => {
      const amounts = [0, -0, 0.004, -0.004, 1, -1, 1000, -1000, 1000000, -1000000, 1234567.89, -1234567.89];

      for (const amt of amounts) {
        for (const loc of ["fr", "ar"]) {
          const formatted = formatDZD(amt, loc);
          // Forbidden characters
          expect(formatted.includes("\u00A0")).toBe(false); // NO-BREAK SPACE
          expect(formatted.includes("\u202F")).toBe(false); // NARROW NO-BREAK SPACE
          expect(formatted.includes("\u200E")).toBe(false); // LTR MARK
          expect(formatted.includes("\u200F")).toBe(false); // RTL MARK
          expect(formatted.includes("\uFEFF")).toBe(false); // ZERO WIDTH NO-BREAK SPACE
          expect(formatted.includes("-0 ")).toBe(false);
          expect(formatted.includes("-0,00")).toBe(false);
          expect(formatted.startsWith("-0")).toBe(false); // Never starts with -0 unless -0,01...
          if (formatted.startsWith("-0")) {
            expect(formatted.startsWith("-0,")).toBe(true);
            expect(formatted).notToBe("-0,00 DZD");
            expect(formatted).notToBe("-0,00 د.ج");
          }
        }
      }
    });

    // -------------------------------------------------------------------------
    // TEST 7: SSR Hydration Cross-Device Simulation
    // -------------------------------------------------------------------------
    test("DEEP-07: SSR vs Multi-Timezone Client Simulation on Diverse Amounts", () => {
      const probeAmounts = [
        0,
        -0,
        100.1 - 100 - 0.1,
        -0.000001,
        -0.005,
        -0.01,
        0.05,
        123.45,
        -987.65,
        10000,
        -50000.75,
        new Prisma.Decimal("-0.002"),
        new Prisma.Decimal("1234567.89"),
      ];

      for (const amt of probeAmounts) {
        for (const loc of ["fr", "ar", undefined]) {
          const serverStr = evaluateWithTimezone("UTC", () => formatDZD(amt as any, loc));
          for (const tz of SIMULATED_TIMEZONES) {
            const clientStr = evaluateWithTimezone(tz, () => formatDZD(amt as any, loc));
            if (serverStr !== clientStr) {
              throw new Error(
                `Hydration mismatch: Server(UTC)="${serverStr}" vs Client(${tz})="${clientStr}" for amount ${amt}`
              );
            }
          }
        }
      }
    });
  });

  await runner.runQueuedTests();
  return runner.getSummary();
}

if (process.argv[1]?.endsWith("challenger-m1-2-deep-stress.test.ts")) {
  runDeepAdversarialStressTests().then(() => {
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
