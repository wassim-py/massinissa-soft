"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, Column } from "@/components/ui/DataTable";
import { TeacherPayrollCalculation } from "@/lib/payroll";
import {
  Coins,
  CheckCircle2,
  Building2,
  BookOpen,
  UserX,
  Calculator,
  Save,
  Calendar,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import {
  calculateIndividualTeacherPayrollAction,
  generateIndividualTeacherPayrollAction,
} from "@/lib/actions";
import { PrintPayslipButton } from "@/components/PrintPayslipButton";
import { PayslipPrintData } from "@/components/printable/PayslipTicket";

interface TeacherPayrollSectionProps {
  teacherId: string;
  teacherName: string;
  teacherPhone?: string | null;
  payroll: TeacherPayrollCalculation | null;
  periodLabel: string;
  isOwner?: boolean;
}

export default function TeacherPayrollSection({
  teacherId,
  teacherName,
  teacherPhone,
  payroll,
  periodLabel,
  isOwner = false,
}: TeacherPayrollSectionProps) {
  const t = useTranslations("teacherProfile");
  const locale = useLocale();

  // Helper for initial month bounds
  const getInitialDates = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const start = new Date(Date.UTC(y, m, 1)).toISOString().split("T")[0];
    const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().split("T")[0];
    return { start, end };
  };

  const initialDates = getInitialDates();
  const [currentPayroll, setCurrentPayroll] = useState<TeacherPayrollCalculation | null>(payroll);
  const [currentPeriodLabel, setCurrentPeriodLabel] = useState<string>(periodLabel);
  const [startDate, setStartDate] = useState<string>(initialDates.start);
  const [endDate, setEndDate] = useState<string>(initialDates.end);
  const [activePreset, setActivePreset] = useState<"thisMonth" | "lastMonth" | "custom">("thisMonth");
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedRunId, setSavedRunId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [, startTransition] = useTransition();

  const setPresetThisMonth = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const start = new Date(Date.UTC(y, m, 1)).toISOString().split("T")[0];
    const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().split("T")[0];
    setStartDate(start);
    setEndDate(end);
    setActivePreset("thisMonth");
  };

  const setPresetLastMonth = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().split("T")[0];
    const end = new Date(Date.UTC(y, m, 0)).toISOString().split("T")[0];
    setStartDate(start);
    setEndDate(end);
    setActivePreset("lastMonth");
  };

  const handleCalculate = () => {
    if (!startDate || !endDate) return;
    setIsCalculating(true);
    setFeedback(null);
    startTransition(async () => {
      const res = await calculateIndividualTeacherPayrollAction({
        teacherId,
        startDate,
        endDate,
      });
      setIsCalculating(false);
      if (res.success && res.payroll) {
        setCurrentPayroll(res.payroll);
        const dStart = new Date(startDate);
        const dEnd = new Date(endDate);
        const df = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        setCurrentPeriodLabel(`${df.format(dStart)} - ${df.format(dEnd)}`);
        setSavedRunId(null);
        setFeedback({
          type: "success",
          message: t("calculationSuccessToast"),
        });
      } else {
        setFeedback({
          type: "error",
          message: res.message || "Erreur lors du calcul",
        });
      }
    });
  };

  const handleSavePayslip = () => {
    if (!startDate || !endDate) return;
    setIsSaving(true);
    setFeedback(null);
    startTransition(async () => {
      const res = await generateIndividualTeacherPayrollAction({
        teacherId,
        startDate,
        endDate,
      });
      setIsSaving(false);
      if (res.success && res.payrollRunId) {
        setSavedRunId(res.payrollRunId);
        setFeedback({
          type: "success",
          message: t("payslipSavedSuccess", { runId: res.payrollRunId }),
        });
      } else {
        setFeedback({
          type: "error",
          message: res.message || "Erreur lors de l'enregistrement",
        });
      }
    });
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  };

  const formatDZD = (num: number) => `${Number(num || 0).toLocaleString(locale)} DZD`;

  // Printable data preparation
  const printData: PayslipPrintData | null = currentPayroll
    ? {
        id: savedRunId || 0,
        periodStart: startDate,
        periodEnd: endDate,
        status: savedRunId ? "SAVED" : "ESTIMATED",
        teacher: {
          id: teacherId,
          name: teacherName,
          phone: teacherPhone || null,
        },
        sessionsCount: currentPayroll.totalSessions,
        paidSessionsCount: currentPayroll.totalPaidSessions ?? (
          currentPayroll.sessionDetails
            ? currentPayroll.sessionDetails.filter((s) => !s.isFree && !s.isTeacherAbsent && !s.isRetroactive).length
            : currentPayroll.totalSessions - (currentPayroll.totalFreeSessions ?? 0)
        ),
        freeSessionsCount: currentPayroll.totalFreeSessions ?? currentPayroll.sessionDetails?.filter((s) => s.isFree && !s.isTeacherAbsent && !s.isRetroactive).length,
        teacherAbsencesCount: currentPayroll.teacherAbsencesCount,
        grossAmount: currentPayroll.grossAmount,
        bookRevenue: currentPayroll.bookRevenue,
        bookRevenueDetails: currentPayroll.bookRevenueDetails,
        advances: currentPayroll.salaryAdvances,
        photocopyDeductions: currentPayroll.photocopyDeductions,
        netAmount: currentPayroll.netAmount,
        branchLines: currentPayroll.branchBreakdown.map((b) => ({
          branchId: b.branchId,
          branchName: b.branchName,
          sessionsCount: b.sessionsCount,
          freeSessionsCount: b.freeSessionsCount,
          amount: b.amount,
        })),
        groupLines: currentPayroll.groupBreakdown,
        sessions: currentPayroll.sessionDetails?.map((s) => ({
          lessonId: s.lessonId,
          startsAt: s.startsAt,
          className: s.className,
          branchName: s.branchName,
          presentCount: s.presentCount,
          payingCount: s.payingCount,
          sessionPrice: s.sessionPrice,
          teacherCut: s.teacherCut,
          lessonAmount: s.lessonAmount,
          isFree: s.isFree,
          isExtra: s.isExtra,
          isCatchUp: s.isCatchUp,
          isTeacherAbsent: s.isTeacherAbsent,
          isRetroactive: s.isRetroactive,
          retroactiveNote: s.retroactiveNote,
          isFormation: s.isFormation,
        })),
        photocopyDetails: currentPayroll.photocopyChargeDetails?.map((p) => ({
          branchName: p.branchName,
          pages: p.pages,
          costAmount: p.costAmount,
          date: p.date,
        })),
      }
    : null;

  const percentage = currentPayroll?.percentageOfSessionFee ?? 0;
  const sessions = currentPayroll?.sessionDetails || [];

  const totalTuitionGross = currentPayroll?.totalTuitionGross ?? sessions.reduce((acc, s) => {
    const count = s.payingCount ?? s.presentCount ?? 0;
    return acc + count * s.sessionPrice;
  }, 0);
  const schoolShareAmount = currentPayroll?.schoolGrossAmount ?? (
    currentPayroll
      ? Math.max(0, totalTuitionGross - (currentPayroll.grossAmount - (currentPayroll.bookRevenue || 0)))
      : 0
  );
  const effectiveSchoolRate = totalTuitionGross > 0
    ? Math.round((schoolShareAmount / totalTuitionGross) * 100)
    : Math.max(0, 100 - percentage);

  const sessionColumns: Column[] = [
    { header: t("colDateTime"), accessor: "startsAt" },
    { header: t("colGroup"), accessor: "className" },
    { header: t("colBranch"), accessor: "branchName" },
    { header: t("colType"), accessor: "type", align: "center" },
    {
      header: locale === "ar" ? "الحضور / الدفع" : "Présents / Payants",
      accessor: "presentCount",
      align: "center",
    },
    { header: t("colSessionPrice"), accessor: "sessionPrice", align: "end" },
    { header: t("colAppliedRate"), accessor: "appliedPercentage", align: "center" },
    { header: t("colTeacherCut"), accessor: "teacherCut", align: "end" },
    { header: t("colSchoolCut"), accessor: "schoolCut", align: "end" },
    { header: t("colLessonTotal"), accessor: "lessonAmount", align: "end" },
  ];

  return (
    <Card className="border-border/80 shadow-xs" id="teacher-payroll-section">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-primary" />
              <span>{t("payrollTitle")}</span>
            </CardTitle>
            <CardDescription className="mt-1">
              {t("payrollDesc")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Badge variant="primary" size="md">
              {t("period", { period: currentPeriodLabel })}
            </Badge>
            {percentage > 0 && (
              <Badge variant="success" size="md">
                {t("approvedRate", { rate: percentage })}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-2">
        {/* SEPARATED INDIVIDUAL PAYROLL CALCULATION BAR (OWNER ONLY) */}
        {isOwner && (
          <div className="bg-gradient-to-br from-primary/5 via-surface to-primary/5 p-4 sm:p-5 rounded-2xl border-2 border-primary/20 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border/80">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Calculator className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">
                    {t("individualCalculationTitle")}
                  </h3>
                  <Badge variant="primary" size="sm" className="font-semibold">
                    {t("ownerPayrollTag")}
                  </Badge>
                </div>
                <p className="text-xs text-muted mt-1">
                  {t("individualCalculationDesc")}
                </p>
              </div>

              {/* Quick Period Presets */}
              <div className="flex items-center gap-1.5 p-1 bg-surface-subtle border border-border/70 rounded-xl self-start md:self-auto">
                <button
                  type="button"
                  onClick={setPresetThisMonth}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activePreset === "thisMonth"
                      ? "bg-white text-primary shadow-xs font-bold"
                      : "text-muted hover:text-gray-900"
                  }`}
                >
                  {t("presetThisMonth")}
                </button>
                <button
                  type="button"
                  onClick={setPresetLastMonth}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activePreset === "lastMonth"
                      ? "bg-white text-primary shadow-xs font-bold"
                      : "text-muted hover:text-gray-900"
                  }`}
                >
                  {t("presetLastMonth")}
                </button>
              </div>
            </div>

            {/* Inputs & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3.5 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-muted" />
                    <span>{t("periodStartDate")}</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setActivePreset("custom");
                    }}
                    className="text-xs font-mono px-3 py-2 rounded-lg border border-border bg-surface text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-muted" />
                    <span>{t("periodEndDate")}</span>
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setActivePreset("custom");
                    }}
                    className="text-xs font-mono px-3 py-2 rounded-lg border border-border bg-surface text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-xs"
                  />
                </div>

                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleCalculate}
                  disabled={isCalculating || !startDate || !endDate}
                  isLoading={isCalculating}
                  className="self-end shadow-xs cursor-pointer h-[38px]"
                  leftIcon={<Calculator className="w-4 h-4" />}
                >
                  {isCalculating ? t("calculatingPayroll") : t("calculateNow")}
                </Button>
              </div>

              {/* Secondary Actions when calculation is available */}
              {currentPayroll && (
                <div className="flex items-center gap-2 self-end flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    onClick={handleSavePayslip}
                    disabled={isSaving || isCalculating}
                    isLoading={isSaving}
                    className="text-xs border-primary/30 text-primary hover:bg-primary/5 cursor-pointer h-[38px]"
                    leftIcon={<Save className="w-3.5 h-3.5" />}
                  >
                    {isSaving ? t("savingPayslip") : t("savePayslipBtn")}
                  </Button>

                  {printData && (
                    <PrintPayslipButton
                      data={printData}
                      label={t("printPayslipBtn")}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3.5 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer h-[38px]"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Feedback notification */}
            {feedback && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between border ${
                  feedback.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-rose-50 text-rose-800 border-rose-200"
                }`}
              >
                <span>{feedback.message}</span>
                <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  className="text-xs underline hover:no-underline font-normal cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )}

        {/* If no payroll data for selected period */}
        {!currentPayroll ? (
          <div className="p-8 text-center text-muted text-table-body bg-surface-subtle/40 rounded-xl border border-dashed border-border/80">
            <Coins className="w-8 h-8 text-muted mx-auto mb-2 opacity-40" />
            <p>{t("noPayrollData", { period: currentPeriodLabel })}</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div
              className={`grid grid-cols-2 ${
                (currentPayroll.bookRevenue ?? 0) > 0
                  ? "lg:grid-cols-4 xl:grid-cols-8"
                  : "lg:grid-cols-4 xl:grid-cols-7"
              } gap-3.5`}
            >
              {/* Payable Lessons count */}
              <div className="bg-blue-50/80 p-4 rounded-xl border-2 border-blue-200/80 flex flex-col justify-between shadow-xs">
                <span className="text-xs text-blue-900 font-bold">
                  {locale === "ar" ? "الحصص المستحقة (تلاميذ)" : "Séances payables"}
                </span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-black text-blue-950 font-mono">
                    {currentPayroll.groupBreakdown
                      ? currentPayroll.groupBreakdown.reduce((sum, g) => sum + (g.payableLessonsCount ?? g.paidSessionsCount ?? 0), 0)
                      : (currentPayroll.totalPaidSessions ?? currentPayroll.totalSessions)}
                  </span>
                  <span className="text-xs text-blue-700 font-semibold">{t("sessionsUnit")}</span>
                </div>
              </div>

              {/* Sessions count */}
              <div className="bg-surface-subtle/70 p-4 rounded-xl border border-border/80 flex flex-col justify-between shadow-xs">
                <span className="text-xs text-muted font-medium">{t("completedSessions")}</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-gray-900">
                    {currentPayroll.totalSessions}
                  </span>
                  <span className="text-xs text-muted">{t("sessionsUnit")}</span>
                </div>
              </div>

              {/* Teacher Absences */}
              <div
                className={`p-4 rounded-xl border flex flex-col justify-between shadow-xs ${
                  (currentPayroll.teacherAbsencesCount ?? 0) > 0
                    ? "bg-rose-50/80 border-rose-200"
                    : "bg-surface-subtle/70 border-border/80"
                }`}
              >
                <span
                  className={`text-xs font-medium ${
                    (currentPayroll.teacherAbsencesCount ?? 0) > 0 ? "text-rose-800" : "text-muted"
                  }`}
                >
                  {locale === "ar" ? "غيابات الأستاذ" : "Absences enseignant"}
                </span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span
                    className={`text-2xl font-bold ${
                      (currentPayroll.teacherAbsencesCount ?? 0) > 0
                        ? "text-rose-700"
                        : "text-gray-900"
                    }`}
                  >
                    {currentPayroll.teacherAbsencesCount ?? 0}
                  </span>
                  <span
                    className={`text-xs ${
                      (currentPayroll.teacherAbsencesCount ?? 0) > 0 ? "text-rose-600" : "text-muted"
                    }`}
                  >
                    {t("sessionsUnit")}
                  </span>
                </div>
              </div>

              {/* Total Actual Attendances */}
              <div className="bg-surface-subtle/70 p-4 rounded-xl border border-border/80 flex flex-col justify-between shadow-xs">
                <span className="text-xs text-muted font-medium">{t("actualAttendance")}</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-primary">
                    {currentPayroll.totalPresentAttendances ?? 0}
                  </span>
                  <span className="text-xs text-muted">{t("attendanceUnit")}</span>
                </div>
              </div>

              {/* Gross Amount */}
              <div className="bg-surface-subtle/70 p-4 rounded-xl border border-border/80 flex flex-col justify-between shadow-xs">
                <span className="text-xs text-muted font-medium">{t("grossSalary")}</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-success-text">
                    {formatDZD(currentPayroll.grossAmount)}
                  </span>
                </div>
              </div>

              {/* 100% Book Revenue KPI Card */}
              {(currentPayroll.bookRevenue ?? 0) > 0 && (
                <div className="bg-purple-50/70 p-4 rounded-xl border border-purple-200/80 flex flex-col justify-between shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-purple-900 font-bold flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5 text-purple-700" />
                      <span>{locale === "ar" ? "الكتب (100%)" : "Livres (100%)"}</span>
                    </span>
                    <Badge variant="secondary" size="sm" className="bg-purple-200 text-purple-900 font-bold">
                      100%
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-purple-900">
                      {formatDZD(currentPayroll.bookRevenue || 0)}
                    </span>
                  </div>
                </div>
              )}

              {/* School Share Card */}
              <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-200/80 flex flex-col justify-between shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-blue-900 font-semibold">{t("schoolShareTitle")}</span>
                  <Badge variant="primary" size="sm" title={`${formatDZD(schoolShareAmount)} / ${formatDZD(totalTuitionGross)}`}>
                    {effectiveSchoolRate}%
                  </Badge>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-blue-900">
                    {formatDZD(schoolShareAmount)}
                  </span>
                </div>
              </div>

              {/* Deductions: Advances & Photocopies */}
              <div className="bg-surface-subtle/70 p-4 rounded-xl border border-border/80 flex flex-col justify-between shadow-xs">
                <span className="text-xs text-muted font-medium">{t("totalDeductions")}</span>
                <div className="mt-1 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">{t("copiesDeduction")}</span>
                    <span className="font-semibold text-warning-text">
                      - {formatDZD(currentPayroll.photocopyDeductions)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">{t("advancesDeduction")}</span>
                    <span className="font-semibold text-danger">
                      - {formatDZD(currentPayroll.salaryAdvances)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Net Amount Due */}
              <div className="bg-emerald-50/70 border-2 border-emerald-300 p-4 rounded-xl flex flex-col justify-between shadow-xs">
                <span className="text-xs font-bold text-emerald-800">{t("netDueAmount")}</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-black text-emerald-900">
                    {formatDZD(currentPayroll.netAmount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Group Breakdown Card */}
            {currentPayroll.groupBreakdown && currentPayroll.groupBreakdown.length > 0 && (
              <div className="bg-surface-subtle/40 p-4 rounded-xl border border-border/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-primary" />
                    <span>{locale === "ar" ? "توزيع الحصص حسب الأفواج" : "Répartition par groupe / classe"}</span>
                  </h4>
                  <Badge variant="primary" size="sm">
                    {locale === "ar"
                      ? `${currentPayroll.groupBreakdown.length} فوج`
                      : `${currentPayroll.groupBreakdown.length} groupe(s)`}
                  </Badge>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-start border-collapse">
                    <thead>
                      <tr className="bg-surface-subtle border-b border-border/80 text-muted font-semibold">
                        <th className="p-2.5 text-start">{locale === "ar" ? "الفوج / القسم" : "Groupe / Classe"}</th>
                        <th className="p-2.5 text-start">{locale === "ar" ? "الفرع" : "Succursale"}</th>
                        <th className="p-2.5 text-center">{locale === "ar" ? "حصص التدريس" : "Séances de cours"}</th>
                        <th className="p-2.5 text-center text-blue-900 font-bold bg-blue-50/50">{locale === "ar" ? "الحصص المستحقة" : "Séances payables"}</th>
                        <th className="p-2.5 text-center text-orange-900 bg-orange-50/40">{locale === "ar" ? "حصص مجانية" : "Séances gratuites"}</th>
                        <th className="p-2.5 text-center">{locale === "ar" ? "النسبة المطبقة" : "Taux appliqué"}</th>
                        <th className="p-2.5 text-end font-bold text-success-text">{locale === "ar" ? "حصة الأستاذ" : "Part Enseignant"}</th>
                        <th className="p-2.5 text-end font-bold text-blue-800">{locale === "ar" ? "حصة المدرسة" : "Part École"}</th>
                        <th className="p-2.5 text-end font-bold text-gray-900">{locale === "ar" ? "إجمالي الرسوم" : "Total Scolarité"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentPayroll.groupBreakdown.map((g, idx) => {
                        const gRate = g.appliedPercentage ?? percentage;
                        const isCustom = g.appliedPercentage !== undefined && g.appliedPercentage !== percentage;
                        return (
                          <tr key={idx} className="border-b border-border/50 hover:bg-surface-subtle/60 transition-colors">
                            <td className="p-2.5 font-bold text-gray-900">{g.className}</td>
                            <td className="p-2.5 text-muted">{g.branchName}</td>
                            <td className="p-2.5 text-center font-mono font-semibold">{g.courseSessionsCount ?? Math.max(0, g.totalSessionsCount - g.freeSessionsCount)}</td>
                            <td className="p-2.5 text-center font-mono font-bold text-blue-900 bg-blue-50/20 text-sm">{g.payableLessonsCount ?? g.paidSessionsCount}</td>
                            <td className="p-2.5 text-center font-mono text-orange-800 bg-orange-50/20">{g.freeSessionsCount}</td>
                            <td className="p-2.5 text-center">
                              <Badge variant={isCustom ? "success" : "neutral"} size="sm" className="font-mono font-semibold">
                                {gRate}% / {100 - gRate}%
                              </Badge>
                            </td>
                            <td className="p-2.5 text-end font-mono font-bold text-success-text">{formatDZD(g.amount)}</td>
                            <td className="p-2.5 text-end font-mono font-bold text-blue-800">{formatDZD(g.schoolAmount || 0)}</td>
                            <td className="p-2.5 text-end font-mono font-semibold text-gray-800">{formatDZD(g.tuitionGross || 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {currentPayroll.groupBreakdown.length > 1 && (
                      <tfoot>
                        <tr className="bg-surface-subtle font-bold border-t-2 border-border/80 text-gray-900">
                          <td className="p-2.5" colSpan={2}>{locale === "ar" ? "المجموع الكلي" : "Total général"}</td>
                          <td className="p-2.5 text-center font-mono">
                            {currentPayroll.groupBreakdown.reduce((s, g) => s + (g.courseSessionsCount ?? Math.max(0, g.totalSessionsCount - g.freeSessionsCount)), 0)}
                          </td>
                          <td className="p-2.5 text-center font-mono text-blue-900 bg-blue-50/40 text-sm">
                            {Math.round(currentPayroll.groupBreakdown.reduce((s, g) => s + (g.payableLessonsCount ?? g.paidSessionsCount ?? 0), 0) * 100) / 100}
                          </td>
                          <td className="p-2.5 text-center font-mono text-orange-800 bg-orange-50/30">
                            {currentPayroll.groupBreakdown.reduce((s, g) => s + (g.freeSessionsCount ?? 0), 0)}
                          </td>
                          <td className="p-2.5 text-center">
                            <Badge variant="primary" size="sm" className="font-mono font-bold">
                              {100 - effectiveSchoolRate}% / {effectiveSchoolRate}%
                            </Badge>
                          </td>
                          <td className="p-2.5 text-end font-mono text-success-text font-bold">
                            {formatDZD(currentPayroll.groupBreakdown.reduce((s, g) => s + (g.amount ?? 0), 0))}
                          </td>
                          <td className="p-2.5 text-end font-mono text-blue-800 font-bold">
                            {formatDZD(currentPayroll.groupBreakdown.reduce((s, g) => s + (g.schoolAmount ?? 0), 0))}
                          </td>
                          <td className="p-2.5 text-end font-mono text-gray-900 font-bold">
                            {formatDZD(currentPayroll.groupBreakdown.reduce((s, g) => s + (g.tuitionGross ?? 0), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            {/* Formation Student Contribution Breakdown */}
            {currentPayroll.formationStudentBreakdown && currentPayroll.formationStudentBreakdown.length > 0 && (
              <div className="space-y-3 p-4 rounded-xl border border-teal-200 bg-teal-50/30">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-teal-600" />
                    <span>{locale === "ar" ? "تفاصيل اشتراكات الدورات التكوينية (نظام 50% لكل دورة شهرية)" : "Détail des paiements de formation (50% Cycle 1 / 50% Cycle 2)"}</span>
                  </h4>
                  <Badge variant="neutral" size="sm" className="font-semibold text-teal-800 bg-teal-100">
                    {currentPayroll.formationStudentBreakdown.length} {locale === "ar" ? "تلميذ مسجل" : "élève(s)"}
                  </Badge>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-start border-collapse bg-white rounded-lg border border-teal-100 shadow-2xs">
                    <thead>
                      <tr className="bg-teal-50/80 border-b border-teal-200 text-teal-950 font-bold">
                        <th className="p-2.5 text-start">{locale === "ar" ? "التلميذ" : "Élève"}</th>
                        <th className="p-2.5 text-start">{locale === "ar" ? "الفوج التكويني" : "Groupe"}</th>
                        <th className="p-2.5 text-center">{locale === "ar" ? "الدورة" : "Cycle"}</th>
                        <th className="p-2.5 text-end">{locale === "ar" ? "سعر المستوى" : "Forfait Niveau"}</th>
                        <th className="p-2.5 text-end">{locale === "ar" ? "المدفوع حتى الآن" : "Payé à ce jour"}</th>
                        <th className="p-2.5 text-end font-bold text-teal-900 bg-teal-100/50">{locale === "ar" ? "المحتسب هذا الشهر" : "Base ce mois"}</th>
                        <th className="p-2.5 text-center">{locale === "ar" ? "النسبة" : "Taux"}</th>
                        <th className="p-2.5 text-end font-bold text-success-text">{locale === "ar" ? "حصة الأستاذ" : "Part Enseignant"}</th>
                        <th className="p-2.5 text-end font-bold text-blue-800">{locale === "ar" ? "حصة المدرسة" : "Part École"}</th>
                        <th className="p-2.5 text-center">{locale === "ar" ? "الحالة" : "Statut"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-teal-100">
                      {currentPayroll.formationStudentBreakdown.map((fsb, idx) => (
                        <tr key={idx} className="hover:bg-teal-50/40 transition-colors">
                          <td className="p-2.5 font-bold text-gray-900">{fsb.studentName}</td>
                          <td className="p-2.5 text-gray-700">{fsb.className}</td>
                          <td className="p-2.5 text-center">
                            <Badge variant={fsb.cycleNumber === 1 ? "primary" : "secondary"} size="sm" className="font-semibold">
                              Cycle {fsb.cycleNumber}/2
                            </Badge>
                          </td>
                          <td className="p-2.5 text-end font-mono text-gray-700">{formatDZD(fsb.totalLevelPrice)}</td>
                          <td className="p-2.5 text-end font-mono font-semibold text-gray-900">{formatDZD(fsb.totalPaidToDate)}</td>
                          <td className="p-2.5 text-end font-mono font-bold text-teal-950 bg-teal-50/50">{formatDZD(fsb.cycleRecognizedBase)}</td>
                          <td className="p-2.5 text-center font-mono font-semibold text-gray-700">{fsb.teacherPercentage}%</td>
                          <td className="p-2.5 text-end font-mono font-bold text-success-text">{formatDZD(fsb.teacherAmount)}</td>
                          <td className="p-2.5 text-end font-mono font-bold text-blue-800">{formatDZD(fsb.schoolAmount)}</td>
                          <td className="p-2.5 text-center">
                            <Badge
                              variant={fsb.status === "FULL" ? "success" : fsb.status === "PARTIAL" ? "warning" : "danger"}
                              size="sm"
                              className="font-bold"
                            >
                              {fsb.status === "FULL"
                                ? (locale === "ar" ? "مدفوع بالكامل" : "Complet")
                                : fsb.status === "PARTIAL"
                                ? (locale === "ar" ? "دفع جزئي" : "Partiel")
                                : (locale === "ar" ? "غير دافع" : "Non payé")}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-teal-50/60 font-bold border-t border-teal-200 text-gray-900">
                      <tr>
                        <td className="p-2.5" colSpan={4}>{locale === "ar" ? "إجمالي التكوين" : "Total Formation"}</td>
                        <td className="p-2.5 text-end font-mono">
                          {formatDZD(currentPayroll.formationStudentBreakdown.reduce((sum, f) => sum + f.totalPaidToDate, 0))}
                        </td>
                        <td className="p-2.5 text-end font-mono font-black text-teal-950 bg-teal-100/60">
                          {formatDZD(currentPayroll.formationStudentBreakdown.reduce((sum, f) => sum + f.cycleRecognizedBase, 0))}
                        </td>
                        <td className="p-2.5 text-center font-mono">-</td>
                        <td className="p-2.5 text-end font-mono text-success-text font-black">
                          {formatDZD(currentPayroll.formationStudentBreakdown.reduce((sum, f) => sum + f.teacherAmount, 0))}
                        </td>
                        <td className="p-2.5 text-end font-mono text-blue-800 font-black">
                          {formatDZD(currentPayroll.formationStudentBreakdown.reduce((sum, f) => sum + f.schoolAmount, 0))}
                        </td>
                        <td className="p-2.5 text-center">-</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Granular Session Breakdown Table using DataTable */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{t("granularBreakdownTitle")}</span>
                </h4>
                <span className="text-xs text-muted">
                  {t("formulaNote", { rate: percentage })}
                </span>
              </div>

              <DataTable
                columns={sessionColumns}
                data={sessions}
                renderRow={(s, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body ${
                      s.isTeacherAbsent
                        ? "bg-rose-50/60 border-l-4 border-l-rose-500"
                        : s.isFree
                        ? "bg-orange-50/50 border-l-4 border-l-orange-500"
                        : ""
                    }`}
                  >
                    <td className="p-3.5 text-gray-800 font-medium">
                      {formatDate(s.startsAt)}
                    </td>
                    <td className="p-3.5 font-semibold text-gray-900">
                      {s.className}
                    </td>
                    <td className="p-3.5 text-gray-600">
                      {s.branchName}
                    </td>
                    <td className="p-3.5 text-center">
                      {s.isTeacherAbsent ? (
                        <Badge size="sm" className="bg-rose-100 text-rose-800 border-rose-300 font-bold">
                          {locale === "ar" ? "غياب الأستاذ" : "Enseignant absent"}
                        </Badge>
                      ) : s.isFormation ? (
                        <Badge size="sm" className="bg-teal-100 text-teal-800 border-teal-300 font-bold">
                          {locale === "ar" ? "دورة تكوينية" : "Formation"}
                        </Badge>
                      ) : s.isRetroactive ? (
                        <Badge size="sm" className="bg-purple-100 text-purple-800 border-purple-300 font-bold">
                          {locale === "ar" ? "تسوية متأخرة" : "Régularisation"}
                        </Badge>
                      ) : s.isFree ? (
                        <Badge size="sm" className="bg-orange-100 text-orange-800 border-orange-300 font-bold">
                          {t("lessonTypeFree")}
                        </Badge>
                      ) : s.isExtra ? (
                        <Badge variant="warning" size="sm">{t("lessonTypeExtra")}</Badge>
                      ) : s.isCatchUp ? (
                        <Badge variant="secondary" size="sm">{t("lessonTypeCatchUp")}</Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">{t("lessonTypeNormal")}</Badge>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      {s.isTeacherAbsent ? (
                        <span className="text-xs text-rose-700 font-medium">
                          {locale === "ar" ? "غياب مسجل" : "Absent"}
                        </span>
                      ) : s.isFormation ? (
                        <div className="flex flex-col items-center">
                          <span className="font-bold text-teal-900">{s.presentCount} {t("presentUnit")}</span>
                          <span className="text-[10px] text-teal-700 font-medium">{locale === "ar" ? "اشتراك شهري" : "Forfait"}</span>
                        </div>
                      ) : s.isRetroactive ? (
                        <div className="flex flex-col items-center">
                          <span className="font-bold text-purple-900">{s.payingCount} {locale === "ar" ? "مسوى" : "régul."}</span>
                          {s.retroactiveNote && (
                            <span className="text-[10px] text-purple-700 font-medium max-w-[150px] truncate" title={s.retroactiveNote}>
                              {s.retroactiveNote}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <span className="font-bold text-primary">{s.presentCount} {t("presentUnit")}</span>
                          {s.payingCount !== undefined && s.payingCount !== s.presentCount && (
                            <span className="text-[11px] text-muted font-medium">
                              ({s.payingCount} {locale === "ar" ? "دافع" : "payant"})
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-3.5 text-end text-gray-700">
                      {s.isFormation ? "-" : formatDZD(s.sessionPrice)}
                    </td>
                    <td className="p-3.5 text-center">
                      {s.isTeacherAbsent ? (
                        <span className="text-xs text-muted">-</span>
                      ) : s.appliedPercentage !== undefined ? (
                        <Badge
                          variant={s.appliedPercentage !== percentage ? "success" : "neutral"}
                          size="sm"
                          className="font-mono font-semibold"
                        >
                          {s.appliedPercentage}%
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm" className="font-mono">
                          {percentage}%
                        </Badge>
                      )}
                    </td>
                    <td className="p-3.5 text-end text-success-text font-semibold">
                      {s.isTeacherAbsent ? "0 DZD" : s.isFormation ? "-" : formatDZD(Math.round(s.teacherCut))}
                    </td>
                    <td className="p-3.5 text-end text-blue-700 font-semibold">
                      {s.isTeacherAbsent ? "0 DZD" : s.isFormation ? "-" : formatDZD(Math.round(Math.max(0, s.sessionPrice - s.teacherCut)))}
                    </td>
                    <td className="p-3.5 text-end font-bold text-gray-900">
                      {s.isTeacherAbsent ? (
                        <span className="text-xs text-rose-600 font-bold">0 DZD</span>
                      ) : s.isFormation ? (
                        <span className="text-xs text-teal-700 font-semibold">{locale === "ar" ? "مشمول في الفوج" : "Forfait mensuel"}</span>
                      ) : (
                        formatDZD(s.lessonAmount)
                      )}
                    </td>
                  </tr>
                )}
                emptyTitle={t("emptyPayrollTitle")}
                emptyDescription={t("emptyPayrollDesc")}
              />

              {/* Dedicated Teacher Absences Summary */}
              {((currentPayroll.teacherAbsencesCount ?? 0) > 0 || (currentPayroll.absentSessions && currentPayroll.absentSessions.length > 0)) && (
                <div className="mt-4 p-4 bg-rose-50/70 border border-rose-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-rose-900 flex items-center gap-1.5">
                      <UserX className="w-4 h-4 text-rose-600" />
                      <span>{locale === "ar" ? "سجل غيابات الأستاذ (غير مدفوعة)" : "Séances d'absence de l'enseignant (Non rémunérées)"}</span>
                    </h4>
                    <Badge variant="danger" size="sm">
                      {currentPayroll.teacherAbsencesCount || currentPayroll.absentSessions?.length || 0} {t("sessionsUnit")}
                    </Badge>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-rose-200 bg-white">
                    <table className="w-full text-xs text-start">
                      <thead>
                        <tr className="bg-rose-100/60 border-b border-rose-200 text-rose-900 font-semibold">
                          <th className="p-2.5 text-start">{t("colDateTime")}</th>
                          <th className="p-2.5 text-start">{t("colGroup")}</th>
                          <th className="p-2.5 text-start">{t("colBranch")}</th>
                          <th className="p-2.5 text-end">{locale === "ar" ? "الأثر المالي" : "Impact financier"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(currentPayroll.absentSessions || []).map((abs, i) => (
                          <tr key={i} className="border-b border-rose-100 text-gray-800 last:border-b-0 hover:bg-rose-50/40">
                            <td className="p-2.5 font-medium">{formatDate(abs.startsAt)}</td>
                            <td className="p-2.5 font-semibold text-gray-900">{abs.className}</td>
                            <td className="p-2.5 text-gray-600">{abs.branchName}</td>
                            <td className="p-2.5 text-end font-mono text-rose-700 font-bold">
                              0 DZD ({locale === "ar" ? "غير مدفوعة" : "Non rémunéré"})
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Book Revenue Details */}
            {currentPayroll.bookRevenueDetails && currentPayroll.bookRevenueDetails.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-purple-600" />
                    <span>{locale === "ar" ? "مبيعات الكتب (100% للأستاذ)" : "Ventes de livres (100% Enseignant)"}</span>
                  </h4>
                  <Badge variant="secondary" className="bg-purple-100 text-purple-900 font-bold border-purple-300">
                    {formatDZD(currentPayroll.bookRevenue || 0)}
                  </Badge>
                </div>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-xs text-start">
                    <thead className="bg-surface-subtle text-muted border-b border-border">
                      <tr>
                        <th className="p-2.5 text-start font-semibold">{locale === "ar" ? "التاريخ" : "Date"}</th>
                        <th className="p-2.5 text-start font-semibold">{locale === "ar" ? "الكتاب" : "Livre"}</th>
                        <th className="p-2.5 text-start font-semibold">{locale === "ar" ? "التلميذ" : "Élève"}</th>
                        <th className="p-2.5 text-start font-semibold">{locale === "ar" ? "الفرع" : "Siège"}</th>
                        <th className="p-2.5 text-end font-semibold">{locale === "ar" ? "المبلغ (100%)" : "Montant (100%)"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {currentPayroll.bookRevenueDetails.map((b, idx) => (
                        <tr key={idx} className="hover:bg-surface-subtle/60 transition-colors">
                          <td className="p-2.5 text-gray-700 font-medium">{formatDate(b.date)}</td>
                          <td className="p-2.5 font-bold text-gray-900">{b.bookTitle || "Livre"}</td>
                          <td className="p-2.5 text-gray-800">{b.studentName || "Élève"}</td>
                          <td className="p-2.5 text-muted">{b.branchName || "-"}</td>
                          <td className="p-2.5 text-end font-bold text-purple-700">{formatDZD(b.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Consolidated Branch Breakdown */}
            {currentPayroll.branchBreakdown && currentPayroll.branchBreakdown.length > 0 && (
              <div className="pt-4 border-t border-border/80">
                <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5 mb-2.5">
                  <Building2 className="w-3.5 h-3.5 text-muted-dark" />
                  <span>{t("branchBreakdownTitle")}</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {currentPayroll.branchBreakdown.map((b) => (
                    <div
                      key={b.branchId}
                      className="bg-surface-subtle/70 p-3.5 rounded-xl border border-border/80 flex items-center justify-between text-xs shadow-xs"
                    >
                      <div>
                        <span className="font-semibold text-gray-900 block">{b.branchName}</span>
                        <span className="text-xs text-muted">{b.sessionsCount} {t("sessionsUnit")}</span>
                      </div>
                      <div className="text-end">
                        <span className="font-bold text-success-text text-sm block">
                          {formatDZD(b.amount)}
                        </span>
                        <span className="text-xs text-muted">
                          {t("effectiveRatePerSession", { rate: formatDZD(Math.round(b.effectiveRate)) })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
