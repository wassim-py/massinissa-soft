"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  generatePayrollRunAction,
  setPayrollRunStatusAction,
  recordPhotocopyChargeAction,
  recordSalaryAdvanceAction,
  saveTeacherPayRateAction,
} from "@/lib/actions";
import PrintPayslipButton from "@/components/PrintPayslipButton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select } from "@/components/ui/FormField";
import { DataTable, Column } from "@/components/ui/DataTable";
import { useTranslations, useLocale } from "next-intl";
import { Info } from "lucide-react";

interface Props {
  currentTab: string;
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

  // Form states
  // 1. Generate Run form
  const [periodStart, setPeriodStart] = useState("2026-09-01");
  const [periodEnd, setPeriodEnd] = useState("2026-09-30");

  // 2. Photocopy charge form
  const [pcTeacherId, setPcTeacherId] = useState(teachers[0]?.id || "");
  const [pcBranchId, setPcBranchId] = useState(branches[0]?.id || 1);
  const [pcPages, setPcPages] = useState(20);
  const [pcRatePerPage, setPcRatePerPage] = useState(5); // Default 5 DZD / page
  const [pcCostAmount, setPcCostAmount] = useState(100);
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
  const formatDZD = (num: number) => Number(num || 0).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ") + (locale === "ar" ? " دج" : " DZD");
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
      {/* TAB 1: OWNER FINANCIAL OVERVIEW                                           */}
      {/* ========================================================================= */}
      {currentTab === "overview" && (
        <div className="flex flex-col gap-6">
          {/* Primary View: School-Wide Revenue vs Payroll */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5 border-border shadow-xs bg-surface">
              <span className="text-form-label font-bold text-muted">{t("schoolRevenueTotal")}</span>
              <p className="text-2xl font-black text-success mt-1 font-mono">
                {formatDZD(overviewData.totalRevenue)}
              </p>
              <span className="text-form-helper text-muted mt-1 block">{t("allBranchesRevenueHelper")}</span>
            </Card>

            <Card className="p-5 border-border shadow-xs bg-surface">
              <span className="text-form-label font-bold text-muted">{t("grossPayrollTotal")}</span>
              <p className="text-2xl font-black text-danger mt-1 font-mono">
                {formatDZD(overviewData.totalGrossPayroll)}
              </p>
              <span className="text-form-helper text-muted mt-1 block">{t("teacherSessionsDuesHelper")}</span>
            </Card>

            <Card className="p-5 border-border shadow-xs bg-surface">
              <span className="text-form-label font-bold text-muted">{t("totalDeductions")}</span>
              <p className="text-2xl font-black text-warning-text mt-1 font-mono">
                {formatDZD(overviewData.totalAdvances + overviewData.totalPhotocopyDeductions)}
              </p>
              <span className="text-form-helper text-muted mt-1 block">
                {t("advancesCol")}: {formatDZD(overviewData.totalAdvances)} | {t("photocopyCol")}: {formatDZD(overviewData.totalPhotocopyDeductions)}
              </span>
            </Card>

            <Card className="p-5 border-border shadow-xs bg-surface">
              <span className="text-form-label font-bold text-muted">{t("operatingMargin")}</span>
              <p
                className={`text-2xl font-black mt-1 font-mono ${
                  overviewData.operatingMargin >= 0 ? "text-primary" : "text-danger"
                }`}
              >
                {formatDZD(overviewData.operatingMargin)}
              </p>
              <span className="text-form-helper text-muted mt-1 block">{t("schoolFinancialEfficiency")}</span>
            </Card>
          </div>

          {/* Teacher Liabilities - What is owed to each teacher total */}
          <Card className="border-border shadow-xs bg-surface">
            <CardHeader className="p-5 border-b border-border">
              <CardTitle className="text-section-title font-bold text-gray-900">
                {t("teacherLiabilitiesTitle")}
              </CardTitle>
              <CardDescription className="text-form-helper text-muted">
                {t("teacherLiabilitiesDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <DataTable
                columns={[
                  { header: t("teacher"), accessor: "teacherName" },
                  { header: t("totalSessionsCol"), accessor: "sessionsCount", align: "center" },
                  { header: t("grossAmountCol"), accessor: "grossAmount", align: "end" },
                  { header: t("advancesDeductedCol"), accessor: "advances", align: "end" },
                  { header: t("photocopyDeductedCol"), accessor: "photocopyDeductions", align: "end" },
                  { header: t("netDueCol"), accessor: "netAmount", align: "end" },
                  { header: t("payslipActionCol"), accessor: "action", align: "center" },
                ]}
                data={payslips}
                renderRow={(p) => (
                  <tr key={p.id} className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body">
                    <td className="p-3.5 font-bold text-gray-900">{p.teacherName}</td>
                    <td className="p-3.5 text-center font-mono">
                      {p.sessionsCount} {locale === "ar" ? "حصة" : "séance(s)"}
                    </td>
                    <td className="p-3.5 text-end font-mono font-bold text-gray-800">
                      {formatDZD(p.grossAmount)}
                    </td>
                    <td className="p-3.5 text-end font-mono text-danger font-semibold">
                      - {formatDZD(p.advances)}
                    </td>
                    <td className="p-3.5 text-end font-mono text-warning-text font-semibold">
                      - {formatDZD(p.photocopyDeductions)}
                    </td>
                    <td className="p-3.5 text-end font-mono font-black text-primary text-sm">
                      {formatDZD(p.netAmount)}
                    </td>
                    <td className="p-3.5 text-center">
                      <Link
                        href={`/list/finance/payslips/${p.id}`}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors shadow-xs"
                      >
                        {t("viewAndPrint")}
                      </Link>
                    </td>
                  </tr>
                )}
                emptyTitle={t("noPayslipsYetTitle")}
                emptyDescription={t("noPayslipsYetDesc")}
              />
            </CardContent>
          </Card>

          {/* Secondary View: Per-Branch Breakdown */}
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PAYROLL RUNS                                                       */}
      {/* ========================================================================= */}
      {currentTab === "runs" && (
        <div className="flex flex-col gap-6">
          {/* Create Run Form */}
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

          {/* Runs Table */}
          <Card className="border-border shadow-xs bg-surface">
            <CardHeader className="p-5 border-b border-border">
              <CardTitle className="text-section-title font-bold text-gray-900">
                {t("recordedPayrollRunsTitle")}
              </CardTitle>
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
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
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
                      </div>
                    </td>
                  </tr>
                )}
                emptyTitle={t("noRunsYetTitle")}
                emptyDescription={t("noRunsYetDesc")}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CONSOLIDATED PAYSLIPS                                              */}
      {/* ========================================================================= */}
      {currentTab === "payslips" && (
        <Card className="border-border shadow-xs bg-surface">
          <CardHeader className="p-5 border-b border-border">
            <CardTitle className="text-section-title font-bold text-gray-900">
              {t("consolidatedPayslipsTitle")}
            </CardTitle>
            <CardDescription className="text-form-helper text-muted">
              {t("consolidatedPayslipsDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
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
                        href={`/list/finance/payslips/${p.id}`}
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
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PHOTOCOPY CHARGES TRACKING (§2.5)                                  */}
      {/* ========================================================================= */}
      {currentTab === "photocopy" && (
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
                    onChange={(e) => setPcTeacherId(e.target.value)}
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
            <CardHeader className="p-5 border-b border-border">
              <CardTitle className="text-section-title font-bold text-gray-900">
                {t("photocopyLogTitle")}
              </CardTitle>
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
                  </tr>
                )}
                emptyTitle={t("noPhotocopyTitle")}
                emptyDescription={t("noPhotocopyDesc")}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: SALARY ADVANCES                                                    */}
      {/* ========================================================================= */}
      {currentTab === "advances" && (
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
            <CardHeader className="p-5 border-b border-border">
              <CardTitle className="text-section-title font-bold text-gray-900">
                {t("salaryAdvancesLogTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <DataTable
                columns={[
                  { header: t("idCol"), accessor: "id" },
                  { header: t("teacher"), accessor: "teacherName" },
                  { header: t("advanceAmount"), accessor: "amount", align: "end" },
                  { header: t("date"), accessor: "date", align: "center" },
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
                  </tr>
                )}
                emptyTitle={t("noAdvancesTitle")}
                emptyDescription={t("noAdvancesDesc")}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: TEACHER PAY RATES CONFIGURATION                                    */}
      {/* ========================================================================= */}
      {currentTab === "rates" && (
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
