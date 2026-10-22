import { describe, test, expect } from "../helpers/runner";
import { safeImport, readSourceFile } from "../helpers/moduleLoader";

export async function runF03Tests() {
  await describe("F3: Eliminate '01/01/2026' Hardcoded Fallbacks (R2)", async () => {
    const { module: voucherUtils } = await safeImport<any>("@/lib/voucherUtils");

    test("F3-01: Zero occurrences of literal string '01/01/2026' in src/lib/voucherUtils.ts", () => {
      const source = readSourceFile("src/lib/voucherUtils.ts");
      const occurrences = (source.match(/01\/01\/2026/g) || []).length;
      if (occurrences > 0) {
        throw new Error(`Defect: Found ${occurrences} occurrences of hardcoded '01/01/2026' in src/lib/voucherUtils.ts`);
      }
      expect(occurrences).toBe(0);
    });

    test("F3-02: formatPaymentDate(null) returns empty string or dash instead of '01/01/2026'", () => {
      if (!voucherUtils?.formatPaymentDate) {
        throw new Error("voucherUtils.formatPaymentDate not found");
      }
      const res = voucherUtils.formatPaymentDate(null);
      expect(res).notToContain("01/01/2026");
      expect(res === "" || res === "—" || res === "-").toBe(true);
    });

    test("F3-03: formatPaymentDate(undefined) returns empty string or dash instead of '01/01/2026'", () => {
      if (!voucherUtils?.formatPaymentDate) {
        throw new Error("voucherUtils.formatPaymentDate not found");
      }
      const res = voucherUtils.formatPaymentDate(undefined);
      expect(res).notToContain("01/01/2026");
      expect(res === "" || res === "—" || res === "-").toBe(true);
    });

    test("F3-04: formatPaymentDateTime(null) returns empty string or dash instead of '01/01/2026 00:00'", () => {
      if (!voucherUtils?.formatPaymentDateTime) {
        throw new Error("voucherUtils.formatPaymentDateTime not found");
      }
      const res = voucherUtils.formatPaymentDateTime(null);
      expect(res).notToContain("01/01/2026");
      expect(res === "" || res === "—" || res === "-").toBe(true);
    });

    test("F3-05: formatVoucherDisplay(null) does not return 'BON 0 (01/01/2026)'", () => {
      if (!voucherUtils?.formatVoucherDisplay) {
        throw new Error("voucherUtils.formatVoucherDisplay not found");
      }
      const res = voucherUtils.formatVoucherDisplay(null);
      expect(res).notToContain("01/01/2026");
    });

    test("F3-06: formatVoucherDisplay with null issuedAt does not leak '(01/01/2026)' into voucher label", () => {
      if (!voucherUtils?.formatVoucherDisplay) {
        throw new Error("voucherUtils.formatVoucherDisplay not found");
      }
      const voucher = {
        id: 155,
        number: 155,
        issuedAt: null,
        series: { prefix: "ANNEX 4AM" },
      };
      const res = voucherUtils.formatVoucherDisplay(voucher);
      expect(res).notToContain("01/01/2026");
    });
  });
}

if (process.argv[1]?.endsWith("f03-eliminate-2026-fallbacks.test.ts")) {
  runF03Tests().then(async () => {
    const { runner } = require("../helpers/runner");
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
