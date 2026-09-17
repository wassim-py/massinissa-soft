import dynamic from "next/dynamic";
import BackButton from "@/components/BackButton";
import prisma from "@/lib/prisma";
import { getAuthSession, getActiveBranchId } from "@/lib/auth";
import { getDailyRevenueDashboardData } from "@/lib/revenue";
import { getOwnerPayrollOverview } from "@/lib/payroll";
import { format } from "date-fns";
import { arDZ } from "date-fns/locale";
import Link from "next/link";
import ExportButton from "@/components/ExportButton";
import Pagination from "@/components/Pagination";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable, Column } from "@/components/ui/DataTable";

const DailyRevenueDashboard = dynamic(() => import("@/components/revenue/DailyRevenueDashboard"), {
  loading: () => <div className="p-8 text-center text-muted animate-pulse">Chargement du tableau de bord...</div>,
});

const PayrollClientTabs = dynamic(() => import("../payroll/PayrollClientTabs"), {
  loading: () => <div className="p-8 text-center text-muted animate-pulse">Chargement de la paie...</div>,
});
import { formatVoucherDisplay } from "@/lib/voucherUtils";
import { getTranslations, getLocale } from "next-intl/server";
import MissingMoneyActions from "@/components/finance/MissingMoneyActions";
import SurplusMoneyActions from "@/components/finance/SurplusMoneyActions";

