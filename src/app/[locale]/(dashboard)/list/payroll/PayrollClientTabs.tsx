"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  generatePayrollRunAction,
  setPayrollRunStatusAction,
  deletePayrollRunAction,
  recordPhotocopyChargeAction,
  updatePhotocopyChargeAction,
  deletePhotocopyChargeAction,
  recordSalaryAdvanceAction,
  updateSalaryAdvanceAction,
  deleteSalaryAdvanceAction,
  saveTeacherPayRateAction,
} from "@/lib/actions";
import PrintPayslipButton from "@/components/PrintPayslipButton";
import PrintSchoolShareButton from "@/components/PrintSchoolShareButton";
import PrintRealNetButton from "@/components/PrintRealNetButton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select } from "@/components/ui/FormField";
import { DataTable } from "@/components/ui/DataTable";
import { useTranslations, useLocale } from "next-intl";
import {
  Info,
  Trash2,
  Edit2,
  AlertTriangle,
  ArrowDownLeft,
  Receipt,
  Loader2,
  X,
  Building2,
  Users,
  TrendingUp,
} from "lucide-react";

interface Props {
  currentTab: string;
  financialReport?: {
    periodStart: string | Date;
    periodEnd: string | Date;
    payrollRunId?: number;
    teachersPayroll: {
      totalSessions: number;
      totalGross: number;
      totalAdvances: number;
      totalPhotocopyDeductions: number;
      totalNet: number;
      items: Array<{
        payslipId?: number;
        teacherId: string;
        teacherName: string;
        phone?: string | null;
        sessionsCount: number;
        grossAmount: number;
        advances: number;
        photocopyDeductions: number;
        netAmount: number;
        branchLines: Array<{
          branchId: number;
          branchName: string;
          sessionsCount: number;
          amount: number;
        }>;
      }>;
    };
    schoolSharePayroll: {
      totalSessions: number;
      totalTuitionGross: number;
      totalTeacherGross: number;
      totalSchoolGross: number;
      totalPhotocopyRecovered: number;
      totalSchoolNet: number;
      items: Array<{
        payslipId?: number;
        teacherId: string;
        teacherName: string;
        phone?: string | null;
        sessionsCount: number;
        totalTuitionGross: number;
        teacherCut: number;
        schoolCut: number;
        photocopyRecovered: number;
        netSchoolCut: number;
        branchLines: Array<{
          branchId: number;
          branchName: string;
          sessionsCount: number;
          tuitionAmount?: number;
          teacherAmount?: number;
          schoolAmount: number;
        }>;
      }>;
    };
    realNetPayroll: {
      totalRevenue: number;
      totalOutcomes: number;
      totalTeacherPayroll: number;
      totalStaffPayroll: number;
      realNet: number;
      revenueBreakdown: Array<{
        branchId: number;
        branchName: string;
        amount: number;
      }>;
      outcomesByCategory: Array<{
        category: string;
        amount: number;
        count: number;
      }>;
      outcomesBreakdown: Array<{
        id: number;
        branchName: string;
        amount: number;
        category: string;
        description: string;
        date: string;
      }>;
      staffPayrollBreakdown: Array<{
        id: number;
        staffName: string;
        roleTitle: string;
        branchName: string;
        amount: number;
        bonus: number;
        total: number;
      }>;
      branchBreakdown: Array<{
        branchId: number;
        branchName: string;
        revenue: number;
        outcomes: number;
        teacherPayroll: number;
        staffPayroll: number;
        realNet: number;
      }>;
    };
  } | null;
  overviewData: {
    totalRevenue: number;
    totalGrossPayroll: number;
    totalAdvances: number;
    totalPhotocopyDeductions: number;
    totalNetPayroll: number;
    operatingMargin: number;
    branchBreakdown: Array<{
      branchId: number;
      branchName: string;
      revenue: number;
      payrollCost: number;
      margin: number;
    }>;
  };
  payrollRuns: Array<{
    id: number;
    periodStart: string;
    periodEnd: string;
    status: string;
    totalGross: number;
    totalAdvances: number;
    totalPhotocopy: number;
    totalNet: number;
    payslipsCount: number;
    schoolShareNet?: number | null;
    realNet?: number | null;
  }>;
  payslips: Array<{
    id: number;
    payrollRunId: number;
    personId: string;
    teacherName: string;
    periodStart: string;
    periodEnd: string;
    status: string;
    sessionsCount: number;
    grossAmount: number;
    advances: number;
    photocopyDeductions: number;
    netAmount: number;
    branchLines: Array<{
      branchId: number;
      branchName: string;
      sessionsCount: number;
      amount: number;
    }>;
  }>;
  photocopyCharges: Array<{
    id: number;
    teacherId: string;
    teacherName: string;
    branchId: number;
    branchName: string;
    pages: number;
    costAmount: number;
    date: string;
    recordedBy: string;
  }>;
  salaryAdvances: Array<{
    id: number;
    personId: string;
    teacherName: string;
    amount: number;
    date: string;
  }>;
  teachers: Array<{
    id: string;
    name: string;
    photocopyRatePerPage?: number | null;
    currentRate: {
      ratePerSession: number | null;
      fixedMonthly: number | null;
      effectiveFrom: string;
    } | null;
    branchOverrides: Array<{
      branchId: number;
      branchName: string;
      payRate: number | null;
    }>;
  }>;
  branches: Array<{
    id: number;
    name: string;
  }>;
}

