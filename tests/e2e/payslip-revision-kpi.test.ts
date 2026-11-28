import React from "react";
import ReactDOMServer from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { describe, test, expect, runner } from "./helpers/runner";
import { PayslipTicket, PayslipPrintData } from "@/components/printable/PayslipTicket";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/massinissa_test";
}

export async function runPayslipRevisionKpiTests() {
  const { computeTeacherPayrollFromData } = await import("@/lib/payroll");

  await describe("Printable Teacher Payroll Revision Count & Overflow-Safe KPI Cards", async () => {
    test("PAY-REV-01: computeTeacherPayrollFromData tracks per-session, per-group, and total revision payable counts & amounts", async () => {
      const classId = 301;
      const branchId = 2;

      const teacher = {
        id: "tch_rev_kpi",
        name: "Prof Amine",
        TeacherPayRate: [{ percentageOfSessionFee: 70, effectiveFrom: new Date("2026-01-01T00:00:00Z") }],
        TeacherBranch: [{ branchId, payRate: null, Branch: { id: branchId, name: "Siège Principal" } }],
        teacherClassRates: [],
      };

      const classInfo = {
        id: classId,
        name: "Maths 3AS - G1",
        branchId,
        pricePerCycle: 2000,
        isFormation: false,
        enrollments: [],
      };

      const lesson1 = {
        id: 5001,
        classId,
        branchId,
        startsAt: new Date("2026-11-10T14:00:00Z"),
        endsAt: new Date("2026-11-10T16:00:00Z"),
        isFree: false,
        isExtra: false,
        isCatchUp: false,
        isTeacherAbsent: false,
        branch: { name: "Siège Principal" },
        class: classInfo,
        attendances: [
          { studentId: "rev_1", lessonId: 5001, status: "PRESENT", isRevisionVisitor: true },
          { studentId: "rev_2", lessonId: 5001, status: "PRESENT", isRevisionVisitor: true },
          // Checked in after cancelling/refunding an earlier voucher and paying a replacement voucher
          { studentId: "rev_rebooked", lessonId: 5001, status: "PRESENT", isRevisionVisitor: true },
          // Checked in with fully refunded voucher -> 0 DZD, NOT counted as payable revision lesson
          { studentId: "rev_refunded", lessonId: 5001, status: "PRESENT", isRevisionVisitor: true },
        ],
        vouchers: [
          { id: 1, studentId: "rev_1", classId, lessonId: 5001, paymentType: "REVISION_SESSION", amount: 600, isVoided: false, isRefund: false, refunds: [] },
          { id: 2, studentId: "rev_2", classId, lessonId: 5001, paymentType: "REVISION_SESSION", amount: 800, isVoided: false, isRefund: false, refunds: [] },
          { id: 3, studentId: "rev_rebooked", classId, lessonId: 5001, paymentType: "REVISION_SESSION", amount: 600, isVoided: false, isRefund: false, refunds: [{ amount: 600 }] },
          { id: 4, studentId: "rev_rebooked", classId, lessonId: 5001, paymentType: "REVISION_SESSION", amount: 600, isVoided: false, isRefund: false, refunds: [] },
          { id: 5, studentId: "rev_refunded", classId, lessonId: 5001, paymentType: "REVISION_SESSION", amount: 600, isVoided: false, isRefund: false, refunds: [{ amount: 600 }] },
        ],
      };

      const classHistoryMap = new Map<number, any>([
        [
          classId,
          {
            lessons: [
              { id: 5001, classId, branchId, startsAt: lesson1.startsAt, isFree: false, isTeacherAbsent: false },
            ],
            attendances: [],
            catchUps: [],
            classInfo,
            vouchers: [],
          },
        ],
      ]);

      const calc = await computeTeacherPayrollFromData({
        startDate: new Date("2026-11-01T00:00:00Z"),
        endDate: new Date("2026-11-30T23:59:59Z"),
        groupFilter: "all",
        teacher,
        lessons: [lesson1],
        teacherClasses: [{ id: classId, isFormation: false }],
        salaryAdvancesList: [],
        photocopyChargesList: [],
        catchUpVisitors: [],
        catchUpsForMissedLessons: [],
        bookVouchers: [],
        formationClasses: [],
        prefetchedFormationData: [[], []],
        classHistoryMap,
        lessonByIdMap: new Map([[5001, lesson1]]),
      });

      expect(Boolean(calc)).toBe(true);
      // 3 paid revision visitors: 600 + 800 + 600 = 2000 gross; 70% = 1400 teacher cut
      expect(calc!.totalRevisionLessons).toBe(3);
      expect(calc!.totalRevisionAmount).toBeCloseTo(1400, 0.01);
      expect(calc!.grossAmount).toBeCloseTo(1400, 0.01);

      const session = calc!.sessionDetails![0];
      expect(session.revisionPayingCount).toBe(3);
      expect(session.revisionAmount).toBeCloseTo(1400, 0.01);
      expect(session.payingCount).toBe(3);

      const group = calc!.groupBreakdown![0];
      expect(group.revisionLessonsCount).toBe(3);
      expect(group.revisionAmount).toBeCloseTo(1400, 0.01);
      expect(group.payableLessonsCount).toBe(3);
    });

    test("PAY-REV-02: PayslipTicket renders revision payable count KPI, group column, session badge, and summary box", () => {
      const data: PayslipPrintData = {
        id: 42,
        periodStart: "2026-11-01",
        periodEnd: "2026-11-30",
        status: "VALIDATED",
        teacher: { id: "tch_1", name: "Prof Karima" },
        sessionsCount: 8,
        paidSessionsCount: 8,
        freeSessionsCount: 0,
        grossAmount: 145250,
        advances: 15000,
        photocopyDeductions: 2500,
        netAmount: 127750,
        branchLines: [{ branchId: 1, branchName: "Siège", sessionsCount: 8, amount: 145250 }],
        groupLines: [
          {
            className: "Physique 3AS",
            branchName: "Siège",
            courseSessionsCount: 8,
            payableLessonsCount: 48,
            paidSessionsCount: 48,
            revisionLessonsCount: 7,
            revisionAmount: 2940,
            freeSessionsCount: 0,
            totalSessionsCount: 8,
            amount: 145250,
          },
        ],
        sessions: [
          {
            lessonId: 101,
            startsAt: "2026-11-12T14:00:00Z",
            className: "Physique 3AS",
            branchName: "Siège",
            presentCount: 10,
            payingCount: 10,
            revisionPayingCount: 3,
            revisionAmount: 1260,
            teacherCut: 350,
            lessonAmount: 3710,
            isFree: false,
          },
        ],
        retroactiveLessonsCount: 5,
        retroactiveAmount: 1750,
        revisionLessonsCount: 7,
        revisionAmount: 2940,
      };

      const html = ReactDOMServer.renderToStaticMarkup(React.createElement(PayslipTicket, { data }));

      // KPI card + subtitle
      expect(html.includes("Séances Révision")).toBe(true);
      expect(html.includes("dont 5 régul. · 7 rév.")).toBe(true);
      // 2-row balanced KPI banner: 4 count cards on Row 1, 2 full-width monetary cards on Row 2
      expect(html.includes("repeat(4, minmax(0, 1fr))")).toBe(true);
      expect(html.includes("repeat(2, minmax(0, 1fr))")).toBe(true);
      // Group breakdown badge & column
      expect(html.includes("Dont révision : 7")).toBe(true);
      expect(html.includes(">Révision<")).toBe(true);
      // Per-session revision indicator & summary box
      expect(html.includes("dont 3 rév.")).toBe(true);
      expect(html.includes("Séances de révision payables (Visiteurs révision)")).toBe(true);
      expect(html.includes("7 séances payables")).toBe(true);
    });

    test("PAY-REV-03: PayslipTicket switches to 2-row KPI banner when monetary numbers are large and hides revision UI when 0", () => {
      const largeData: PayslipPrintData = {
        id: 43,
        periodStart: "2026-11-01",
        periodEnd: "2026-11-30",
        status: "PAID",
        teacher: { id: "tch_2", name: "Prof Big Numbers" },
        sessionsCount: 20,
        paidSessionsCount: 20,
        freeSessionsCount: 0,
        grossAmount: 12450750.5,
        advances: 0,
        photocopyDeductions: 0,
        netAmount: 12450750.5,
        branchLines: [{ branchId: 1, branchName: "Siège", sessionsCount: 20, amount: 12450750.5 }],
        groupLines: [
          {
            className: "Maths",
            branchName: "Siège",
            courseSessionsCount: 20,
            payableLessonsCount: 120,
            freeSessionsCount: 0,
            totalSessionsCount: 20,
            amount: 12450750.5,
          },
        ],
        revisionLessonsCount: 0,
        retroactiveLessonsCount: 0,
      };

      const html = ReactDOMServer.renderToStaticMarkup(React.createElement(PayslipTicket, { data: largeData }));

      // No revision UI when count is 0
      expect(html.includes("Séances Révision")).toBe(false);
      expect(html.includes("Dont révision")).toBe(false);
      expect(html.includes("Séances de révision payables")).toBe(false);

      // Switches to 2-row KPI layout for large 12-char numbers so monetary cards get 50% width each
      expect(html.includes("repeat(2, minmax(0, 1fr))")).toBe(true);
      // Overflow guards present on cards
      expect(html.includes("min-w-0 overflow-hidden")).toBe(true);
      // Adaptive smaller font size applied for 12-char number
      expect(html.includes("text-base font-mono")).toBe(true);
    });

    test("PAY-REV-04: TeacherPayrollSection and payslip flows enforce overflow-safe KPI grids and revision plumbing", () => {
      const readRepo = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
      const section = readRepo("src/components/teachers/TeacherPayrollSection.tsx");
      const modal = readRepo("src/components/teachers/TeacherPayslipConfigModal.tsx");
      const actions = readRepo("src/lib/financeActions.ts");
      const detailPage = readRepo("src/app/[locale]/(dashboard)/list/finance/payslips/[id]/page.tsx");

      // Old cramped 7/8-column xl grid bug must be gone
      expect(section.includes("xl:grid-cols-7")).toBe(false);
      expect(section.includes("xl:grid-cols-8")).toBe(false);
      expect(section.includes("min-w-0 overflow-hidden")).toBe(true);
      expect(section.includes("revisionLessonsCount")).toBe(true);

      // Selective print modal, server action, and detail page all plumb revisionLessonsCount
      expect(modal.includes("revisionLessonsCount")).toBe(true);
      expect(actions.includes("revisionLessonsCount")).toBe(true);
      expect(detailPage.includes("revisionLessonsCount")).toBe(true);
    });
  });

  await runner.runQueuedTests();
}

if (process.argv[1]?.endsWith("payslip-revision-kpi.test.ts")) {
  runPayslipRevisionKpiTests().then(() => {
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}
