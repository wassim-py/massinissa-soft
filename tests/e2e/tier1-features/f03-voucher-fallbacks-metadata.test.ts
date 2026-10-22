import { runF03Tests } from "./f03-eliminate-2026-fallbacks.test";
import { runner } from "../helpers/runner";

export { runF03Tests };

if (process.argv[1]?.includes("f03-voucher-fallbacks-metadata.test.ts")) {
  runF03Tests().then(async () => {
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
