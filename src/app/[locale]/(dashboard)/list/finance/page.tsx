import dynamic from "next/dynamic";
import BackButton from "@/components/BackButton";
import prisma from "@/lib/prisma";
import { getAuthSession, getActiveBranchId } from "@/lib/auth";
import { getDailyRevenueDashboardData } from "@/lib/revenue";
import { getOwnerPayrollOverview } from "@/lib/payroll";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  TrendingUp,
  TrendingDown,
  Receipt,
  GraduationCap,
  Users,
  Wallet,
  Coins,
} from "lucide-react";

const DailyRevenueDashboard = dynamic(() => import("@/components/revenue/DailyRevenueDashboard"), {
  loading: () => <div className="p-8 text-center text-muted animate-pulse">Chargement du tableau de bord...</div>,
});

const PayrollClientTabs = dynamic(() => import("../payroll/PayrollClientTabs"), {
  loading: () => <div className="p-8 text-center text-muted animate-pulse">Chargement de la paie...</div>,
});

const DailyExpensesSection = dynamic(() => import("@/components/finance/DailyExpensesSection"), {
  loading: () => <div className="p-8 text-center text-muted animate-pulse">Chargement des dépenses...</div>,
});

const CaisseNoireSection = dynamic(() => import("@/components/finance/CaisseNoireSection"), {
  loading: () => <div className="p-8 text-center text-muted animate-pulse">Chargement de la Caisse Noire...</div>,
});

const StaffPayrollSection = dynamic(() => import("@/components/finance/StaffPayrollSection"), {
  loading: () => <div className="p-8 text-center text-muted animate-pulse">Chargement du personnel...</div>,
});

import { getTranslations, getLocale } from "next-intl/server";
import { getCaisseNoireSummary } from "@/lib/financeActions";

interface PageProps {
  searchParams: Promise<{
    section?: "revenue" | "expenses" | "caisseNoire" | "payroll" | "staff";
    tab?: "runs" | "deductions" | "rates" | "overview" | "payslips" | "photocopy" | "advances";
    dateFrom?: string;
    dateTo?: string;
    branchId?: string;
    periodMode?: "daily" | "weekly" | "monthly";
    page?: string;
  }>;
}

