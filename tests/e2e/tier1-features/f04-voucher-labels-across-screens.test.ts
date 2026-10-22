import { describe, test, expect } from "../helpers/runner";
import { safeImport, readSourceFile } from "../helpers/moduleLoader";

export async function runF04Tests() {
  await describe("F4: Consistent Voucher Labels Across Screens (R2)", async () => {
    const { module: voucherUtils } = await safeImport<any>("@/lib/voucherUtils");

    test("F4-01: formatVoucherDisplay outputs complete series, branch, level, BON and number", () => {
      if (!voucherUtils?.formatVoucherDisplay) {
        throw new Error("voucherUtils.formatVoucherDisplay not found");
      }
      const voucher = {
        number: 42,
        issuedAt: new Date("2026-05-15T10:00:00.000Z"),
        series: {
          prefix: "ANNEX 4AM",
        },
      };
      const label = voucherUtils.formatVoucherDisplay(voucher);
      expect(label).toContain("ANNEX 4AM");
      expect(label).toContain("BON 42");
      expect(label).toContain("15/05/2026");
    });

    test("F4-02: RevenuePaymentsTable does not render bare '#{v.number}' without series context", () => {
      const source = readSourceFile("src/components/revenue/RevenuePaymentsTable.tsx");
      // Check whether RevenuePaymentsTable only renders #{v.number} on line 383
      const rendersBareNumberOnly = /<td[^>]*dir="ltr">\s*#\{v\.number\}\s*<\/td>/.test(source);
      if (rendersBareNumberOnly) {
        throw new Error("Defect in RevenuePaymentsTable.tsx: Voucher column renders bare '#{v.number}' missing series and level context");
      }
      expect(rendersBareNumberOnly).toBe(false);
    });

    test("F4-03: Revenue query in src/lib/revenue.ts includes series or precomputed voucherDisplay", () => {
      const revenueSource = readSourceFile("src/lib/revenue.ts");
      const hasSeriesInclude = /series:\s*\{\s*select:|\bseries\b|\bvoucherDisplay\b/.test(revenueSource);
      if (!hasSeriesInclude) {
        throw new Error("Defect in src/lib/revenue.ts: Voucher query does not select series/level relational data");
      }
      expect(hasSeriesInclude).toBe(true);
    });

    test("F4-04: formatVoucherDisplay handles workshop/dawarat vouchers with ECOLE DAWARAT prefix", () => {
      if (!voucherUtils?.formatVoucherDisplay) {
        throw new Error("voucherUtils.formatVoucherDisplay not found");
      }
      const voucher = {
        number: 7,
        issuedAt: new Date("2026-10-21T10:00:00.000Z"),
        series: {
          prefix: "ECOLE DAWARAT",
        },
      };
      const label = voucherUtils.formatVoucherDisplay(voucher);
      expect(label).toContain("ECOLE DAWARAT");
      expect(label).toContain("BON 7");
    });

    test("F4-05: formatVoucherDisplay falls back gracefully when series is absent but fallback context provided", () => {
      if (!voucherUtils?.formatVoucherDisplay) {
        throw new Error("voucherUtils.formatVoucherDisplay not found");
      }
      const voucher = {
        number: 88,
        issuedAt: new Date("2026-10-21T10:00:00.000Z"),
      };
      const label = voucherUtils.formatVoucherDisplay(voucher, {
        branchName: "AMPHI",
        levelName: "BAC",
      });
      expect(label).toContain("AMPHI");
      expect(label).toContain("BAC");
      expect(label).toContain("BON 88");
    });
  });
}

if (process.argv[1]?.endsWith("f04-voucher-labels-across-screens.test.ts")) {
  runF04Tests().then(async () => {
    const { runner } = require("../helpers/runner");
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
