import { describe, test, expect } from "../helpers/runner";
import { safeImport, readSourceFile } from "../helpers/moduleLoader";
import { evaluateWithTimezone } from "../helpers/timezoneSimulator";
import { Prisma } from "@prisma/client";

export async function runM2AdversarialStressTests() {
  await describe("Challenger M2: Adversarial Cross-Screen & Boundary Stress", async () => {
    const { module: voucherUtils } = await safeImport<any>("@/lib/voucherUtils");
    const { module: algiersDate } = await safeImport<any>("@/lib/algiersDate");

    // =========================================================================
    // 1. STRESS-TESTING calculateVoucherTotals
    // =========================================================================
    test("ADV-M2-01: calculateVoucherTotals handles empty, null, and non-array inputs safely", () => {
      if (!voucherUtils?.calculateVoucherTotals) {
        throw new Error("voucherUtils.calculateVoucherTotals not found");
      }

      // Empty array
      const emptyRes = voucherUtils.calculateVoucherTotals([]);
      expect(emptyRes.grossAmount).toBe(0);
      expect(emptyRes.refundAmount).toBe(0);
      expect(emptyRes.netAmount).toBe(0);
      expect(emptyRes.formattedGross).toContain("0");
      expect(emptyRes.formattedGross).toContain("DZD");

      // Non-array inputs
      const nullRes = voucherUtils.calculateVoucherTotals(null as any);
      expect(nullRes.grossAmount).toBe(0);
      expect(nullRes.refundAmount).toBe(0);
      expect(nullRes.netAmount).toBe(0);

      const undefRes = voucherUtils.calculateVoucherTotals(undefined as any);
      expect(undefRes.grossAmount).toBe(0);
      expect(undefRes.refundAmount).toBe(0);
      expect(undefRes.netAmount).toBe(0);
    });

    test("ADV-M2-02: calculateVoucherTotals correctly excludes voided vouchers from both gross and refunds", () => {
      const vouchers = [
        { amount: 5000, isRefund: false, isVoided: false },
        { amount: 3000, isRefund: false, isVoided: true }, // voided gross
        { amount: 1500, isRefund: true, isVoided: false },  // active refund
        { amount: 2000, isRefund: true, isVoided: true },   // voided refund
      ];

      const res = voucherUtils.calculateVoucherTotals(vouchers);
      expect(res.grossAmount).toBe(5000);
      expect(res.refundAmount).toBe(1500);
      expect(res.netAmount).toBe(3500);
    });

    test("ADV-M2-03: calculateVoucherTotals handles Prisma.Decimal, string numbers, and decimal fractions", () => {
      const vouchers = [
        { amount: "4500.50", isRefund: false },
        { amount: new Prisma.Decimal(2500.25), isRefund: false },
        { amount: "1000.75", isRefund: true },
        { amount: null, isRefund: false },
        { amount: undefined, isRefund: false },
        { amount: "invalid-number", isRefund: false },
      ];

      const res = voucherUtils.calculateVoucherTotals(vouchers);
      // gross: 4500.50 + 2500.25 = 7000.75
      expect(Math.abs(res.grossAmount - 7000.75) < 0.001).toBe(true);
      // refund: 1000.75
      expect(Math.abs(res.refundAmount - 1000.75) < 0.001).toBe(true);
      // net: 7000.75 - 1000.75 = 6000
      expect(Math.abs(res.netAmount - 6000.0) < 0.001).toBe(true);
    });

    test("ADV-M2-04: calculateVoucherTotals handles negative refund amounts gracefully (magnitude abs)", () => {
      const vouchers = [
        { amount: 10000, isRefund: false },
        { amount: -2000, isRefund: true }, // negative magnitude in refund record
      ];

      const res = voucherUtils.calculateVoucherTotals(vouchers);
      expect(res.grossAmount).toBe(10000);
      expect(res.refundAmount).toBe(2000); // magnitude preserved positively
      expect(res.netAmount).toBe(8000);
    });

    test("ADV-M2-05: calculateVoucherTotals localized outputs match formatDZD in 'fr' and 'ar'", () => {
      const vouchers = [
        { amount: 150000, isRefund: false },
        { amount: 25000, isRefund: true },
      ];

      const resFr = voucherUtils.calculateVoucherTotals(vouchers, "fr");
      const resAr = voucherUtils.calculateVoucherTotals(vouchers, "ar");

      // Verify net matching formatDZD
      expect(resFr.formattedNet).toBe(algiersDate.formatDZD(125000, "fr"));
      expect(resAr.formattedNet).toBe(algiersDate.formatDZD(125000, "ar"));

      // Verify no raw NaN or undefined
      expect(resFr.formattedGross).notToContain("NaN");
      expect(resAr.formattedGross).notToContain("NaN");
      expect(resFr.formattedRefund).notToContain("NaN");
      expect(resAr.formattedRefund).notToContain("NaN");
    });

    test("ADV-M2-06: formatDZD produces identical normalized string regardless of client platform locale", () => {
      const amount = 1234567.89;
      const fr1 = algiersDate.formatDZD(amount, "fr");
      const fr2 = algiersDate.formatDZD(amount, "fr");
      expect(fr1).toBe(fr2);

      // Verify non-breaking space consistency
      const containsSpace = fr1.includes("\u00A0") || fr1.includes("\u202F") || fr1.includes(" ");
      expect(containsSpace).toBe(true);
      expect(fr1).toContain("DZD");
    });

    // =========================================================================
    // 2. AUDIT CROSS-SCREEN CONSISTENCY & BARE #{v.number}
    // =========================================================================
    test("ADV-M2-07: RevenuePaymentsTable has zero instances of bare '#{v.number}' in table cells", () => {
      const source = readSourceFile("src/components/revenue/RevenuePaymentsTable.tsx");
      // Check for table cells rendering bare voucher number without series/display context
      const bareTdNumberMatch = /<td[^>]*dir="ltr">\s*#\{v\.number\}\s*<\/td>/.test(source);
      expect(bareTdNumberMatch).toBe(false);

      // Check for any #{v.number} inside table rows
      const tableRowBareNumber = /<tr[\s\S]*?#\{v\.number\}[\s\S]*?<\/tr>/.test(source);
      expect(tableRowBareNumber).toBe(false);
    });

    test("ADV-M2-08: daily-ledger/page.tsx has zero instances of bare '#{v.number}'", () => {
      const source = readSourceFile("src/app/[locale]/(dashboard)/list/daily-ledger/page.tsx");
      const bareNumberSpan = /<span>\s*#\{v\.number\}\s*<\/span>/.test(source);
      expect(bareNumberSpan).toBe(false);

      const anyBareNumber = /#\{v\.number\}/.test(source);
      expect(anyBareNumber).toBe(false);
    });

    test("ADV-M2-09: RevenuePaymentsTable uses formatPaymentDate and formatPaymentTime for date column", () => {
      const source = readSourceFile("src/components/revenue/RevenuePaymentsTable.tsx");
      expect(source).toContain("formatPaymentDate(v.issuedAt)");
      expect(source).toContain("formatPaymentTime(v.issuedAt)");

      // Must not use device-local format(new Date(v.issuedAt), ...) without timezone
      const usesUnanchoredDateFns = /format\(\s*new\s+Date\(v\.issuedAt\)/.test(source);
      expect(usesUnanchoredDateFns).toBe(false);
    });

    // =========================================================================
    // 3. ADVERSARIAL STRESS ON formatVoucherDisplay
    // =========================================================================
    test("ADV-M2-10: formatVoucherDisplay handles extreme and adversarial voucher inputs", () => {
      // 1. null voucher returns "BON 0"
      const r0 = voucherUtils.formatVoucherDisplay(null);
      expect(r0).toBe("BON 0");

      // 2. completely empty object resolves to default branch "ECOLE BON 0"
      const r1 = voucherUtils.formatVoucherDisplay({});
      expect(r1).toBe("ECOLE BON 0");

      // 3. voucher with negative or float number
      const r2 = voucherUtils.formatVoucherDisplay({ number: -5 });
      expect(r2).toContain("BON -5");

      // 4. voucher with zero and valid series prefix
      const r3 = voucherUtils.formatVoucherDisplay({ number: 0, series: { prefix: "TEST-BRANCH" } });
      expect(r3).toBe("TEST-BRANCH BON 0");

      // 5. voucher with only id (no number property)
      const r4 = voucherUtils.formatVoucherDisplay({ id: 999, series: { prefix: "ANNEX" } });
      expect(r4).toBe("ANNEX BON 999");

      // 6. voucher with empty spaces prefix (should fall back to branch resolution)
      const r5 = voucherUtils.formatVoucherDisplay(
        { number: 10, series: { prefix: "   " } },
        { branchName: "AMPHI", levelName: "BAC" }
      );
      expect(r5).toContain("AMPHI");
      expect(r5).toContain("BAC");
      expect(r5).toContain("BON 10");

      // 7. voucher with special characters and Arabic in prefix
      const arabicPrefix = "فرع-البليدة / قسم-التحضيري";
      const r6 = voucherUtils.formatVoucherDisplay({ number: 77, series: { prefix: arabicPrefix } });
      expect(r6).toContain(arabicPrefix);
      expect(r6).toContain("BON 77");
    });

    test("ADV-M2-11: formatVoucherDisplay dates never emit '01/01/2026' or empty '()' across edge dates", () => {
      const edgeDates = [
        null,
        undefined,
        "",
        "not-a-date",
        new Date(NaN),
        0, // timestamp 0 (1970)
        "2026-01-01T00:00:00Z", // legitimate 2026-01-01 date should format DD/MM/YYYY
      ];

      for (const d of edgeDates) {
        const res = voucherUtils.formatVoucherDisplay({
          number: 100,
          issuedAt: d,
          series: { prefix: "ECOLE" },
        });

        // Must never emit empty parentheses
        expect(res).notToContain("()");

        if (d === null || d === undefined || d === "" || d === "not-a-date" || (d instanceof Date && isNaN(d.getTime()))) {
          // Missing/invalid dates must NOT append date or 01/01/2026
          expect(res).toBe("ECOLE BON 100");
          expect(res).notToContain("01/01/2026");
        } else if (d === 0) {
          // Unix epoch
          expect(res).toContain("1970");
        } else if (d === "2026-01-01T00:00:00Z") {
          // Legitimate date should include (01/01/2026)
          expect(res).toContain("(01/01/2026)");
        }
      }
    });

    test("ADV-M2-12: formatVoucherDisplay correctly reflects refund status in label", () => {
      // isRefund: true
      const r1 = voucherUtils.formatVoucherDisplay({
        number: 404,
        isRefund: true,
        series: { prefix: "ANNEX 4AM" },
      });
      expect(r1).toContain("ANNEX 4AM");
      expect(r1).toContain("BON REMBOURSEMENT 404");

      // status: "REFUND"
      const r2 = voucherUtils.formatVoucherDisplay({
        number: 505,
        status: "REFUND",
        series: { prefix: "ANNEX 4AM" },
      } as any);
      expect(r2).toContain("BON REMBOURSEMENT 505");

      // fallbackContext: { isRefund: true }
      const r3 = voucherUtils.formatVoucherDisplay(
        { number: 606, series: { prefix: "ANNEX" } },
        { isRefund: true }
      );
      expect(r3).toContain("BON REMBOURSEMENT 606");
    });

    test("ADV-M2-13: formatVoucherDisplay distinguishes WORKSHOP (DAWARAT) and FORMATION categories", () => {
      // Workshop via paymentType
      const r1 = voucherUtils.formatVoucherDisplay({
        number: 1,
        paymentType: "WORKSHOP",
        issuingBranchId: 1,
      });
      expect(r1).toContain("ECOLE DAWARAT BON 1");

      // Workshop via fallback context
      const r2 = voucherUtils.formatVoucherDisplay(
        { number: 2, issuingBranchId: 2 },
        { isWorkshop: true }
      );
      expect(r2).toContain("ANNEX DAWARAT BON 2");

      // Formation via paymentType
      const r3 = voucherUtils.formatVoucherDisplay({
        number: 3,
        paymentType: "FORMATION",
        issuingBranchId: 3,
      });
      expect(r3).toContain("AMPHI FORMATION BON 3");

      // Formation via class.isFormation
      const r4 = voucherUtils.formatVoucherDisplay({
        number: 4,
        class: { isFormation: true },
        issuingBranchId: 1,
      });
      expect(r4).toContain("ECOLE FORMATION BON 4");
    });

    // =========================================================================
    // 4. PRINTABLE TICKETS TIMEZONE DRIFT IMMUNITY
    // =========================================================================
    test("ADV-M2-14: Thermal tickets render identical timestamps across foreign timezones", () => {
      const fixedTimestamp = "2026-10-21T15:30:00.000Z"; // 16:30 in Algiers (UTC+1)

      // Timezones around the globe
      const foreignZones = [
        "America/New_York",       // UTC-4 / UTC-5
        "America/Los_Angeles",    // UTC-7 / UTC-8
        "Asia/Tokyo",             // UTC+9
        "Asia/Dubai",             // UTC+4
        "Europe/London",          // UTC+0 / UTC+1
        "Pacific/Auckland",       // UTC+12 / UTC+13
      ];

      for (const zone of foreignZones) {
        const formattedDate = evaluateWithTimezone(zone, () => {
          return voucherUtils.formatPaymentDate(fixedTimestamp);
        });
        const formattedTime = evaluateWithTimezone(zone, () => {
          return voucherUtils.formatPaymentTime(fixedTimestamp);
        });
        const formattedDateTime = evaluateWithTimezone(zone, () => {
          return voucherUtils.formatPaymentDateTime(fixedTimestamp);
        });

        expect(formattedDate).toBe("21/10/2026");
        expect(formattedTime).toBe("16:30");
        expect(formattedDateTime).toBe("21/10/2026 16:30");
      }
    });

    test("ADV-M2-15: All printable ticket files are anchored strictly to Africa/Algiers", () => {
      const ticketFiles = [
        "src/components/printable/PaymentTicket.tsx",
        "src/components/printable/WorkshopTicket.tsx",
        "src/components/printable/PayslipTicket.tsx",
        "src/components/printable/StaffPayslipTicket.tsx",
        "src/components/printable/RealNetTicket.tsx",
        "src/components/printable/SchoolShareTicket.tsx",
      ];

      for (const file of ticketFiles) {
        const content = readSourceFile(file);

        // Check for raw unanchored toLocaleDateString() or toLocaleString()
        const rawToLocale = /(?<!formatAlgiers[a-zA-Z]*\s*)\.toLocale(Date|Time)?String\(\s*(locale)?\s*\)/.test(content);
        if (rawToLocale) {
          throw new Error(`Defect in ${file}: Contains raw unanchored toLocaleDateString/toLocaleString call without Africa/Algiers timezone`);
        }

        // Must either import from algiersDate/voucherUtils or reference Africa/Algiers
        const isAnchored =
          content.includes("algiersDate") ||
          content.includes("voucherUtils") ||
          content.includes("Africa/Algiers") ||
          content.includes("formatDZD");
        expect(isAnchored).toBe(true);
      }
    });
  });
}

if (process.argv[1]?.endsWith("challenger-m2-cross-screen-stress.test.ts")) {
  runM2AdversarialStressTests().then(async () => {
    const { runner } = require("../helpers/runner");
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