interface PageProps {
  searchParams: Promise<{
    section?: "revenue" | "payroll";
    tab?: "revenue" | "transactions" | "discrepancies" | "missing" | "surplus" | "overview" | "runs" | "payslips" | "photocopy" | "advances" | "rates";
    dateFrom?: string;
    dateTo?: string;
    branchId?: string;
    periodMode?: "daily" | "weekly" | "monthly";
    classId?: string;
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

  // Active Section: "revenue" (Daily Revenue Dashboard & Refunds) vs "payroll" (Consolidated Payroll & Compensation)
  let activeSection: "revenue" | "payroll" = "revenue";
  if (searchParams.section === "payroll" || searchParams.section === "revenue") {
    activeSection = searchParams.section;
  } else if (
    searchParams.tab === "overview" ||
    searchParams.tab === "runs" ||
    searchParams.tab === "payslips" ||
    searchParams.tab === "photocopy" ||
    searchParams.tab === "advances" ||
    searchParams.tab === "rates"
  ) {
    activeSection = "payroll";
  }

  const currentTab = searchParams.tab || (activeSection === "payroll" ? "overview" : "revenue");

  // Fetch data conditionally based on active section
  let dashboardData: any = null;
  let refunds: any[] = [];
  let refundsCount = 0;
  let classes: any[] = [];
  let missingRecords: any[] = [];
  let surplusRecords: any[] = [];

  let overviewData: any = null;
  let payrollRuns: any[] = [];
  let payslips: any[] = [];
  let teachers: any[] = [];
  let photocopyCharges: any[] = [];
  let salaryAdvances: any[] = [];
  let branches: any[] = [];
  let payrollRunsCount = 0;
  let payslipsCount = 0;
  let salaryAdvancesCount = 0;
  let teachersCount = 0;
  const teacherMap = new Map<string, string>();

  if (activeSection === "revenue") {
    dashboardData = await getDailyRevenueDashboardData({
      branchId: selectedBranchParam,
      dateFrom: searchParams.dateFrom,
      dateTo: searchParams.dateTo,
      periodMode: searchParams.periodMode || "daily",
    });

    if (currentTab === "transactions") {
      const p = searchParams.page ? parseInt(searchParams.page, 10) : 1;
      const startOfRange = new Date(dashboardData.dateFrom + "T00:00:00.000Z");
      const endOfRange = new Date(dashboardData.dateTo + "T23:59:59.999Z");
      const parsedClassId = searchParams.classId ? parseInt(searchParams.classId, 10) : undefined;
      const branchFilter = selectedBranchParam !== "all" ? Number(selectedBranchParam) : undefined;

      const whereClause = {
        refundedAt: { gte: startOfRange, lte: endOfRange },
        ...(branchFilter ? { voucher: { targetBranchId: branchFilter } } : {}),
        ...(parsedClassId ? { voucher: { classId: parsedClassId } } : {}),
      };

      [refunds, refundsCount, classes] = await Promise.all([
        prisma.refund.findMany({
          where: whereClause,
          select: {
            id: true,
            refundedAt: true,
            reason: true,
            refundedBy: true,
            amount: true,
            voucher: {
              select: {
                id: true,
                number: true,
                paymentType: true,
                student: { select: { id: true, name: true } },
                class: { select: { id: true, name: true } },
                series: {
                  select: {
                    id: true,
                    scope: true,
                    level: { select: { id: true, name: true } },
                    issuingBranch: { select: { id: true, name: true } },
                    targetBranch: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
          orderBy: { refundedAt: "desc" },
          take: ITEM_PER_PAGE,
          skip: ITEM_PER_PAGE * (p - 1),
        }),
        prisma.refund.count({ where: whereClause }),
        prisma.class.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ]);
    } else if (currentTab === "discrepancies" || currentTab === "missing" || currentTab === "surplus") {
      const startOfRange = new Date(dashboardData.dateFrom + "T00:00:00.000Z");
      const endOfRange = new Date(dashboardData.dateTo + "T23:59:59.999Z");
      const branchFilter = selectedBranchParam !== "all" ? Number(selectedBranchParam) : undefined;

      [missingRecords, surplusRecords] = await Promise.all([
        prisma.missingMoney.findMany({
          where: {
            date: { gte: startOfRange, lte: endOfRange },
            ...(branchFilter ? { branchId: branchFilter } : {}),
          },
          include: {
            branch: true,
          },
          orderBy: { date: "desc" },
        }),
        prisma.surplusMoney.findMany({
          where: {
            date: { gte: startOfRange, lte: endOfRange },
            ...(branchFilter ? { branchId: branchFilter } : {}),
          },
          include: {
            branch: true,
          },
          orderBy: { date: "desc" },
        }),
      ]);
    }
  } else {
    // Section: Payroll
    const now = new Date();
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));

    const startDate = searchParams.dateFrom ? new Date(searchParams.dateFrom) : firstDay;
    const endDate = searchParams.dateTo ? new Date(searchParams.dateTo) : lastDay;

    [payrollRunsCount, payslipsCount, salaryAdvancesCount, teachersCount] = await Promise.all([
      prisma.payrollRun.count(),
      prisma.payslip.count(),
      prisma.salaryAdvance.count(),
      prisma.teacher.count(),
    ]);

    if (currentTab === "overview") {
      overviewData = await getOwnerPayrollOverview(startDate, endDate);
    } else {
      overviewData = {
        totalRevenue: 0,
        totalGrossPayroll: 0,
        totalAdvances: 0,
        totalPhotocopyDeductions: 0,
        totalNetPayroll: 0,
        operatingMargin: 0,
        branchBreakdown: [],
      };
    }

    if (currentTab === "runs") {
      payrollRuns = await prisma.payrollRun.findMany({
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
      });
    }

    if (currentTab === "payslips") {
      const [rawPayslips, teacherList] = await Promise.all([
        prisma.payslip.findMany({
          orderBy: { id: "desc" },
          include: {
            PayrollRun: { select: { periodStart: true, periodEnd: true, status: true } },
            PayslipBranchLine: {
              include: { Branch: { select: { id: true, name: true } } },
            },
          },
          take: 50,
        }),
        prisma.teacher.findMany({ select: { id: true, name: true } }),
      ]);
      payslips = rawPayslips;
      teacherList.forEach((t) => teacherMap.set(t.id, t.name));
    }

    if (currentTab === "photocopy") {
      [photocopyCharges, branches, teachers] = await Promise.all([
        prisma.photocopyCharge.findMany({
          orderBy: { date: "desc" },
          include: {
            Branch: { select: { id: true, name: true } },
            Teacher: { select: { id: true, name: true } },
          },
          take: 50,
        }),
        prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
        prisma.teacher.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      ]);
    }

    if (currentTab === "advances") {
      const [rawAdvances, teacherList] = await Promise.all([
        prisma.salaryAdvance.findMany({
          orderBy: { date: "desc" },
          take: 50,
        }),
        prisma.teacher.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      ]);
      salaryAdvances = rawAdvances;
      teachers = teacherList;
      teacherList.forEach((t) => teacherMap.set(t.id, t.name));
    }

    if (currentTab === "rates") {
      [teachers, branches] = await Promise.all([
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
    }
  }

  const discrepancies = [
    ...missingRecords.map((m) => ({ ...m, discrepancyType: "MISSING" as const })),
    ...surplusRecords.map((s) => ({ ...s, discrepancyType: "SURPLUS" as const })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
              <Badge variant="primary" size="sm">
                Consolidated Finance & Payroll
              </Badge>
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
        <div className="flex items-center bg-surface-muted border border-border p-1 rounded-xl shadow-xs text-xs font-semibold shrink-0">
          <Link
            href={`/list/finance?section=revenue${selectedBranchParam !== "all" ? `&branchId=${selectedBranchParam}` : ""}${dashboardData?.dateFrom ? `&dateFrom=${dashboardData.dateFrom}` : ""}${dashboardData?.dateTo ? `&dateTo=${dashboardData.dateTo}` : ""}`}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all ${
              activeSection === "revenue"
                ? "bg-primary text-white shadow-xs"
                : "text-muted hover:text-gray-900 hover:bg-surface"
            }`}
          >
            <span>📊 {t("revenueTab")}</span>
            <span className="text-[10px] opacity-80">(Revenue)</span>
          </Link>
          <Link
            href={`/list/finance?section=payroll&tab=overview`}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all ${
              activeSection === "payroll"
                ? "bg-primary text-white shadow-xs"
                : "text-muted hover:text-gray-900 hover:bg-surface"
            }`}
          >
            <span>💼 {t("payrollTab")}</span>
            <span className="text-[10px] opacity-80">(Payroll)</span>
          </Link>
        </div>
      </Card>

      {/* SECTION 1: REVENUE DASHBOARD & REPORTS */}
      {activeSection === "revenue" && dashboardData && (
        <div className="space-y-6">
          {/* Sub-view switcher for Revenue */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center bg-surface border border-border p-1 rounded-xl shadow-xs text-xs font-semibold">
              <Link
                href={`/list/finance?section=revenue&tab=revenue${selectedBranchParam !== "all" ? `&branchId=${selectedBranchParam}` : ""}${dashboardData.dateFrom ? `&dateFrom=${dashboardData.dateFrom}` : ""}${dashboardData.dateTo ? `&dateTo=${dashboardData.dateTo}` : ""}${dashboardData.periodMode ? `&periodMode=${dashboardData.periodMode}` : ""}`}
                className={`px-4 py-2 rounded-lg transition-all ${
                  currentTab === "revenue"
                    ? "bg-primary text-white shadow-xs"
                    : "text-muted hover:text-gray-900 hover:bg-surface-subtle"
                }`}
              >
                {t("dailyRevenueDashboard")}
              </Link>
              <Link
                href={`/list/finance?section=revenue&tab=transactions${selectedBranchParam !== "all" ? `&branchId=${selectedBranchParam}` : ""}${dashboardData.dateFrom ? `&dateFrom=${dashboardData.dateFrom}` : ""}${dashboardData.dateTo ? `&dateTo=${dashboardData.dateTo}` : ""}`}
                className={`px-4 py-2 rounded-lg transition-all ${
                  currentTab === "transactions"
                    ? "bg-primary text-white shadow-xs"
                    : "text-muted hover:text-gray-900 hover:bg-surface-subtle"
                }`}
              >
                {t("refundsRegistry")}
              </Link>
              <Link
                href={`/list/finance?section=revenue&tab=discrepancies${selectedBranchParam !== "all" ? `&branchId=${selectedBranchParam}` : ""}${dashboardData.dateFrom ? `&dateFrom=${dashboardData.dateFrom}` : ""}${dashboardData.dateTo ? `&dateTo=${dashboardData.dateTo}` : ""}`}
                className={`px-4 py-2 rounded-lg transition-all ${
                  currentTab === "discrepancies" || currentTab === "missing" || currentTab === "surplus"
                    ? "bg-primary text-white shadow-xs"
                    : "text-muted hover:text-gray-900 hover:bg-surface-subtle"
                }`}
              >
                {t("discrepanciesTab")}
              </Link>
            </div>
          </div>

          {currentTab === "revenue" ? (
            <DailyRevenueDashboard data={dashboardData} />
          ) : currentTab === "transactions" ? (
            <Card className="border-border/80 shadow-xs bg-surface">
              <CardContent className="p-5 sm:p-6 space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-border/80 gap-4">
                  <div>
                    <h2 className="text-section-title font-bold text-gray-900">
                      {t("refundsRegistryTitle")}
                    </h2>
                    <p className="text-form-helper text-muted mt-0.5">
                      {t("refundsRegistryDesc")}
                    </p>
                  </div>
                  <ExportButton
                    type="financial_report"
                    options={{
                      dateFrom: dashboardData.dateFrom,
                      dateTo: dashboardData.dateTo,
                      classId: searchParams.classId ? parseInt(searchParams.classId, 10) : undefined,
                    }}
                  />
                </div>

                {/* Architecture note banner (§1.2 & §2.3) */}
                <div className="p-4 bg-surface-muted border border-border/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <p className="text-muted leading-relaxed">
                    <strong className="text-gray-900 font-semibold">{t("architectureNoteTitle")}</strong> {t("architectureNoteDesc")}
                  </p>
                  <Link
                    href="/list/payments"
                    className="px-3.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-semibold shrink-0 transition-colors"
                  >
                    {t("groupPaymentTables")}
                  </Link>
                </div>

                {/* Refunds Table */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="danger" size="sm" withDot>
                      {t("studentRefundsBadge", { count: refundsCount })}
                    </Badge>
                  </div>
                  <DataTable
                    columns={[
                      { header: t("refundDateCol"), accessor: "refundedAt" },
                      { header: t("voucherRefCol"), accessor: "voucherId" },
                      { header: t("studentCol"), accessor: "student" },
                      { header: t("groupCol"), accessor: "class" },
                      { header: t("refundReasonCol"), accessor: "reason" },
                      { header: t("refundedByCol"), accessor: "refundedBy" },
                      { header: t("refundAmountCol"), accessor: "amount", align: "end" },
                    ]}
                    data={refunds}
                    renderRow={(r) => (
                      <tr key={r.id} className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body">
                        <td className="p-3.5 text-muted text-xs">
                          {format(new Date(r.refundedAt), "d MMMM yyyy, HH:mm", { locale: locale === "ar" ? arDZ : undefined })}
                        </td>
                        <td className="p-3.5 font-mono text-xs font-bold text-primary">
                          {formatVoucherDisplay(r.voucher)}
                        </td>
                        <td className="p-3.5 font-semibold text-gray-900">
                          {r.voucher?.student?.name}
                        </td>
                        <td className="p-3.5 text-gray-700">
                          {r.voucher?.class?.name || "—"}
                        </td>
                        <td className="p-3.5 text-gray-600 text-xs">
                          {r.reason}
                        </td>
                        <td className="p-3.5 text-muted">{r.refundedBy}</td>
                        <td className="p-3.5 font-bold text-danger text-end font-mono">
                          -{Number(r.amount).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                        </td>
                      </tr>
                    )}
                    emptyTitle={t("emptyRefundsTitle")}
                    emptyDescription={t("emptyRefundsDesc")}
                  />
                  <div className="pt-2">
                    <Pagination count={refundsCount} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* Cash Discrepancies Registry Tab (Missing & Surplus Unified) */
            <Card className="border-border/80 shadow-xs bg-surface">
              <CardContent className="p-5 sm:p-6 space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-border/80 gap-4">
                  <div>
                    <h2 className="text-section-title font-bold text-gray-900">
                      {t("discrepanciesRegistryTitle")}
                    </h2>
                    <p className="text-form-helper text-muted mt-0.5">
                      {t("discrepanciesRegistryDesc")}
                    </p>
                  </div>
                  <Badge variant="primary" size="sm" withDot>
                    {t("discrepanciesBadge", { count: discrepancies.length })}
                  </Badge>
                </div>

                <DataTable
                  columns={[
                    { header: t("discrepancyTypeCol"), accessor: "type" },
                    { header: "Date", accessor: "date" },
                    { header: "Branche", accessor: "branch" },
                    { header: t("discrepancyAmountCol"), accessor: "amount", align: "end" },
                    { header: t("discrepancyReasonCol"), accessor: "reason" },
                    { header: t("discrepancyStatusCol"), accessor: "status", align: "center" },
                    { header: t("discrepancyActionsCol"), accessor: "actions", align: "end" },
                  ]}
                  data={discrepancies}
                  renderRow={(item) => (
                    <tr key={`${item.discrepancyType}-${item.id}`} className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body">
                      <td className="p-3.5">
                        <Badge
                          variant={item.discrepancyType === "MISSING" ? "danger" : "success"}
                          size="sm"
                          withDot
                        >
                          {item.discrepancyType === "MISSING" ? "Manque" : "Surplus"}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-muted text-xs">
                        {format(new Date(item.date), "d MMMM yyyy", { locale: locale === "ar" ? arDZ : undefined })}
                      </td>
                      <td className="p-3.5 font-semibold text-gray-900">
                        {item.branch?.name}
                      </td>
                      <td className={`p-3.5 font-mono font-bold text-end ${item.discrepancyType === "MISSING" ? "text-danger" : "text-success-text"}`}>
                        {item.discrepancyType === "MISSING" ? "-" : "+"}
                        {Number(item.amount).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                      </td>
                      <td className="p-3.5 text-gray-800 font-medium">
                        {item.reason || "—"}
                      </td>
                      <td className="p-3.5 text-center">
                        <Badge
                          variant={
                            item.status === "CONFIRMED"
                              ? item.discrepancyType === "MISSING"
                                ? "danger"
                                : "success"
                              : item.status === "PENDING"
                              ? "warning"
                              : "secondary"
                          }
                          size="sm"
                          withDot
                        >
                          {item.status === "CONFIRMED"
                            ? item.discrepancyType === "MISSING"
                              ? "Confirmé (déduit)"
                              : "Confirmé (ajouté)"
                            : item.status === "PENDING"
                            ? "En attente"
                            : "Rejeté"}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-end">
                        {item.discrepancyType === "MISSING" ? (
                          <MissingMoneyActions id={item.id} status={item.status} />
                        ) : (
                          <SurplusMoneyActions id={item.id} status={item.status} />
                        )}
                      </td>
                    </tr>
                  )}
                  emptyTitle={t("emptyDiscrepanciesTitle")}
                  emptyDescription={t("emptyDiscrepanciesDesc")}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* SECTION 2: CONSOLIDATED PAYROLL */}
      {activeSection === "payroll" && overviewData && (
        <div className="space-y-6">
          {/* Payroll Sub-tab Navigation */}
          <div className="flex flex-wrap items-center bg-surface p-1 rounded-xl gap-1 text-xs font-semibold border border-border shadow-xs">
            <Link
              href={`/list/finance?section=payroll&tab=overview`}
              className={`px-3.5 py-2 rounded-lg transition-all ${
                currentTab === "overview"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted hover:text-gray-900 hover:bg-surface-muted"
              }`}
            >
              {t("ownerFinancialOverview")}
            </Link>
            <Link
              href={`/list/finance?section=payroll&tab=runs`}
              className={`px-3.5 py-2 rounded-lg transition-all ${
                currentTab === "runs"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted hover:text-gray-900 hover:bg-surface-muted"
              }`}
            >
              {t("payrollRunsCount", { count: payrollRunsCount })}
            </Link>
            <Link
              href={`/list/finance?section=payroll&tab=payslips`}
              className={`px-3.5 py-2 rounded-lg transition-all ${
                currentTab === "payslips"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted hover:text-gray-900 hover:bg-surface-muted"
              }`}
            >
              {t("payslipsCount", { count: payslipsCount })}
            </Link>
            <Link
              href={`/list/finance?section=payroll&tab=photocopy`}
              className={`px-3.5 py-2 rounded-lg transition-all ${
                currentTab === "photocopy"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted hover:text-gray-900 hover:bg-surface-muted"
              }`}
            >
              {t("photocopyCosts")}
            </Link>
            <Link
              href={`/list/finance?section=payroll&tab=advances`}
              className={`px-3.5 py-2 rounded-lg transition-all ${
                currentTab === "advances"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted hover:text-gray-900 hover:bg-surface-muted"
              }`}
            >
              {t("salaryAdvances")}
            </Link>
            <Link
              href={`/list/finance?section=payroll&tab=rates`}
              className={`px-3.5 py-2 rounded-lg transition-all ${
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
            teachers={teachers.map((t) => ({
              id: t.id,
              name: t.name,
              currentRate: t.TeacherPayRate[0]
                ? {
                    ratePerSession: t.TeacherPayRate[0].ratePerSession
                      ? Number(t.TeacherPayRate[0].ratePerSession)
                      : null,
                    fixedMonthly: t.TeacherPayRate[0].fixedMonthly
                      ? Number(t.TeacherPayRate[0].fixedMonthly)
                      : null,
                    effectiveFrom: t.TeacherPayRate[0].effectiveFrom.toISOString(),
                  }
                : null,
              branchOverrides: t.TeacherBranch.map((tb: any) => ({
                branchId: tb.branchId,
                branchName: tb.Branch.name,
                payRate: tb.payRate ? Number(tb.payRate) : null,
              })),
            }))}
            branches={branches}
          />
        </div>
      )}
    </div>
  );
}
