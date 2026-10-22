/**
 * Challenger M3-R2-2 Empirical Adversarial Stress & Verification Suite
 * 
 * Verifies that the defects identified in Iteration 1 (unanchored date-fns format in
 * daily-ledger/page.tsx and unanchored date formatting in revenue.ts) have been completely
 * resolved without regression, side effects, or runtime errors.
 */

import * as fs from "fs";
import * as path from "path";
import { formatAlgiersDate, getAlgiersDateInfo } from "../../../src/lib/algiersDate";

function evaluateWithTimezone<T>(tz: string, fn: () => T): T {
  const originalTz = process.env.TZ;
  try {
    process.env.TZ = tz;
    return fn();
  } finally {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  }
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err?.message || err}`);
    failed++;
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toContain(expected: string) {
      if (typeof actual !== "string" || !actual.includes(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`);
      }
    },
    notToContain(expected: string) {
      if (typeof actual === "string" && actual.includes(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} not to contain ${JSON.stringify(expected)}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null but got ${JSON.stringify(actual)}`);
      }
    },
  };
}

console.log("\n======================================================================");
console.log("RUNNING CHALLENGER M3-R2-2 ADVERSARIAL VERIFICATION HARNESS");
console.log("======================================================================\n");

// 1. Static AST/Source Code Audit of daily-ledger/page.tsx
const ledgerSource = fs.readFileSync(
  path.resolve(process.cwd(), "src/app/[locale]/(dashboard)/list/daily-ledger/page.tsx"),
  "utf8"
);

test("R2-2-01: daily-ledger/page.tsx contains zero imports from date-fns", () => {
  const hasDateFnsImport = /from\s*["']date-fns["']/.test(ledgerSource);
  expect(hasDateFnsImport).toBe(false);
});

test("R2-2-02: daily-ledger/page.tsx contains zero imports from date-fns/locale", () => {
  const hasDateFnsLocale = /from\s*["']date-fns\/locale["']/.test(ledgerSource);
  expect(hasDateFnsLocale).toBe(false);
});

test("R2-2-03: daily-ledger/page.tsx uses formatAlgiersDate for discrepancy createdAt", () => {
  const discrepancyFormatRegex = /formatAlgiersDate\s*\(\s*item\.createdAt\s*,\s*locale\s*,/g;
  const matches = ledgerSource.match(discrepancyFormatRegex);
  if (!matches || matches.length === 0) {
    throw new Error("Discrepancy table createdAt does not use formatAlgiersDate(item.createdAt, locale, ...)");
  }
});

test("R2-2-04: daily-ledger/page.tsx uses formatPaymentTime for voucher issuedAt", () => {
  const voucherFormatRegex = /formatPaymentTime\s*\(\s*v\.issuedAt\s*\)/g;
  const matches = ledgerSource.match(voucherFormatRegex);
  if (!matches || matches.length === 0) {
    throw new Error("Voucher table issuedAt does not use formatPaymentTime(v.issuedAt)");
  }
});

test("R2-2-05: daily-ledger/page.tsx passes locale to all formatDZD call sites", () => {
  const unlocalizedCalls = /formatDZD\s*\(\s*[^,)]+\s*\)/g;
  const matches = ledgerSource.match(unlocalizedCalls);
  expect(matches).toBeNull();
});

// 2. Static AST/Source Code Audit of src/lib/revenue.ts
const revenueSource = fs.readFileSync(
  path.resolve(process.cwd(), "src/lib/revenue.ts"),
  "utf8"
);

test("R2-2-06: src/lib/revenue.ts imports formatAlgiersDate from algiersDate", () => {
  const hasImport = /import\s*\{[^}]*formatAlgiersDate[^}]*\}\s*from\s*["'].\/algiersDate["']/.test(revenueSource);
  expect(hasImport).toBe(true);
});

test("R2-2-07: src/lib/revenue.ts does not import format from date-fns", () => {
  const importsFormat = /import\s*\{[^}]*\bformat\b[^}]*\}\s*from\s*["']date-fns["']/.test(revenueSource);
  expect(importsFormat).toBe(false);
});

// 3. Empirical formatting determinism across simulated hostile timezones
test("R2-2-08: formatAlgiersDate discrepancy rendering identical across 5 hostile timezones", () => {
  // Midnight hour timestamp: Oct 21 at 00:30 AM in Algeria is Oct 20 at 23:30:00 UTC
  const testDate = new Date("2026-10-20T23:30:00.000Z");
  const zones = ["UTC", "America/New_York", "Asia/Tokyo", "Europe/Paris", "Pacific/Honolulu"];

  const results = zones.map((tz) => {
    return evaluateWithTimezone(tz, () => {
      return formatAlgiersDate(testDate, "ar", {
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
      });
    });
  });

  // Verify all outputs match the first
  for (let i = 1; i < results.length; i++) {
    expect(results[i]).toBe(results[0]);
  }
  // Verify day is 21, not 20
  expect(results[0]).toContain("21");
});

test("R2-2-09: formatAlgiersDate handles French locale and 23:59:59 crossover cleanly", () => {
  const testDate = new Date("2026-10-21T22:59:59.000Z"); // 23:59:59 in Algeria
  const formatted = formatAlgiersDate(testDate, "fr", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
  expect(formatted).toContain("21");
  expect(formatted).toContain("23:59");
});

test("R2-2-10: formatAlgiersDate handles String ISO inputs as safely as Date objects", () => {
  const strIso = "2026-10-20T23:30:00.000Z";
  const objDate = new Date(strIso);

  const res1 = formatAlgiersDate(strIso, "fr");
  const res2 = formatAlgiersDate(objDate, "fr");
  expect(res1).toBe(res2);
});

console.log("\n======================================================================");
console.log(`SUMMARY: ${passed + failed} Tests | ${passed} Passed | ${failed} Failed`);
console.log("======================================================================\n");

if (failed > 0) {
  process.exit(1);
}
