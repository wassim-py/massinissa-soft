import { describe, test, expect } from "../helpers/runner";
import { readSourceFile } from "../helpers/moduleLoader";

export async function runF05Tests() {
  await describe("F5: Standardize Thermal & Printable Tickets (R1, R2)", async () => {
    test("F5-01: PrintWorkshopTicketButton defines '@page { size: 80mm auto; margin: 0; }' stylesheet", () => {
      const source = readSourceFile("src/components/PrintWorkshopTicketButton.tsx");
      const hasPageStyle = /@page\s*\{\s*size:\s*80mm\s*auto;\s*margin:\s*0;?\s*\}/.test(source);
      if (!hasPageStyle) {
        throw new Error("Defect in PrintWorkshopTicketButton.tsx: Missing '@page { size: 80mm auto; margin: 0; }' CSS for 80mm thermal printers");
      }
      expect(hasPageStyle).toBe(true);
    });

    test("F5-02: PrintWorkshopTicketButton injects '<base href=' to ensure relative logos resolve", () => {
      const source = readSourceFile("src/components/PrintWorkshopTicketButton.tsx");
      const hasBaseHref = /<base\s+href=/.test(source);
      if (!hasBaseHref) {
        throw new Error("Defect in PrintWorkshopTicketButton.tsx: Missing '<base href=...>' in print popup window");
      }
      expect(hasBaseHref).toBe(true);
    });

    test("F5-03: WorkshopTicket.tsx anchors date rendering to Africa/Algiers timezone", () => {
      const source = readSourceFile("src/components/printable/WorkshopTicket.tsx");
      // Must not call raw toLocaleString(locale) without timezone options or must use algiersDate/voucherUtils
      const hasRawToLocaleString = /toLocaleString\([^)]*\)/.test(source) && !/Africa\/Algiers/.test(source);
      if (hasRawToLocaleString) {
        throw new Error("Defect in WorkshopTicket.tsx: Date is rendered with device local timezone; missing 'Africa/Algiers' anchoring");
      }
      expect(hasRawToLocaleString).toBe(false);
    });

    test("F5-04: PayslipTicket.tsx print date and timestamps anchored to Africa/Algiers", () => {
      const source = readSourceFile("src/components/printable/PayslipTicket.tsx");
      const hasAlgiersAnchor = /Africa\/Algiers/.test(source) || /formatAlgiers/.test(source);
      if (!hasAlgiersAnchor) {
        throw new Error("Defect in PayslipTicket.tsx: Timestamps and 'Date d\\'impression' not anchored to 'Africa/Algiers'");
      }
      expect(hasAlgiersAnchor).toBe(true);
    });

    test("F5-05: PaymentTicket.tsx enforces 78mm-80mm thermal roll boundary and tajawal font for Arabic", () => {
      const source = readSourceFile("src/components/printable/PaymentTicket.tsx");
      expect(source).toContain("78mm");
      expect(source).toContain("Tajawal");
    });
  });
}

if (process.argv[1]?.endsWith("f05-thermal-printable-tickets.test.ts")) {
  runF05Tests().then(async () => {
    const { runner } = require("../helpers/runner");
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
