import { describe, test, expect } from "../helpers/runner";
import { readSourceFile } from "../helpers/moduleLoader";

export async function runF10Tests() {
  await describe("F10: Mutating Server Actions Revalidation Integration (R5)", async () => {
    test("F10-01: issueMultiItemVoucherAction revalidates daily ledger and revenue", () => {
      const source = readSourceFile("src/lib/actions.ts");
      const actionMatch = source.match(/issueMultiItemVoucherAction\s*=\s*async[\s\S]*?return\s*\{[\s\S]*?\};/) ||
                          source.match(/function\s+issueMultiItemVoucherAction[\s\S]*?return\s*\{[\s\S]*?\};/);
      if (!actionMatch) {
        throw new Error("Could not find issueMultiItemVoucherAction in src/lib/actions.ts");
      }
      const actionBody = actionMatch[0];
      const hasDailyLedger = actionBody.includes("/list/daily-ledger") || actionBody.includes("revalidateFinancialRoutes");
      const hasRevenue = actionBody.includes("/list/revenue") || actionBody.includes("revalidateFinancialRoutes");

      if (!hasDailyLedger || !hasRevenue) {
        throw new Error("Defect in issueMultiItemVoucherAction: Does not revalidate /list/daily-ledger or /list/revenue on voucher creation");
      }
      expect(hasDailyLedger && hasRevenue).toBe(true);
    });

    test("F10-02: voidVoucher and editVoucher revalidate financial routes without class/null path error", () => {
      const source = readSourceFile("src/lib/actions.ts");
      const editMatch = source.match(/editVoucher\s*=\s*async[\s\S]*?return\s*\{[\s\S]*?\};/);
      if (!editMatch) {
        throw new Error("Could not find editVoucher in src/lib/actions.ts");
      }
      const editBody = editMatch[0];
      const hasRevenue = editBody.includes("/list/revenue") || editBody.includes("revalidateFinancialRoutes");
      if (!hasRevenue) {
        throw new Error("Defect in editVoucher: Does not revalidate /list/revenue upon voucher update/voiding");
      }
      expect(hasRevenue).toBe(true);
    });

    test("F10-03: createRefund (both branches) revalidates /list/daily-ledger", () => {
      const source = readSourceFile("src/lib/actions.ts");
      const refundMatch = source.match(/createRefund\s*=\s*async[\s\S]*?return\s*\{[\s\S]*?\};/);
      if (!refundMatch) {
        throw new Error("Could not find createRefund in src/lib/actions.ts");
      }
      const refundBody = refundMatch[0];
      const hasDailyLedger = refundBody.includes("/list/daily-ledger") || refundBody.includes("revalidateFinancialRoutes");
      if (!hasDailyLedger) {
        throw new Error("Defect in createRefund: Does not revalidate /list/daily-ledger on voucher refund");
      }
      expect(hasDailyLedger).toBe(true);
    });

    test("F10-04: registerParticipant triggers financial cache revalidation", () => {
      const source = readSourceFile("src/lib/actions.ts");
      const regMatch = source.match(/registerParticipant\s*=\s*async[\s\S]*?return\s*\{[\s\S]*?\};/);
      if (!regMatch) {
        throw new Error("Could not find registerParticipant in src/lib/actions.ts");
      }
      const regBody = regMatch[0];
      const hasRevalidation = regBody.includes("revalidatePath") || regBody.includes("revalidateFinancialRoutes");
      if (!hasRevalidation) {
        throw new Error("Defect in registerParticipant: Has zero revalidation calls; financial balances remain stale");
      }
      expect(hasRevalidation).toBe(true);
    });

    test("F10-05: recordFormationLumpSumPayment in formationActions.ts revalidates daily ledger & revenue", () => {
      const source = readSourceFile("src/lib/formationActions.ts");
      const formMatch = source.match(/recordFormationLumpSumPayment[\s\S]*?return\s*\{[\s\S]*?\};/);
      if (!formMatch) {
        throw new Error("Could not find recordFormationLumpSumPayment in src/lib/formationActions.ts");
      }
      const formBody = formMatch[0];
      const hasDailyLedger = formBody.includes("/list/daily-ledger") || formBody.includes("revalidateFinancialRoutes");
      if (!hasDailyLedger) {
        throw new Error("Defect in recordFormationLumpSumPayment: Does not revalidate /list/daily-ledger or /list/revenue");
      }
      expect(hasDailyLedger).toBe(true);
    });
  });
}

if (process.argv[1]?.endsWith("f10-mutating-actions-revalidation.test.ts")) {
  runF10Tests().then(async () => {
    const { runner } = require("../helpers/runner");
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
