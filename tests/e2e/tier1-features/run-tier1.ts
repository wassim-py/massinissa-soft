import { runner } from "../helpers/runner";
import { runF01Tests } from "./f01-algiers-date-engine.test";
import { runF02Tests } from "./f02-deterministic-currency-ssr.test";
import { runF03Tests } from "./f03-eliminate-2026-fallbacks.test";
import { runF04Tests } from "./f04-voucher-labels-across-screens.test";
import { runF05Tests } from "./f05-thermal-printable-tickets.test";
import { runF06Tests } from "./f06-ledger-midnight-boundary.test";
import { runF07Tests } from "./f07-revenue-business-day-window.test";
import { runF08Tests } from "./f08-today-filter-date-pickers.test";
import { runF09Tests } from "./f09-unified-revalidation-helper.test";
import { runF10Tests } from "./f10-mutating-actions-revalidation.test";
import { runF11Tests } from "./f11-schedules-attendance-timezone.test";
import { runF12Tests } from "./f12-e2e-adversarial-hardening.test";

export async function runTier1() {
  console.log("\n>>> STARTING TIER 1: FEATURE COVERAGE (F1 - F12) <<<\n");
  await runF01Tests();
  await runF02Tests();
  await runF03Tests();
  await runF04Tests();
  await runF05Tests();
  await runF06Tests();
  await runF07Tests();
  await runF08Tests();
  await runF09Tests();
  await runF10Tests();
  await runF11Tests();
  await runF12Tests();
  await runner.runQueuedTests();
  return runner.getSummary();
}

if (process.argv[1]?.endsWith("run-tier1.ts")) {
  runTier1().then(() => {
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
