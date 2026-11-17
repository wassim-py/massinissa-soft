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

    test("CM2-19: PaymentTicket renders remainingSessions for normal cycles and excludes REVISION_SESSION / FORMATION", async () => {
      const { module: paymentTicketMod } = await safeImport<any>("@/components/printable/PaymentTicket");
      const baseVoucher: any = {
        id: 201,
        number: 201,
        issuedAt: "2026-10-21T10:00:00Z",
        amount: 2000,
        paymentType: "TUITION_4SESSION",
        isVoided: false,
        issuingBranchId: 1,
        targetBranchId: 1,
        student: { id: "std-19", name: "Yasmine K", globalNumber: 120 },
        class: { id: 10, name: "3AS-Math" },
        series: { prefix: "ECOLE 3AS" },
      };

      const htmlAr = ReactDOMServer.renderToStaticMarkup(
        React.createElement(paymentTicketMod.PaymentTicket, {
          voucher: baseVoucher,
          remainingSessions: 3,
          locale: "ar",
        })
      );
      expect(htmlAr).toContain("الحصص المتبقية:");
      expect(htmlAr).toContain(">3<");

      const htmlZero = ReactDOMServer.renderToStaticMarkup(
        React.createElement(paymentTicketMod.PaymentTicket, {
          voucher: baseVoucher,
          remainingSessions: 0,
          locale: "fr",
        })
      );
      expect(htmlZero).toContain("Séances restantes :");
      expect(htmlZero).toContain(">0<");

      const htmlRevision = ReactDOMServer.renderToStaticMarkup(
        React.createElement(paymentTicketMod.PaymentTicket, {
          voucher: { ...baseVoucher, paymentType: "REVISION_SESSION" },
          remainingSessions: 2,
          locale: "fr",
        })
      );
      expect(htmlRevision).notToContain("Séances restantes :");

      const htmlFormation = ReactDOMServer.renderToStaticMarkup(
        React.createElement(paymentTicketMod.PaymentTicket, {
          voucher: { ...baseVoucher, paymentType: "FORMATION", class: { id: 10, name: "Eng A1", isFormation: true } },
          remainingSessions: 2,
          locale: "fr",
        })
      );
      expect(htmlFormation).notToContain("Séances restantes :");
    });

    test("CM2-20: PaymentTicket supports REVISION_SESSION in AR/FR and guards missing student/class", async () => {
      const { module: paymentTicketMod } = await safeImport<any>("@/components/printable/PaymentTicket");

      const htmlAr = ReactDOMServer.renderToStaticMarkup(
        React.createElement(paymentTicketMod.PaymentTicket, {
          voucher: {
            id: 202,
            number: 202,
            issuedAt: "2026-10-21T10:00:00Z",
            amount: 500,
            paymentType: "REVISION_SESSION",
            isVoided: false,
            issuingBranchId: 1,
            targetBranchId: 1,
            student: null,
            class: null,
          },
          locale: "ar",
        })
      );
      expect(htmlAr).toContain("حصة مراجعة (زائر)");
      expect(htmlAr).toContain("BON 202");

      const htmlFr = ReactDOMServer.renderToStaticMarkup(
        React.createElement(paymentTicketMod.PaymentTicket, {
          voucher: {
            id: 203,
            number: 203,
            issuedAt: "2026-10-21T10:00:00Z",
            amount: 500,
            paymentType: "REVISION_SESSION",
            isVoided: false,
            issuingBranchId: 1,
            targetBranchId: 1,
            student: { id: "s2", name: "Nabil", globalNumber: 200 },
            class: { id: 5, name: "BAC-Phys" },
          },
          locale: "fr",
        })
      );
      expect(htmlFr).toContain("Séance de révision (Visiteur)");
    });

    test("CM2-21: PaymentTicket renders REFUND, REFUNDED, PARTIALLY_REFUNDED, VOIDED, and PARTIAL + 1-cycle balance cleanly", async () => {
      const { module: paymentTicketMod } = await safeImport<any>("@/components/printable/PaymentTicket");
      const base: any = {
        id: 210,
        number: 210,
        issuedAt: "2026-10-21T10:00:00Z",
        amount: 2000,
        paymentType: "TUITION_4SESSION",
        isVoided: false,
        issuingBranchId: 1,
        targetBranchId: 1,
        student: { id: "s3", name: "Meriem", globalNumber: 300 },
        class: { id: 7, name: "4AM-A" },
        series: { prefix: "ECOLE 4AM" },
      };

      const htmlPartial = ReactDOMServer.renderToStaticMarkup(
        React.createElement(paymentTicketMod.PaymentTicket, {
          voucher: { ...base, amount: 1000, isPartial: true },
          cycleRemainingFee: 1000,
          remainingSessions: 2,
          locale: "fr",
        })
      );
      expect(htmlPartial).toContain("Paiement partiel (PARTIEL)");
      expect(htmlPartial).toContain("Reste pour 1 cycle :");
      expect(htmlPartial).toContain("1");
      expect(htmlPartial).toContain("000");

      const htmlPartialAr = ReactDOMServer.renderToStaticMarkup(
        React.createElement(paymentTicketMod.PaymentTicket, {
          voucher: { ...base, amount: 1000 },
          cycleRemainingFee: 1000,
          locale: "ar",
        })
      );
      expect(htmlPartialAr).toContain("دفع جزئي (PARTIEL)");
      expect(htmlPartialAr).toContain("المتبقي لإكمال الدورة:");
      expect(htmlPartialAr).toContain("اشتراك دراسي");
      expect(htmlPartialAr).notToContain("(4 حصص)");

      // PARTIALLY_REFUNDED: DB remainingBalance tracks unrefunded money (1500), NOT unpaid fee!
      const htmlPartRefunded = ReactDOMServer.renderToStaticMarkup(
        React.createElement(paymentTicketMod.PaymentTicket, {
          voucher: {
            ...base,
            status: "PARTIALLY_REFUNDED",
            remainingBalance: 1500,
            refunds: [{ id: 1, amount: 500 }],
          },
          locale: "fr",
        })
      );
      expect(htmlPartRefunded).toContain("Partiellement remboursé");
      expect(htmlPartRefunded).toContain("Montant remboursé :");
      expect(htmlPartRefunded).toContain("Net payé :");
      expect(htmlPartRefunded).notToContain("Paiement partiel (PARTIEL)");
      expect(htmlPartRefunded).notToContain("Reste à payer :");

      const htmlRefunded = ReactDOMServer.renderToStaticMarkup(
        React.createElement(paymentTicketMod.PaymentTicket, {
          voucher: {
            ...base,
            status: "REFUNDED",
            remainingBalance: 0,
            refunds: [{ id: 2, amount: 2000 }],
          },
          locale: "ar",
        })
      );
      expect(htmlRefunded).toContain("وصل مسترجع كلياً (REFUNDED)");
      expect(htmlRefunded).notToContain("دفع جزئي (PARTIEL)");

      const htmlRefundVoucher = ReactDOMServer.renderToStaticMarkup(
        React.createElement(paymentTicketMod.PaymentTicket, {
          voucher: {
            ...base,
            amount: -500,
            isRefund: true,
            status: "REFUND",
            refundForVoucherId: 209,
          },
          locale: "fr",
        })
      );
      expect(htmlRefundVoucher).toContain("Bon de remboursement (REFUND)");
      expect(htmlRefundVoucher).toContain("BON REMBOURSEMENT 210");
      expect(htmlRefundVoucher).toContain("#209");
      expect(htmlRefundVoucher).toContain("Total remboursé :");
    });

    test("CM2-22: WorkshopTicket renders PARTIAL, REFUND, PARTIALLY_REFUNDED, and REFUNDED badges", async () => {
      const { module: workshopTicketMod } = await safeImport<any>("@/components/printable/WorkshopTicket");
      const basePay: any = {
        id: 88,
        number: 88,
        voucherDisplay: "ECOLE DAWARAT BON 88",
        amount: 1500,
        date: "2026-10-21T14:30:00Z",
        participant: { name: "Sara", chairNumber: 3 },
        workshop: { title: "Arduino" },
      };

      const htmlPartial = ReactDOMServer.renderToStaticMarkup(
        React.createElement(workshopTicketMod.WorkshopTicket, {
          payment: { ...basePay, isPartial: true },
          amountOwedByParticipant: 1000,
          locale: "fr",
        })
      );
      expect(htmlPartial).toContain("Paiement partiel (PARTIEL)");

      const htmlPartRefund = ReactDOMServer.renderToStaticMarkup(
        React.createElement(workshopTicketMod.WorkshopTicket, {
          payment: {
            ...basePay,
            status: "PARTIALLY_REFUNDED",
            refunds: [{ id: 1, amount: 500 }],
          },
          amountOwedByParticipant: 0,
          locale: "fr",
        })
      );
      expect(htmlPartRefund).toContain("Partiellement remboursé");
      expect(htmlPartRefund).toContain("Montant remboursé :");

      const htmlRefund = ReactDOMServer.renderToStaticMarkup(
        React.createElement(workshopTicketMod.WorkshopTicket, {
          payment: {
            ...basePay,
            amount: -1500,
            isRefund: true,
            status: "REFUND",
            refundForVoucherId: 77,
          },
          amountOwedByParticipant: 0,
          locale: "ar",
        })
      );
      expect(htmlRefund).toContain("وصل استرداد (REFUND)");
      expect(htmlRefund).toContain("المجموع المسترد:");
    });

    test("CM2-23: buildVoucherBundleForPrint combines same-day multi-item sibling vouchers cleanly", async () => {
      const { buildVoucherBundleForPrint } = voucherUtils;
      const v1 = {
        id: 1,
        seriesId: 10,
        number: 555,
        issuedAt: "2026-10-21T10:00:00Z",
        paymentType: "TUITION_4SESSION",
        amount: 2000,
        isVoided: false,
        isRefund: false,
        refunds: [{ id: 9, amount: 500 }],
      };
      const v2 = {
        id: 2,
        seriesId: 10,
        number: 555,
        issuedAt: "2026-10-21T10:00:00Z",
        paymentType: "INSCRIPTION",
        amount: 1000,
        isVoided: false,
        isRefund: false,
      };
      const vDiffNum = {
        id: 3,
        seriesId: 10,
        number: 556,
        issuedAt: "2026-10-21T10:00:00Z",
        paymentType: "BOOK",
        amount: 600,
        isVoided: false,
        isRefund: false,
      };
      const bundled = buildVoucherBundleForPrint(v1, [v1, v2, vDiffNum]);
      expect(bundled.items.length).toBe(2);
      expect(bundled.totalAmount).toBe(3000);
      expect(bundled.refunds.length).toBe(1);
    });

    test("CM2-24: computeStudentCreditAndSessions computes exact cycleRemainingFee across edge cases", async () => {
      const { module: billingMod } = await safeImport<any>("@/lib/studentBilling");
      const { computeStudentCreditAndSessions } = billingMod;

      // 1. Partial 1000 / 2000 cycle
      const partialRes = computeStudentCreditAndSessions({
        pricePerCycle: 2000,
        tuitionVouchers: [{ id: 1, amount: 1000, paymentType: "TUITION_4SESSION", isVoided: false, isRefund: false }],
      });
      expect(partialRes.effectiveCycleFee).toBe(2000);
      expect(partialRes.cycleRemainingFee).toBe(1000);

      // 2. Settled with second 1000 payment
      const settledRes = computeStudentCreditAndSessions({
        pricePerCycle: 2000,
        tuitionVouchers: [
          { id: 1, amount: 1000, paymentType: "TUITION_4SESSION", isVoided: false, isRefund: false },
          { id: 2, amount: 1000, paymentType: "TUITION_4SESSION", isVoided: false, isRefund: false },
        ],
      });
      expect(settledRes.cycleRemainingFee).toBe(0);

      // 3. Sibling 50% discount (effectiveCycleFee = 1000), 600 paid -> remainder 400
      const siblingRes = computeStudentCreditAndSessions({
        pricePerCycle: 2000,
        siblingDiscountPercentage: 50,
        isPayerActiveAndPaid: true,
        tuitionVouchers: [{ id: 3, amount: 600, paymentType: "TUITION_4SESSION", isVoided: false, isRefund: false }],
      });
      expect(siblingRes.effectiveCycleFee).toBe(1000);
      expect(siblingRes.cycleRemainingFee).toBe(400);

      // 4. Non-payer -> 0
      const nonPayerRes = computeStudentCreditAndSessions({
        pricePerCycle: 2000,
        payerStatus: "NON_PAYER",
      });
      expect(nonPayerRes.effectiveCycleFee).toBe(0);
      expect(nonPayerRes.cycleRemainingFee).toBe(0);

      // 5. Debt (1 attended = 500) + full cycle (2000) paid together (2500) -> 0 remaining
      const debtPlusCycleRes = computeStudentCreditAndSessions({
        pricePerCycle: 2000,
        tuitionVouchers: [{ id: 4, amount: 2500, paymentType: "TUITION_4SESSION", isVoided: false, isRefund: false }],
        attendances: [
          { lessonId: 1, status: "PRESENT", lesson: { id: 1, startsAt: "2026-10-01T10:00:00Z", isFree: false } },
        ],
      });
      expect(debtPlusCycleRes.cycleRemainingFee).toBe(0);

      // 6. Cross-price transfer remainder (1500 out of 2000) -> 500 remaining
      const transferRes = computeStudentCreditAndSessions({
        pricePerCycle: 2000,
        transfersIn: [
          {
            transferredSessions: 3,
            amount: 1500,
            notes: "[PRICE_DIFF_VIREMENT]",
            fromEnrollment: { class: { pricePerCycle: 1500 } },
          },
        ],
      });
      expect(transferRes.cycleRemainingFee).toBe(500);
    });

    test("CM2-25: Thermal logos are pure 1-bit B&W (#000/#FFF) across upper and lower halves and used by PaymentTicket & WorkshopTicket", async () => {
      const zlib = require("zlib");
      const { module: assets } = await safeImport<any>("@/lib/receiptAssets");
      expect(typeof assets?.CLASSTY_THERMAL_LOGO_BASE64).toBe("string");
      expect(typeof assets?.MASSINISSA_THERMAL_LOGO_BASE64).toBe("string");

      function inspectMonochromePng(dataUri: string) {
        const b64 = dataUri.replace(/^data:image\/png;base64,/, "");
        const buf = Buffer.from(b64, "base64");
        let pos = 8, w = 0, h = 0;
        const idat: Buffer[] = [];
        while (pos < buf.length) {
          const len = buf.readUInt32BE(pos);
          const type = buf.toString("ascii", pos + 4, pos + 8);
          const data = buf.subarray(pos + 8, pos + 8 + len);
          if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
          else if (type === "IDAT") idat.push(data);
          else if (type === "IEND") break;
          pos += 12 + len;
        }
        const raw = zlib.inflateSync(Buffer.concat(idat));
        const stride = w * 4;
        let topBlack = 0, bottomBlack = 0, intermediateGray = 0;
        for (let y = 0; y < h; y++) {
          const rowOff = y * (stride + 1) + 1;
          for (let x = 0; x < w; x++) {
            const r = raw[rowOff + x * 4];
            const g = raw[rowOff + x * 4 + 1];
            const b = raw[rowOff + x * 4 + 2];
            const a = raw[rowOff + x * 4 + 3];
            expect(a).toBe(255);
            if (r === 0 && g === 0 && b === 0) {
              if (y < h / 2) topBlack++;
              else bottomBlack++;
            } else if (!(r === 255 && g === 255 && b === 255)) {
              intermediateGray++;
            }
          }
        }
        expect(intermediateGray).toBe(0);
        return { w, h, topBlack, bottomBlack };
      }

      const classty = inspectMonochromePng(assets.CLASSTY_THERMAL_LOGO_BASE64);
      const massinissa = inspectMonochromePng(assets.MASSINISSA_THERMAL_LOGO_BASE64);
      // Both upper (cap) and lower (globe / book ribbons) halves must contain solid black pixels
      expect(classty.topBlack > 500).toBe(true);
      expect(classty.bottomBlack > 500).toBe(true);
      expect(massinissa.topBlack > 300).toBe(true);
      expect(massinissa.bottomBlack > 300).toBe(true);

      const ptSrc = readSourceFile("src/components/printable/PaymentTicket.tsx");
      const wtSrc = readSourceFile("src/components/printable/WorkshopTicket.tsx");
      expect(ptSrc).toContain("CLASSTY_THERMAL_LOGO_BASE64");
      expect(ptSrc).toContain("MASSINISSA_THERMAL_LOGO_BASE64");
      expect(wtSrc).toContain("CLASSTY_THERMAL_LOGO_BASE64");
      expect(wtSrc).toContain("MASSINISSA_THERMAL_LOGO_BASE64");
      expect(wtSrc).notToContain('src="/logo.png"');
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
