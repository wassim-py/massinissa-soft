/**
 * Opaque-box E2E Test Runner & Assertion Library
 * Provides isolated, queued sequential test execution, structured reporting, and rich assertion primitives.
 */

export interface TestResult {
  suiteName: string;
  testName: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface SuiteSummary {
  suiteName: string;
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: TestResult[];
}

interface QueuedTest {
  suiteName: string;
  testName: string;
  fn: () => void | Promise<void>;
}

export class TestRunner {
  private currentSuite: string = "Global";
  private queue: QueuedTest[] = [];
  private results: TestResult[] = [];
  private suites: Map<string, TestResult[]> = new Map();

  async describe(suiteName: string, fn: () => void | Promise<void>): Promise<void> {
    const prevSuite = this.currentSuite;
    this.currentSuite = suiteName;
    if (!this.suites.has(suiteName)) {
      this.suites.set(suiteName, []);
    }

    try {
      await fn();
    } finally {
      this.currentSuite = prevSuite;
    }
  }

  test(name: string, fn: () => void | Promise<void>): void {
    this.queue.push({
      suiteName: this.currentSuite,
      testName: name,
      fn,
    });
  }

  async runQueuedTests(): Promise<void> {
    const testsToRun = [...this.queue];
    this.queue = [];

    for (const item of testsToRun) {
      const start = Date.now();
      try {
        await item.fn();
        const durationMs = Date.now() - start;
        const result: TestResult = {
          suiteName: item.suiteName,
          testName: item.testName,
          passed: true,
          durationMs,
        };
        this.results.push(result);
        if (!this.suites.has(item.suiteName)) this.suites.set(item.suiteName, []);
        this.suites.get(item.suiteName)!.push(result);
        console.log(`  ✓ ${item.testName} (${durationMs}ms)`);
      } catch (err: any) {
        const durationMs = Date.now() - start;
        const errorMsg = err?.message || String(err);
        const result: TestResult = {
          suiteName: item.suiteName,
          testName: item.testName,
          passed: false,
          error: errorMsg,
          durationMs,
        };
        this.results.push(result);
        if (!this.suites.has(item.suiteName)) this.suites.set(item.suiteName, []);
        this.suites.get(item.suiteName)!.push(result);
        console.error(`  ✗ ${item.testName} (${durationMs}ms)\n    Error: ${errorMsg}`);
      }
    }
  }

  getResults(): TestResult[] {
    return this.results;
  }

  getSummary(): { total: number; passed: number; failed: number; suites: SuiteSummary[] } {
    let total = 0;
    let passed = 0;
    let failed = 0;
    const suites: SuiteSummary[] = [];

    for (const [suiteName, tests] of this.suites.entries()) {
      const sPassed = tests.filter((t) => t.passed).length;
      const sFailed = tests.filter((t) => !t.passed).length;
      const sTotal = tests.length;
      const sDuration = tests.reduce((acc, t) => acc + t.durationMs, 0);

      total += sTotal;
      passed += sPassed;
      failed += sFailed;

      suites.push({
        suiteName,
        total: sTotal,
        passed: sPassed,
        failed: sFailed,
        durationMs: sDuration,
        results: tests,
      });
    }

    return { total, passed, failed, suites };
  }

  printSummaryReport(): boolean {
    const summary = this.getSummary();
    console.log("\n" + "=".repeat(70));
    console.log(`E2E TEST RUN SUMMARY: ${summary.total} Tests | ${summary.passed} Passed | ${summary.failed} Failed`);
    console.log("=".repeat(70));

    for (const suite of summary.suites) {
      const badge = suite.failed === 0 ? "PASS" : "FAIL";
      console.log(`[${badge}] ${suite.suiteName}: ${suite.passed}/${suite.total} passed (${suite.durationMs}ms)`);
      if (suite.failed > 0) {
        for (const t of suite.results.filter((r) => !r.passed)) {
          console.log(`    - ✗ ${t.testName}`);
          console.log(`      Error: ${t.error}`);
        }
      }
    }
    console.log("=".repeat(70) + "\n");
    return summary.failed === 0;
  }
}

export const runner = new TestRunner();
export const describe = runner.describe.bind(runner);
export const test = runner.test.bind(runner);
export const it = test;

/**
 * Rich expectation assertions
 */
export function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected: ${JSON.stringify(expected)} (${typeof expected})\nReceived: ${JSON.stringify(actual)} (${typeof actual})`);
      }
    },
    toEqual(expected: any) {
      const actStr = JSON.stringify(actual);
      const expStr = JSON.stringify(expected);
      if (actStr !== expStr) {
        throw new Error(`Expected equal: ${expStr}\nReceived:       ${actStr}`);
      }
    },
    notToBe(expected: any) {
      if (actual === expected) {
        throw new Error(`Expected not to be: ${JSON.stringify(expected)}`);
      }
    },
    toContain(expectedSubstr: string) {
      if (typeof actual !== "string" && !Array.isArray(actual)) {
        throw new Error(`Expected string or array, got: ${typeof actual}`);
      }
      if (!actual.includes(expectedSubstr as any)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expectedSubstr)}`);
      }
    },
    notToContain(expectedSubstr: string) {
      if (typeof actual === "string" || Array.isArray(actual)) {
        if (actual.includes(expectedSubstr as any)) {
          throw new Error(`Expected ${JSON.stringify(actual)} NOT to contain ${JSON.stringify(expectedSubstr)}`);
        }
      }
    },
    toMatch(regex: RegExp) {
      if (typeof actual !== "string" || !regex.test(actual)) {
        throw new Error(`Expected "${actual}" to match regex ${regex}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== "number" || actual <= expected) {
        throw new Error(`Expected ${actual} > ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      if (typeof actual !== "number" || actual >= expected) {
        throw new Error(`Expected ${actual} < ${expected}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, received: ${JSON.stringify(actual)}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected defined, received undefined`);
      }
    },
    toBeCloseTo(expected: number, delta: number = 0.001) {
      if (Math.abs(actual - expected) > delta) {
        throw new Error(`Expected ${actual} close to ${expected} (+/- ${delta})`);
      }
    },
    toThrow(expectedErrorPattern?: string | RegExp) {
      if (typeof actual !== "function") {
        throw new Error(`expect(actual).toThrow() requires actual to be a function`);
      }
      let didThrow = false;
      let thrownError: any = null;
      try {
        actual();
      } catch (e) {
        didThrow = true;
        thrownError = e;
      }
      if (!didThrow) {
        throw new Error(`Expected function to throw, but it did not`);
      }
      if (expectedErrorPattern) {
        const msg = thrownError?.message || String(thrownError);
        if (expectedErrorPattern instanceof RegExp) {
          if (!expectedErrorPattern.test(msg)) {
            throw new Error(`Expected thrown error message to match ${expectedErrorPattern}, got: "${msg}"`);
          }
        } else if (!msg.includes(expectedErrorPattern)) {
          throw new Error(`Expected thrown error message to contain "${expectedErrorPattern}", got: "${msg}"`);
        }
      }
    },
    get not() {
      return {
        toThrow(expectedErrorPattern?: string | RegExp) {
          if (typeof actual !== "function") {
            throw new Error(`expect(actual).not.toThrow() requires actual to be a function`);
          }
          let didThrow = false;
          let thrownError: any = null;
          try {
            actual();
          } catch (e) {
            didThrow = true;
            thrownError = e;
          }
          if (didThrow) {
            const msg = thrownError?.message || String(thrownError);
            throw new Error(`Expected function NOT to throw, but it threw: ${msg}`);
          }
        },
      };
    },
  };
}