export default function PayrollClientTabs({
  currentTab,
  overviewData,
  financialReport,
  payrollRuns,
  payslips,
  photocopyCharges,
  salaryAdvances,
  teachers,
  branches,
}: Props) {
  const t = useTranslations("finance");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [payrollViewMode, setPayrollViewMode] = useState<"teachers" | "school_share" | "real_net">("teachers");

  // Tab mapping: 3 clear views
  const isRunsTab =
    currentTab === "runs" ||
    currentTab === "overview" ||
    currentTab === "payslips" ||
    !currentTab;
  const isDeductionsTab =
    currentTab === "deductions" ||
    currentTab === "advances" ||
    currentTab === "photocopy";
  const isRatesTab = currentTab === "rates";

  // Sub-toggle for Deductions (Advances vs Photocopy)
  const [deductionSubTab, setDeductionSubTab] = useState<"advances" | "photocopy">(
    currentTab === "photocopy" ? "photocopy" : "advances"
  );

  // Form states
  // 1. Generate Run form
  const [periodStart, setPeriodStart] = useState("2026-09-01");
  const [periodEnd, setPeriodEnd] = useState("2026-09-30");

  // 2. Photocopy charge form
  const [pcTeacherId, setPcTeacherId] = useState(teachers[0]?.id || "");
  const [pcBranchId, setPcBranchId] = useState(branches[0]?.id || 1);
  const [pcPages, setPcPages] = useState(20);
  const initialSelectedTeacher = teachers.find((t) => t.id === (teachers[0]?.id || ""));
  const initialRate = initialSelectedTeacher?.photocopyRatePerPage != null
    ? Number(initialSelectedTeacher.photocopyRatePerPage)
    : 3.5;
  const [pcRatePerPage, setPcRatePerPage] = useState(initialRate);
  const [pcCostAmount, setPcCostAmount] = useState(20 * initialRate);
  const [pcDate, setPcDate] = useState(new Date().toISOString().split("T")[0]);

  // 3. Salary advance form
  const [saTeacherId, setSaTeacherId] = useState(teachers[0]?.id || "");
  const [saAmount, setSaAmount] = useState(2000);
  const [saDate, setSaDate] = useState(new Date().toISOString().split("T")[0]);

  // 4. Teacher Rate form
  const [rateTeacherId, setRateTeacherId] = useState(teachers[0]?.id || "");
  const [ratePerSession, setRatePerSession] = useState<number | "">(1000);
  const [fixedMonthly, setFixedMonthly] = useState<number | "">("");
  const [branchRateOverrides, setBranchRateOverrides] = useState<Record<number, string>>({});

  // Formatters
  const formatDZD = (num: number) =>
    Number(num || 0).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ") +
    (locale === "ar" ? " دج" : " DZD");

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  };

  // Handlers
  const handleGenerateRun = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackMessage(null);
    startTransition(async () => {
      const res = await generatePayrollRunAction({ periodStart, periodEnd });
      if (res.success) {
        setFeedbackMessage({ text: res.message, isError: false });
      } else {
        setFeedbackMessage({ text: res.message, isError: true });
      }
    });
  };

  const handleUpdateStatus = (runId: number, status: "DRAFT" | "VALIDATED" | "PAID") => {
    setFeedbackMessage(null);
    startTransition(async () => {
      const res = await setPayrollRunStatusAction({ payrollRunId: runId, status });
      if (res.success) {
        setFeedbackMessage({ text: res.message, isError: false });
      } else {
        setFeedbackMessage({ text: res.message, isError: true });
      }
    });
  };

  const handleDeleteRun = (runId: number) => {
    const msg =
      locale === "ar"
        ? "هل أنت متأكد من رغبتك في إلغاء وحذف دورة الرواتب هذه؟ سيتم حذف جميع كشوف الرواتب المرتبطة بها وتراجع القيود المالية."
        : "Êtes-vous sûr de vouloir annuler et supprimer ce cycle de paie ? Toutes les fiches de paie générées seront supprimées.";
    if (!window.confirm(msg)) return;

    setFeedbackMessage(null);
    startTransition(async () => {
      const res = await deletePayrollRunAction(runId);
      if (res.success) {
        setFeedbackMessage({ text: res.message, isError: false });
      } else {
        setFeedbackMessage({ text: res.message, isError: true });
      }
    });
  };

  const handleCreatePhotocopyCharge = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackMessage(null);
    startTransition(async () => {
      const res = await recordPhotocopyChargeAction({
        teacherId: pcTeacherId,
        branchId: Number(pcBranchId),
        pages: Number(pcPages),
        costAmount: Number(pcCostAmount),
        date: pcDate,
      });
      if (res.success) {
        setFeedbackMessage({ text: res.message, isError: false });
      } else {
        setFeedbackMessage({ text: res.message, isError: true });
      }
    });
  };

  const handleCreateSalaryAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackMessage(null);
    startTransition(async () => {
      const res = await recordSalaryAdvanceAction({
        personId: saTeacherId,
        amount: Number(saAmount),
        date: saDate,
      });
      if (res.success) {
        setFeedbackMessage({ text: res.message, isError: false });
      } else {
        setFeedbackMessage({ text: res.message, isError: true });
      }
    });
  };

  const handleSaveRates = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackMessage(null);
    startTransition(async () => {
      const branchRates = branches.map((b) => ({
        branchId: b.id,
        payRate: branchRateOverrides[b.id] ? Number(branchRateOverrides[b.id]) : null,
      }));

      const res = await saveTeacherPayRateAction({
        teacherId: rateTeacherId,
        ratePerSession: ratePerSession !== "" ? Number(ratePerSession) : null,
        fixedMonthly: fixedMonthly !== "" ? Number(fixedMonthly) : null,
        branchRates,
      });

      if (res.success) {
        setFeedbackMessage({ text: res.message, isError: false });
      } else {
        setFeedbackMessage({ text: res.message, isError: true });
      }
    });
  };

  // Salary Advance Edit & Delete states & handlers
  const [editingAdvance, setEditingAdvance] = useState<{
    id: number;
    personId: string;
    amount: number;
    date: string;
  } | null>(null);
  const [advanceToDelete, setAdvanceToDelete] = useState<{
    id: number;
    teacherName: string;
    amount: number;
  } | null>(null);

  const handleUpdateSalaryAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdvance) return;
    setFeedbackMessage(null);
    startTransition(async () => {
      const res = await updateSalaryAdvanceAction(editingAdvance.id, {
        personId: editingAdvance.personId,
        amount: Number(editingAdvance.amount),
        date: editingAdvance.date,
      });
      if (res.success) {
        setFeedbackMessage({ text: res.message, isError: false });
        setEditingAdvance(null);
      } else {
        setFeedbackMessage({ text: res.message, isError: true });
      }
    });
  };

  const handleDeleteSalaryAdvance = () => {
    if (!advanceToDelete) return;
    setFeedbackMessage(null);
    startTransition(async () => {
      const res = await deleteSalaryAdvanceAction(advanceToDelete.id);
      if (res.success) {
        setFeedbackMessage({ text: res.message, isError: false });
        setAdvanceToDelete(null);
      } else {
        setFeedbackMessage({ text: res.message, isError: true });
      }
    });
  };

  // Photocopy Charge Edit & Delete states & handlers
  const [editingPhotocopy, setEditingPhotocopy] = useState<{
    id: number;
    teacherId: string;
    branchId: number;
    pages: number;
    costAmount: number;
    date: string;
  } | null>(null);
  const [photocopyToDelete, setPhotocopyToDelete] = useState<{
    id: number;
    teacherName: string;
    costAmount: number;
  } | null>(null);

  const handleUpdatePhotocopyCharge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPhotocopy) return;
    setFeedbackMessage(null);
    startTransition(async () => {
      const res = await updatePhotocopyChargeAction(editingPhotocopy.id, {
        teacherId: editingPhotocopy.teacherId,
        branchId: Number(editingPhotocopy.branchId),
        pages: Number(editingPhotocopy.pages),
        costAmount: Number(editingPhotocopy.costAmount),
        date: editingPhotocopy.date,
      });
      if (res.success) {
        setFeedbackMessage({ text: res.message, isError: false });
        setEditingPhotocopy(null);
      } else {
        setFeedbackMessage({ text: res.message, isError: true });
      }
    });
  };

  const handleDeletePhotocopyCharge = () => {
    if (!photocopyToDelete) return;
    setFeedbackMessage(null);
    startTransition(async () => {
      const res = await deletePhotocopyChargeAction(photocopyToDelete.id);
      if (res.success) {
        setFeedbackMessage({ text: res.message, isError: false });
        setPhotocopyToDelete(null);
      } else {
        setFeedbackMessage({ text: res.message, isError: true });
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Toast Feedback */}
      {feedbackMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold border flex items-center justify-between shadow-xs transition-all ${
            feedbackMessage.isError
              ? "bg-danger-light text-danger-text border-danger-soft"
              : "bg-success-light text-success-text border-success-soft"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                feedbackMessage.isError ? "bg-danger" : "bg-success"
              }`}
            />
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-xs font-bold hover:underline cursor-pointer px-2 py-0.5"
          >
            {t("close")}
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 1: CYCLES DE PAIE & FICHES DE PAIE CONSOLIDÉES                       */}
      {/* ========================================================================= */}
      {isRunsTab && (
        <div className="flex flex-col gap-6">
          {/* Card 1: Generate Run Form */}
          <Card className="border-border shadow-xs bg-surface">
            <CardHeader className="p-5 border-b border-border">
              <CardTitle className="text-section-title font-bold text-gray-900">
                {t("generateRunFormTitle")}
              </CardTitle>
              <CardDescription className="text-form-helper text-muted">
                {t("generateRunFormDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={handleGenerateRun} className="flex flex-wrap items-end gap-4">
                <div className="w-full sm:w-auto min-w-[200px]">
                  <FormField label={t("periodStartLabel")}>
                    <Input
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      required
                      className="font-mono text-xs"
                    />
                  </FormField>
                </div>

                <div className="w-full sm:w-auto min-w-[200px]">
                  <FormField label={t("periodEndLabel")}>
                    <Input
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      required
                      className="font-mono text-xs"
                    />
                  </FormField>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isPending}
                  isLoading={isPending}
                  className="h-[38px]"
                >
                  {isPending ? t("generating") : t("calculateAndGenerateRunBtn")}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Card 2: Recorded Payroll Runs Table */}
          <Card className="border-border shadow-xs bg-surface">
            <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-section-title font-bold text-gray-900">
                  {t("recordedPayrollRunsTitle")}
                </CardTitle>
                <CardDescription className="text-form-helper text-muted">
                  {payrollRuns.length} {locale === "ar" ? "دورات مسجلة" : "cycle(s) enregistré(s)"}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <DataTable
                columns={[
                  { header: t("runNumberCol"), accessor: "id" },
                  { header: t("periodCol"), accessor: "period" },
                  { header: t("statusCol"), accessor: "status", align: "center" },
                  { header: t("teachersCountCol"), accessor: "payslipsCount", align: "center" },
                  { header: t("grossAmountCol"), accessor: "totalGross", align: "end" },
                  { header: t("advancesCol"), accessor: "totalAdvances", align: "end" },
                  { header: t("photocopyCol"), accessor: "totalPhotocopy", align: "end" },
                  { header: t("netDueCol"), accessor: "totalNet", align: "end" },
                  { header: t("schoolShareNetCol"), accessor: "schoolShareNet", align: "end" },
                  { header: t("realNetCol"), accessor: "realNet", align: "end" },
                  { header: t("actions"), accessor: "actions", align: "center" },
                ]}
                data={payrollRuns}
                renderRow={(r) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body">
                    <td className="p-3.5 font-mono font-bold">#{r.id}</td>
                    <td className="p-3.5 font-semibold text-gray-900">
                      {t("periodFromTo", {
                        start: formatDate(r.periodStart),
                        end: formatDate(r.periodEnd),
                      })}
                    </td>
                    <td className="p-3.5 text-center">
                      <Badge
                        variant={
                          r.status === "PAID"
                            ? "success"
                            : r.status === "VALIDATED"
                            ? "primary"
                            : "warning"
                        }
                        size="sm"
                        withDot
                      >
                        {r.status === "PAID"
                          ? t("statusPaidLabel")
                          : r.status === "VALIDATED"
                          ? t("statusValidatedLabel")
                          : t("statusDraftLabel")}
                      </Badge>
                    </td>
                    <td className="p-3.5 text-center font-mono">
                      {r.payslipsCount} {locale === "ar" ? "أستاذ" : "enseignant(s)"}
                    </td>
                    <td className="p-3.5 text-end font-mono font-bold text-gray-900">{formatDZD(r.totalGross)}</td>
                    <td className="p-3.5 text-end font-mono text-danger font-semibold">- {formatDZD(r.totalAdvances)}</td>
                    <td className="p-3.5 text-end font-mono text-warning-text font-semibold">- {formatDZD(r.totalPhotocopy)}</td>
                    <td className="p-3.5 text-end font-mono font-black text-primary text-sm">{formatDZD(r.totalNet)}</td>
                    <td className="p-3.5 text-end font-mono font-bold text-emerald-700 text-sm">
                      {r.schoolShareNet != null ? formatDZD(r.schoolShareNet) : "—"}
                    </td>
                    <td
                      className={`p-3.5 text-end font-mono font-black text-sm ${
                        r.realNet != null
                          ? r.realNet >= 0
                            ? "text-emerald-700"
                            : "text-rose-600"
                          : "text-gray-400"
                      }`}
                    >
                      {r.realNet != null ? formatDZD(r.realNet) : "—"}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {r.status === "DRAFT" && (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleUpdateStatus(r.id, "VALIDATED")}
                          >
                            {t("confirmRunBtn")}
                          </Button>
                        )}
                        {r.status === "VALIDATED" && (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            disabled={isPending}
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => handleUpdateStatus(r.id, "PAID")}
                          >
                            {t("disbursePayrollBtn")}
                          </Button>
                        )}
                        {r.status === "PAID" && (
                          <Badge variant="neutral" size="sm">
                            {t("disbursedInCashbox")}
                          </Badge>
                        )}
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleDeleteRun(r.id)}
                          title={t("undoRunBtn")}
                          className="!px-2.5"
                        >
                          <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
                emptyTitle={t("noRunsYetTitle")}
                emptyDescription={t("noRunsYetDesc")}
              />
            </CardContent>
          </Card>

          {/* Card 3: Unified 3-in-1 Generated Payroll Views */}
          <Card className="border-border shadow-xs bg-surface">
            <CardHeader className="p-5 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-section-title font-bold text-gray-900 flex items-center gap-2">
                  {payrollViewMode === "teachers" && (
                    <>
                      <Users className="w-5 h-5 text-primary" />
                      <span>{t("consolidatedPayslipsTitle")}</span>
                    </>
                  )}
                  {payrollViewMode === "school_share" && (
                    <>
                      <Building2 className="w-5 h-5 text-emerald-700" />
                      <span>{t("schoolSharePayrollTitle")}</span>
                    </>
                  )}
                  {payrollViewMode === "real_net" && (
                    <>
                      <TrendingUp className="w-5 h-5 text-blue-900" />
                      <span>{t("realNetPayrollTitle")}</span>
                    </>
                  )}
                </CardTitle>
                <CardDescription className="text-form-helper text-muted">
                  {payrollViewMode === "teachers" && t("consolidatedPayslipsDesc")}
                  {payrollViewMode === "school_share" && t("schoolSharePayrollDesc")}
                  {payrollViewMode === "real_net" && t("realNetPayrollDesc")}
                </CardDescription>
              </div>

              {/* 3-View Segmented Toggle */}
              <div className="flex items-center p-1 bg-surface-subtle border border-border rounded-xl shadow-xs gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPayrollViewMode("teachers")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    payrollViewMode === "teachers"
                      ? "bg-white text-gray-900 shadow-xs border border-border"
                      : "text-muted hover:text-gray-900"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{t("teachersPayrollTab")}</span>
                  <Badge variant="primary" size="sm" className="ml-1">
                    {payslips.length}
                  </Badge>
                </button>

                <button
                  type="button"
                  onClick={() => setPayrollViewMode("school_share")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    payrollViewMode === "school_share"
                      ? "bg-white text-emerald-800 shadow-xs border border-border"
                      : "text-muted hover:text-emerald-800"
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{t("schoolSharePayrollTab")}</span>
                  {financialReport?.schoolSharePayroll?.items && (
                    <Badge variant="success" size="sm" className="ml-1">
                      {financialReport.schoolSharePayroll.items.length}
                    </Badge>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setPayrollViewMode("real_net")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    payrollViewMode === "real_net"
                      ? "bg-white text-blue-950 shadow-xs border border-border"
                      : "text-muted hover:text-blue-950"
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>{t("realNetPayrollTab")}</span>
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              {/* VIEW 1: TEACHERS PAYROLL */}
              {payrollViewMode === "teachers" && (
                <DataTable
                  columns={[
                    { header: t("payslipIdCol"), accessor: "id" },
                    { header: t("teacher"), accessor: "teacherName" },
                    { header: t("periodCol"), accessor: "period" },
                    { header: t("totalSessionsCol"), accessor: "sessionsCount", align: "center" },
                    { header: t("branchesDetailCol"), accessor: "branches" },
                    { header: t("grossAmountCol"), accessor: "grossAmount", align: "end" },
                    { header: t("advancesCol"), accessor: "advances", align: "end" },
                    { header: t("photocopyCol"), accessor: "photocopy", align: "end" },
                    { header: t("netDueCol"), accessor: "netAmount", align: "end" },
                    { header: t("printCol"), accessor: "actions", align: "center" },
                  ]}
                  data={payslips}
                  renderRow={(p) => (
                    <tr key={p.id} className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body">
                      <td className="p-3.5 font-mono font-bold">#{p.id}</td>
                      <td className="p-3.5 font-bold text-gray-900">{p.teacherName}</td>
                      <td className="p-3.5 text-muted text-xs">
                        {formatDate(p.periodStart)} → {formatDate(p.periodEnd)}
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold">{p.sessionsCount}</td>
                      <td className="p-3.5">
                        <div className="flex flex-col gap-0.5">
                          {p.branchLines.map((bl) => (
                            <span key={bl.branchId} className="text-xs text-muted">
                              • <span className="font-semibold text-gray-800">{bl.branchName}</span>: {bl.sessionsCount} {locale === "ar" ? "حصة" : "séance(s)"} ({formatDZD(bl.amount)})
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3.5 text-end font-mono font-bold text-gray-800">{formatDZD(p.grossAmount)}</td>
                      <td className="p-3.5 text-end font-mono text-danger font-semibold">- {formatDZD(p.advances)}</td>
                      <td className="p-3.5 text-end font-mono text-warning-text font-semibold">- {formatDZD(p.photocopyDeductions)}</td>
                      <td className="p-3.5 text-end font-mono font-black text-primary text-sm">{formatDZD(p.netAmount)}</td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/list/finance/payslips/${p.id}?view=teacher`}
                            className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors shadow-xs"
                          >
                            {t("previewBtn")}
                          </Link>
                          <PrintPayslipButton
                            label={t("printBtn")}
                            className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-900 text-white transition-colors shadow-xs"
                            data={{
                              id: p.id,
                              periodStart: p.periodStart,
                              periodEnd: p.periodEnd,
                              status: p.status,
                              teacher: { id: p.personId, name: p.teacherName },
                              sessionsCount: p.sessionsCount,
                              grossAmount: p.grossAmount,
                              advances: p.advances,
                              photocopyDeductions: p.photocopyDeductions,
                              netAmount: p.netAmount,
                              branchLines: p.branchLines,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                  emptyTitle={t("noPayslipsYetTitle")}
                  emptyDescription={t("noPayslipsYetDesc")}
                />
              )}

              {/* VIEW 2: SCHOOL SHARE PAYROLL */}
              {payrollViewMode === "school_share" && (
                <div className="flex flex-col gap-6">
                  {/* Summary Header & School-Wide Print Action */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-emerald-50/50 border border-emerald-100">
                    <div className="text-xs text-emerald-950">
                      <span className="font-bold">{t("schoolSharePayrollTitle")}</span>
                      <p className="text-muted mt-0.5">{t("schoolSharePayrollDesc")}</p>
                    </div>

                    {financialReport?.schoolSharePayroll && (
                      <PrintSchoolShareButton
                        data={{
                          periodStart: financialReport.periodStart,
                          periodEnd: financialReport.periodEnd,
                          sessionsCount: financialReport.schoolSharePayroll.totalSessions,
                          totalTuitionGross: financialReport.schoolSharePayroll.totalTuitionGross,
                          teacherGross: financialReport.schoolSharePayroll.totalTeacherGross,
                          schoolGross: financialReport.schoolSharePayroll.totalSchoolGross,
                          photocopyRecovered: financialReport.schoolSharePayroll.totalPhotocopyRecovered,
                          schoolNet: financialReport.schoolSharePayroll.totalSchoolNet,
                          branchLines: [],
                          teacherSummaryList: financialReport.schoolSharePayroll.items,
                        }}
                        label={t("printSchoolShareSummaryBtn")}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-2 shadow-xs transition-colors shrink-0"
                      />
                    )}
                  </div>

                  {/* 6 Metric KPI Cards */}
                  {financialReport?.schoolSharePayroll && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      <div className="p-3 rounded-xl bg-surface-subtle border border-border">
                        <span className="text-[11px] text-muted font-semibold block">{t("totalSessionsCol")}</span>
                        <span className="text-base font-black font-mono text-gray-900 mt-1 block">
                          {financialReport.schoolSharePayroll.totalSessions}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-surface-subtle border border-border">
                        <span className="text-[11px] text-muted font-semibold block">{t("totalTuitionLabel")}</span>
                        <span className="text-base font-black font-mono text-gray-900 mt-1 block">
                          {formatDZD(financialReport.schoolSharePayroll.totalTuitionGross)}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-surface-subtle border border-border">
                        <span className="text-[11px] text-muted font-semibold block">{t("teacherGrossLabel")}</span>
                        <span className="text-base font-black font-mono text-rose-600 mt-1 block">
                          {formatDZD(financialReport.schoolSharePayroll.totalTeacherGross)}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-surface-subtle border border-border">
                        <span className="text-[11px] text-muted font-semibold block">{t("schoolCutLabel")}</span>
                        <span className="text-base font-black font-mono text-emerald-800 mt-1 block">
                          {formatDZD(financialReport.schoolSharePayroll.totalSchoolGross)}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-surface-subtle border border-border">
                        <span className="text-[11px] text-muted font-semibold block">{t("photocopyRecoveredLabel")}</span>
                        <span className="text-base font-black font-mono text-amber-700 mt-1 block">
                          + {formatDZD(financialReport.schoolSharePayroll.totalPhotocopyRecovered)}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 shadow-xs">
                        <span className="text-[11px] text-emerald-900 font-bold block">{t("netSchoolCutLabel")}</span>
                        <span className="text-base font-black font-mono text-emerald-700 mt-1 block">
                          {formatDZD(financialReport.schoolSharePayroll.totalSchoolNet)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* School Share Table per Teacher */}
                  <DataTable
                    columns={[
                      { header: t("teacher"), accessor: "teacherName" },
                      { header: t("totalSessionsCol"), accessor: "sessionsCount", align: "center" },
                      { header: t("totalTuitionLabel"), accessor: "totalTuitionGross", align: "end" },
                      { header: t("teacherGrossLabel"), accessor: "teacherCut", align: "end" },
                      { header: t("schoolCutLabel"), accessor: "schoolCut", align: "end" },
                      { header: t("photocopyRecoveredLabel"), accessor: "photocopyRecovered", align: "end" },
                      { header: t("netSchoolCutLabel"), accessor: "netSchoolCut", align: "end" },
                      { header: t("branchesDetailCol"), accessor: "branchLines" },
                      { header: t("actions"), accessor: "actions", align: "center" },
                    ]}
                    data={financialReport?.schoolSharePayroll?.items || []}
                    renderRow={(item) => (
                      <tr key={item.teacherId} className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body">
                        <td className="p-3.5">
                          <span className="font-bold text-gray-900 block">{item.teacherName}</span>
                          {item.phone && <span className="text-muted text-[11px] font-mono">{item.phone}</span>}
                        </td>
                        <td className="p-3.5 text-center font-mono font-bold">{item.sessionsCount}</td>
                        <td className="p-3.5 text-end font-mono font-bold text-gray-800">{formatDZD(item.totalTuitionGross)}</td>
                        <td className="p-3.5 text-end font-mono text-rose-600 font-semibold">{formatDZD(item.teacherCut)}</td>
                        <td className="p-3.5 text-end font-mono text-emerald-800 font-semibold">{formatDZD(item.schoolCut)}</td>
                        <td className="p-3.5 text-end font-mono text-amber-700 font-semibold">+ {formatDZD(item.photocopyRecovered)}</td>
                        <td className="p-3.5 text-end font-mono font-black text-emerald-700 text-sm">{formatDZD(item.netSchoolCut)}</td>
                        <td className="p-3.5">
                          <div className="flex flex-col gap-0.5">
                            {item.branchLines.map((bl) => (
                              <span key={bl.branchId} className="text-xs text-muted">
                                • <span className="font-semibold text-gray-800">{bl.branchName}</span>: {bl.sessionsCount} {locale === "ar" ? "حصة" : "séance(s)"} ({formatDZD(bl.schoolAmount)})
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {item.payslipId && (
                              <Link
                                href={`/list/finance/payslips/${item.payslipId}?view=school`}
                                className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors shadow-xs"
                              >
                                {t("previewBtn")}
                              </Link>
                            )}
                            <PrintSchoolShareButton
                              data={{
                                id: item.payslipId,
                                periodStart: financialReport?.periodStart || periodStart,
                                periodEnd: financialReport?.periodEnd || periodEnd,
                                teacher: { id: item.teacherId, name: item.teacherName, phone: item.phone },
                                sessionsCount: item.sessionsCount,
                                totalTuitionGross: item.totalTuitionGross,
                                teacherGross: item.teacherCut,
                                schoolGross: item.schoolCut,
                                photocopyRecovered: item.photocopyRecovered,
                                schoolNet: item.netSchoolCut,
                                branchLines: item.branchLines,
                              }}
                              label={t("printBtn")}
                              className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white transition-colors shadow-xs"
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                    emptyTitle={t("noPayslipsYetTitle")}
                    emptyDescription={t("noPayslipsYetDesc")}
                  />
                </div>
              )}

              {/* VIEW 3: REAL NET STATEMENT */}
              {payrollViewMode === "real_net" && (
                <div className="flex flex-col gap-6">
                  {/* Equation Banner & Print Action */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-blue-50/50 border border-blue-100">
                    <div className="flex flex-col gap-1">
                      <span className="font-bold text-xs text-blue-950 uppercase tracking-wide">
                        {t("realNetPayrollTitle")}
                      </span>
                      <p className="text-xs text-muted font-medium font-mono">
                        {locale === "ar"
                          ? "الصافي الحقيقي = المداخيل الإجمالية - مصاريف التسيير - رواتب الأساتذة - رواتب الموظفين"
                          : "Net Réel = Recettes Générales − Dépenses d'exploitation − Paie Enseignants − Paie Staff"}
                      </p>
                    </div>

                    {financialReport?.realNetPayroll && (
                      <PrintRealNetButton
                        data={{
                          periodStart: financialReport.periodStart,
                          periodEnd: financialReport.periodEnd,
                          totalRevenue: financialReport.realNetPayroll.totalRevenue,
                          totalOutcomes: financialReport.realNetPayroll.totalOutcomes,
                          totalTeacherPayroll: financialReport.realNetPayroll.totalTeacherPayroll,
                          totalStaffPayroll: financialReport.realNetPayroll.totalStaffPayroll,
                          realNet: financialReport.realNetPayroll.realNet,
                          revenueBreakdown: financialReport.realNetPayroll.revenueBreakdown,
                          outcomesByCategory: financialReport.realNetPayroll.outcomesByCategory,
                          outcomesBreakdown: financialReport.realNetPayroll.outcomesBreakdown,
                          staffPayrollBreakdown: financialReport.realNetPayroll.staffPayrollBreakdown,
                          branchBreakdown: financialReport.realNetPayroll.branchBreakdown,
                        }}
                        label={t("printRealNetBtn")}
                        className="bg-blue-950 hover:bg-black text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-2 shadow-xs transition-colors shrink-0"
                      />
                    )}
                  </div>

                  {/* 5 Prominent Equation KPI Cards */}
                  {financialReport?.realNetPayroll && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      <div className="p-3.5 rounded-xl bg-surface-subtle border border-border">
                        <span className="text-[11px] text-muted font-semibold block">{t("schoolRevenueTotal")}</span>
                        <span className="text-lg font-black font-mono text-emerald-700 mt-1 block">
                          + {formatDZD(financialReport.realNetPayroll.totalRevenue)}
                        </span>
                      </div>
                      <div className="p-3.5 rounded-xl bg-surface-subtle border border-border">
                        <span className="text-[11px] text-muted font-semibold block">{t("outcomesExpensesLabel")}</span>
                        <span className="text-lg font-black font-mono text-rose-600 mt-1 block">
                          - {formatDZD(financialReport.realNetPayroll.totalOutcomes)}
                        </span>
                      </div>
                      <div className="p-3.5 rounded-xl bg-surface-subtle border border-border">
                        <span className="text-[11px] text-muted font-semibold block">{t("teachersPayrollLabel")}</span>
                        <span className="text-lg font-black font-mono text-rose-600 mt-1 block">
                          - {formatDZD(financialReport.realNetPayroll.totalTeacherPayroll)}
                        </span>
                      </div>
                      <div className="p-3.5 rounded-xl bg-surface-subtle border border-border">
                        <span className="text-[11px] text-muted font-semibold block">{t("staffsPayrollLabel")}</span>
                        <span className="text-lg font-black font-mono text-rose-600 mt-1 block">
                          - {formatDZD(financialReport.realNetPayroll.totalStaffPayroll)}
                        </span>
                      </div>
                      <div
                        className={`p-3.5 rounded-xl border shadow-xs ${
                          financialReport.realNetPayroll.realNet >= 0
                            ? "bg-emerald-50/80 border-emerald-200"
                            : "bg-rose-50/80 border-rose-200"
                        }`}
                      >
                        <span
                          className={`text-[11px] font-bold block ${
                            financialReport.realNetPayroll.realNet >= 0 ? "text-emerald-900" : "text-rose-900"
                          }`}
                        >
                          {t("realNetLabel")}
                        </span>
                        <span
                          className={`text-lg font-black font-mono mt-1 block ${
                            financialReport.realNetPayroll.realNet >= 0 ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {formatDZD(financialReport.realNetPayroll.realNet)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Subsection 1: Real Net Comparison by Branch */}
                  {financialReport?.realNetPayroll?.branchBreakdown && (
                    <div className="border border-border rounded-xl p-4 bg-surface shadow-xs">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3">
                        {t("branchComparisonTitle")}
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border text-muted font-semibold">
                              <th className="p-2 text-start">{t("branchNameCol")}</th>
                              <th className="p-2 text-end">{t("branchRevenueCol")}</th>
                              <th className="p-2 text-end">{t("outcomesExpensesLabel")}</th>
                              <th className="p-2 text-end">{t("teachersPayrollLabel")}</th>
                              <th className="p-2 text-end">{t("staffsPayrollLabel")}</th>
                              <th className="p-2 text-end">{t("realNetLabel")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {financialReport.realNetPayroll.branchBreakdown.map((b) => (
                              <tr key={b.branchId} className="border-b border-border/50 hover:bg-surface-subtle">
                                <td className="p-2.5 font-bold text-gray-900">{b.branchName}</td>
                                <td className="p-2.5 text-end font-mono text-emerald-700 font-semibold">{formatDZD(b.revenue)}</td>
                                <td className="p-2.5 text-end font-mono text-rose-600">- {formatDZD(b.outcomes)}</td>
                                <td className="p-2.5 text-end font-mono text-rose-600">- {formatDZD(b.teacherPayroll)}</td>
                                <td className="p-2.5 text-end font-mono text-rose-600">- {formatDZD(b.staffPayroll)}</td>
                                <td
                                  className={`p-2.5 text-end font-mono font-black ${
                                    b.realNet >= 0 ? "text-emerald-700" : "text-rose-600"
                                  }`}
                                >
                                  {formatDZD(b.realNet)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Subsection 2: Outcomes by Category & Staff Payroll Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Outcomes Categories */}
                    {financialReport?.realNetPayroll?.outcomesByCategory && (
                      <div className="border border-border rounded-xl p-4 bg-surface shadow-xs">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3">
                          {t("outcomesExpensesLabel")}
                        </h4>
                        <div className="space-y-2">
                          {financialReport.realNetPayroll.outcomesByCategory.map((cat) => (
                            <div key={cat.category} className="flex justify-between items-center text-xs p-2 rounded-lg bg-surface-subtle">
                              <span className="font-semibold text-gray-800">
                                {cat.category} <span className="text-muted font-normal">({cat.count})</span>
                              </span>
                              <span className="font-mono font-bold text-rose-600">- {formatDZD(cat.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Staff Payroll Breakdown */}
                    {financialReport?.realNetPayroll?.staffPayrollBreakdown && (
                      <div className="border border-border rounded-xl p-4 bg-surface shadow-xs">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3">
                          {t("staffsPayrollLabel")} ({financialReport.realNetPayroll.staffPayrollBreakdown.length})
                        </h4>
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {financialReport.realNetPayroll.staffPayrollBreakdown.map((staff) => (
                            <div key={staff.id} className="flex justify-between items-center text-xs p-2 rounded-lg bg-surface-subtle">
                              <div>
                                <span className="font-bold text-gray-800 block">{staff.staffName}</span>
                                <span className="text-[11px] text-muted">{staff.roleTitle} • {staff.branchName}</span>
                              </div>
                              <span className="font-mono font-bold text-rose-600">- {formatDZD(staff.total)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 4: Per-Branch Comparison */}
          {overviewData.branchBreakdown.length > 0 && (
            <Card className="border-border shadow-xs bg-surface">
              <CardHeader className="p-5 border-b border-border">
                <CardTitle className="text-section-title font-bold text-gray-900">
                  {t("branchComparisonTitle")}
                </CardTitle>
                <CardDescription className="text-form-helper text-muted">
                  {t("branchComparisonDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {overviewData.branchBreakdown.map((b) => (
                    <div key={b.branchId} className="border border-border rounded-xl p-4 bg-surface-subtle/60 shadow-xs">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-bold text-gray-900 text-table-body">{b.branchName}</span>
                        <Badge variant="neutral" size="sm">{t("branchNumberBadge", { id: b.branchId })}</Badge>
                      </div>
                      <div className="space-y-2 text-table-body text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted">{t("branchRevenueLabel")}</span>
                          <span className="font-mono font-bold text-success-text">{formatDZD(b.revenue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">{t("branchPayrollCostLabel")}</span>
                          <span className="font-mono font-bold text-danger">{formatDZD(b.payrollCost)}</span>
                        </div>
                        <div className="border-t border-border pt-1.5 flex justify-between font-bold">
                          <span className="text-gray-800">{t("netOperatingLabel")}</span>
                          <span
                            className={`font-mono ${
                              b.margin >= 0 ? "text-primary font-black" : "text-danger font-black"
                            }`}
                          >
                            {formatDZD(b.margin)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: AVANCES & FRAIS DE PHOTOCOPIE (DEDUCTIONS)                        */}
      {/* ========================================================================= */}
      {isDeductionsTab && (
        <div className="flex flex-col gap-6">
          {/* Sub-Switch: Avances vs Photocopies */}
          <div className="flex items-center bg-surface border border-border p-1 rounded-xl shadow-xs text-xs font-semibold w-fit">
            <button
              type="button"
              onClick={() => setDeductionSubTab("advances")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
                deductionSubTab === "advances"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted hover:text-gray-900 hover:bg-surface-subtle"
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>{t("advancesSubTab")}</span>
            </button>
            <button
              type="button"
              onClick={() => setDeductionSubTab("photocopy")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
                deductionSubTab === "photocopy"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted hover:text-gray-900 hover:bg-surface-subtle"
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>{t("photocopySubTab")}</span>
            </button>
          </div>

          {deductionSubTab === "advances" ? (
            <div className="flex flex-col gap-6">
              {/* Form */}
              <Card className="border-border shadow-xs bg-surface">
                <CardHeader className="p-5 border-b border-border">
                  <CardTitle className="text-section-title font-bold text-gray-900">
                    {t("recordSalaryAdvanceTitle")}
                  </CardTitle>
                  <CardDescription className="text-form-helper text-muted">
                    {t("recordSalaryAdvanceDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5">
                  <form onSubmit={handleCreateSalaryAdvance} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <FormField label={`${t("teacher")}:`}>
                      <Select
                        value={saTeacherId}
                        onChange={(e) => setSaTeacherId(e.target.value)}
                        className="text-xs"
                      >
                        {teachers.map((tItem) => (
                          <option key={tItem.id} value={tItem.id}>
                            {tItem.name}
                          </option>
                        ))}
                      </Select>
                    </FormField>

                    <FormField label={t("advanceAmountLabel")}>
                      <Input
                        type="number"
                        min="100"
                        step="100"
                        value={saAmount}
                        onChange={(e) => setSaAmount(Number(e.target.value))}
                        className="font-mono text-xs font-bold text-danger"
                        required
                      />
                    </FormField>

                    <FormField label={t("disbursementDateLabel")}>
                      <Input
                        type="date"
                        value={saDate}
                        onChange={(e) => setSaDate(e.target.value)}
                        className="font-mono text-xs"
                        required
                      />
                    </FormField>

                    <Button
                      type="submit"
                      variant="danger"
                      size="md"
                      disabled={isPending}
                      isLoading={isPending}
                      className="w-full h-[38px]"
                    >
                      {isPending ? t("saving") : t("recordAdvanceSubmitBtn")}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Table */}
              <Card className="border-border shadow-xs bg-surface">
                <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
                  <CardTitle className="text-section-title font-bold text-gray-900">
                    {t("salaryAdvancesLogTitle")}
                  </CardTitle>
                  <Badge variant="danger" size="sm">
                    {salaryAdvances.length} {locale === "ar" ? "تسبيق" : "avance(s)"}
                  </Badge>
                </CardHeader>
                <CardContent className="p-5">
                  <DataTable
                    columns={[
                      { header: t("idCol"), accessor: "id" },
                      { header: t("teacher"), accessor: "teacherName" },
                      { header: t("advanceAmount"), accessor: "amount", align: "end" },
                      { header: t("date"), accessor: "date", align: "center" },
                      { header: t("actions") || (locale === "ar" ? "إجراءات" : "Actions"), accessor: "actions", align: "center" },
                    ]}
                    data={salaryAdvances}
                    renderRow={(a) => (
                      <tr key={a.id} className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body">
                        <td className="p-3.5 font-mono font-bold">#{a.id}</td>
                        <td className="p-3.5 font-bold text-gray-900">{a.teacherName}</td>
                        <td className="p-3.5 text-end font-mono font-bold text-danger">
                          - {formatDZD(a.amount)}
                        </td>
                        <td className="p-3.5 text-center font-mono text-muted">{formatDate(a.date)}</td>
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                setEditingAdvance({
                                  id: a.id,
                                  personId: a.personId,
                                  amount: a.amount,
                                  date: new Date(a.date).toISOString().split("T")[0],
                                })
                              }
                              title={locale === "ar" ? "تعديل التسبيق" : "Modifier l'avance"}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="soft-danger"
                              size="icon-sm"
                              onClick={() =>
                                setAdvanceToDelete({
                                  id: a.id,
                                  teacherName: a.teacherName,
                                  amount: a.amount,
                                })
                              }
                              title={locale === "ar" ? "حذف التسبيق" : "Supprimer l'avance"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                    emptyTitle={t("noAdvancesTitle")}
                    emptyDescription={t("noAdvancesDesc")}
                  />
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Isolation Notice */}
              <div className="bg-amber-500/10 border-r-4 border-amber-500 p-4 rounded-xl text-amber-950 dark:text-amber-200 text-xs leading-relaxed shadow-xs">
                <span className="font-bold flex items-center gap-1.5 mb-1">
                  <Info className="w-4 h-4 shrink-0" />
                  {t("photocopyNoticeTitle")}
                </span>
                {t("photocopyNoticeDesc")}
              </div>

              {/* Form */}
              <Card className="border-border shadow-xs bg-surface">
                <CardHeader className="p-5 border-b border-border">
                  <CardTitle className="text-section-title font-bold text-gray-900">
                    {t("recordNewPhotocopyTitle")}
                  </CardTitle>
                  <CardDescription className="text-form-helper text-muted">
                    {t("recordNewPhotocopyDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5">
                  <form onSubmit={handleCreatePhotocopyCharge} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                    <FormField label={`${t("teacher")}:`}>
                      <Select
                        value={pcTeacherId}
                        onChange={(e) => {
                          const newTeacherId = e.target.value;
                          setPcTeacherId(newTeacherId);
                          const selectedTeacher = teachers.find((t) => t.id === newTeacherId);
                          const rate = selectedTeacher?.photocopyRatePerPage != null
                            ? Number(selectedTeacher.photocopyRatePerPage)
                            : 3.5;
                          setPcRatePerPage(rate);
                          setPcCostAmount(pcPages * rate);
                        }}
                        className="text-xs"
                      >
                        {teachers.map((tItem) => (
                          <option key={tItem.id} value={tItem.id}>
                            {tItem.name}
                          </option>
                        ))}
                      </Select>
                    </FormField>

                    <FormField label={t("executingBranchLabel")}>
                      <Select
                        value={pcBranchId}
                        onChange={(e) => setPcBranchId(Number(e.target.value))}
                        className="text-xs"
                      >
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </Select>
                    </FormField>

                    <FormField label={`${t("pageCount")}:`}>
                      <Input
                        type="number"
                        min="1"
                        value={pcPages}
                        onChange={(e) => {
                          const pages = Number(e.target.value);
                          setPcPages(pages);
                          setPcCostAmount(pages * pcRatePerPage);
                        }}
                        className="font-mono text-xs"
                        required
                      />
                    </FormField>

                    <FormField label={t("chargedAmountLabel")}>
                      <Input
                        type="number"
                        step="0.01"
                        value={pcCostAmount}
                        onChange={(e) => setPcCostAmount(Number(e.target.value))}
                        className="font-mono text-xs font-bold text-danger"
                        required
                      />
                    </FormField>

                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      disabled={isPending}
                      isLoading={isPending}
                      className="w-full bg-amber-600 hover:bg-amber-700 h-[38px]"
                    >
                      {isPending ? t("saving") : t("recordCopyBtn")}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Table */}
              <Card className="border-border shadow-xs bg-surface">
                <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
                  <CardTitle className="text-section-title font-bold text-gray-900">
                    {t("photocopyLogTitle")}
                  </CardTitle>
                  <Badge variant="warning" size="sm">
                    {photocopyCharges.length} {locale === "ar" ? "عملية" : "opération(s)"}
                  </Badge>
                </CardHeader>
                <CardContent className="p-5">
                  <DataTable
                    columns={[
                      { header: t("idCol"), accessor: "id" },
                      { header: t("teacher"), accessor: "teacherName" },
                      { header: t("branch"), accessor: "branchName" },
                      { header: t("pageCount"), accessor: "pages", align: "center" },
                      { header: t("totalAmount"), accessor: "costAmount", align: "end" },
                      { header: t("date"), accessor: "date", align: "center" },
                      { header: t("recordedByCol"), accessor: "recordedBy" },
                      { header: t("actions") || (locale === "ar" ? "إجراءات" : "Actions"), accessor: "actions", align: "center" },
                    ]}
                    data={photocopyCharges}
                    renderRow={(c) => (
                      <tr key={c.id} className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body">
                        <td className="p-3.5 font-mono font-bold">#{c.id}</td>
                        <td className="p-3.5 font-bold text-gray-900">{c.teacherName}</td>
                        <td className="p-3.5 text-gray-700">{c.branchName}</td>
                        <td className="p-3.5 text-center font-mono">
                          {c.pages} {locale === "ar" ? "صفحة" : "pages"}
                        </td>
                        <td className="p-3.5 text-end font-mono font-bold text-danger">
                          - {formatDZD(c.costAmount)}
                        </td>
                        <td className="p-3.5 text-center font-mono text-muted">{formatDate(c.date)}</td>
                        <td className="p-3.5 text-muted">{c.recordedBy}</td>
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                setEditingPhotocopy({
                                  id: c.id,
                                  teacherId: c.teacherId,
                                  branchId: c.branchId,
                                  pages: c.pages,
                                  costAmount: c.costAmount,
                                  date: new Date(c.date).toISOString().split("T")[0],
                                })
                              }
                              title={locale === "ar" ? "تعديل تكلفة النسخ" : "Modifier la charge"}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="soft-danger"
                              size="icon-sm"
                              onClick={() =>
                                setPhotocopyToDelete({
                                  id: c.id,
                                  teacherName: c.teacherName,
                                  costAmount: c.costAmount,
                                })
                              }
                              title={locale === "ar" ? "حذف تكلفة النسخ" : "Supprimer la charge"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                    emptyTitle={t("noPhotocopyTitle")}
                    emptyDescription={t("noPhotocopyDesc")}
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* MODAL: EDIT SALARY ADVANCE */}
      {editingAdvance && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border shadow-xl relative w-full max-w-md mx-4 p-6">
            <button
              type="button"
              className="absolute top-4 end-4 cursor-pointer p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors"
              onClick={() => setEditingAdvance(null)}
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-primary" />
              <span>{locale === "ar" ? "تعديل تسبيق مالي لأستاذ" : "Modifier l'avance sur salaire"}</span>
            </h3>
            <p className="text-xs text-muted mb-4">
              {locale === "ar" ? "تحديث بيانات التسبيق المالي المسجل للأستاذ." : "Mettre à jour les détails de l'avance accordée à l'enseignant."}
            </p>

            <form onSubmit={handleUpdateSalaryAdvance} className="flex flex-col gap-4">
              <FormField label={`${t("teacher")}:`}>
                <Select
                  value={editingAdvance.personId}
                  onChange={(e) => setEditingAdvance({ ...editingAdvance, personId: e.target.value })}
                  className="text-xs"
                >
                  {teachers.map((tItem) => (
                    <option key={tItem.id} value={tItem.id}>
                      {tItem.name}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label={`${t("advanceAmount")}:`}>
                <Input
                  type="number"
                  step="0.01"
                  value={editingAdvance.amount}
                  onChange={(e) => setEditingAdvance({ ...editingAdvance, amount: Number(e.target.value) })}
                  className="font-mono text-xs font-bold text-danger"
                  required
                />
              </FormField>

              <FormField label={`${t("date")}:`}>
                <Input
                  type="date"
                  value={editingAdvance.date}
                  onChange={(e) => setEditingAdvance({ ...editingAdvance, date: e.target.value })}
                  className="text-xs font-mono"
                  required
                />
              </FormField>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setEditingAdvance(null)}>
                  {locale === "ar" ? "إلغاء" : "Annuler"}
                </Button>
                <Button type="submit" variant="primary" disabled={isPending} isLoading={isPending}>
                  {locale === "ar" ? "حفظ التعديلات" : "Enregistrer les modifications"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE SALARY ADVANCE */}
      {advanceToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border shadow-xl relative w-full max-w-sm mx-4 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-danger-light text-danger flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">
              {locale === "ar" ? "تأكيد حذف التسبيق" : "Confirmer la suppression"}
            </h3>
            <p className="text-xs text-muted mb-4 leading-relaxed">
              {locale === "ar"
                ? `هل أنت متأكد من حذف تسبيق الأستاذ "${advanceToDelete.teacherName}" بقيمة ${formatDZD(advanceToDelete.amount)}؟`
                : `Voulez-vous vraiment supprimer l'avance de ${advanceToDelete.teacherName} (${formatDZD(advanceToDelete.amount)}) ?`}
            </p>
            <div className="flex items-center justify-center gap-2.5">
              <Button type="button" variant="outline" onClick={() => setAdvanceToDelete(null)} className="flex-1">
                {locale === "ar" ? "إلغاء" : "Annuler"}
              </Button>
              <Button type="button" variant="danger" disabled={isPending} isLoading={isPending} onClick={handleDeleteSalaryAdvance} className="flex-1">
                {locale === "ar" ? "تأكيد الحذف" : "Supprimer"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT PHOTOCOPY CHARGE */}
      {editingPhotocopy && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border shadow-xl relative w-full max-w-md mx-4 p-6">
            <button
              type="button"
              className="absolute top-4 end-4 cursor-pointer p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors"
              onClick={() => setEditingPhotocopy(null)}
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-amber-600" />
              <span>{locale === "ar" ? "تعديل تكلفة النسخ" : "Modifier la charge de photocopie"}</span>
            </h3>
            <p className="text-xs text-muted mb-4">
              {locale === "ar" ? "تحديث بيانات تكلفة النسخ المسجلة للأستاذ." : "Mettre à jour les détails de la charge de photocopie de l'enseignant."}
            </p>

            <form onSubmit={handleUpdatePhotocopyCharge} className="flex flex-col gap-4">
              <FormField label={`${t("teacher")}:`}>
                <Select
                  value={editingPhotocopy.teacherId}
                  onChange={(e) => {
                    const newTeacherId = e.target.value;
                    const selectedTeacher = teachers.find((t) => t.id === newTeacherId);
                    const rate = selectedTeacher?.photocopyRatePerPage != null
                      ? Number(selectedTeacher.photocopyRatePerPage)
                      : 3.5;
                    setEditingPhotocopy({
                      ...editingPhotocopy,
                      teacherId: newTeacherId,
                      costAmount: editingPhotocopy.pages * rate,
                    });
                  }}
                  className="text-xs"
                >
                  {teachers.map((tItem) => (
                    <option key={tItem.id} value={tItem.id}>
                      {tItem.name}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label={t("executingBranchLabel")}>
                <Select
                  value={editingPhotocopy.branchId}
                  onChange={(e) => setEditingPhotocopy({ ...editingPhotocopy, branchId: Number(e.target.value) })}
                  className="text-xs"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label={`${t("pageCount")}:`}>
                  <Input
                    type="number"
                    min="1"
                    value={editingPhotocopy.pages}
                    onChange={(e) => {
                      const pages = Number(e.target.value);
                      const selectedTeacher = teachers.find((t) => t.id === editingPhotocopy.teacherId);
                      const rate = selectedTeacher?.photocopyRatePerPage != null
                        ? Number(selectedTeacher.photocopyRatePerPage)
                        : 3.5;
                      setEditingPhotocopy({
                        ...editingPhotocopy,
                        pages,
                        costAmount: pages * rate,
                      });
                    }}
                    className="font-mono text-xs"
                    required
                  />
                </FormField>

                <FormField label={t("chargedAmountLabel")}>
                  <Input
                    type="number"
                    step="0.01"
                    value={editingPhotocopy.costAmount}
                    onChange={(e) => setEditingPhotocopy({ ...editingPhotocopy, costAmount: Number(e.target.value) })}
                    className="font-mono text-xs font-bold text-danger"
                    required
                  />
                </FormField>
              </div>

              <FormField label={`${t("date")}:`}>
                <Input
                  type="date"
                  value={editingPhotocopy.date}
                  onChange={(e) => setEditingPhotocopy({ ...editingPhotocopy, date: e.target.value })}
                  className="text-xs font-mono"
                  required
                />
              </FormField>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setEditingPhotocopy(null)}>
                  {locale === "ar" ? "إلغاء" : "Annuler"}
                </Button>
                <Button type="submit" variant="primary" disabled={isPending} isLoading={isPending} className="bg-amber-600 hover:bg-amber-700">
                  {locale === "ar" ? "حفظ التعديلات" : "Enregistrer les modifications"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE PHOTOCOPY CHARGE */}
      {photocopyToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border shadow-xl relative w-full max-w-sm mx-4 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-danger-light text-danger flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">
              {locale === "ar" ? "تأكيد حذف تكلفة النسخ" : "Confirmer la suppression"}
            </h3>
            <p className="text-xs text-muted mb-4 leading-relaxed">
              {locale === "ar"
                ? `هل أنت متأكد من حذف تكلفة النسخ للأستاذ "${photocopyToDelete.teacherName}" بقيمة ${formatDZD(photocopyToDelete.costAmount)}؟`
                : `Voulez-vous vraiment supprimer la charge de photocopie de ${photocopyToDelete.teacherName} (${formatDZD(photocopyToDelete.costAmount)}) ?`}
            </p>
            <div className="flex items-center justify-center gap-2.5">
              <Button type="button" variant="outline" onClick={() => setPhotocopyToDelete(null)} className="flex-1">
                {locale === "ar" ? "إلغاء" : "Annuler"}
              </Button>
              <Button type="button" variant="danger" disabled={isPending} isLoading={isPending} onClick={handleDeletePhotocopyCharge} className="flex-1">
                {locale === "ar" ? "تأكيد الحذف" : "Supprimer"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: TEACHER PAY RATES CONFIGURATION                                   */}
      {/* ========================================================================= */}
      {isRatesTab && (
        <div className="flex flex-col gap-6">
          {/* Form */}
          <Card className="border-border shadow-xs bg-surface">
            <CardHeader className="p-5 border-b border-border">
              <CardTitle className="text-section-title font-bold text-gray-900">
                {t("configureTeacherRatesTitle")}
              </CardTitle>
              <CardDescription className="text-form-helper text-muted">
                {t("configureTeacherRatesDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={handleSaveRates} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label={t("selectTeacherLabel")}>
                    <Select
                      value={rateTeacherId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setRateTeacherId(id);
                        const tch = teachers.find((x) => x.id === id);
                        if (tch?.currentRate) {
                          setRatePerSession(tch.currentRate.ratePerSession ?? "");
                          setFixedMonthly(tch.currentRate.fixedMonthly ?? "");
                        } else {
                          setRatePerSession(1000);
                          setFixedMonthly("");
                        }
                        const overrides: Record<number, string> = {};
                        tch?.branchOverrides.forEach((bo) => {
                          if (bo.payRate !== null) {
                            overrides[bo.branchId] = String(bo.payRate);
                          }
                        });
                        setBranchRateOverrides(overrides);
                      }}
                      className="text-xs"
                    >
                      {teachers.map((tch) => (
                        <option key={tch.id} value={tch.id}>
                          {tch.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField
                    label={t("generalRatePerSessionLabel")}
                    helperText={t("generalRateHelper")}
                  >
                    <Input
                      type="number"
                      value={ratePerSession}
                      onChange={(e) => setRatePerSession(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder={locale === "ar" ? "مثال: 1000" : "Ex: 1000"}
                      className="font-mono text-xs"
                    />
                  </FormField>

                  <FormField
                    label={t("orFixedMonthlySalary")}
                    helperText={t("fixedMonthlyHelper")}
                  >
                    <Input
                      type="number"
                      value={fixedMonthly}
                      onChange={(e) => setFixedMonthly(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder={locale === "ar" ? "مثال: 50000" : "Ex: 50000"}
                      className="font-mono text-xs"
                    />
                  </FormField>
                </div>

                {/* Branch overrides */}
                <div className="border-t border-border pt-4">
                  <h3 className="text-table-header font-bold text-gray-800 mb-3">
                    {t("branchRateOverridesHeading")}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {branches.map((b) => (
                      <div key={b.id} className="bg-surface-subtle p-3.5 rounded-xl border border-border shadow-xs">
                        <label className="block text-form-label font-semibold text-gray-700 mb-1.5">
                          {t("branch")}: <span className="font-bold text-primary">{b.name}</span>
                        </label>
                        <Input
                          type="number"
                          placeholder={t("useGeneralRate")}
                          value={branchRateOverrides[b.id] || ""}
                          onChange={(e) =>
                            setBranchRateOverrides({
                              ...branchRateOverrides,
                              [b.id]: e.target.value,
                            })
                          }
                          className="font-mono text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    disabled={isPending}
                    isLoading={isPending}
                    className="px-6"
                  >
                    {isPending ? t("saving") : t("saveTeacherRatesBtn")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* List of current rates */}
          <Card className="border-border shadow-xs bg-surface">
            <CardHeader className="p-5 border-b border-border">
              <CardTitle className="text-section-title font-bold text-gray-900">
                {t("currentTeacherRatesTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <DataTable
                columns={[
                  { header: t("teacher"), accessor: "name" },
                  { header: t("baseRatePerSession"), accessor: "ratePerSession", align: "end" },
                  { header: t("fixedMonthlySalary"), accessor: "fixedMonthly", align: "end" },
                  { header: t("branchOverridesCol"), accessor: "branchOverrides" },
                ]}
                data={teachers}
                renderRow={(tch) => (
                  <tr key={tch.id} className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body">
                    <td className="p-3.5 font-bold text-gray-900">{tch.name}</td>
                    <td className="p-3.5 text-end font-mono font-bold">
                      {tch.currentRate?.ratePerSession
                        ? formatDZD(tch.currentRate.ratePerSession)
                        : "-"}
                    </td>
                    <td className="p-3.5 text-end font-mono text-muted">
                      {tch.currentRate?.fixedMonthly
                        ? formatDZD(tch.currentRate.fixedMonthly)
                        : "-"}
                    </td>
                    <td className="p-3.5">
                      <div className="flex flex-wrap gap-2">
                        {tch.branchOverrides && tch.branchOverrides.length > 0 ? (
                          tch.branchOverrides.map((bo) =>
                            bo.payRate !== null ? (
                              <Badge
                                key={bo.branchId}
                                variant="primary"
                                size="sm"
                              >
                                {bo.branchName}: {formatDZD(bo.payRate)}
                              </Badge>
                            ) : null
                          )
                        ) : (
                          <span className="text-muted text-xs">{t("noOverrides")}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                emptyTitle={t("noTeachersTitle")}
                emptyDescription={t("noTeachersDesc")}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
