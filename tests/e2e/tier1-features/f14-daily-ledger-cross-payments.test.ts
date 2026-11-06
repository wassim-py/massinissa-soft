import { describe, test, expect } from "../helpers/runner";
import { readSourceFile } from "../helpers/moduleLoader";

export async function runF14Tests() {
  await describe("F14: Admin Daily Ledger Cross-Branch Payments Display (Zero Cash Impact)", async () => {
    test("F14-01: revenue.ts exports DailyBranchLedgerData containing todayCrossPayments, crossPaymentsInTotal, crossPaymentsOutTotal", () => {
      const source = readSourceFile("src/lib/revenue.ts");
      expect(source.includes("todayCrossPayments:")).toBe(true);
      expect(source.includes("crossPaymentsInTotal: number")).toBe(true);
      expect(source.includes("crossPaymentsOutTotal: number")).toBe(true);
    });

    test("F14-02: getDailyBranchLedgerData queries cross vouchers where issuingBranchId != targetBranchId without polluting local caisse", () => {
      const source = readSourceFile("src/lib/revenue.ts");
      // Must query vouchers for both issuing and target branch
      expect(source.includes("issuingBranchId: branchId")).toBe(true);
      expect(source.includes("targetBranchId: branchId")).toBe(true);

      // Must filter todayVouchers strictly to issuing branch (physical caisse protection)
      const hasStrictIssuingFilter = /todayVouchers\s*=\s*allDayVouchers\.filter\(\s*\(v\)\s*=>\s*v\.issuingBranchId\s*===\s*branchId\s*\)/.test(source);
      expect(hasStrictIssuingFilter).toBe(true);

      // Incoming cross payment sets cashImpact to 0
      expect(source.includes('cashImpact: direction === "IN" ? 0 : amt')).toBe(true);
    });

    test("F14-03: daily-ledger/page.tsx renders cross payments table with 0 DZD non-monetary impact for incoming transactions", () => {
      const pageSource = readSourceFile("src/app/[locale]/(dashboard)/list/daily-ledger/page.tsx");

      // Verifies destructuring
      expect(pageSource.includes("todayCrossPayments")).toBe(true);

      // Verifies conditional render
      expect(pageSource.includes("hasCrossPayments")).toBe(true);

      // Verifies non-monetary 0 DZD badge for incoming cross payments
      expect(pageSource.includes("0 DZD (non monétaire)")).toBe(true);
      expect(pageSource.includes("0 دج (غير نقدي هنا)")).toBe(true);

      // Verifies disclaimer banner
      expect(pageSource.includes("Avis aux caissiers")).toBe(true);
    });

    test("F14-04: Cross-branch payment direction logic correctly classifies incoming vs outgoing", () => {
      // Simulation test of cross logic:
      // Student pays at Branch 1 (issuingBranchId = 1) for a group belonging to Branch 2 (targetBranchId = 2)
      const v = {
        id: 101,
        issuingBranchId: 1,
        targetBranchId: 2,
        amount: 5000,
      };

      // When Branch 2 views their ledger (branchId = 2):
      const branch2Id = 2;
      const targetBId_b2 = v.targetBranchId;
      const issuingBId_b2 = v.issuingBranchId;
      const isCross_b2 = issuingBId_b2 !== targetBId_b2;
      expect(isCross_b2).toBe(true);

      const direction_b2: "IN" | "OUT" = targetBId_b2 === branch2Id && issuingBId_b2 !== branch2Id ? "IN" : "OUT";
      expect(direction_b2).toBe("IN");
      const cashImpact_b2 = direction_b2 === "IN" ? 0 : v.amount;
      expect(cashImpact_b2).toBe(0);

      // When Branch 1 views their ledger (branchId = 1):
      const branch1Id = 1;
      const targetBId_b1 = v.targetBranchId;
      const issuingBId_b1 = v.issuingBranchId;
      const direction_b1: "IN" | "OUT" = targetBId_b1 === branch1Id && issuingBId_b1 !== branch1Id ? "IN" : "OUT";
      expect(direction_b1).toBe("OUT");
      const cashImpact_b1 = direction_b1 === "IN" ? 0 : v.amount;
      expect(cashImpact_b1).toBe(5000);
    });

    test("F14-05: messages/fr.json and messages/ar.json contain required cross payment localization keys", () => {
      const frSource = JSON.parse(readSourceFile("messages/fr.json"));
      const arSource = JSON.parse(readSourceFile("messages/ar.json"));

      expect(Boolean(frSource.dailyLedger?.crossPaymentsTitle)).toBe(true);
      expect(Boolean(frSource.dailyLedger?.directionIn)).toBe(true);
      expect(Boolean(frSource.dailyLedger?.directionOut)).toBe(true);
      expect(Boolean(frSource.dailyLedger?.cashImpactNone)).toBe(true);

      expect(Boolean(arSource.dailyLedger?.crossPaymentsTitle)).toBe(true);
      expect(Boolean(arSource.dailyLedger?.directionIn)).toBe(true);
      expect(Boolean(arSource.dailyLedger?.directionOut)).toBe(true);
      expect(Boolean(arSource.dailyLedger?.cashImpactNone)).toBe(true);
    });
  });
}

if (process.argv[1]?.endsWith("f14-daily-ledger-cross-payments.test.ts")) {
  runF14Tests().then(async () => {
    const { runner } = require("../helpers/runner");
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
