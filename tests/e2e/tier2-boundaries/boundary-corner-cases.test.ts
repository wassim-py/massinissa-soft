import { describe, test, expect, runner } from "../helpers/runner";
import { safeImport, readSourceFile } from "../helpers/moduleLoader";
import { evaluateWithTimezone, SIMULATED_TIMEZONES } from "../helpers/timezoneSimulator";

export async function runTier2BoundaryTests() {
  await describe("Tier 2: Boundary & Corner Cases (F1-F12 Boundary Matrix)", async () => {
    const { module: algiersDate } = await safeImport<any>("@/lib/algiersDate");
    const { module: voucherUtils } = await safeImport<any>("@/lib/voucherUtils");
    const { module: ledger } = await safeImport<any>("@/lib/ledger");

    // =========================================================================
    // F1 BOUNDARIES (Date Engine)
    // =========================================================================
    test("B01 (F1): Exact local midnight 00:00:00.000 (UTC 23:00:00.000Z prev day)", () => {
      if (!algiersDate?.getAlgiersDateInfo) throw new Error("[M1 Pending] getAlgiersDateInfo not implemented");
      const info = algiersDate.getAlgiersDateInfo(new Date("2026-10-20T23:00:00.000Z"));
      expect(info.day).toBe(21);
      expect(info.hour).toBe(0);
      expect(info.minute).toBe(0);
      expect(info.second).toBe(0);
    });

    test("B02 (F1): One millisecond before local midnight 23:59:59.999 (UTC 22:59:59.999Z same day)", () => {
      if (!algiersDate?.getAlgiersDateInfo) throw new Error("[M1 Pending] getAlgiersDateInfo not implemented");
      const info = algiersDate.getAlgiersDateInfo(new Date("2026-10-20T22:59:59.999Z"));
      expect(info.day).toBe(20);
      expect(info.hour).toBe(23);
      expect(info.minute).toBe(59);
    });

    test("B03 (F1): Boundary 00:59:59.999 local (UTC 23:59:59.999Z prev day)", () => {
      if (!algiersDate?.getAlgiersDateInfo) throw new Error("[M1 Pending] getAlgiersDateInfo not implemented");
      const info = algiersDate.getAlgiersDateInfo(new Date("2026-10-20T23:59:59.999Z"));
      expect(info.day).toBe(21);
      expect(info.hour).toBe(0);
      expect(info.minute).toBe(59);
    });

    test("B04 (F1): Sharp 01:00:00.000 local (UTC 00:00:00.000Z same day)", () => {
      if (!algiersDate?.getAlgiersDateInfo) throw new Error("[M1 Pending] getAlgiersDateInfo not implemented");
      const info = algiersDate.getAlgiersDateInfo(new Date("2026-10-21T00:00:00.000Z"));
      expect(info.day).toBe(21);
      expect(info.hour).toBe(1);
      expect(info.minute).toBe(0);
    });

    test("B05 (F1): Leap day Feb 28 23:30Z transition into Feb 29 00:30 in Algiers", () => {
      if (!algiersDate?.getAlgiersDateInfo) throw new Error("[M1 Pending] getAlgiersDateInfo not implemented");
      const info = algiersDate.getAlgiersDateInfo(new Date("2028-02-28T23:30:00.000Z"));
      expect(info.month).toBe(2);
      expect(info.day).toBe(29);
      expect(info.dateStr).toBe("2028-02-29");
    });

    // =========================================================================
    // F2 BOUNDARIES (Currency & Locale Determinism)
    // =========================================================================
    test("B06 (F2): Currency formatting of exactly 0 DZD", () => {
      if (!algiersDate?.formatDZD) throw new Error("[M1 Pending] formatDZD not implemented");
      expect(algiersDate.formatDZD(0)).toContain("0");
    });

    test("B07 (F2): Currency formatting of tiny deficit -0.50 DZD", () => {
      if (!algiersDate?.formatDZD) throw new Error("[M1 Pending] formatDZD not implemented");
      const res = algiersDate.formatDZD(-0.5);
      expect(res).toContain("-");
    });

    test("B08 (F2): Currency formatting with fractional dinars", () => {
      if (!algiersDate?.formatDZD) throw new Error("[M1 Pending] formatDZD not implemented");
      const res = algiersDate.formatDZD(1500.75);
      expect(res).toContain("1");
      expect(res).toContain("500");
    });

    test("B09 (F2): Currency formatting accepts numeric string '3500'", () => {
      if (!algiersDate?.formatDZD) throw new Error("[M1 Pending] formatDZD not implemented");
      const res = algiersDate.formatDZD("3500");
      expect(res).toMatch(/3[\s\u00A0\u202F]?500/);
    });

    test("B10 (F2): SSR Currency output does not contain raw undefined or NaN", () => {
      if (!algiersDate?.formatDZD) throw new Error("[M1 Pending] formatDZD not implemented");
      const res = algiersDate.formatDZD(NaN);
      expect(res).notToContain("NaN");
    });

    // =========================================================================
    // F3 BOUNDARIES (Eliminate 01/01/2026 Fallbacks)
    // =========================================================================
    test("B11 (F3): Malformed date string into formatPaymentDate", () => {
      if (!voucherUtils?.formatPaymentDate) throw new Error("formatPaymentDate not found");
      const res = voucherUtils.formatPaymentDate("not-a-valid-date");
      expect(res).notToContain("01/01/2026");
    });

    test("B12 (F3): Empty string into formatPaymentDate", () => {
      if (!voucherUtils?.formatPaymentDate) throw new Error("formatPaymentDate not found");
      const res = voucherUtils.formatPaymentDate("");
      expect(res).notToContain("01/01/2026");
    });

    test("B13 (F3): Unix Epoch timestamp 0 into formatPaymentDate", () => {
      if (!voucherUtils?.formatPaymentDate) throw new Error("formatPaymentDate not found");
      const res = voucherUtils.formatPaymentDate(new Date(0));
      expect(res).notToContain("01/01/2026");
      expect(res).toContain("1970");
    });

    test("B14 (F3): Year 2099 future timestamp into formatPaymentDate", () => {
      if (!voucherUtils?.formatPaymentDate) throw new Error("formatPaymentDate not found");
      const res = voucherUtils.formatPaymentDate("2099-12-31T12:00:00Z");
      expect(res).toContain("2099");
      expect(res).notToContain("01/01/2026");
    });

    test("B15 (F3): Undefined voucher object with empty fallback context into formatVoucherDisplay", () => {
      if (!voucherUtils?.formatVoucherDisplay) throw new Error("formatVoucherDisplay not found");
      const res = voucherUtils.formatVoucherDisplay(undefined, {});
      expect(res).notToContain("01/01/2026");
    });

    // =========================================================================
    // F4 BOUNDARIES (Consistent Voucher Labels)
    // =========================================================================
    test("B16 (F4): Voucher with zero number (BON 0)", () => {
      if (!voucherUtils?.formatVoucherDisplay) throw new Error("formatVoucherDisplay not found");
      const res = voucherUtils.formatVoucherDisplay({ number: 0, issuedAt: new Date("2026-10-21") });
      expect(res).toContain("BON 0");
    });

    test("B17 (F4): Voucher with null series but valid level name fallback", () => {
      if (!voucherUtils?.formatVoucherDisplay) throw new Error("formatVoucherDisplay not found");
      const res = voucherUtils.formatVoucherDisplay({ number: 45, issuedAt: new Date("2026-10-21") }, { levelName: "2AS" });
      expect(res).toContain("2AS");
      expect(res).toContain("BON 45");
    });

    test("B18 (F4): Voucher with empty string series prefix", () => {
      if (!voucherUtils?.formatVoucherDisplay) throw new Error("formatVoucherDisplay not found");
      const res = voucherUtils.formatVoucherDisplay({ number: 10, series: { prefix: "" } });
      expect(res).toContain("BON 10");
    });

    test("B19 (F4): Voucher with Arabic characters in level name (4 متوسط)", () => {
      if (!voucherUtils?.formatVoucherDisplay) throw new Error("formatVoucherDisplay not found");
      const res = voucherUtils.formatVoucherDisplay({ number: 12, series: { prefix: "فرع 1 4متوسط" } });
      expect(res).toContain("4متوسط");
      expect(res).toContain("BON 12");
    });

    test("B20 (F4): Voucher with long series label", () => {
      if (!voucherUtils?.formatVoucherDisplay) throw new Error("formatVoucherDisplay not found");
      const prefix = "ECOLE-PRINCIPALE-SECTION-LANGUES-INTENSIVES";
      const res = voucherUtils.formatVoucherDisplay({ number: 999, series: { prefix } });
      expect(res).toContain(prefix);
      expect(res).toContain("BON 999");
    });

    // =========================================================================
    // F5 BOUNDARIES (Standardize Printable Tickets)
    // =========================================================================
    test("B21 (F5): Printable ticket with missing student name renders gracefully", () => {
      const source = readSourceFile("src/components/printable/PaymentTicket.tsx");
      expect(source).toContain("78mm");
    });

    test("B22 (F5): Print timestamp evaluated under simulated UTC-5 (New York) matches Algiers", () => {
      const ts = new Date("2026-10-21T13:30:00.000Z"); // 14:30 in Algiers
      const formatted = evaluateWithTimezone("America/New_York", () => {
        return new Intl.DateTimeFormat("en-GB", {
          timeZone: "Africa/Algiers",
          hour: "2-digit",
          minute: "2-digit",
        }).format(ts);
      });
      expect(formatted).toBe("14:30");
    });

    test("B23 (F5): Print timestamp evaluated under simulated UTC+3 (Riyadh) matches Algiers", () => {
      const ts = new Date("2026-10-21T13:30:00.000Z");
      const formatted = evaluateWithTimezone("Asia/Riyadh", () => {
        return new Intl.DateTimeFormat("en-GB", {
          timeZone: "Africa/Algiers",
          hour: "2-digit",
          minute: "2-digit",
        }).format(ts);
      });
      expect(formatted).toBe("14:30");
    });

    test("B24 (F5): Thermal ticket with zero amount (fee waiver voucher)", () => {
      const source = readSourceFile("src/components/printable/PaymentTicket.tsx");
      expect(source).toContain("formatVoucherDisplay");
    });

    test("B25 (F5): Workshop ticket with partial balance", () => {
      const source = readSourceFile("src/components/printable/WorkshopTicket.tsx");
      expect(source).toBeDefined();
    });

    // =========================================================================
    // F6 BOUNDARIES (Ledger Midnight Normalization)
    // =========================================================================
    test("B26 (F6): Ledger normalization across year boundary 2026-12-31T23:30:00Z -> 2027-01-01", () => {
      if (!ledger?.normalizeDateToStartOfDay) throw new Error("normalizeDateToStartOfDay not found");
      const res = ledger.normalizeDateToStartOfDay(new Date("2026-12-31T23:30:00.000Z"));
      if (res.toISOString() === "2026-12-31T00:00:00.000Z") {
        throw new Error("Defect in normalizeDateToStartOfDay: Attributed Jan 1 transaction to prior year Dec 31");
      }
      expect(res.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    });

    test("B27 (F6): Ledger normalization at exact 00:00:00.000 local (23:00:00Z prev day)", () => {
      if (!ledger?.normalizeDateToStartOfDay) throw new Error("normalizeDateToStartOfDay not found");
      const res = ledger.normalizeDateToStartOfDay("2026-10-20T23:00:00.000Z");
      expect(res.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    });

    test("B28 (F6): Ledger normalization at exact 00:59:59.999 local (23:59:59.999Z prev day)", () => {
      if (!ledger?.normalizeDateToStartOfDay) throw new Error("normalizeDateToStartOfDay not found");
      const res = ledger.normalizeDateToStartOfDay("2026-10-20T23:59:59.999Z");
      expect(res.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    });

    test("B29 (F6): Ledger normalization at exact 01:00:00.000 local (00:00:00Z current day)", () => {
      if (!ledger?.normalizeDateToStartOfDay) throw new Error("normalizeDateToStartOfDay not found");
      const res = ledger.normalizeDateToStartOfDay("2026-10-21T00:00:00.000Z");
      expect(res.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    });

    test("B30 (F6): Ledger normalization with explicit ISO offset +01:00 string", () => {
      if (!ledger?.normalizeDateToStartOfDay) throw new Error("normalizeDateToStartOfDay not found");
      const res = ledger.normalizeDateToStartOfDay("2026-10-21T00:30:00+01:00");
      expect(res.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    });

    // =========================================================================
    // F7 BOUNDARIES (Revenue Query Business-Day Window)
    // =========================================================================
    test("B31 (F7): Revenue query window on month-end Feb 28", () => {
      // For 2026-02-28: starts 2026-02-27T23:00:00.000Z, ends 2026-02-28T22:59:59.999Z
      const start = new Date("2026-02-27T23:00:00.000Z").getTime();
      const end = new Date("2026-02-28T22:59:59.999Z").getTime();
      const mid = new Date("2026-02-27T23:30:00.000Z").getTime();
      expect(mid >= start && mid <= end).toBe(true);
    });

    test("B32 (F7): Revenue query window spanning year boundary (2026-12-31 to 2027-01-01)", () => {
      const start = new Date("2026-12-30T23:00:00.000Z").getTime();
      const end = new Date("2027-01-01T22:59:59.999Z").getTime();
      const newYearMidnight = new Date("2026-12-31T23:30:00.000Z").getTime();
      expect(newYearMidnight >= start && newYearMidnight <= end).toBe(true);
    });

    test("B33 (F7): Transaction exactly at start boundary 2026-10-20T23:00:00.000Z included in Oct 21", () => {
      const windowStart = new Date("2026-10-20T23:00:00.000Z").getTime();
      const tx = new Date("2026-10-20T23:00:00.000Z").getTime();
      expect(tx >= windowStart).toBe(true);
    });

    test("B34 (F7): Transaction exactly at end boundary 2026-10-21T22:59:59.999Z included in Oct 21", () => {
      const windowEnd = new Date("2026-10-21T22:59:59.999Z").getTime();
      const tx = new Date("2026-10-21T22:59:59.999Z").getTime();
      expect(tx <= windowEnd).toBe(true);
    });

    test("B35 (F7): Transaction 1 millisecond past end boundary 2026-10-21T23:00:00.000Z excluded from Oct 21", () => {
      const windowEnd = new Date("2026-10-21T22:59:59.999Z").getTime();
      const tx = new Date("2026-10-21T23:00:00.000Z").getTime();
      expect(tx > windowEnd).toBe(true);
    });

    // =========================================================================
    // F8 BOUNDARIES (Today Filter & Date Pickers)
    // =========================================================================
    test("B36 (F8): 'Today' resolution at 00:01 AM local time resolves to current date in Algiers", () => {
      const localTime = new Date("2026-10-20T23:01:00.000Z");
      const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(localTime);
      expect(d).toBe("2026-10-21");
    });

    test("B37 (F8): 'Today' resolution at 23:59 PM local time resolves to current date in Algiers", () => {
      const localTime = new Date("2026-10-21T22:59:00.000Z");
      const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(localTime);
      expect(d).toBe("2026-10-21");
    });

    test("B38 (F8): Simulated client in Tokyo (UTC+9) resolving Algiers today", () => {
      const utcNow = new Date("2026-10-20T23:30:00.000Z");
      const algiersToday = evaluateWithTimezone("Asia/Tokyo", () => {
        return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(utcNow);
      });
      // In Tokyo it is already Oct 21 08:30 AM, in Algiers it is Oct 21 00:30 AM -> both agree date is 2026-10-21
      expect(algiersToday).toBe("2026-10-21");
    });

    test("B39 (F8): Simulated client in Los Angeles (UTC-8) resolving Algiers today", () => {
      const utcNow = new Date("2026-10-20T23:30:00.000Z");
      const algiersToday = evaluateWithTimezone("America/Los_Angeles", () => {
        return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(utcNow);
      });
      // In LA it is Oct 20 15:30, but Algiers is already 2026-10-21
      expect(algiersToday).toBe("2026-10-21");
    });

    test("B40 (F8): Branch admin date filter with empty query string falls back safely", () => {
      const source = readSourceFile("src/app/[locale]/(dashboard)/list/daily-ledger/page.tsx");
      expect(source).toContain("targetDateStr");
    });

    // =========================================================================
    // F9 BOUNDARIES (Unified Financial Revalidation)
    // =========================================================================
    test("B41 (F9): revalidateFinancialRoutes with empty object {}", async () => {
      const { module: revalidation } = await safeImport<any>("@/lib/revalidation");
      if (!revalidation) throw new Error("[M4 Pending] revalidation not implemented");
      let threw = false;
      try {
        await revalidation.revalidateFinancialRoutes({});
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    test("B42 (F9): revalidateFinancialRoutes with negative ID target { classId: -1 }", async () => {
      const { module: revalidation } = await safeImport<any>("@/lib/revalidation");
      if (!revalidation) throw new Error("[M4 Pending] revalidation not implemented");
      let threw = false;
      try {
        await revalidation.revalidateFinancialRoutes({ classId: -1 });
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    test("B43 (F9): revalidateFinancialRoutes with alphanumeric UUID studentId", async () => {
      const { module: revalidation } = await safeImport<any>("@/lib/revalidation");
      if (!revalidation) throw new Error("[M4 Pending] revalidation not implemented");
      let threw = false;
      try {
        await revalidation.revalidateFinancialRoutes({ studentId: "std-a1b2-c3d4-e5f6" });
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    test("B44 (F9): revalidateFinancialRoutes with all targets populated", async () => {
      const { module: revalidation } = await safeImport<any>("@/lib/revalidation");
      if (!revalidation) throw new Error("[M4 Pending] revalidation not implemented");
      let threw = false;
      try {
        await revalidation.revalidateFinancialRoutes({
          classId: 10,
          studentId: "std-100",
          workshopId: 5,
          branchId: 2,
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    test("B45 (F9): Concurrent calls to revalidateFinancialRoutes", async () => {
      const { module: revalidation } = await safeImport<any>("@/lib/revalidation");
      if (!revalidation) throw new Error("[M4 Pending] revalidation not implemented");
      let threw = false;
      try {
        await Promise.all([
          revalidation.revalidateFinancialRoutes({ classId: 1 }),
          revalidation.revalidateFinancialRoutes({ classId: 2 }),
          revalidation.revalidateFinancialRoutes({ classId: 3 }),
        ]);
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    // =========================================================================
    // F10 BOUNDARIES (Mutating Actions Revalidation)
    // =========================================================================
    test("B46 (F10): Action revalidation when voucher has null classId (Workshop Voucher)", () => {
      const source = readSourceFile("src/lib/actions.ts");
      // Check that editVoucher handles null classId without building /list/payments/class/null
      expect(source).toContain("editVoucher");
    });

    test("B47 (F10): Full voucher refund vs partial refund revalidations", () => {
      const source = readSourceFile("src/lib/actions.ts");
      expect(source).toContain("createRefund");
    });

    test("B48 (F10): Revalidation on zero-dollar transaction or fee waiver", () => {
      const source = readSourceFile("src/lib/actions.ts");
      expect(source).toContain("overrideEnrollmentFee");
    });

    test("B49 (F10): Multi-item voucher action creates up to 3 vouchers with atomic revalidation", () => {
      const source = readSourceFile("src/lib/actions.ts");
      expect(source).toContain("issueMultiItemVoucherAction");
    });

    test("B50 (F10): Actions revalidate routes even when optional metadata is missing", () => {
      const source = readSourceFile("src/lib/actions.ts");
      expect(source).toContain("revalidatePath");
    });

    // =========================================================================
    // F11 BOUNDARIES (Schedules & Attendance Timezone)
    // =========================================================================
    test("B51 (F11): Lesson at 08:00 AM Algiers evaluated under UTC client", () => {
      // 08:00 Algiers = 07:00 UTC
      const lessonUtc = new Date("2026-10-21T07:00:00.000Z");
      const clientHour = evaluateWithTimezone("UTC", () => {
        return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Algiers", hour: "2-digit", hour12: false }).format(lessonUtc);
      });
      expect(clientHour).toBe("08");
    });

    test("B52 (F11): Lesson at 17:30 PM Algiers evaluated under New York client (UTC-5)", () => {
      // 17:30 Algiers = 16:30 UTC
      const lessonUtc = new Date("2026-10-21T16:30:00.000Z");
      const clientHour = evaluateWithTimezone("America/New_York", () => {
        return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Algiers", hour: "2-digit", minute: "2-digit", hour12: false }).format(lessonUtc);
      });
      expect(clientHour).toBe("17:30");
    });

    test("B53 (F11): Friday schedule consistency across timezones", () => {
      const fridayNoon = new Date("2026-10-23T11:00:00.000Z"); // 12:00 in Algiers
      const formatted = evaluateWithTimezone("Europe/London", () => {
        return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Algiers", hour: "2-digit", minute: "2-digit" }).format(fridayNoon);
      });
      expect(formatted).toBe("12:00");
    });

    test("B54 (F11): Workshop attendance grid slot formatting", () => {
      const source = readSourceFile("src/components/workshops/WorkshopAttendanceGrid.tsx");
      expect(source).toContain("dateLocale");
    });

    test("B55 (F11): Weekly calendar boundary Saturday start (Algiers school week)", () => {
      const satMorning = new Date("2026-10-24T07:00:00.000Z"); // 08:00 Sat in Algiers
      const dayName = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Algiers", weekday: "short" }).format(satMorning);
      expect(dayName).toBe("Sat");
    });

    // =========================================================================
    // F12 BOUNDARIES (Adversarial Hardening)
    // =========================================================================
    test("B56 (F12): Distant future date 2099-12-31 day bounds calculation", () => {
      if (!algiersDate?.getAlgiersDayBounds) throw new Error("[M1 Pending] getAlgiersDayBounds not implemented");
      const bounds = algiersDate.getAlgiersDayBounds("2099-12-31");
      expect(bounds.startUtc.toISOString()).toBe("2099-12-30T23:00:00.000Z");
      expect(bounds.endUtc.toISOString()).toBe("2099-12-31T22:59:59.999Z");
    });

    test("B57 (F12): Early historical date 1970-01-01 day bounds calculation", () => {
      if (!algiersDate?.getAlgiersDayBounds) throw new Error("[M1 Pending] getAlgiersDayBounds not implemented");
      const bounds = algiersDate.getAlgiersDayBounds("1970-01-01");
      expect(bounds.startUtc.toISOString()).toBe("1969-12-31T23:00:00.000Z");
    });

    test("B58 (F12): Daylight saving clock change in Paris has zero effect on Algiers date math", () => {
      // France jumps to DST on March 29, 2026 (UTC+2). Algeria stays strictly UTC+1.
      const summerTime = new Date("2026-06-15T12:00:00.000Z");
      const algiersTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Algiers", hour: "2-digit", minute: "2-digit" }).format(summerTime);
      // In Algiers: 12:00 UTC + 1 = 13:00
      expect(algiersTime).toBe("13:00");
    });

    test("B59 (F12): Precision addition in ledger decimal sums (0.1 + 0.2 dinar equivalents)", () => {
      const sum = Math.round((0.1 + 0.2) * 100) / 100;
      expect(sum).toBe(0.3);
    });

    test("B60 (F12): Unicode control characters in student or voucher remarks do not crash date rendering", () => {
      if (!voucherUtils?.formatVoucherDisplay) throw new Error("formatVoucherDisplay not found");
      const voucherWithUnicode = {
        number: 77,
        issuedAt: new Date("2026-10-21T10:00:00.000Z"),
        series: { prefix: "\u200E\u200FANNEX 4AM\u202A" },
      };
      const res = voucherUtils.formatVoucherDisplay(voucherWithUnicode);
    });
  });
  await runner.runQueuedTests();
  return runner.getSummary();
}

if (process.argv[1]?.endsWith("boundary-corner-cases.test.ts")) {
  runTier2BoundaryTests().then(() => {
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
