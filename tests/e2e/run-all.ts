/**
 * Master E2E Test Suite Runner
 * Executes all 5 test tiers across Requirements R1 through R5.
 */

import { runner } from "./helpers/runner";
import { runTier1 } from "./tier1-features/run-tier1";
import { runTier2BoundaryTests } from "./tier2-boundaries/boundary-corner-cases.test";
import { runTier3CombinationTests } from "./tier3-combinations/cross-feature-combinations.test";
import { runTier4WorkflowTests } from "./tier4-scenarios/real-world-workflows.test";
import { runTier5AdversarialTests } from "./tier5-adversarial/adversarial-stress.test";

export async function runAllTiers() {
  console.log("\n======================================================================");
  console.log("MASSINISSA SCHOOL MANAGEMENT SYSTEM: MASTER E2E TEST RUNNER");
  console.log("Requirements: R1 (Timezone), R2 (Vouchers/Tickets), R3 (Ledger/Revenue), R4 (SSR/Locale), R5 (Revalidation)");
  console.log("======================================================================\n");

  const startAll = Date.now();

  try {
    await runTier1();
    await runTier2BoundaryTests();
    await runTier3CombinationTests();
    await runTier4WorkflowTests();
    await runTier5AdversarialTests();
  } catch (err: any) {
    console.error("Critical error during test run:", err);
  }

  const durationTotalMs = Date.now() - startAll;
  console.log(`\nAll tiers completed in ${(durationTotalMs / 1000).toFixed(2)}s`);

  const ok = runner.printSummaryReport();
  return { ok, summary: runner.getSummary() };
}

if (process.argv[1]?.endsWith("run-all.ts")) {
  runAllTiers().then(({ ok }) => {
    process.exit(ok ? 0 : 1);
  });
}