export default async function FinancePage(props: PageProps) {
  const searchParams = await props.searchParams;
  const session = await getAuthSession();
  const t = await getTranslations("finance");
  const locale = await getLocale();

  // Strict Phase 3 owner-only protection
  if (!session.can("view", "finance") || !session.isOwner) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-8 border-danger-soft">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {t("unauthorizedTitle")}
          </Badge>
          <p className="text-table-body text-muted">
            {t("unauthorizedDesc")}
          </p>
        </div>
      </Card>
    );
  }

  const activeBranchId = await getActiveBranchId();

  // Branch Selection logic
  let selectedBranchParam: number | "all" = "all";
  if (searchParams.branchId) {
    selectedBranchParam = searchParams.branchId === "all" ? "all" : Number(searchParams.branchId);
  } else if (!session.isOwner) {
    selectedBranchParam = activeBranchId;
  }

  // Active Section: revenue | expenses | caisseNoire | payroll | staff
  let activeSection: "revenue" | "expenses" | "caisseNoire" | "payroll" | "staff" = "revenue";
  if (
    searchParams.section === "payroll" ||
    searchParams.section === "revenue" ||
    searchParams.section === "expenses" ||
    searchParams.section === "caisseNoire" ||
    searchParams.section === "staff"
  ) {
    activeSection = searchParams.section;
  } else if (
    searchParams.tab === "runs" ||
    searchParams.tab === "deductions" ||
    searchParams.tab === "rates" ||
    searchParams.tab === "overview" ||
    searchParams.tab === "payslips" ||
    searchParams.tab === "photocopy" ||
    searchParams.tab === "advances"
  ) {
    activeSection = "payroll";
  }

  // Normalized currentTab for Payroll
  let currentTab = searchParams.tab || (activeSection === "payroll" ? "runs" : "revenue");
  if (currentTab === "overview" || currentTab === "payslips") currentTab = "runs";
  if (currentTab === "photocopy" || currentTab === "advances") currentTab = "deductions";

  // Fetch Common Data: Daily Expenses, Caisse Noire, Staff Members, Staff Payrolls, Branches
  const [
    rawDailyExpenses,
    caisseNoireData,
    rawStaffMembers,
    rawStaffPayrolls,
    allBranchesData,
  ] = await Promise.all([
    prisma.dailyExpense.findMany({
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { date: "desc" },
    }),
    getCaisseNoireSummary(),
    prisma.staffMember.findMany({
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.staffPayroll.findMany({
      include: { staffMember: { select: { name: true, roleTitle: true } } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    prisma.branch.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const formattedExpenses = rawDailyExpenses.map((e) => ({
    id: e.id,
    branchId: e.branchId,
    branchName: e.branch?.name,
    amount: Number(e.amount),
    description: e.description,
    category: e.category,
    date: e.date,
    recordedBy: e.recordedBy,
  }));

  const formattedStaff = rawStaffMembers.map((s) => ({
    id: s.id,
    name: s.name,
    roleTitle: s.roleTitle,
    phone: s.phone,
    branchId: s.branchId,
    branchName: s.branch?.name,
    baseSalary: Number(s.baseSalary),
    isActive: s.isActive,
  }));

  const formattedStaffPayrolls = rawStaffPayrolls.map((p) => ({
    id: p.id,
    staffMemberId: p.staffMemberId,
    staffName: p.staffMember.name,
    roleTitle: p.staffMember.roleTitle,
    month: p.month,
    year: p.year,
    amount: Number(p.amount),
    status: p.status,
    paidAt: p.paidAt,
    notes: p.notes,
  }));

  const totalDailyExpensesSum = formattedExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalStaffPayrollSum = formattedStaffPayrolls
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + p.amount, 0);

  // Top KPIs Revenue data
  const dashboardData = await getDailyRevenueDashboardData({
    branchId: selectedBranchParam,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
    periodMode: searchParams.periodMode || "daily",
  });

  // Payroll data
  let overviewData: any = {
    totalRevenue: 0,
    totalGrossPayroll: 0,
    totalAdvances: 0,
    totalPhotocopyDeductions: 0,
    totalNetPayroll: 0,
    operatingMargin: 0,
    branchBreakdown: [],
  };
  let payrollRuns: any[] = [];
  let payslips: any[] = [];
  let teachers: any[] = [];
  let photocopyCharges: any[] = [];
  let salaryAdvances: any[] = [];
  let branches: any[] = [];
  const teacherMap = new Map<string, string>();

  if (activeSection === "payroll") {
    const now = new Date();
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));

    const startDate = searchParams.dateFrom ? new Date(searchParams.dateFrom) : firstDay;
    const endDate = searchParams.dateTo ? new Date(searchParams.dateTo) : lastDay;

    if (currentTab === "runs") {
      const [rawOverview, rawRuns, rawPayslips, teacherList] = await Promise.all([
        getOwnerPayrollOverview(startDate, endDate),
        prisma.payrollRun.findMany({
          orderBy: { periodEnd: "desc" },
          include: {
            Payslip: {
              select: {
                grossAmount: true,
                advances: true,
                photocopyDeductions: true,
                netAmount: true,
              },
            },
          },
          take: 30,
        }),
        prisma.payslip.findMany({
          orderBy: { id: "desc" },
          include: {
            PayrollRun: { select: { periodStart: true, periodEnd: true, status: true } },
            PayslipBranchLine: {
              include: { Branch: { select: { id: true, name: true } } },
            },
          },
          take: 100,
        }),
        prisma.teacher.findMany({ select: { id: true, name: true } }),
      ]);

      overviewData = rawOverview;
      payrollRuns = rawRuns;
      payslips = rawPayslips;
      teacherList.forEach((tItem) => teacherMap.set(tItem.id, tItem.name));
    } else if (currentTab === "deductions") {
      const [rawPhotocopy, rawAdvances, teacherList, branchList] = await Promise.all([
        prisma.photocopyCharge.findMany({
          orderBy: { date: "desc" },
          include: {
            Branch: { select: { id: true, name: true } },
            Teacher: { select: { id: true, name: true } },
          },
          take: 100,
        }),
        prisma.salaryAdvance.findMany({
          orderBy: { date: "desc" },
          take: 100,
        }),
        prisma.teacher.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
      ]);

      photocopyCharges = rawPhotocopy;
      salaryAdvances = rawAdvances;
      teachers = teacherList;
      branches = branchList;
      teacherList.forEach((tItem) => teacherMap.set(tItem.id, tItem.name));
    } else if (currentTab === "rates") {
      const [teacherList, branchList] = await Promise.all([
        prisma.teacher.findMany({
          include: {
            TeacherBranch: {
              include: { Branch: { select: { id: true, name: true } } },
            },
            TeacherPayRate: {
              orderBy: { effectiveFrom: "desc" },
              take: 1,
            },
          },
          orderBy: { name: "asc" },
        }),
        prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
      ]);

      teachers = teacherList;
      branches = branchList;
    }
  }

  const totalRevenueSum = Number(dashboardData?.summary?.grossRevenue || 0);
  const totalTeacherPayrollSum = overviewData?.totalGrossPayroll
    ? Number(overviewData.totalGrossPayroll)
    : 0;
  const totalAllDecaissed = totalDailyExpensesSum + totalStaffPayrollSum + totalTeacherPayrollSum;
  const netProfitSum = totalRevenueSum - totalAllDecaissed;

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header Card */}
      <Card className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 p-5 border-border/80 shadow-xs bg-surface">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-page-title text-gray-900">
                {t("financeTitle")}
              </h1>
              <Badge variant="danger" size="sm" withDot>
                {t("ownerOnlyBadge")}
              </Badge>
            </div>
            <p className="text-form-helper text-muted mt-0.5">
              {t("financeSubtitle")}
            </p>
          </div>
        </div>

        {/* Primary Section Switcher */}
        <div className="flex items-center bg-surface-muted border border-border p-1 rounded-xl shadow-xs text-xs font-semibold overflow-x-auto scrollbar-none w-full sm:w-auto">
          <Link
            href={`/list/finance?section=revenue`}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg transition-all shrink-0 cursor-pointer ${
              activeSection === "revenue"
                ? "bg-primary text-white shadow-xs"
                : "text-muted hover:text-gray-900 hover:bg-surface"
            }`}
          >
            <TrendingUp className="w-4 h-4 shrink-0" />
            <span>{t("revenueTab")}</span>
          </Link>
          <Link
            href={`/list/finance?section=expenses`}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg transition-all shrink-0 cursor-pointer ${
              activeSection === "expenses"
                ? "bg-primary text-white shadow-xs"
                : "text-muted hover:text-gray-900 hover:bg-surface"
            }`}
          >
            <Receipt className="w-4 h-4 shrink-0" />
            <span>{t("expensesTab")}</span>
          </Link>
          <Link
            href={`/list/finance?section=payroll&tab=runs`}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg transition-all shrink-0 cursor-pointer ${
              activeSection === "payroll"
                ? "bg-primary text-white shadow-xs"
                : "text-muted hover:text-gray-900 hover:bg-surface"
            }`}
          >
            <GraduationCap className="w-4 h-4 shrink-0" />
            <span>{t("payrollTab")}</span>
          </Link>
          <Link
            href={`/list/finance?section=staff`}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg transition-all shrink-0 cursor-pointer ${
              activeSection === "staff"
                ? "bg-primary text-white shadow-xs"
                : "text-muted hover:text-gray-900 hover:bg-surface"
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>{t("staffPayrollTab")}</span>
          </Link>
          <Link
            href={`/list/finance?section=caisseNoire`}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg transition-all shrink-0 cursor-pointer ${
              activeSection === "caisseNoire"
                ? "bg-primary text-white shadow-xs"
                : "text-muted hover:text-gray-900 hover:bg-surface"
            }`}
          >
            <Wallet className="w-4 h-4 shrink-0" />
            <span>{t("caisseNoireTab")}</span>
          </Link>
        </div>
      </Card>

      {/* Top 4 KPI Cards (Bilingual Layout) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Chiffre d'Affaires */}
        <Card className="p-5 border-border/80 shadow-xs bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              {t("turnover")}
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold font-mono text-gray-900 truncate">
              {totalRevenueSum.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")}{" "}
              <span className="text-xs font-normal text-muted">{t("currency")}</span>
            </div>
            <p className="text-form-helper text-muted mt-1">{t("turnoverDesc")}</p>
          </div>
        </Card>

        {/* Card 2: Dépenses Totales */}
        <Card className="p-5 border-border/80 shadow-xs bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              {t("totalExpensesLabel")}
            </span>
            <div className="w-9 h-9 rounded-xl bg-danger-light/50 text-danger flex items-center justify-center">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold font-mono text-danger truncate">
              - {totalAllDecaissed.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")}{" "}
              <span className="text-xs font-normal text-danger-soft">{t("currency")}</span>
            </div>
            <p className="text-form-helper text-muted mt-1">{t("totalExpensesDesc")}</p>
          </div>
        </Card>

        {/* Card 3: Bénéfice Net */}
        <Card className="p-5 border-border/80 shadow-xs bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              {t("netProfit")}
            </span>
            <div className="w-9 h-9 rounded-xl bg-success-light/50 text-success flex items-center justify-center">
              <Coins className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className={`text-2xl font-bold font-mono truncate ${netProfitSum >= 0 ? "text-success-text" : "text-danger"}`}>
              {netProfitSum.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")}{" "}
              <span className="text-xs font-normal text-muted">{t("currency")}</span>
            </div>
            <p className="text-form-helper text-muted mt-1">{t("netProfitDesc")}</p>
          </div>
        </Card>

        {/* Card 4: Caisse Noire */}
        <Card className="p-5 border-border/80 shadow-xs bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              {t("caisseNoireBalance")}
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold font-mono text-gray-900 truncate">
              {caisseNoireData.balance.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")}{" "}
              <span className="text-xs font-normal text-muted">{t("currency")}</span>
            </div>
            <p className="text-form-helper text-muted mt-1">{t("caisseNoireDesc")}</p>
          </div>
        </Card>
      </div>

      {/* SECTION 1: REVENUE DASHBOARD (Zero nested tabs!) */}
      {activeSection === "revenue" && dashboardData && (
        <DailyRevenueDashboard data={dashboardData} />
      )}

      {/* SECTION 2: CONSOLIDATED PAYROLL (Streamlined into 3 clear tabs) */}
      {activeSection === "payroll" && (
        <div className="space-y-6">
          {/* Payroll Sub-tab Navigation: Runs, Deductions, Rates */}
          <div className="flex flex-wrap items-center bg-surface p-1 rounded-xl gap-1 text-xs font-semibold border border-border shadow-xs w-fit">
            <Link
              href={`/list/finance?section=payroll&tab=runs`}
              className={`px-4 py-2 rounded-lg transition-all ${
                currentTab === "runs"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted hover:text-gray-900 hover:bg-surface-muted"
              }`}
            >
              {t("runsAndPayslipsTab")}
            </Link>
            <Link
              href={`/list/finance?section=payroll&tab=deductions`}
              className={`px-4 py-2 rounded-lg transition-all ${
                currentTab === "deductions"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted hover:text-gray-900 hover:bg-surface-muted"
              }`}
            >
              {t("advancesAndDeductions")}
            </Link>
            <Link
              href={`/list/finance?section=payroll&tab=rates`}
              className={`px-4 py-2 rounded-lg transition-all ${
                currentTab === "rates"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted hover:text-gray-900 hover:bg-surface-muted"
              }`}
            >
              {t("teacherPayRates")}
            </Link>
          </div>

          {/* Client Interactive Tab Views */}
          <PayrollClientTabs
            currentTab={currentTab}
            overviewData={overviewData}
            payrollRuns={payrollRuns.map((r) => ({
              id: r.id,
              periodStart: r.periodStart.toISOString(),
              periodEnd: r.periodEnd.toISOString(),
              status: r.status,
              totalGross: r.Payslip.reduce((s: number, p: any) => s + Number(p.grossAmount), 0),
              totalAdvances: r.Payslip.reduce((s: number, p: any) => s + Number(p.advances), 0),
              totalPhotocopy: r.Payslip.reduce((s: number, p: any) => s + Number(p.photocopyDeductions), 0),
              totalNet: r.Payslip.reduce((s: number, p: any) => s + Number(p.netAmount), 0),
              payslipsCount: r.Payslip.length,
            }))}
            payslips={payslips.map((p) => ({
              id: p.id,
              payrollRunId: p.payrollRunId,
              personId: p.personId,
              teacherName: teacherMap.get(p.personId) || p.personId,
              periodStart: p.PayrollRun.periodStart.toISOString(),
              periodEnd: p.PayrollRun.periodEnd.toISOString(),
              status: p.PayrollRun.status,
              sessionsCount: p.sessionsCount || 0,
              grossAmount: Number(p.grossAmount),
              advances: Number(p.advances),
              photocopyDeductions: Number(p.photocopyDeductions),
              netAmount: Number(p.netAmount),
              branchLines: p.PayslipBranchLine.map((bl: any) => ({
                branchId: bl.branchId,
                branchName: bl.Branch.name,
                sessionsCount: bl.sessionsCount,
                amount: Number(bl.amount),
              })),
            }))}
            photocopyCharges={photocopyCharges.map((c) => ({
              id: c.id,
              teacherId: c.teacherId,
              teacherName: c.Teacher.name,
              branchId: c.branchId,
              branchName: c.Branch.name,
              pages: c.pages,
              costAmount: Number(c.costAmount),
              date: c.date.toISOString(),
              recordedBy: c.recordedBy,
            }))}
            salaryAdvances={salaryAdvances.map((a) => ({
              id: a.id,
              personId: a.personId,
              teacherName: teacherMap.get(a.personId) || a.personId,
              amount: Number(a.amount),
              date: a.date.toISOString(),
            }))}
            teachers={teachers.map((tItem) => ({
              id: tItem.id,
              name: tItem.name,
              currentRate: tItem.TeacherPayRate && tItem.TeacherPayRate[0]
                ? {
                    ratePerSession: tItem.TeacherPayRate[0].ratePerSession
                      ? Number(tItem.TeacherPayRate[0].ratePerSession)
                      : null,
                    fixedMonthly: tItem.TeacherPayRate[0].fixedMonthly
                      ? Number(tItem.TeacherPayRate[0].fixedMonthly)
                      : null,
                    effectiveFrom: tItem.TeacherPayRate[0].effectiveFrom.toISOString(),
                  }
                : null,
              branchOverrides: (tItem.TeacherBranch || []).map((tb: any) => ({
                branchId: tb.branchId,
                branchName: tb.Branch.name,
                payRate: tb.payRate ? Number(tb.payRate) : null,
              })),
            }))}
            branches={branches.length > 0 ? branches : allBranchesData}
          />
        </div>
      )}

      {/* SECTION 3: DAILY EXPENSES */}
      {activeSection === "expenses" && (
        <DailyExpensesSection
          expenses={formattedExpenses}
          branches={allBranchesData}
          locale={locale}
        />
      )}

      {/* SECTION 4: CAISSE NOIRE */}
      {activeSection === "caisseNoire" && (
        <CaisseNoireSection
          balance={caisseNoireData.balance}
          totalDeposited={caisseNoireData.totalDeposited}
          totalWithdrawn={caisseNoireData.totalWithdrawn}
          transactions={caisseNoireData.recentTransactions}
          locale={locale}
        />
      )}

      {/* SECTION 5: STAFF PAYROLL */}
      {activeSection === "staff" && (
        <StaffPayrollSection
          staffMembers={formattedStaff}
          payrollLogs={formattedStaffPayrolls}
          branches={allBranchesData}
          locale={locale}
        />
      )}
    </div>
  );
}
