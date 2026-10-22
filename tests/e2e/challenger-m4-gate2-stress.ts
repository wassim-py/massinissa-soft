import { describe, test, expect, runner } from "./helpers/runner";
import { readSourceFile } from "./helpers/moduleLoader";

export async function runChallengerM4Gate2StressTests() {
  await describe("Challenger M4 Gate 2: Server Action Revalidation Integration Stress Verification", async () => {
    // Dynamically spy on next/cache revalidatePath
    const nextCache = require("next/cache");
    const originalRevalidatePath = nextCache.revalidatePath;
    let recordedCalls: Array<{ path: string; type?: "page" | "layout" }> = [];

    const startRecording = () => {
      recordedCalls = [];
      nextCache.revalidatePath = (path: string, type?: "page" | "layout") => {
        recordedCalls.push({ path, type });
      };
    };

    const stopRecording = () => {
      nextCache.revalidatePath = originalRevalidatePath;
    };

    const { revalidateFinancialRoutes } = require("../../src/lib/revalidation");

    // =========================================================================
    // 1. REVALIDATION HELPER CORE COVERAGE & LOCALES
    // =========================================================================
    test("CHALLENGE-01: revalidateFinancialRoutes revalidates all 6 core financial routes across canonical, [locale], fr, and ar", async () => {
      startRecording();
      await revalidateFinancialRoutes();
      stopRecording();

      const paths = recordedCalls.map((c) => c.path);
      const expectedCoreRoutes = [
        "/list/daily-ledger",
        "/list/revenue",
        "/list/finance",
        "/list/payments",
        "/dashboard",
        "/admin",
      ];

      for (const route of expectedCoreRoutes) {
        expect(paths).toContain(route);
        expect(paths).toContain(`/[locale]${route}`);
        expect(paths).toContain(`/fr${route}`);
        expect(paths).toContain(`/ar${route}`);
      }

      // Root layout revalidation
      const layoutCall = recordedCalls.find((c) => c.path === "/" && c.type === "layout");
      expect(layoutCall).toBeDefined();

      // Exactly 6 * 4 + 1 = 25 calls for empty targets
      expect(recordedCalls.length).toBe(25);
    });

    // =========================================================================
    // 2. NULL / UNDEFINED / DEFENSIVE CLASS ID HANDLING (WORKSHOP VOUCHERS)
    // =========================================================================
    test("CHALLENGE-02: Workshop voucher with null/undefined classId does NOT emit /list/payments/class/null or class/undefined", async () => {
      startRecording();
      await revalidateFinancialRoutes({ classId: null, workshopId: 77 });
      await revalidateFinancialRoutes({ classId: undefined, workshopId: 88 });
      stopRecording();

      const paths = recordedCalls.map((c) => c.path);

      // Verify no corrupted paths
      const corruptedPaths = paths.filter(
        (p) =>
          p.includes("/class/null") ||
          p.includes("/class/undefined") ||
          p.includes("/class/NaN") ||
          p.includes("/workshops/null") ||
          p.includes("/workshops/undefined")
      );
      expect(corruptedPaths.length).toBe(0);

      // Verify workshop routes WERE revalidated
      expect(paths).toContain("/list/workshops/77");
      expect(paths).toContain("/list/workshops/88");
      expect(paths).toContain("/list/workshops");
    });

    test("CHALLENGE-03: Defensive numeric ID validation filters out <= 0, NaN, and negative IDs", async () => {
      startRecording();
      await revalidateFinancialRoutes({ classId: -1, workshopId: 0, branchId: -99 });
      await revalidateFinancialRoutes({ classId: NaN as any, workshopId: "invalid" as any });
      stopRecording();

      const paths = recordedCalls.map((c) => c.path);
      const invalidClassPaths = paths.filter((p) => p.includes("/class/-1") || p.includes("/class/0") || p.includes("/class/NaN"));
      const invalidWorkshopPaths = paths.filter((p) => p.includes("/workshops/0") || p.includes("/workshops/invalid"));

      expect(invalidClassPaths.length).toBe(0);
      expect(invalidWorkshopPaths.length).toBe(0);
    });

    // =========================================================================
    // 3. STUDENT ID SANITIZATION & URL ENCODING
    // =========================================================================
    test("CHALLENGE-04: Student ID handles alphanumeric UUIDs, prevents 'null'/'undefined' string injections, and URI encodes specials", async () => {
      startRecording();
      // Valid UUID
      await revalidateFinancialRoutes({ studentId: "std_e4f5-6789-abcd" });
      // Malicious or accidental string tokens
      await revalidateFinancialRoutes({ studentId: "null" });
      await revalidateFinancialRoutes({ studentId: "undefined" });
      await revalidateFinancialRoutes({ studentId: "   " });
      await revalidateFinancialRoutes({ studentId: "[object Object]" });
      // Special characters requiring encoding
      await revalidateFinancialRoutes({ studentId: "std/2026 #1" });
      stopRecording();

      const paths = recordedCalls.map((c) => c.path);

      // Valid UUID present
      expect(paths).toContain("/list/students/std_e4f5-6789-abcd");

      // Corrupted tokens absent
      expect(paths.filter((p) => p.includes("/students/null")).length).toBe(0);
      expect(paths.filter((p) => p.includes("/students/undefined")).length).toBe(0);
      expect(paths.filter((p) => p.includes("/students/%5Bobject%20Object%5D")).length).toBe(0);

      // Properly encoded special characters
      expect(paths).toContain(`/list/students/${encodeURIComponent("std/2026 #1")}`);
    });

    // =========================================================================
    // 4. MULTI-ITEM VOUCHER BUNDLE COMBINATIONS (1, 2, OR 3 ITEMS)
    // =========================================================================
    test("CHALLENGE-05: Multi-item voucher action structure handles 1, 2, or 3 item combinations atomically", async () => {
      const actionsSource = readSourceFile("src/lib/actions.ts");

      // Verify payload and validation logic
      expect(actionsSource).toContain("issueMultiItemVoucherAction");
      expect(actionsSource).toContain("payload.items.tuition");
      expect(actionsSource).toContain("payload.items.inscription");
      expect(actionsSource).toContain("payload.items.book");
      expect(actionsSource).toContain("!tuitionItem && !inscriptionItem && !bookItem");

      // Verify that revalidation call in issueMultiItemVoucherAction passes classId, studentId, and branchId
      const fnIdx = actionsSource.indexOf("export async function issueMultiItemVoucherAction");
      expect(fnIdx).toBeGreaterThan(0);
      const nextFnIdx = actionsSource.indexOf("export const issueVoucher", fnIdx);
      const actionBody = actionsSource.slice(fnIdx, nextFnIdx);

      expect(actionBody).toContain("revalidateFinancialRoutes({");
      expect(actionBody).toContain("classId: payload.classId");
      expect(actionBody).toContain("studentId: payload.studentId");
      expect(actionBody).toContain("branchId: issuingBranchId");
      expect(actionBody).toContain("safeRevalidatePath(`/list/attendance/class/${payload.classId}`)");

      // Test revalidation call with sample payload
      startRecording();
      await revalidateFinancialRoutes({
        classId: 101,
        studentId: "student_multi_1",
        branchId: 1,
      });
      stopRecording();

      const paths = recordedCalls.map((c) => c.path);
      expect(paths).toContain("/list/classes/101");
      expect(paths).toContain("/list/payments/class/101");
      expect(paths).toContain("/list/students/student_multi_1");
      expect(paths).toContain("/list/daily-ledger");
      expect(paths).toContain("/list/revenue");
    });

    // =========================================================================
    // 5. EDIT VOUCHER & VOID VOUCHER DELEGATION
    // =========================================================================
    test("CHALLENGE-06: editVoucher and voidVoucher revalidation parameters include workshopId & avoid class/null", async () => {
      const actionsSource = readSourceFile("src/lib/actions.ts");

      // Verify voidVoucher delegates to editVoucher
      const voidIdx = actionsSource.indexOf("export const voidVoucher = async");
      expect(voidIdx).toBeGreaterThan(0);
      const voidBody = actionsSource.slice(voidIdx, voidIdx + 400);
      expect(voidBody).toContain("editVoucher(");

      // Verify editVoucher calls revalidateFinancialRoutes with classId, studentId, issuingBranchId, and workshopId
      const editIdx = actionsSource.indexOf("export const editVoucher = async");
      expect(editIdx).toBeGreaterThan(0);
      const editBody = actionsSource.slice(editIdx, editIdx + 6000);

      expect(editBody).toContain("revalidateFinancialRoutes({");
      expect(editBody).toContain("classId: voucher.classId");
      expect(editBody).toContain("studentId: voucher.studentId");
      expect(editBody).toContain("branchId: voucher.issuingBranchId");
      expect(editBody).toContain("workshopId: voucher.workshopId");

      // Test scenario: Workshop voucher edited (classId is null, workshopId is 15)
      startRecording();
      await revalidateFinancialRoutes({
        classId: null,
        studentId: "std_ws_1",
        branchId: 1,
        workshopId: 15,
      });
      stopRecording();

      const paths = recordedCalls.map((c) => c.path);
      expect(paths.filter((p) => p.includes("null")).length).toBe(0);
      expect(paths).toContain("/list/workshops/15");
      expect(paths).toContain("/list/daily-ledger");
      expect(paths).toContain("/list/revenue");
    });

    // =========================================================================
    // 6. REFUNDS BRANCH A VS BRANCH B REVALIDATION COVERAGE
    // =========================================================================
    test("CHALLENGE-07: createRefund revalidates financial routes in BOTH Branch A (Transfer) and Branch B (Voucher)", async () => {
      const actionsSource = readSourceFile("src/lib/actions.ts");

      const refundIdx = actionsSource.indexOf("export const createRefund = async");
      expect(refundIdx).toBeGreaterThan(0);
      const nextFnIdx = actionsSource.indexOf("export const getRefundsAction", refundIdx);
      const refundBody = actionsSource.slice(refundIdx, nextFnIdx);

      // Branch A verification
      expect(refundBody).toContain("BRANCH A: REFUNDING A CREDIT TRANSFER");
      expect(refundBody).toContain("classId: destClassId");
      expect(refundBody).toContain("studentId: student.id");
      expect(refundBody).toContain("branchId: toBranchId");
      expect(refundBody).toContain("classId: transfer.fromEnrollment.classId");

      // Branch B verification
      expect(refundBody).toContain("BRANCH B: REFUNDING A VOUCHER");
      expect(refundBody).toContain("classId: voucher.classId");
      expect(refundBody).toContain("studentId: voucher.studentId");
      expect(refundBody).toContain("branchId: voucher.issuingBranchId");
      expect(refundBody).toContain("workshopId: voucher.workshopId");

      // Simulate Branch A (cross-branch credit refund)
      startRecording();
      await revalidateFinancialRoutes({ classId: 201, studentId: "std_refund_a", branchId: 2 });
      await revalidateFinancialRoutes({ classId: 202, branchId: 1 });
      stopRecording();

      let paths = recordedCalls.map((c) => c.path);
      expect(paths).toContain("/list/classes/201");
      expect(paths).toContain("/list/classes/202");
      expect(paths).toContain("/list/daily-ledger");

      // Simulate Branch B (workshop voucher refund: null classId, workshopId 55)
      startRecording();
      await revalidateFinancialRoutes({ classId: null, studentId: "std_refund_b", branchId: 1, workshopId: 55 });
      stopRecording();

      paths = recordedCalls.map((c) => c.path);
      expect(paths.filter((p) => p.includes("null")).length).toBe(0);
      expect(paths).toContain("/list/workshops/55");
      expect(paths).toContain("/list/revenue");
    });

    // =========================================================================
    // 7. WORKSHOP ACTIONS (REGISTER PARTICIPANT & WORKSHOP PAYMENTS)
    // =========================================================================
    test("CHALLENGE-08: Workshop actions (registerParticipant, addWorkshopPayment, updateWorkshopPayment) revalidate financial routes", async () => {
      const actionsSource = readSourceFile("src/lib/actions.ts");

      // registerParticipant
      const regIdx = actionsSource.indexOf("export const registerParticipant = async");
      expect(regIdx).toBeGreaterThan(0);
      const regBody = actionsSource.slice(regIdx, regIdx + 6000);
      expect(regBody).toContain("revalidateFinancialRoutes({");
      expect(regBody).toContain("workshopId: data.workshopId");

      // addWorkshopPayment
      const addPayIdx = actionsSource.indexOf("export const addWorkshopPayment = async");
      expect(addPayIdx).toBeGreaterThan(0);
      const addPayBody = actionsSource.slice(addPayIdx, addPayIdx + 4000);
      expect(addPayBody).toContain("revalidateFinancialRoutes({");
      expect(addPayBody).toContain("workshopId: workshop.id");

      // updateWorkshopPayment
      const updPayIdx = actionsSource.indexOf("export const updateWorkshopPayment = async");
      expect(updPayIdx).toBeGreaterThan(0);
      const updPayBody = actionsSource.slice(updPayIdx, updPayIdx + 3000);
      expect(updPayBody).toContain("revalidateFinancialRoutes({");
      expect(updPayBody).toContain("workshopId: data.workshopId");
    });

    // =========================================================================
    // 8. CASH DISCREPANCY ACTIONS (MISSING & SURPLUS MONEY)
    // =========================================================================
    test("CHALLENGE-09: All 10 Cash Discrepancy actions (Missing & Surplus Money) invoke revalidateFinancialRoutes({ branchId })", async () => {
      const actionsSource = readSourceFile("src/lib/actions.ts");

      const requiredActions = [
        "declareMissingMoneyAction",
        "confirmMissingMoneyAction",
        "rejectMissingMoneyAction",
        "resetMissingMoneyAction",
        "deleteMissingMoneyAction",
        "declareSurplusMoneyAction",
        "confirmSurplusMoneyAction",
        "rejectSurplusMoneyAction",
        "resetSurplusMoneyAction",
        "deleteSurplusMoneyAction",
      ];

      for (const actionName of requiredActions) {
        const marker = `export async function ${actionName}`;
        const startPos = actionsSource.indexOf(marker);
        if (startPos === -1) {
          throw new Error(`Could not find ${actionName} in src/lib/actions.ts`);
        }
        // Slice up to 3000 characters to capture the entire function
        const body = actionsSource.slice(startPos, startPos + 3000);
        const hasRevalidation = body.includes("revalidateFinancialRoutes({ branchId");
        if (!hasRevalidation) {
          throw new Error(`Defect in ${actionName}: Missing revalidateFinancialRoutes({ branchId })`);
        }
        expect(hasRevalidation).toBe(true);
      }
    });

    // =========================================================================
    // 9. FORMATION ACTIONS REVALIDATION
    // =========================================================================
    test("CHALLENGE-10: formationActions.ts revalidates daily ledger, revenue, formations for lump-sum & enrollment", async () => {
      const formationSource = readSourceFile("src/lib/formationActions.ts");

      // recordFormationLumpSumPayment
      const lumpIdx = formationSource.indexOf("export async function recordFormationLumpSumPayment");
      expect(lumpIdx).toBeGreaterThan(0);
      const lumpBody = formationSource.slice(lumpIdx, lumpIdx + 8000);
      expect(lumpBody).toContain("revalidateFinancialRoutes({");
      expect(lumpBody).toContain("classId: data.classId");
      expect(lumpBody).toContain("studentId: data.studentId");
      expect(lumpBody).toContain("branchId: issuingBranchId");
      expect(lumpBody).toContain("safeRevalidatePath(\"/list/formations\")");
      expect(lumpBody).toContain("safeRevalidatePath(`/list/formations/${data.classId}`)");

      // enrollStudentInFormationGroup
      const enrollIdx = formationSource.indexOf("export async function enrollStudentInFormationGroup");
      expect(enrollIdx).toBeGreaterThan(0);
      const enrollBody = formationSource.slice(enrollIdx, enrollIdx + 4000);
      expect(enrollBody).toContain("revalidateFinancialRoutes({");
      expect(enrollBody).toContain("classId: targetClass.id");
      expect(enrollBody).toContain("studentId: data.studentId");
      expect(enrollBody).toContain("branchId: targetClass.branchId");
      expect(enrollBody).toContain("safeRevalidatePath(\"/list/formations\")");
    });

    // =========================================================================
    // 10. FINANCE ACTIONS REVALIDATION (DAILY EXPENSES, CAISSE NOIRE, PAYROLL)
    // =========================================================================
    test("CHALLENGE-11: financeActions.ts calls revalidateFinancialRoutes across daily expenses, caisse noire, payroll, and advances", async () => {
      const financeSource = readSourceFile("src/lib/financeActions.ts");

      // Daily Expenses (create, update, delete)
      const expCreateIdx = financeSource.indexOf("export async function createDailyExpenseAction");
      const expUpdateIdx = financeSource.indexOf("export async function updateDailyExpenseAction");
      const expDeleteIdx = financeSource.indexOf("export async function deleteDailyExpenseAction");
      expect(financeSource.slice(expCreateIdx, expCreateIdx + 2000)).toContain("revalidateFinancialRoutes({");
      expect(financeSource.slice(expUpdateIdx, expUpdateIdx + 2000)).toContain("revalidateFinancialRoutes({");
      expect(financeSource.slice(expDeleteIdx, expDeleteIdx + 2000)).toContain("revalidateFinancialRoutes({");

      // Caisse Noire (create, update, delete)
      const cnCreateIdx = financeSource.indexOf("export async function createCaisseNoireTransactionAction");
      const cnUpdateIdx = financeSource.indexOf("export async function updateCaisseNoireTransactionAction");
      const cnDeleteIdx = financeSource.indexOf("export async function deleteCaisseNoireTransactionAction");
      expect(financeSource.slice(cnCreateIdx, cnCreateIdx + 2000)).toContain("revalidateFinancialRoutes()");
      expect(financeSource.slice(cnUpdateIdx, cnUpdateIdx + 2000)).toContain("revalidateFinancialRoutes()");
      expect(financeSource.slice(cnDeleteIdx, cnDeleteIdx + 2000)).toContain("revalidateFinancialRoutes()");

      // Staff Payroll (record, update, delete)
      const payRecordIdx = financeSource.indexOf("export async function recordStaffPayrollAction");
      const payUpdateIdx = financeSource.indexOf("export async function updateStaffPayrollAction");
      const payDeleteIdx = financeSource.indexOf("export async function deleteStaffPayrollAction");
      expect(financeSource.slice(payRecordIdx, payRecordIdx + 3000)).toContain("revalidateFinancialRoutes()");
      expect(financeSource.slice(payUpdateIdx, payUpdateIdx + 3000)).toContain("revalidateFinancialRoutes()");
      expect(financeSource.slice(payDeleteIdx, payDeleteIdx + 3000)).toContain("revalidateFinancialRoutes()");

      // Staff Advance (record, update, delete)
      const advRecordIdx = financeSource.indexOf("export async function recordStaffAdvanceAction");
      const advUpdateIdx = financeSource.indexOf("export async function updateStaffAdvanceAction");
      const advDeleteIdx = financeSource.indexOf("export async function deleteStaffAdvanceAction");
      expect(financeSource.slice(advRecordIdx, advRecordIdx + 3000)).toContain("revalidateFinancialRoutes()");
      expect(financeSource.slice(advUpdateIdx, advUpdateIdx + 3000)).toContain("revalidateFinancialRoutes()");
      expect(financeSource.slice(advDeleteIdx, advDeleteIdx + 3000)).toContain("revalidateFinancialRoutes()");
    });

    // =========================================================================
    // 11. CONCURRENCY & STRESS LOAD
    // =========================================================================
    test("CHALLENGE-12: High-concurrency stress (100 parallel revalidations with mixed target permutations)", async () => {
      startRecording();

      const promises: Array<Promise<void>> = [];
      for (let i = 1; i <= 100; i++) {
        const targets = {
          classId: i % 2 === 0 ? i : null,
          studentId: i % 3 === 0 ? `std_${i}` : null,
          workshopId: i % 5 === 0 ? i : null,
          branchId: (i % 4) + 1,
        };
        promises.push(revalidateFinancialRoutes(targets));
      }

      await Promise.all(promises);
      stopRecording();

      // Ensure that 100 concurrent revalidations completed without error
      expect(recordedCalls.length).toBeGreaterThan(2500);

      // Verify that no undefined/null dynamic paths leaked through
      const leaked = recordedCalls.filter(
        (c) =>
          c.path.includes("null") ||
          c.path.includes("undefined") ||
          c.path.includes("NaN")
      );
      expect(leaked.length).toBe(0);
    });
  });
}

if (process.argv[1]?.endsWith("challenger-m4-gate2-stress.ts")) {
  runChallengerM4Gate2StressTests().then(async () => {
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
