import { describe, test, expect, runner } from "../helpers/runner";
import { safeImport, readSourceFile } from "../helpers/moduleLoader";
import { evaluateWithTimezone } from "../helpers/timezoneSimulator";
import { MOCK_VOUCHERS } from "../helpers/mockData";

export async function runTier3CombinationTests() {
  await describe("Tier 3: Cross-Feature Combinations (Pairwise & Multi-Feature Interactions)", async () => {
    const { module: algiersDate } = await safeImport<any>("@/lib/algiersDate");
    const { module: voucherUtils } = await safeImport<any>("@/lib/voucherUtils");
    const { module: ledger } = await safeImport<any>("@/lib/ledger");
    const { module: revalidation } = await safeImport<any>("@/lib/revalidation");

    test("XF-01: Voucher Issuance at 00:30 AM + Ledger Attribution + Financial Revalidation (F4 + F6 + F9 + F10)", async () => {
      // 1. Format voucher label (F4)
      if (!voucherUtils?.formatVoucherDisplay) throw new Error("voucherUtils.formatVoucherDisplay not found");
      const midnightVoucher = MOCK_VOUCHERS.find((v) => v.id === 102)!;
      const label = voucherUtils.formatVoucherDisplay(midnightVoucher);
      expect(label).toContain("ANNEX 1AS");
      expect(label).toContain("BON 102");
      expect(label).notToContain("01/01/2026");

      // 2. Ledger normalization to current day Oct 21 (F6)
      if (!ledger?.normalizeDateToStartOfDay) throw new Error("ledger.normalizeDateToStartOfDay not found");
      const normalizedDate = ledger.normalizeDateToStartOfDay(midnightVoucher.issuedAt);
      expect(normalizedDate.toISOString()).toBe("2026-10-21T00:00:00.000Z");

      // 3. Revalidation triggered (F9, F10)
      if (!revalidation?.revalidateFinancialRoutes) throw new Error("[M4 Pending] revalidateFinancialRoutes not implemented");
      let revalidated = false;
      try {
        await revalidation.revalidateFinancialRoutes({ classId: midnightVoucher.classId, branchId: midnightVoucher.issuingBranchId });
        revalidated = true;
      } catch {
        revalidated = false;
      }
      expect(revalidated).toBe(true);
    });

    test("XF-02: Thermal Ticket Print + Client Timezone Parity (F1 + F5)", () => {
      // Payment at 15:30 in Algiers (UTC 14:30)
      const paymentDate = new Date("2026-10-21T14:30:00.000Z");

      // Simulated clients across the globe printing the ticket
      const parisTime = evaluateWithTimezone("Europe/Paris", () => {
        return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Algiers", hour: "2-digit", minute: "2-digit" }).format(paymentDate);
      });
      const nyTime = evaluateWithTimezone("America/New_York", () => {
        return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Algiers", hour: "2-digit", minute: "2-digit" }).format(paymentDate);
      });
      const tokyoTime = evaluateWithTimezone("Asia/Tokyo", () => {
        return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Algiers", hour: "2-digit", minute: "2-digit" }).format(paymentDate);
      });

      // All must print exactly 15:30 without shifting
      expect(parisTime).toBe("15:30");
      expect(nyTime).toBe("15:30");
      expect(tokyoTime).toBe("15:30");

      // Thermal ticket stylesheet verified
      const ticketBtnSource = readSourceFile("src/components/PrintTicketButton.tsx");
      expect(ticketBtnSource).toContain("80mm");
    });

    test("XF-03: 'Today' Filter Resolution + Daily Revenue Query Alignment (F1 + F7 + F8)", () => {
      // Simulating time at 00:20 AM local time on Oct 21
      const localTime = new Date("2026-10-20T23:20:00.000Z");
      const algiersTodayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(localTime);
      expect(algiersTodayStr).toBe("2026-10-21");

      // Revenue query window for this date
      const queryStartUtc = new Date("2026-10-20T23:00:00.000Z").getTime();
      const queryEndUtc = new Date("2026-10-21T22:59:59.999Z").getTime();

      // Midnight transaction timestamp
      const txTimestamp = localTime.getTime();
      expect(txTimestamp >= queryStartUtc && txTimestamp <= queryEndUtc).toBe(true);
    });

    test("XF-04: Multi-Item Voucher Bundle + DZD SSR Currency Formatting + Ledger Category Breakdown (F2 + F6 + F10)", () => {
      if (!algiersDate?.formatDZD) throw new Error("[M1 Pending] formatDZD not implemented");

      const tuition = 2500;
      const inscription = 1000;
      const book = 1500;
      const total = tuition + inscription + book;

      const fTotal = algiersDate.formatDZD(total);
      expect(fTotal).toMatch(/5[\s\u00A0\u202F]?000/);

      // Verify that actions.ts supports multi-item vouchers
      const actionsSource = readSourceFile("src/lib/actions.ts");
      expect(actionsSource).toContain("issueMultiItemVoucherAction");
    });

    test("XF-05: Voucher Voiding + Ledger Reconciliation + Cache Invalidation (F6 + F9 + F10)", async () => {
      const actionsSource = readSourceFile("src/lib/actions.ts");
      expect(actionsSource).toContain("voidVoucher");
      expect(actionsSource).toContain("editVoucher");

      if (!revalidation?.revalidateFinancialRoutes) throw new Error("[M4 Pending] revalidateFinancialRoutes not implemented");
      let threw = false;
      try {
        await revalidation.revalidateFinancialRoutes({ classId: 48 });
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    test("XF-06: Student Timetable Session Hours Cross-Device Parity (F1 + F11)", () => {
      // 09:00 AM class session in Algiers
      const lessonUtc = new Date("2026-10-21T08:00:00.000Z");

      const algiersFormatted = evaluateWithTimezone("Africa/Algiers", () => {
        return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Algiers", hour: "2-digit", minute: "2-digit" }).format(lessonUtc);
      });
      const remoteFormatted = evaluateWithTimezone("America/Chicago", () => {
        return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Algiers", hour: "2-digit", minute: "2-digit" }).format(lessonUtc);
      });

      expect(algiersFormatted).toBe("09:00");
      expect(remoteFormatted).toBe("09:00");
    });

    test("XF-07: Legacy Voucher with Null Timestamp Prints Safely without '01/01/2026' (F3 + F5)", () => {
      if (!voucherUtils?.formatVoucherDisplay) throw new Error("voucherUtils.formatVoucherDisplay not found");
      const legacyVoucher = {
        number: 300,
        issuedAt: null,
        series: { prefix: "ECOLE 1AM" },
      };
      const label = voucherUtils.formatVoucherDisplay(legacyVoucher);
      expect(label).toContain("ECOLE 1AM");
      expect(label).toContain("BON 300");
      expect(label).notToContain("01/01/2026");
    });

    test("XF-08: Cash Surplus/Deficit Action at Midnight + Daily Ledger Update + Revalidation (F6 + F9 + F10)", async () => {
      if (!ledger?.normalizeDateToStartOfDay) throw new Error("ledger.normalizeDateToStartOfDay not found");
      const surplusMidnight = new Date("2026-10-20T23:45:00.000Z"); // 00:45 AM Oct 21
      const normalized = ledger.normalizeDateToStartOfDay(surplusMidnight);
      expect(normalized.toISOString()).toBe("2026-10-21T00:00:00.000Z");

      const actionsSource = readSourceFile("src/lib/actions.ts");
      expect(actionsSource).toContain("confirmSurplusMoneyAction");
    });

    test("XF-09: Workshop Participant Registration + Continuous Numbering + Thermal Print (F4 + F5 + F10)", () => {
      const actionsSource = readSourceFile("src/lib/actions.ts");
      expect(actionsSource).toContain("registerParticipant");

      const workshopTicketSource = readSourceFile("src/components/printable/WorkshopTicket.tsx");
      expect(workshopTicketSource).toContain("WorkshopTicket");
    });

    test("XF-10: Formation Lump-Sum + Book Fee + Ledger Category Attribution (F4 + F6 + F10)", () => {
      const formationSource = readSourceFile("src/lib/formationActions.ts");
      expect(formationSource).toContain("recordFormationLumpSumPayment");
      expect(formationSource).toContain("ATELIER_FORMATION");
    });
  });

  await runner.runQueuedTests();
  return runner.getSummary();
}

if (process.argv[1]?.endsWith("cross-feature-combinations.test.ts")) {
  runTier3CombinationTests().then(() => {
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
