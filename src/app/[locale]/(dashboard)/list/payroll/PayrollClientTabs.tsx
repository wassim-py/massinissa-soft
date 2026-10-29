"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  confirmTeacherPayslipAction,
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
import PrintOwnerConsolidationButton from "@/components/PrintOwnerConsolidationButton";
import PrintMasterOwnerReportButton from "@/components/PrintMasterOwnerReportButton";
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
  Search,
  Eye,
  CheckCircle2,
  Check,
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
        bonus?: number;
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
    bonus?: number;
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

  // Form states & Filters
  const [searchTeacher, setSearchTeacher] = useState("");
  const [periodFilterStart, setPeriodFilterStart] = useState("");
  const [periodFilterEnd, setPeriodFilterEnd] = useState("");

  const filteredPayslips = payslips.filter((p) => {
    if (searchTeacher && !p.teacherName.toLowerCase().includes(searchTeacher.toLowerCase())) {
      return false;
    }
    if (periodFilterStart) {
      const pStart = new Date(p.periodStart).getTime();
      const fStart = new Date(periodFilterStart).getTime();
      if (pStart < fStart) return false;
    }
    if (periodFilterEnd) {
      const pEnd = new Date(p.periodEnd).getTime();
      const fEnd = new Date(periodFilterEnd).getTime();
      if (pEnd > fEnd) return false;
    }
    return true;
  });

  // 1. Photocopy charge form
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
  const handleConfirmPayslip = (payslipId: number, confirm: boolean) => {
    setFeedbackMessage(null);
    startTransition(async () => {
      const res = await confirmTeacherPayslipAction(payslipId, confirm);
      if (res.success) {
        setFeedbackMessage({ text: res.message, isError: false });
      } else {
        setFeedbackMessage({ text: res.message, isError: true });
      }
    });
  };

  const handleDeletePayslip = (payrollRunId: number, payslipId: number, teacherName: string) => {
    const msg =
      locale === "ar"
        ? `هل أنت متأكد من رغبتك في حذف كشف الراتب #${payslipId} للأستاذ ${teacherName}؟`
        : `Êtes-vous sûr de vouloir supprimer la fiche de paie #${payslipId} pour ${teacherName} ?`;
    if (!window.confirm(msg)) return;

    setFeedbackMessage(null);
    startTransition(async () => {
      const res = await deletePayrollRunAction(payrollRunId);
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
      {/* VIEW 1: FICHES DE PAIE DES ENSEIGNANTS                                    */}
      {/* ========================================================================= */}
      {isRunsTab && (
        <div className="flex flex-col gap-6">
          {/* Card: Dedicated Payslips Management Section */}
          <Card className="border-border shadow-xs bg-surface">
            <CardHeader className="p-5 border-b border-border flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <CardTitle className="text-section-title font-bold text-gray-900">
                    {t("consolidatedPayslipsTitle")}
                  </CardTitle>
                  <Badge variant="primary" size="sm" className="font-semibold">
                    {filteredPayslips.length} {locale === "ar" ? "كشف" : "fiche(s)"}
                  </Badge>
                </div>
                <CardDescription className="text-form-helper text-muted mt-1">
                  {locale === "ar"
                    ? "كشوف الرواتب المحفوظة من ملفات الأساتذة."
                    : "Fiches de paie générées depuis les profils enseignants."}
                </CardDescription>
              </div>

              {/* Master Accumulated Owner Report Print Button */}
              <div className="flex items-center gap-2 flex-wrap">
                <PrintMasterOwnerReportButton
                  periodStart={periodFilterStart || undefined}
                  periodEnd={periodFilterEnd || undefined}
                  payslipIds={
                    filteredPayslips.length > 0
                      ? filteredPayslips.map((p) => p.id)
                      : (payslips.length > 0 && (searchTeacher || periodFilterStart || periodFilterEnd) ? [] : undefined)
                  }
                />
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-5">
              {/* Filter and Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-surface-subtle border border-border/80 rounded-xl">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTeacher}
                    onChange={(e) => setSearchTeacher(e.target.value)}
                    placeholder={locale === "ar" ? "بحث عن أستاذ..." : "Rechercher un enseignant..."}
                    className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-border bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted text-[11px] font-semibold">{locale === "ar" ? "من:" : "Du :"}</span>
                    <input
                      type="date"
                      value={periodFilterStart}
                      onChange={(e) => setPeriodFilterStart(e.target.value)}
                      className="text-xs font-mono px-2.5 py-1.5 rounded-lg border border-border bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted text-[11px] font-semibold">{locale === "ar" ? "إلى:" : "Au :"}</span>
                    <input
                      type="date"
                      value={periodFilterEnd}
                      onChange={(e) => setPeriodFilterEnd(e.target.value)}
                      className="text-xs font-mono px-2.5 py-1.5 rounded-lg border border-border bg-white"
                    />
                  </div>
                  {(searchTeacher || periodFilterStart || periodFilterEnd) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTeacher("");
                        setPeriodFilterStart("");
                        setPeriodFilterEnd("");
                      }}
                      className="text-xs font-semibold text-danger hover:underline px-2 py-1 cursor-pointer"
                    >
                      {locale === "ar" ? "إعادة تعيين" : "Réinitialiser"}
                    </button>
                  )}
                </div>
              </div>

              {/* Summary KPIs for Displayed Payslips */}
              {filteredPayslips.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="p-3 rounded-xl bg-surface-subtle border border-border">
                    <span className="text-[11px] text-muted font-semibold block">{t("totalSessionsCol")}</span>
                    <span className="text-base font-black font-mono text-gray-900 mt-1 block">
                      {filteredPayslips.reduce((s, p) => s + (p.sessionsCount || 0), 0)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-subtle border border-border">
                    <span className="text-[11px] text-muted font-semibold block">{t("grossAmountCol")}</span>
                    <span className="text-base font-black font-mono text-gray-900 mt-1 block">
                      {formatDZD(filteredPayslips.reduce((s, p) => s + p.grossAmount, 0))}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-subtle border border-border">
                    <span className="text-[11px] text-muted font-semibold block">{t("advancesCol")}</span>
                    <span className="text-base font-black font-mono text-danger mt-1 block">
                      - {formatDZD(filteredPayslips.reduce((s, p) => s + p.advances, 0))}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-subtle border border-border">
                    <span className="text-[11px] text-muted font-semibold block">{t("photocopyCol")}</span>
                    <span className="text-base font-black font-mono text-warning-text mt-1 block">
                      - {formatDZD(filteredPayslips.reduce((s, p) => s + p.photocopyDeductions, 0))}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                    <span className="text-[11px] text-primary font-bold block">{t("netDueCol")}</span>
                    <span className="text-base font-black font-mono text-primary mt-1 block">
                      {formatDZD(filteredPayslips.reduce((s, p) => s + p.netAmount, 0))}
                    </span>
                  </div>
                </div>
              )}
              {/* DESKTOP TABLE VIEW */}
              <div className="hidden md:block">
                <DataTable
                  columns={[
                    { header: "#", accessor: "id" },
                    { header: locale === "ar" ? "الحالة" : "Statut", accessor: "status", align: "center" },
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
                  data={filteredPayslips}
                  renderRow={(p) => {
                    const isConfirmed = p.status === "PAID" || p.status === "VALIDATED" || p.status === "CONFIRMED";
                    return (
                      <tr key={p.id} className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body">
                        <td className="p-3.5 font-mono font-bold">#{p.id}</td>
                        <td className="p-3.5 text-center">
                          {isConfirmed ? (
                            <Badge variant="success" size="sm" withDot className="font-semibold whitespace-nowrap">
                              {locale === "ar" ? "مؤكد" : "Confirmé"}
                            </Badge>
                          ) : (
                            <Badge variant="warning" size="sm" className="font-semibold whitespace-nowrap">
                              {locale === "ar" ? "مسودة" : "Brouillon"}
                            </Badge>
                          )}
                        </td>
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
                          <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                            {isConfirmed ? (
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleConfirmPayslip(p.id, false)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors shadow-xs cursor-pointer"
                                title={locale === "ar" ? "كشف مؤكد - اضغط لإلغاء التأكيد" : "Fiche confirmée - cliquer pour annuler"}
                              >
                                <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                <span>{locale === "ar" ? "مؤكد" : "Confirmé"}</span>
                              </button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                disabled={isPending}
                                onClick={() => handleConfirmPayslip(p.id, true)}
                                className="!bg-emerald-600 hover:!bg-emerald-700 !text-white !px-2.5 !py-1.5 text-xs font-semibold gap-1 shadow-xs cursor-pointer"
                                title={locale === "ar" ? "تأكيد وصرف كشف الراتب وخصمه من الصافي الإجمالي" : "Confirmer la fiche de paie et mettre à jour le revenu net"}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                <span>{locale === "ar" ? "تأكيد" : "Confirmer"}</span>
                              </Button>
                            )}

                            <Link
                              href={`/list/finance/payslips/${p.id}?view=teacher`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors shadow-xs"
                              title={locale === "ar" ? "معاينة كشف الراتب" : "Aperçu de la fiche"}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{t("previewBtn")}</span>
                            </Link>
                            <PrintPayslipButton
                              label={locale === "ar" ? "الأستاذ" : "Enseignant"}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-900 text-white transition-colors shadow-xs cursor-pointer"
                              data={{
                                id: p.id,
                                periodStart: p.periodStart,
                                periodEnd: p.periodEnd,
                                status: p.status,
                                teacher: { id: p.personId, name: p.teacherName },
                                sessionsCount: p.sessionsCount,
                                grossAmount: p.grossAmount + (p.bonus || 0),
                                advances: p.advances,
                                photocopyDeductions: p.photocopyDeductions,
                                netAmount: p.netAmount,
                                branchLines: p.branchLines,
                              }}
                            />
                            <PrintOwnerConsolidationButton
                              payslipId={p.id}
                              label={locale === "ar" ? "المالك" : "Propriétaire"}
                            />
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              disabled={isPending}
                              onClick={() => handleDeletePayslip(p.payrollRunId, p.id, p.teacherName)}
                              title={locale === "ar" ? "حذف" : "Supprimer"}
                              className="!px-2 !py-1.5"
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  }}
                  emptyTitle={t("noPayslipsYetTitle")}
                  emptyDescription={
                    searchTeacher || periodFilterStart || periodFilterEnd
                      ? (locale === "ar" ? "لا توجد كشوف رواتب مطابقة للتصفية الحالية." : "Aucune fiche de paie ne correspond aux filtres.")
                      : t("noPayslipsYetDesc")
                  }
                />
              </div>

              {/* MOBILE CARDS VIEW (Fully responsive for small screens) */}
              <div className="block md:hidden space-y-3">
                {filteredPayslips.length === 0 ? (
                  <div className="p-6 text-center text-muted bg-surface-subtle rounded-xl border border-dashed border-border text-xs">
                    {searchTeacher || periodFilterStart || periodFilterEnd
                      ? (locale === "ar" ? "لا توجد كشوف مطابقة للتصفية." : "Aucune fiche ne correspond aux filtres.")
                      : t("noPayslipsYetDesc")}
                  </div>
                ) : (
                  filteredPayslips.map((p) => {
                    const isConfirmed = p.status === "PAID" || p.status === "VALIDATED" || p.status === "CONFIRMED";
                    return (
                      <div
                        key={p.id}
                        className={`p-4 rounded-xl border bg-surface transition-all shadow-xs space-y-3 ${
                          isConfirmed ? "border-emerald-200 bg-emerald-50/20" : "border-border"
                        }`}
                      >
                        {/* Top Card Row */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-muted">#{p.id}</span>
                            <span className="font-bold text-sm text-gray-900">{p.teacherName}</span>
                          </div>
                          {isConfirmed ? (
                            <Badge variant="success" size="sm" withDot className="font-semibold text-[11px]">
                              {locale === "ar" ? "مؤكد" : "Confirmé"}
                            </Badge>
                          ) : (
                            <Badge variant="warning" size="sm" className="font-semibold text-[11px]">
                              {locale === "ar" ? "مسودة" : "Brouillon"}
                            </Badge>
                          )}
                        </div>

                        {/* Period & Sessions */}
                        <div className="flex items-center justify-between text-xs text-muted">
                          <span>{formatDate(p.periodStart)} → {formatDate(p.periodEnd)}</span>
                          <span className="font-mono font-bold text-gray-800">
                            {p.sessionsCount} {locale === "ar" ? "حصة" : "séances"}
                          </span>
                        </div>

                        {/* Branches Details */}
                        {p.branchLines && p.branchLines.length > 0 && (
                          <div className="text-[11px] text-muted flex flex-wrap gap-1.5 pt-1 border-t border-border/50">
                            {p.branchLines.map((bl) => (
                              <span key={bl.branchId} className="bg-surface-subtle px-2 py-0.5 rounded border border-border/60">
                                {bl.branchName}: <strong className="text-gray-800">{bl.sessionsCount}</strong> ({formatDZD(bl.amount)})
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Financials Grid */}
                        <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-surface-subtle/80 border border-border/60 text-xs">
                          <div>
                            <span className="text-[10px] text-muted block">{locale === "ar" ? "الخام" : "Brut"}</span>
                            <span className="font-mono font-bold text-gray-900">{formatDZD(p.grossAmount)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted block">{locale === "ar" ? "الصافي للدفع" : "Net à payer"}</span>
                            <span className="font-mono font-black text-primary text-sm">{formatDZD(p.netAmount)}</span>
                          </div>
                          {(p.advances > 0 || p.photocopyDeductions > 0) && (
                            <div className="col-span-2 flex items-center justify-between text-[11px] pt-1.5 border-t border-border/50">
                              {p.advances > 0 && (
                                <span className="font-mono text-danger font-semibold">
                                  {locale === "ar" ? "تسبيق:" : "Avance :"} -{formatDZD(p.advances)}
                                </span>
                              )}
                              {p.photocopyDeductions > 0 && (
                                <span className="font-mono text-warning-text font-semibold">
                                  {locale === "ar" ? "نسخ:" : "Copies :"} -{formatDZD(p.photocopyDeductions)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions Row */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          {isConfirmed ? (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleConfirmPayslip(p.id, false)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors shadow-xs"
                              title={locale === "ar" ? "كشف مؤكد - اضغط لإلغاء التأكيد" : "Fiche confirmée - cliquer pour annuler"}
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              <span>{locale === "ar" ? "مؤكد" : "Confirmé"}</span>
                            </button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={isPending}
                              onClick={() => handleConfirmPayslip(p.id, true)}
                              className="!bg-emerald-600 hover:!bg-emerald-700 !text-white !px-3 !py-1.5 text-xs font-semibold gap-1 shadow-xs"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>{locale === "ar" ? "تأكيد" : "Confirmer"}</span>
                            </Button>
                          )}

                          <Link
                            href={`/list/finance/payslips/${p.id}?view=teacher`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors shadow-xs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{t("previewBtn")}</span>
                          </Link>

                          <PrintPayslipButton
                            label={locale === "ar" ? "الأستاذ" : "Enseignant"}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-900 text-white transition-colors shadow-xs"
                            data={{
                              id: p.id,
                              periodStart: p.periodStart,
                              periodEnd: p.periodEnd,
                              status: p.status,
                              teacher: { id: p.personId, name: p.teacherName },
                              sessionsCount: p.sessionsCount,
                              grossAmount: p.grossAmount + (p.bonus || 0),
                              advances: p.advances,
                              photocopyDeductions: p.photocopyDeductions,
                              netAmount: p.netAmount,
                              branchLines: p.branchLines,
                            }}
                          />

                          <PrintOwnerConsolidationButton
                            payslipId={p.id}
                            label={locale === "ar" ? "المالك" : "Propriétaire"}
                          />

                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleDeletePayslip(p.payrollRunId, p.id, p.teacherName)}
                            className="!px-2 !py-1.5 ms-auto"
                            title={locale === "ar" ? "حذف" : "Supprimer"}
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Per-Branch Comparison */}
          {overviewData.branchBreakdown.length > 0 && (() => {
            const confirmedSlips = filteredPayslips.filter(
              (p) => p.status === "PAID" || p.status === "VALIDATED" || p.status === "CONFIRMED"
            );
            const reactiveBranchBreakdown = overviewData.branchBreakdown.map((b) => {
              const payslipsDeductionForBranch = confirmedSlips.reduce((sum, p) => {
                const lines = (p.branchLines || []).filter((bl) => bl.branchId === b.branchId);
                return sum + lines.reduce((acc, bl) => acc + Number(bl.amount || 0), 0);
              }, 0);

              const hasFilters = Boolean(searchTeacher || periodFilterStart || periodFilterEnd);
              const finalPayrollCost = hasFilters
                ? payslipsDeductionForBranch
                : (payslipsDeductionForBranch > 0 ? payslipsDeductionForBranch : (b.payrollCost || 0));

              const finalMargin = b.revenue - finalPayrollCost;

              return {
                ...b,
                payrollCost: finalPayrollCost,
                margin: finalMargin,
              };
            });

            return (
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
                    {reactiveBranchBreakdown.map((b) => (
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
                            <span className="text-muted">
                              {locale === "ar" ? "رواتب الأساتذة المخصومة" : "Fiches de paie déduites"}
                            </span>
                            <span className={`font-mono font-bold ${b.payrollCost > 0 ? "text-danger" : "text-gray-500"}`}>
                              {b.payrollCost > 0 ? `- ${formatDZD(b.payrollCost)}` : "0 DZD"}
                            </span>
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
            );
          })()}
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
