import { describe, test, expect, runner } from "../helpers/runner";
import { safeImport, readSourceFile } from "../helpers/moduleLoader";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { Prisma } from "@prisma/client";

/**
 * Challenger M2: Voucher Metadata & Printable Tickets Adversarial Stress Harness
 *
 * Stress-tests:
 * 1. Complete elimination of '01/01/2026' across all inputs, edge cases, and components.
 * 2.formatPaymentDate / formatPaymentTime / formatPaymentDateTime with invalid, null, boundary dates.
 * 3. formatVoucherDisplay series prefix priority:
 *    - explicit series.prefix (standard, Arabic, long multi-word, workshop, refund)
 *    - fallback context priority & relational resolution
 *    - null / undefined vouchers
 * 4. calculateVoucherTotals with voided, negative, Decimal, and refund vouchers.
 * 5. Thermal printable tickets (PaymentTicket, WorkshopTicket, PrintWorkshopTicketButton):
 *    - 80mm continuous roll @page CSS
 *    - 78mm roll width and Tajawal Arabic font
 *    - React server rendering under edge cases (missing student, missing workshop, null dates)
 */

export async function runChallengerM2StressTests() {
  await describe("Challenger M2: Voucher Metadata & Thermal Ticket Adversarial Stress", async () => {
    const { module: voucherUtils, error: vuErr } = await safeImport<any>("@/lib/voucherUtils");
    if (!voucherUtils) {
      throw new Error(`Failed to load voucherUtils: ${vuErr}`);
    }

    const {
      formatPaymentDate,
      formatPaymentTime,
      formatPaymentDateTime,
      formatVoucherDate,
      formatVoucherDateTime,
      formatVoucherDisplay,
      resolvePaymentBranch,
      resolveStudentLevel,
      calculateVoucherTotals,
    } = voucherUtils;

    // =========================================================================
    // SECTION 1: Zero Occurrences of '01/01/2026' & No Empty Parentheses '()'
    // =========================================================================

    test("CM2-01: formatPaymentDate returns empty string without '01/01/2026' across 12 adversarial date inputs", () => {
      const adversarialDateInputs = [
        null,
        undefined,
        "",
        "   ",
        "invalid-date",
        "abc-def-ghi",
        "undefined",
        "null",
        NaN,
        new Date(NaN),
        {},
        [],
      ];

      for (const input of adversarialDateInputs) {
        const res = formatPaymentDate(input as any);
        expect(res).notToContain("01/01/2026");
        expect(res).toBe("");
      }
    });

    test("CM2-02: formatPaymentDateTime returns empty string without '01/01/2026 00:00' across adversarial inputs", () => {
      const adversarialInputs = [
        null,
        undefined,
        "",
        "   ",
        "invalid-iso-string",
        new Date("invalid"),
        NaN,
      ];

      for (const input of adversarialInputs) {
        const res = formatPaymentDateTime(input as any);
        expect(res).notToContain("01/01/2026");
        expect(res).toBe("");
      }
    });

    test("CM2-03: formatVoucherDate and formatVoucherDateTime never produce empty parentheses '()' or fake date", () => {
      const inputs = [null, undefined, "", "not-a-date", new Date(NaN)];
      for (const input of inputs) {
        const dateWrap = formatVoucherDate(input as any);
        const dateTimeWrap = formatVoucherDateTime(input as any);
        expect(dateWrap).toBe("");
        expect(dateTimeWrap).toBe("");
        expect(dateWrap).notToContain("()");
        expect(dateTimeWrap).notToContain("()");
        expect(dateWrap).notToContain("01/01/2026");
        expect(dateTimeWrap).notToContain("01/01/2026");
      }
    });

    test("CM2-04: formatVoucherDisplay with null/undefined voucher produces safe 'BON 0' without fake date or '()'", () => {
      const resNull = formatVoucherDisplay(null);
      const resUndef = formatVoucherDisplay(undefined);

      expect(resNull).toBe("BON 0");
      expect(resUndef).toBe("BON 0");
      expect(resNull).notToContain("01/01/2026");
      expect(resNull).notToContain("()");
      expect(resUndef).notToContain("01/01/2026");
      expect(resUndef).notToContain("()");

      // With fallback context
      const resWithContext = formatVoucherDisplay(null, {
        branchName: "ANNEX",
        levelName: "4AM",
      });
      expect(resWithContext).toBe("ANNEX 4AM BON 0");
      expect(resWithContext).notToContain("01/01/2026");
      expect(resWithContext).notToContain("()");
    });

    // =========================================================================
    // SECTION 2: Valid Date Formatting Anchored to Africa/Algiers
    // =========================================================================

    test("CM2-05: formatPaymentDate formats leap days, epoch, and future dates strictly in Algiers timezone", () => {
      // Leap day in Algiers
      const leapDay = formatPaymentDate(new Date("2024-02-29T12:00:00Z"));
      expect(leapDay).toBe("29/02/2024");

      // Midnight UTC-1 crossing into next day in Algiers (UTC 23:30Z on Oct 21 -> Oct 22 in Algiers)
      const crossingDate = formatPaymentDate(new Date("2026-10-21T23:30:00Z"));
      expect(crossingDate).toBe("22/10/2026");

      // Distant future 2099
      const future = formatPaymentDate(new Date("2099-12-31T20:00:00Z"));
      expect(future).toBe("31/12/2099");

      // Unix Epoch 1970-01-01 00:00:00 UTC -> 01:00:00 in Algiers
      const epoch = formatPaymentDate(0);
      expect(epoch).toBe("01/01/1970");
    });

    // =========================================================================
    // SECTION 3: Series Prefix Priority & Formatting Stress
    // =========================================================================

    test("CM2-06: Explicit series.prefix takes precedence over relational branch and level", () => {
      const voucher = {
        number: 42,
        issuedAt: new Date("2026-05-15T10:00:00.000Z"),
        series: {
          prefix: "ANNEX 4AM",
        },
        issuingBranch: { name: "ECOLE" }, // Should be overridden by series.prefix
        class: { level: { name: "1AS" } }, // Should be overridden by series.prefix
      };

      const result = formatVoucherDisplay(voucher);
      expect(result).toBe("ANNEX 4AM BON 42 (15/05/2026)");
    });

    test("CM2-07: Diverse series prefixes: Arabic script, multi-word, workshop, and punctuation", () => {
      // Arabic prefix
      const arabicVoucher = {
        number: 12,
        issuedAt: new Date("2026-10-21T10:00:00.000Z"),
        series: {
          prefix: "فرع 1 4متوسط",
        },
      };
      expect(formatVoucherDisplay(arabicVoucher)).toBe("فرع 1 4متوسط BON 12 (21/10/2026)");

      // Multi-word long prefix
      const longPrefixVoucher = {
        number: 999,
        series: {
          prefix: "ECOLE-PRINCIPALE-SECTION-LANGUES-INTENSIVES",
        },
      };
      expect(formatVoucherDisplay(longPrefixVoucher)).toBe(
        "ECOLE-PRINCIPALE-SECTION-LANGUES-INTENSIVES BON 999"
      );

      // Workshop prefix
      const workshopVoucher = {
        number: 7,
        series: {
          prefix: "ECOLE DAWARAT",
        },
      };
      expect(formatVoucherDisplay(workshopVoucher)).toBe("ECOLE DAWARAT BON 7");
    });

    test("CM2-08: Empty or whitespace-only series.prefix falls back to relational branch/level", () => {
      // Empty string prefix
      const emptyPrefixVoucher = {
        number: 15,
        series: {
          prefix: "",
        },
        issuingBranch: { name: "AMPHI" },
        levelName: "BAC",
      };
      expect(formatVoucherDisplay(emptyPrefixVoucher)).toBe("AMPHI BAC BON 15");

      // Whitespace string prefix
      const spacePrefixVoucher = {
        number: 20,
        series: {
          prefix: "    ",
        },
        issuingBranchId: 2, // Maps to ANNEX
        class: { level: { name: "2AS" } },
      };
      expect(formatVoucherDisplay(spacePrefixVoucher)).toBe("ANNEX 2AS BON 20");
    });

    test("CM2-09: Refund vouchers format with 'BON REMBOURSEMENT' across all triggers", () => {
      // Trigger 1: isRefund = true
      const v1 = {
        number: 101,
        isRefund: true,
        series: { prefix: "ECOLE 3AM" },
        issuedAt: new Date("2026-10-21T12:00:00Z"),
      };
      expect(formatVoucherDisplay(v1)).toBe("ECOLE 3AM BON REMBOURSEMENT 101 (21/10/2026)");

      // Trigger 2: status = "REFUND"
      const v2 = {
        number: 102,
        status: "REFUND",
        issuingBranchId: 1,
        class: { level: { name: "BAC" } },
      };
      expect(formatVoucherDisplay(v2)).toBe("ECOLE BAC BON REMBOURSEMENT 102");

      // Trigger 3: fallbackContext.isRefund = true
      const v3 = {
        number: 103,
        issuingBranchId: 3,
      };
      expect(formatVoucherDisplay(v3, { isRefund: true, levelName: "BEM" })).toBe(
        "AMPHI BEM BON REMBOURSEMENT 103"
      );
    });

    test("CM2-10: Dawarat and Formation vouchers render correct middle segments when series.prefix is absent", () => {
      // Dawarat by paymentType
      const vDawaratType = {
        number: 5,
        paymentType: "WORKSHOP",
        issuingBranchId: 1,
      };
      expect(formatVoucherDisplay(vDawaratType)).toBe("ECOLE DAWARAT BON 5");

      // Dawarat by workshopId
      const vDawaratId = {
        number: 6,
        workshopId: 12,
        issuingBranchId: 2,
      };
      expect(formatVoucherDisplay(vDawaratId)).toBe("ANNEX DAWARAT BON 6");

      // Dawarat by fallbackContext
      const vDawaratCtx = {
        number: 7,
        issuingBranchId: 3,
      };
      expect(formatVoucherDisplay(vDawaratCtx, { isWorkshop: true })).toBe("AMPHI DAWARAT BON 7");

      // Formation by paymentType
      const vFormationType = {
        number: 8,
        paymentType: "FORMATION",
        issuingBranchId: 1,
      };
      expect(formatVoucherDisplay(vFormationType)).toBe("ECOLE FORMATION BON 8");

      // Formation by class.isFormation
      const vFormationClass = {
        number: 9,
        issuingBranchId: 2,
        class: { isFormation: true },
      };
      expect(formatVoucherDisplay(vFormationClass)).toBe("ANNEX FORMATION BON 9");
    });

    test("CM2-11: Number fallback priority: number -> id -> 0", () => {
      // number present
      expect(formatVoucherDisplay({ number: 99 })).toBe("ECOLE BON 99");

      // number null, id present
      expect(formatVoucherDisplay({ number: null, id: 55 })).toBe("ECOLE BON 55");

      // number undefined, id present
      expect(formatVoucherDisplay({ id: 77 })).toBe("ECOLE BON 77");

      // neither present
      expect(formatVoucherDisplay({})).toBe("ECOLE BON 0");
    });

    // =========================================================================
    // SECTION 4: calculateVoucherTotals Aggregation & Localized DZD Formatting
    // =========================================================================

    test("CM2-12: calculateVoucherTotals properly excludes voided vouchers and computes net = gross - refunds", () => {
      const mockVouchers = [
        { amount: 5000, isRefund: false, isVoided: false },
        { amount: 3000, isRefund: false, isVoided: false },
        { amount: 2000, isRefund: true, isVoided: false }, // Refund: -2000
        { amount: 10000, isRefund: false, isVoided: true }, // Voided: excluded
        { amount: new Prisma.Decimal("1500"), isRefund: false, isVoided: false }, // Prisma Decimal
        { amount: "500", isRefund: true, isVoided: false }, // String refund: -500
      ];

      const totals = calculateVoucherTotals(mockVouchers, "fr");
      // Gross: 5000 + 3000 + 1500 = 9500
      // Refunds: 2000 + 500 = 2500
      // Net: 9500 - 2500 = 7000
      expect(totals.grossAmount).toBe(9500);
      expect(totals.refundAmount).toBe(2500);
      expect(totals.netAmount).toBe(7000);

      expect(totals.formattedGross).toContain("9");
      expect(totals.formattedGross).toContain("500");
      expect(totals.formattedGross).toContain("DZD");

      expect(totals.formattedRefund).toContain("2");
      expect(totals.formattedRefund).toContain("500");
      expect(totals.formattedRefund).toContain("DZD");

      expect(totals.formattedNet).toContain("7");
      expect(totals.formattedNet).toContain("000");
      expect(totals.formattedNet).toContain("DZD");
    });

    test("CM2-13: calculateVoucherTotals with empty array or null handles gracefully", () => {
      const t1 = calculateVoucherTotals([], "ar");
      expect(t1.grossAmount).toBe(0);
      expect(t1.refundAmount).toBe(0);
      expect(t1.netAmount).toBe(0);

      const t2 = calculateVoucherTotals(null as any, "fr");
      expect(t2.grossAmount).toBe(0);
      expect(t2.refundAmount).toBe(0);
      expect(t2.netAmount).toBe(0);
    });

    // =========================================================================
    // SECTION 5: Thermal Printable Tickets Static & Dynamic Verification
    // =========================================================================

    test("CM2-14: PrintWorkshopTicketButton enforces 80mm roll, base href, and p-1 body", () => {
      const source = readSourceFile("src/components/PrintWorkshopTicketButton.tsx");

      // Verify exact @page rule
      expect(source).toMatch(/@page\s*\{\s*size:\s*80mm\s*auto;\s*margin:\s*0;?\s*\}/);

      // Verify base href injection
      expect(source).toContain('<base href="${window.location.origin}/">');

      // Verify continuous roll body class
      expect(source).toContain('class="flex justify-center p-1 m-0"');

      // Verify print trigger mechanism
      expect(source).toContain("window.print()");
      expect(source).toContain("window.close()");
    });

    test("CM2-15: PaymentTicket enforces 78mm roll width and Tajawal Arabic font", () => {
      const source = readSourceFile("src/components/printable/PaymentTicket.tsx");

      expect(source).toContain("width: '78mm'");
      expect(source).toContain("Tajawal");
      expect(source).toContain("formatAlgiersDateTime");
      expect(source).toContain("formatVoucherDisplay");
      expect(source).notToContain("01/01/2026");
    });

    test("CM2-16: PaymentTicket renders cleanly with React without throwing or leaking '01/01/2026'", async () => {
      const { module: paymentTicketMod } = await safeImport<any>("@/components/printable/PaymentTicket");
      if (!paymentTicketMod?.PaymentTicket) {
        throw new Error("PaymentTicket component not found");
      }

      const mockVoucher: any = {
        id: 101,
        number: 101,
        issuedAt: null, // Test null date rendering
        amount: 4500,
        paymentType: "TUITION_4SESSION",
        isVoided: false,
        issuingBranchId: 1,
        targetBranchId: 1,
        student: { id: "std-1", name: "Ahmed Benali", globalNumber: "1001" },
        class: { id: 1, name: "4AM-Groupe-A" },
        series: { prefix: "ANNEX 4AM" },
      };

      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(paymentTicketMod.PaymentTicket, {
          voucher: mockVoucher,
          locale: "ar",
        })
      );

      expect(html).notToContain("01/01/2026");
      expect(html).toContain("ANNEX 4AM");
      expect(html).toContain("BON 101");
      expect(html).toContain("Ahmed Benali");
      expect(html).toContain("4AM-Groupe-A");
      expect(html).toContain("4");
      expect(html).toContain("500");
    });

    test("CM2-17: WorkshopTicket renders cleanly with React without throwing or leaking '01/01/2026'", async () => {
      const { module: workshopTicketMod } = await safeImport<any>("@/components/printable/WorkshopTicket");
      if (!workshopTicketMod?.WorkshopTicket) {
        throw new Error("WorkshopTicket component not found");
      }

      const mockPayment: any = {
        id: 55,
        number: 55,
        voucherDisplay: "ECOLE DAWARAT BON 55",
        amount: 2500,
        date: "2026-10-21T14:30:00Z",
        participant: { name: "Karim Ziani", chairNumber: 14 },
        workshop: { title: "Robotics Workshop" },
      };

      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(workshopTicketMod.WorkshopTicket, {
          payment: mockPayment,
          amountOwedByParticipant: 0,
          locale: "fr",
        })
      );

      expect(html).notToContain("01/01/2026");
      expect(html).toContain("ECOLE DAWARAT BON 55");
      expect(html).toContain("Karim Ziani");
      expect(html).toContain("#14");
      expect(html).toContain("Robotics Workshop");
      expect(html).toContain("2");
      expect(html).toContain("500");
    });

    test("CM2-18: Global static scan confirms zero occurrences of '01/01/2026' across entire src/ directory", () => {
      const fs = require("fs");
      const path = require("path");

      function scanDir(dir: string, matches: string[]) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath, matches);
          } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
            const content = fs.readFileSync(fullPath, "utf-8");
            if (content.includes("01/01/2026")) {
              matches.push(fullPath);
            }
          }
        }
      }

      const matches: string[] = [];
      const srcDir = path.resolve(process.cwd(), "src");
      scanDir(srcDir, matches);

      if (matches.length > 0) {
        throw new Error(`Defect: Found hardcoded '01/01/2026' in files: ${matches.join(", ")}`);
      }
      expect(matches.length).toBe(0);
    });
  });
}

if (process.argv[1]?.includes("challenger-m2-voucher-thermal-stress.test.ts")) {
  runChallengerM2StressTests().then(async () => {
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
