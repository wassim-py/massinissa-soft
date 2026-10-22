import { describe, test, expect, runner } from "../helpers/runner";
import { safeImport, readSourceFile } from "../helpers/moduleLoader";

export async function runF02Tests() {
  await describe("F2: Deterministic Currency & SSR Locale Formatting (R4)", async () => {
    const { module: algiersDate } = await safeImport<any>("@/lib/algiersDate");

    test("F2-01: formatDZD formats standard amount with DZD suffix deterministically", () => {
      if (!algiersDate?.formatDZD) {
        throw new Error("[M1 Pending] formatDZD not implemented in src/lib/algiersDate.ts");
      }
      const formatted = algiersDate.formatDZD(2500, "fr");
      expect(formatted).toMatch(/^2[\s\u00A0\u202F]?500\s*(DZD|د\.ج)$/i);
    });

    test("F2-02: formatDZD handles 0, null, and undefined without throwing or crashing", () => {
      if (!algiersDate?.formatDZD) {
        throw new Error("[M1 Pending] formatDZD not implemented in src/lib/algiersDate.ts");
      }
      const fZero = algiersDate.formatDZD(0);
      const fNull = algiersDate.formatDZD(null);
      const fUndefined = algiersDate.formatDZD(undefined);

      expect(fZero).toContain("0");
      expect(fNull).toContain("0");
      expect(fUndefined).toContain("0");
    });

    test("F2-03: formatDZD handles large amounts with consistent thousands separators", () => {
      if (!algiersDate?.formatDZD) {
        throw new Error("[M1 Pending] formatDZD not implemented in src/lib/algiersDate.ts");
      }
      const fMillion = algiersDate.formatDZD(1500000);
      expect(fMillion).toMatch(/1[\s\u00A0\u202F]?500[\s\u00A0\u202F]?000/);
    });

    test("F2-04: next-intl request config sets timeZone to Africa/Algiers", () => {
      const requestSource = readSourceFile("src/i18n/request.ts");
      const hasAlgiersTz = /timeZone:\s*["']Africa\/Algiers["']/.test(requestSource);
      if (!hasAlgiersTz) {
        throw new Error("Defect in src/i18n/request.ts: timeZone is not configured as 'Africa/Algiers'");
      }
      expect(hasAlgiersTz).toBe(true);
    });

    test("F2-05: next-intl LocaleLayout supplies timeZone Africa/Algiers to NextIntlClientProvider", () => {
      const layoutSource = readSourceFile("src/app/[locale]/layout.tsx");
      const hasProviderTz = /<NextIntlClientProvider[^>]*timeZone=["']Africa\/Algiers["']/.test(layoutSource);
      if (!hasProviderTz) {
        throw new Error("Defect in src/app/[locale]/layout.tsx: NextIntlClientProvider missing timeZone='Africa/Algiers'");
      }
      expect(hasProviderTz).toBe(true);
    });
  });
}

if (process.argv[1]?.endsWith("f02-deterministic-currency-ssr.test.ts")) {
  runF02Tests().then(async () => {
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
