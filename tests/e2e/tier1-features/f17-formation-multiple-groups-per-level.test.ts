import { describe, test, expect } from "../helpers/runner";
import { readSourceFile } from "../helpers/moduleLoader";

export async function runF17Tests() {
  await describe("F17: Multiple Formation Groups per Formation Level", async () => {
    test("F17-01: createFormationWithLevels & updateFormationWithLevels support multi-group levels while syncing shared lumpSumPrice & book fees", () => {
      const source = readSourceFile("src/lib/formationActions.ts");
      expect(source.includes("groups?: Array<{")).toBe(true);
      expect(source.includes("where: { isFormation: true, formationLevelId: lvl.id }")).toBe(true);
      expect(source.includes("data: { pricePerCycle: newPriceDecimal }")).toBe(true);
      // Shared book fee update must not overwrite per-group branchId/ageGroup across the whole formation
      const updateSharedMatch = source.match(
        /await tx\.class\.updateMany\(\{\s*where:\s*\{\s*isFormation:\s*true,\s*FormationLevel:\s*\{\s*languageId:\s*resolvedLanguageId\s*\},?\s*\},\s*data:\s*\{([\s\S]*?)\},?\s*\}\);/
      );
      expect(Boolean(updateSharedMatch)).toBe(true);
      expect(updateSharedMatch![1].includes("hasBooks")).toBe(true);
      expect(updateSharedMatch![1].includes("branchId")).toBe(false);
    });

    test("F17-02: executeSafeDeleteFormationGroup enforces minimum sibling group, enrollment, and active voucher guards", () => {
      const source = readSourceFile("src/lib/formationActions.ts");
      expect(source.includes("export async function executeSafeDeleteFormationGroup")).toBe(true);
      expect(source.includes("opts?.requireRemainingSiblingGroup")).toBe(true);
      expect(source.includes("if (siblingCount <= 1)")).toBe(true);
      expect(source.includes("if (targetClass.enrollments.length > 0)")).toBe(true);
      expect(source.includes("if (targetClass.vouchers.length > 0)")).toBe(true);
    });

    test("F17-03: getFormationClosurePreview & closeFormationLevelsWithCascade support multi-group target selection and per-group cycle closure", () => {
      const source = readSourceFile("src/lib/formationActions.ts");
      expect(source.includes("ENROLL_EXISTING")).toBe(true);
      expect(source.includes("CREATE_NEW_KEEP_OPEN")).toBe(true);
      expect(source.includes("CLOSE_GROUP_AND_CREATE_NEW")).toBe(true);
      expect(source.includes("activeGroups")).toBe(true);
      expect(source.includes("where: { id: classToClose.id }")).toBe(true);
    });

    test("F17-04: Same-level formation group transfer preserves vouchers & level tests without mutating issuingBranchId or DailyLedger", () => {
      const formSource = readSourceFile("src/lib/formationActions.ts");
      const actionsSource = readSourceFile("src/lib/actions.ts");

      expect(formSource.includes("export async function executeFormationGroupTransferTx")).toBe(true);
      expect(formSource.includes("export async function transferStudentFormationGroup")).toBe(true);
      expect(formSource.includes("[FORMATION_VOUCHERS:")).toBe(true);

      const transferTxMatch = formSource.match(
        /export async function executeFormationGroupTransferTx[\s\S]*?return\s*\{\s*fromClass/
      );
      expect(Boolean(transferTxMatch)).toBe(true);
      // Must NOT call upsertDailyLedger or overwrite issuingBranchId during a group switch
      expect(transferTxMatch![0].includes("upsertDailyLedger")).toBe(false);
      expect(transferTxMatch![0].includes("issuingBranchId:")).toBe(false);
      expect(transferTxMatch![0].includes("targetBranchId: toClass.branchId")).toBe(true);

      // Wired into generic transferEnrollmentCredit & reversible in cancelEnrollmentTransfer
      expect(actionsSource.includes("executeFormationGroupTransferTx")).toBe(true);
      expect(actionsSource.includes("FORMATION_VOUCHERS:")).toBe(true);
    });

    test("F17-05: Formation pages, form, modals, and FR/AR i18n keys are wired for multi-group management", () => {
      const detailsPage = readSourceFile("src/app/[locale]/(dashboard)/list/formations/[id]/page.tsx");
      const formationForm = readSourceFile("src/components/forms/FormationForm.tsx");
      const roster = readSourceFile("src/components/formations/FormationRoster.tsx");
      const frJson = JSON.parse(readSourceFile("messages/fr.json"));
      const arJson = JSON.parse(readSourceFile("messages/ar.json"));

      expect(detailsPage.includes("FormationGroupActionsBar")).toBe(true);
      expect(detailsPage.includes("sameLevelActiveGroups")).toBe(true);
      expect(detailsPage.includes('notIn: ["TRANSFERRED", "UNENROLLED"]')).toBe(true);
      expect(formationForm.includes("handleAddGroupToLevel")).toBe(true);
      expect(roster.includes("TransferFormationGroupModal")).toBe(true);
      expect(roster.includes("onRequestCreateGroup")).toBe(true);

      const requiredKeys = [
        "groupsCount",
        "addGroupToLevel",
        "editGroupTitle",
        "deleteGroupTitle",
        "cannotDeleteOnlyGroup",
        "groupSwitcherLabel",
        "switchStudentGroup",
        "transferGroupTitle",
        "transferGroupPreservesNote",
        "finishGroupCycle",
        "reopenGroupCycle",
        "selectTargetGroupInNextLevel",
        "createNewGroupKeepOpen",
      ];
      for (const key of requiredKeys) {
        expect(typeof frJson.formations?.[key]).toBe("string");
        expect(typeof arJson.formations?.[key]).toBe("string");
      }
    });
  });
}

if (process.argv[1]?.endsWith("f17-formation-multiple-groups-per-level.test.ts")) {
  runF17Tests().then(async () => {
    const { runner } = require("../helpers/runner");
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
