import { describe, test, expect, runner } from "../helpers/runner";
import { execFileSync } from "child_process";
import path from "path";

const PROCESS_TIMEZONES = [
  "UTC",
  "Africa/Algiers",
  "America/New_York",
  "Asia/Tokyo",
  "Pacific/Auckland",
  "Asia/Kolkata",
  "Europe/London",
  "Pacific/Honolulu",
  "America/St_Johns",
  "Asia/Kathmandu",
];

export async function runProcessLevelTzTests() {
  await describe("Challenger M1-R2: OS Process-Level TZ Environment Isolation", async () => {
    test("PROC-01: Independent child processes with distinct OS TZ environments", () => {
      const scriptPath = path.resolve(__dirname, "../helpers/isolatedTzWorker.ts");
      const tsxBin = path.resolve(__dirname, "../../../node_modules/.bin/tsx.cmd");

      let referenceJson: string | null = null;

      for (const tz of PROCESS_TIMEZONES) {
        const output = execFileSync(tsxBin, [scriptPath], {
          env: { ...process.env, TZ: tz },
          encoding: "utf-8",
          shell: true,
        }).trim();

        const parsed = JSON.parse(output);
        expect(parsed.d1).toBe("2026-10-21 14:30");
        expect(parsed.d2).toBe("2026-10-21 00:30");
        expect(parsed.f1).toBe("21/10/2026 14:30");
        expect(parsed.f2).toBe("21/10/2026 00:30");
        expect(parsed.b1Start).toBe("2026-10-20T23:00:00.000Z");
        expect(parsed.b1End).toBe("2026-10-21T22:59:59.999Z");
        expect(parsed.b2Start).toBe("2026-10-20T23:00:00.000Z");
        expect(parsed.b2End).toBe("2026-10-21T22:59:59.999Z");
        expect(parsed.n1).toBe("2026-10-21T00:00:00.000Z");
        expect(parsed.n2).toBe("2026-10-21T00:00:00.000Z");
        expect(parsed.numZero).toBe("0");
        expect(parsed.dzdZero).toBe("0 DZD");

        if (referenceJson === null) {
          referenceJson = output;
        } else {
          expect(output).toBe(referenceJson);
        }
      }
    });
  });

  await runner.runQueuedTests();
  return runner.getSummary();
}

if (process.argv[1]?.endsWith("challenger-m1-process-tz.test.ts")) {
  runProcessLevelTzTests().then(() => {
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
