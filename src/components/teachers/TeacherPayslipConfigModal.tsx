"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Printer,
  BookOpen,
  GraduationCap,
  Calendar,
  Loader2,
  AlertCircle,
  Layers,
  Sparkles,
  Receipt,
  Eye,
  Banknote,
  Copy,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  getTeacherSelectivePayslipDataAction,
  TeacherSelectivePayslipData,
} from "@/lib/financeActions";
import type {
  PayslipPrintData,
  PayslipSalaryGrowthPoint,
} from "@/components/printable/PayslipTicket";
import { useLocale } from "next-intl";
import { buildPrintableReportHtml } from "@/lib/printReportHtml";
import { formatUtcPeriodDate } from "@/lib/algiersDate";

export interface TeacherPayslipConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherId: string;
  teacherName: string;
  teacherPhone?: string | null;
  startDate: string;
  endDate: string;
  payslipId?: number;
  initialBonus?: number;
  initialStatus?: string;
  initialScope?: "all" | "normal" | "formation";
  locale?: string;
}

const round2 = (num: number) => Math.round((Number(num || 0) + Number.EPSILON) * 100) / 100;

function printViaIframe(html: string) {
  let iframe = document.getElementById("teacher-payslip-print-iframe") as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "teacher-payslip-print-iframe";
    iframe.style.position = "fixed";
    iframe.style.right = "100%";
    iframe.style.bottom = "100%";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
  }

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc || !iframe.contentWindow) return;

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  iframe.contentWindow.focus();
  setTimeout(() => {
    try {
      iframe?.contentWindow?.print();
    } catch (e) {
      console.error("Iframe print error:", e);
    }
  }, 400);
}

export default function TeacherPayslipConfigModal({
  isOpen,
  onClose,
  teacherId,
  teacherName,
  teacherPhone,
  startDate,
  endDate,
  payslipId,
  initialBonus = 0,
  initialStatus,
  initialScope = "all",
  locale: propLocale,
}: TeacherPayslipConfigModalProps) {
  const currentLocale = useLocale();
  const locale = propLocale || currentLocale || "fr";
  const isAr = locale === "ar";

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reportData, setReportData] = useState<TeacherSelectivePayslipData | null>(null);

  // Financial calculation & content checkboxes
  const [includeRegularLessons, setIncludeRegularLessons] = useState(true);
  const [includeFormationCourses, setIncludeFormationCourses] = useState(true);
  const [includeBooks, setIncludeBooks] = useState(true);
  const [includeAdvances, setIncludeAdvances] = useState(true);
  const [includePhotocopy, setIncludePhotocopy] = useState(true);
  const [includeBonus, setIncludeBonus] = useState(true);

  // Visual display sections on the printed payslip
  const [showSalaryGrowth, setShowSalaryGrowth] = useState(true);
  const [showGroupBreakdown, setShowGroupBreakdown] = useState(true);
  const [showBranchBreakdown, setShowBranchBreakdown] = useState(true);
  const [showSessionDetails, setShowSessionDetails] = useState(true);
  const [showFreeSessions, setShowFreeSessions] = useState(true);
  const [showTeacherAbsences, setShowTeacherAbsences] = useState(true);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  // Fetch selective payslip data on open
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    getTeacherSelectivePayslipDataAction({
      teacherId,
      startDate,
      endDate,
      payslipId,
      initialBonus,
      status: initialStatus,
    })
      .then((res) => {
        if (isCancelled) return;
        setIsLoading(false);
        if (res.success && res.data) {
          const d = res.data;
          setReportData(d);

          const hasRegular =
            d.regularLessons.grossAmount > 0 ||
            d.regularLessons.sessionsCount > 0 ||
            d.regularLessons.groupLines.length > 0 ||
            d.regularLessons.branchLines.length > 0;
          const hasFormation =
            d.formationCourses.grossAmount > 0 ||
            d.formationCourses.sessionsCount > 0 ||
            d.formationCourses.groupLines.length > 0;
          const hasBooks = d.booksFinance.totalRevenue > 0 || d.booksFinance.vouchersCount > 0;
          const hasAdvances = d.salaryAdvances.total > 0 || d.salaryAdvances.details.length > 0;
          const hasPhotocopy = d.photocopyDeductions.total > 0 || d.photocopyDeductions.details.length > 0;

          setIncludeRegularLessons(
            initialScope === "formation" ? false : hasRegular || (!hasFormation && !hasBooks)
          );
          setIncludeFormationCourses(initialScope === "normal" ? false : hasFormation);
          setIncludeBooks(initialScope === "formation" ? false : hasBooks);
          setIncludeAdvances(hasAdvances);
          setIncludePhotocopy(hasPhotocopy);
          setIncludeBonus(d.bonus !== 0);
        } else {
          setErrorMessage(
            res.message ||
              (isAr
                ? "تعذر تحميل بيانات قسيمة الراتب."
                : "Erreur lors du chargement des données du bulletin de paie.")
          );
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        setIsLoading(false);
        setErrorMessage(
          err?.message ||
            (isAr
              ? "حدث خطأ غير متوقع أثناء تحميل البيانات."
              : "Erreur inattendue lors du chargement des données.")
        );
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, teacherId, startDate, endDate, payslipId, initialBonus, initialStatus, initialScope, isAr]);

  const formatDZD = (num: number) =>
    isAr
      ? `${Number(num || 0).toLocaleString("ar-DZ")} دج`
      : `${Number(num || 0).toLocaleString("fr-DZ")} DZD`;

  const formatPeriodLabel = (iso: string) =>
    formatUtcPeriodDate(iso, isAr ? "ar-DZ" : "fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) || iso;

  const availability = useMemo(() => {
    if (!reportData) {
      return {
        hasRegular: false,
        hasFormation: false,
        hasBooks: false,
        hasAdvances: false,
        hasPhotocopy: false,
        hasBonus: false,
        hasAbsences: false,
      };
    }
    return {
      hasRegular:
        reportData.regularLessons.grossAmount > 0 ||
        reportData.regularLessons.sessionsCount > 0 ||
        reportData.regularLessons.groupLines.length > 0 ||
        reportData.regularLessons.branchLines.length > 0,
      hasFormation:
        reportData.formationCourses.grossAmount > 0 ||
        reportData.formationCourses.sessionsCount > 0 ||
        reportData.formationCourses.groupLines.length > 0,
      hasBooks: reportData.booksFinance.totalRevenue > 0 || reportData.booksFinance.vouchersCount > 0,
      hasAdvances: reportData.salaryAdvances.total > 0 || reportData.salaryAdvances.details.length > 0,
      hasPhotocopy:
        reportData.photocopyDeductions.total > 0 || reportData.photocopyDeductions.details.length > 0,
      hasBonus: reportData.bonus !== 0,
      hasAbsences:
        reportData.regularLessons.teacherAbsencesCount > 0 ||
        reportData.formationCourses.teacherAbsencesCount > 0,
    };
  }, [reportData]);

  // Live financial calculation matching the exact PayslipTicket output
  const calculations = useMemo(() => {
    if (!reportData) {
      return {
        regularAmount: 0,
        formationAmount: 0,
        booksAmount: 0,
        appliedBonus: 0,
        totalGross: 0,
        advancesDeducted: 0,
        photocopyDeducted: 0,
        totalDeductions: 0,
        netPayout: 0,
        sessionsCount: 0,
        paidSessionsCount: 0,
        freeSessionsCount: 0,
        teacherAbsencesCount: 0,
      };
    }

    const regularAmount = includeRegularLessons ? reportData.regularLessons.grossAmount : 0;
    const formationAmount = includeFormationCourses ? reportData.formationCourses.grossAmount : 0;
    const booksAmount = includeBooks ? reportData.booksFinance.totalRevenue : 0;
    const appliedBonus = includeBonus ? reportData.bonus : 0;

    const hasCourses = includeRegularLessons || includeFormationCourses;
    const coursesWithBonus = hasCourses ? Math.max(0, round2(regularAmount + formationAmount + appliedBonus)) : 0;
    const totalGross = hasCourses
      ? round2(coursesWithBonus + booksAmount)
      : Math.max(0, round2(booksAmount + appliedBonus));

    const advancesDeducted = includeAdvances ? reportData.salaryAdvances.total : 0;
    const photocopyDeducted = includePhotocopy ? reportData.photocopyDeductions.total : 0;
    const totalDeductions = round2(advancesDeducted + photocopyDeducted);

    const netPayout = Math.max(0, round2(totalGross - totalDeductions));

    const sessionsCount =
      (includeRegularLessons ? reportData.regularLessons.sessionsCount : 0) +
      (includeFormationCourses ? reportData.formationCourses.sessionsCount : 0);
    const paidSessionsCount =
      (includeRegularLessons ? reportData.regularLessons.paidSessionsCount : 0) +
      (includeFormationCourses ? reportData.formationCourses.paidSessionsCount : 0);
    const freeSessionsCount =
      (includeRegularLessons ? reportData.regularLessons.freeSessionsCount : 0) +
      (includeFormationCourses ? reportData.formationCourses.freeSessionsCount : 0);
    const teacherAbsencesCount =
      (includeRegularLessons ? reportData.regularLessons.teacherAbsencesCount : 0) +
      (includeFormationCourses ? reportData.formationCourses.teacherAbsencesCount : 0);

    return {
      regularAmount,
      formationAmount,
      booksAmount,
      appliedBonus,
      totalGross,
      advancesDeducted,
      photocopyDeducted,
      totalDeductions,
      netPayout,
      sessionsCount,
      paidSessionsCount,
      freeSessionsCount,
      teacherAbsencesCount,
    };
  }, [
    reportData,
    includeRegularLessons,
    includeFormationCourses,
    includeBooks,
    includeAdvances,
    includePhotocopy,
    includeBonus,
  ]);

  const selectionSummaryLabel = useMemo(() => {
    const parts: string[] = [];
    if (includeRegularLessons) parts.push(isAr ? "الدروس" : "Cours");
    if (includeFormationCourses) parts.push(isAr ? "التكوينات" : "Formations");
    if (includeBooks) parts.push(isAr ? "الكتب" : "Livres");
    if (parts.length === 0) return isAr ? "لم يتم تحديد أي بند" : "Aucune rubrique";
    if (availability.hasBooks && !includeBooks) {
      return `${parts.join(" + ")} (${isAr ? "بدون الكتب" : "sans livres"})`;
    }
    return parts.join(" + ");
  }, [includeRegularLessons, includeFormationCourses, includeBooks, availability.hasBooks, isAr]);

  const applyPresetAll = () => {
    setIncludeRegularLessons(availability.hasRegular || (!availability.hasFormation && !availability.hasBooks));
    setIncludeFormationCourses(availability.hasFormation);
    setIncludeBooks(availability.hasBooks);
    setIncludeAdvances(availability.hasAdvances);
    setIncludePhotocopy(availability.hasPhotocopy);
    setIncludeBonus(availability.hasBonus);
  };

  const applyPresetWithoutBooks = () => {
    setIncludeRegularLessons(availability.hasRegular || !availability.hasFormation);
    setIncludeFormationCourses(availability.hasFormation);
    setIncludeBooks(false);
    setIncludeAdvances(availability.hasAdvances);
    setIncludePhotocopy(availability.hasPhotocopy);
    setIncludeBonus(availability.hasBonus);
  };

  const applyPresetBooksOnly = () => {
    setIncludeRegularLessons(false);
    setIncludeFormationCourses(false);
    setIncludeBooks(true);
    setIncludeAdvances(false);
    setIncludePhotocopy(false);
    setIncludeBonus(false);
  };

  const nothingSelected = !includeRegularLessons && !includeFormationCourses && !includeBooks;

  if (!isOpen) return null;

  const handlePrintPayslip = async () => {
    if (!reportData || nothingSelected) return;

    // Open popup window synchronously inside click gesture to avoid popup blockers
    let targetWindow: Window | null = null;
    try {
      targetWindow = window.open("", "_blank", "width=950,height=850");
    } catch {
      targetWindow = null;
    }

    // Merge branch lines from selected financial streams only
    const branchMap = new Map<
      number,
      {
        branchId: number;
        branchName: string;
        sessionsCount: number;
        freeSessionsCount: number;
        amount: number;
      }
    >();

    const addBranchLine = (b: {
      branchId: number;
      branchName: string;
      sessionsCount: number;
      freeSessionsCount?: number;
      amount: number;
    }) => {
      const existing = branchMap.get(b.branchId) || {
        branchId: b.branchId,
        branchName: b.branchName,
        sessionsCount: 0,
        freeSessionsCount: 0,
        amount: 0,
      };
      existing.sessionsCount += b.sessionsCount;
      existing.freeSessionsCount += b.freeSessionsCount || 0;
      existing.amount = round2(existing.amount + b.amount);
      branchMap.set(b.branchId, existing);
    };

    if (includeRegularLessons) {
      reportData.regularLessons.branchLines.forEach(addBranchLine);
    }
    if (includeFormationCourses) {
      reportData.formationCourses.branchLines.forEach(addBranchLine);
    }
    if (includeBooks) {
      reportData.booksFinance.branchTotals.forEach((bt) => {
        addBranchLine({
          branchId: bt.branchId,
          branchName: bt.branchName,
          sessionsCount: 0,
          freeSessionsCount: 0,
          amount: bt.amount,
        });
      });
    }

    const mergedBranchLines = Array.from(branchMap.values()).filter(
      (b) => b.sessionsCount > 0 || b.amount > 0
    );

    // Merge group lines from selected course scopes
    const mergedGroupLines = [
      ...(includeRegularLessons ? reportData.regularLessons.groupLines : []),
      ...(includeFormationCourses ? reportData.formationCourses.groupLines : []),
    ].sort((a, b) => a.className.localeCompare(b.className));

    // Merge sessions from selected course scopes
    const mergedSessions = [
      ...(includeRegularLessons ? reportData.regularLessons.sessions : []),
      ...(includeFormationCourses ? reportData.formationCourses.sessions : []),
    ].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

    // Reconcile the current month bar in the 3-month salary growth chart with selected totals
    let reconciledHistory: PayslipSalaryGrowthPoint[] | undefined = undefined;
    if (showSalaryGrowth && reportData.salaryHistory && reportData.salaryHistory.length > 0) {
      const sMs = new Date(reportData.periodStart).getTime();
      const eMs = new Date(reportData.periodEnd).getTime();
      const isFullMonth = !Number.isNaN(sMs) && !Number.isNaN(eMs) && (eMs - sMs) / 86_400_000 >= 20;

      reconciledHistory = reportData.salaryHistory.map((pt, idx) => {
        if (!isFullMonth || idx !== reportData.salaryHistory.length - 1) return pt;
        const prevGross = idx > 0 ? reportData.salaryHistory[idx - 1].grossAmount : null;
        const delta = prevGross !== null ? round2(calculations.totalGross - prevGross) : null;
        const rate =
          prevGross !== null && prevGross > 0
            ? Math.round(((calculations.totalGross - prevGross) / prevGross) * 1000) / 10
            : null;
        return {
          ...pt,
          sessionsCount: calculations.sessionsCount,
          grossAmount: calculations.totalGross,
          netAmount: calculations.netPayout,
          growthDelta: delta,
          growthRate: rate,
        };
      });
    }

    const printData: PayslipPrintData = {
      id: reportData.payslipId,
      periodStart: reportData.periodStart,
      periodEnd: reportData.periodEnd,
      status: reportData.status,
      teacher: {
        id: reportData.teacher.id,
        name: reportData.teacher.name,
        phone: reportData.teacher.phone ?? teacherPhone ?? null,
      },
      sessionsCount: calculations.sessionsCount,
      paidSessionsCount: calculations.paidSessionsCount,
      freeSessionsCount: calculations.freeSessionsCount,
      teacherAbsencesCount: calculations.teacherAbsencesCount,
      grossAmount: calculations.totalGross,
      bookRevenue: includeBooks ? reportData.booksFinance.totalRevenue : 0,
      bookRevenueDetails: includeBooks ? reportData.booksFinance.details : [],
      advances: calculations.advancesDeducted,
      advanceDetails: includeAdvances ? reportData.salaryAdvances.details : [],
      photocopyDeductions: calculations.photocopyDeducted,
      photocopyDetails: includePhotocopy ? reportData.photocopyDeductions.details : [],
      netAmount: calculations.netPayout,
      branchLines: mergedBranchLines,
      groupLines: mergedGroupLines,
      sessions: mergedSessions,
      retroactiveLessonsCount: includeRegularLessons
        ? reportData.regularLessons.retroactiveLessonsCount
        : 0,
      retroactiveAmount: includeRegularLessons ? reportData.regularLessons.retroactiveAmount : 0,
      revisionLessonsCount: includeRegularLessons
        ? reportData.regularLessons.revisionLessonsCount
        : 0,
      revisionAmount: includeRegularLessons ? reportData.regularLessons.revisionAmount : 0,
      salaryHistory: reconciledHistory,
      displayOptions: {
        includeRegularLessons,
        includeFormationCourses,
        includeBooks,
        includeAdvances,
        includePhotocopy,
        showSalaryGrowth,
        showGroupBreakdown,
        showBranchBreakdown,
        showSessionDetails,
        showFreeSessions,
        showTeacherAbsences,
      },
    };

    const [{ default: ReactDOMServer }, { PayslipTicket }] = await Promise.all([
      import("react-dom/server"),
      import("@/components/printable/PayslipTicket"),
    ]);

    const printContent = ReactDOMServer.renderToString(
      <PayslipTicket data={printData} locale={locale} />
    );

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const safeName = reportData.teacher.name.replace(/[^0-9A-Za-z_-]/g, "_");
    const html = buildPrintableReportHtml({
      title: `${isAr ? "قسيمة راتب" : "Bulletin de paie"} ${
        reportData.payslipId ? `#${reportData.payslipId} ` : ""
      }- ${reportData.teacher.name}`,
      toolbarTitle: `${isAr ? "قسيمة راتب الأستاذ" : "Bulletin de Paie Enseignant"} — ${
        reportData.teacher.name
      }`,
      toolbarBadge: selectionSummaryLabel,
      contentHtml: printContent,
      isAr,
      locale,
      origin,
      includeToolbar: true,
      includeDownloadButton: true,
      downloadFilename: `bulletin-paie-${safeName}${!includeBooks && availability.hasBooks ? "-sans-livres" : ""}.html`,
      autoPrint: true,
      closeAfterPrint: false,
    });

    if (targetWindow && !targetWindow.closed) {
      try {
        targetWindow.document.open();
        targetWindow.document.write(html);
        targetWindow.document.close();
        targetWindow.focus();
        return;
      } catch (e) {
        console.error("Window print error, falling back to iframe:", e);
      }
    }

    printViaIframe(html);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        dir={isAr ? "rtl" : "ltr"}
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in-50 zoom-in-95 duration-200 text-start"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-blue-950 text-white flex items-center justify-between border-b border-blue-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
                <span>
                  {isAr ? "خيارات قسيمة راتب الأستاذ" : "Options du Bulletin de Paie Enseignant"}
                </span>
                <Badge variant="primary" size="sm" className="bg-blue-800 text-blue-100 border-blue-700">
                  {teacherName}
                </Badge>
              </h2>
              <p className="text-xs text-blue-200 mt-0.5">
                {isAr
                  ? "حدد العناصر التي تريد إظهارها وحسابها في قسيمة الراتب المطبوعة"
                  : "Cochez les éléments à afficher et calculer dans le bulletin imprimé"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-blue-300 hover:text-white hover:bg-blue-900 transition-colors cursor-pointer"
            aria-label={isAr ? "إغلاق" : "Fermer"}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-700 mx-auto" />
              <p className="text-sm font-medium text-gray-600">
                {isAr
                  ? "جاري تجهيز عناصر قسيمة الراتب..."
                  : "Préparation des rubriques du bulletin de paie..."}
              </p>
            </div>
          ) : errorMessage || !reportData ? (
            <div className="p-6 text-center text-gray-500">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
              <p className="text-sm">
                {errorMessage || (isAr ? "تعذر تحميل البيانات" : "Impossible de charger les données.")}
              </p>
            </div>
          ) : (
            <>
              {/* Period banner & quick presets */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="font-semibold">
                    {isAr ? "الفترة:" : "Période :"} {formatPeriodLabel(reportData.periodStart)} —{" "}
                    {formatPeriodLabel(reportData.periodEnd)}
                  </span>
                </div>

                {/* Quick Presets */}
                {(availability.hasBooks || availability.hasFormation) && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={applyPresetAll}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      {isAr ? "تضمين الكل" : "Tout inclure"}
                    </button>
                    {availability.hasBooks && (
                      <button
                        type="button"
                        onClick={applyPresetWithoutBooks}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                          !includeBooks && (includeRegularLessons || includeFormationCourses)
                            ? "bg-blue-700 text-white border-blue-700 shadow-xs"
                            : "bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100"
                        }`}
                      >
                        {isAr ? "بدون الكتب" : "Sans livres"}
                      </button>
                    )}
                    {availability.hasBooks && (availability.hasRegular || availability.hasFormation) && (
                      <button
                        type="button"
                        onClick={applyPresetBooksOnly}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                          includeBooks && !includeRegularLessons && !includeFormationCourses
                            ? "bg-purple-700 text-white border-purple-700 shadow-xs"
                            : "bg-purple-50 border-purple-300 text-purple-800 hover:bg-purple-100"
                        }`}
                      >
                        {isAr ? "الكتب فقط" : "Livres uniquement"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 1. Financial Calculation Items */}
              <div className="space-y-2.5">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  {isAr
                    ? "1. العناصر المالية (الحساب والإظهار):"
                    : "1. Rubriques financières à inclure & calculer :"}
                </p>

                {/* Regular Lessons */}
                <label
                  className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer ${
                    includeRegularLessons
                      ? "bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-300/40"
                      : "bg-gray-50/60 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={includeRegularLessons}
                    onChange={(e) => setIncludeRegularLessons(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <GraduationCap className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          {isAr ? "مستحقات الدروس العادية" : "Séances de Cours Réguliers"}
                        </span>
                      </span>
                      <span className="text-xs font-mono font-bold text-emerald-700 whitespace-nowrap">
                        +{formatDZD(reportData.regularLessons.grossAmount)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {availability.hasRegular
                        ? isAr
                          ? `${reportData.regularLessons.payableLessonsCount} حصة مستحقة${
                              reportData.regularLessons.revisionLessonsCount > 0
                                ? ` (منها ${reportData.regularLessons.revisionLessonsCount} مراجعة)`
                                : ""
                            } (${reportData.regularLessons.sessionsCount} حصة) عبر ${reportData.regularLessons.groupLines.length} أفواج`
                          : `${reportData.regularLessons.payableLessonsCount} séances payables${
                              reportData.regularLessons.revisionLessonsCount > 0
                                ? ` (dont ${reportData.regularLessons.revisionLessonsCount} révision)`
                                : ""
                            } (${reportData.regularLessons.sessionsCount} séances) sur ${reportData.regularLessons.groupLines.length} groupe(s)`
                        : isAr
                        ? "لا توجد دروس عادية مسجلة في هذه الفترة"
                        : "Aucune séance régulière enregistrée sur cette période"}
                    </p>
                  </div>
                </label>

                {/* Formation Courses & Dawarat */}
                <label
                  className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all ${
                    !availability.hasFormation
                      ? "opacity-60 cursor-not-allowed bg-gray-50/50 border-gray-200"
                      : includeFormationCourses
                      ? "bg-rose-50/60 border-rose-300 ring-1 ring-rose-300/40 cursor-pointer"
                      : "bg-gray-50/60 border-gray-200 hover:bg-gray-50 cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={includeFormationCourses}
                    onChange={(e) => setIncludeFormationCourses(e.target.checked)}
                    disabled={!availability.hasFormation}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500 disabled:opacity-40 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>
                          {isAr
                            ? "دورات التكوين والورشات (Formations / Dawarat)"
                            : "Formations & Ateliers (Dawarat)"}
                        </span>
                      </span>
                      <span className="text-xs font-mono font-bold text-rose-700 whitespace-nowrap">
                        +{formatDZD(reportData.formationCourses.grossAmount)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {availability.hasFormation
                        ? isAr
                          ? `${reportData.formationCourses.payableLessonsCount} اشتراك/حصة عبر ${reportData.formationCourses.groupLines.length} أفواج تكوينية`
                          : `${reportData.formationCourses.payableLessonsCount} participation(s) sur ${reportData.formationCourses.groupLines.length} groupe(s) de formation`
                        : isAr
                        ? "لا توجد دورات تكوين مسجلة في هذه الفترة"
                        : "Aucune formation ou atelier sur cette période"}
                    </p>
                  </div>
                </label>

                {/* Books Fees (100% Teacher) */}
                <label
                  className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all ${
                    !availability.hasBooks
                      ? "opacity-60 cursor-not-allowed bg-gray-50/50 border-gray-200"
                      : includeBooks
                      ? "bg-purple-50/70 border-purple-300 ring-1 ring-purple-300/40 cursor-pointer"
                      : "bg-gray-50/60 border-gray-200 hover:bg-gray-50 cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={includeBooks}
                    onChange={(e) => setIncludeBooks(e.target.checked)}
                    disabled={!availability.hasBooks}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-40 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-purple-600 shrink-0" />
                        <span>
                          {isAr
                            ? "مبيعات ورسوم الكتب (100% للأستاذ)"
                            : "Ventes & Frais de Livres (100% Enseignant)"}
                        </span>
                      </span>
                      <span className="text-xs font-mono font-bold text-purple-700 whitespace-nowrap">
                        +{formatDZD(reportData.booksFinance.totalRevenue)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {availability.hasBooks
                        ? isAr
                          ? `${reportData.booksFinance.vouchersCount} وصل كتب مسدد — أزل التحديد لطباعة القسيمة وحساب الصافي بدون الكتب`
                          : `${reportData.booksFinance.vouchersCount} reçu(s) de livres encaissé(s) — décochez pour exclure les livres du calcul et du bulletin`
                        : isAr
                        ? "لا توجد مبيعات كتب مسجلة لهذا الأستاذ في هذه الفترة"
                        : "Aucune vente de livre enregistrée pour cette période"}
                    </p>
                  </div>
                </label>

                {/* Saved Bonus / Adjustment (only if non-zero) */}
                {availability.hasBonus && (
                  <label
                    className={`flex items-start gap-3.5 p-3 rounded-xl border transition-all cursor-pointer ${
                      includeBonus
                        ? reportData.bonus > 0
                          ? "bg-teal-50/60 border-teal-300"
                          : "bg-rose-50/60 border-rose-300"
                        : "bg-gray-50/60 border-gray-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={includeBonus}
                      onChange={(e) => setIncludeBonus(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-gray-900">
                          {reportData.bonus > 0
                            ? isAr
                              ? "تضمين المنحة المحفوظة في الصافي"
                              : "Inclure la prime / bonus enregistré"
                            : isAr
                            ? "تضمين الخصم المحفوظ في الصافي"
                            : "Inclure la déduction enregistrée"}
                        </span>
                        <span
                          className={`text-xs font-mono font-bold whitespace-nowrap ${
                            reportData.bonus > 0 ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {reportData.bonus > 0 ? "+" : "-"}
                          {formatDZD(Math.abs(reportData.bonus))}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {isAr
                          ? "يُدمج مباشرة في المبلغ دون إظهار سطر منفصل للأستاذ."
                          : "Intégré directement dans le montant final sans ligne dédiée sur la fiche enseignant."}
                      </p>
                    </div>
                  </label>
                )}
              </div>

              {/* 2. Deductions */}
              <div className="space-y-2 pt-2 border-t border-gray-200">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  {isAr ? "2. الاقتطاعات (الحساب والإظهار):" : "2. Déductions à appliquer & afficher :"}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Salary Advances */}
                  <label
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs transition-all ${
                      !availability.hasAdvances
                        ? "opacity-60 cursor-not-allowed bg-gray-50 border-gray-200 text-gray-500"
                        : includeAdvances
                        ? "bg-red-50/70 border-red-200 text-red-950 cursor-pointer"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100/70 cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={includeAdvances}
                      onChange={(e) => setIncludeAdvances(e.target.checked)}
                      disabled={!availability.hasAdvances}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-40 cursor-pointer"
                    />
                    <Banknote className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <div className="flex-1 flex justify-between items-center gap-2 min-w-0">
                      <span className="font-semibold truncate">
                        {isAr ? "التسبيقات على الراتب" : "Avances sur salaire"}
                        {reportData.salaryAdvances.details.length > 0 && (
                          <span className="opacity-70 ms-1">
                            ({reportData.salaryAdvances.details.length})
                          </span>
                        )}
                      </span>
                      <span className="font-mono font-bold whitespace-nowrap">
                        -{formatDZD(reportData.salaryAdvances.total)}
                      </span>
                    </div>
                  </label>

                  {/* Photocopy Charges */}
                  <label
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs transition-all ${
                      !availability.hasPhotocopy
                        ? "opacity-60 cursor-not-allowed bg-gray-50 border-gray-200 text-gray-500"
                        : includePhotocopy
                        ? "bg-amber-50/70 border-amber-200 text-amber-950 cursor-pointer"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100/70 cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={includePhotocopy}
                      onChange={(e) => setIncludePhotocopy(e.target.checked)}
                      disabled={!availability.hasPhotocopy}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500 disabled:opacity-40 cursor-pointer"
                    />
                    <Copy className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <div className="flex-1 flex justify-between items-center gap-2 min-w-0">
                      <span className="font-semibold truncate">
                        {isAr ? "تكاليف التصوير" : "Frais de photocopie"}
                        {reportData.photocopyDeductions.pages > 0 && (
                          <span className="opacity-70 ms-1">
                            ({reportData.photocopyDeductions.pages}p)
                          </span>
                        )}
                      </span>
                      <span className="font-mono font-bold whitespace-nowrap">
                        -{formatDZD(reportData.photocopyDeductions.total)}
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* 3. Printable Visual Sections */}
              <div className="space-y-2 pt-2 border-t border-gray-200">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {isAr
                      ? "3. الأقسام الظاهرة على القسيمة المطبوعة:"
                      : "3. Sections affichées sur le bulletin :"}
                  </span>
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    {
                      checked: showSalaryGrowth,
                      onChange: setShowSalaryGrowth,
                      label: isAr ? "مخطط التطور (3 أشهر)" : "Graphique (3 mois)",
                    },
                    {
                      checked: showGroupBreakdown,
                      onChange: setShowGroupBreakdown,
                      label: isAr ? "جدول الأفواج" : "Détail par groupe",
                    },
                    {
                      checked: showBranchBreakdown,
                      onChange: setShowBranchBreakdown,
                      label: isAr ? "جدول الفروع" : "Synthèse branches",
                    },
                    {
                      checked: showSessionDetails,
                      onChange: setShowSessionDetails,
                      label: isAr ? "تفاصيل الحصص" : "Liste des séances",
                    },
                    {
                      checked: showFreeSessions,
                      onChange: setShowFreeSessions,
                      label: isAr ? "الحصص المجانية" : "Séances gratuites",
                    },
                    {
                      checked: showTeacherAbsences,
                      onChange: setShowTeacherAbsences,
                      label: isAr ? "غيابات الأستاذ" : "Absences enseignant",
                      disabled: !availability.hasAbsences,
                    },
                  ].map((item, idx) => (
                    <label
                      key={idx}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs transition-all ${
                        item.disabled
                          ? "opacity-50 cursor-not-allowed bg-gray-50 border-gray-200 text-gray-400"
                          : item.checked
                          ? "bg-blue-50/60 border-blue-200 text-blue-950 font-semibold cursor-pointer"
                          : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={item.checked && !item.disabled}
                        disabled={item.disabled}
                        onChange={(e) => item.onChange(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-700 focus:ring-blue-600 cursor-pointer"
                      />
                      <span className="truncate">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Dynamic Live Net Simulation Box */}
              <div className="bg-slate-900 text-white rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-300 pb-2 border-b border-slate-800 flex-wrap">
                  <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-200">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    <span>
                      {isAr ? "معاينة الحساب في قسيمة الراتب:" : "Aperçu du calcul sur le bulletin :"}
                    </span>
                  </span>
                  <span className="text-[11px] font-semibold bg-white/10 text-blue-200 px-2.5 py-0.5 rounded-full">
                    {selectionSummaryLabel}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-slate-800/80">
                    <p className="text-[10px] text-slate-400">
                      {isAr ? "الدروس العادية" : "Cours Réguliers"}
                    </p>
                    <p className="font-mono font-bold text-emerald-400 mt-0.5">
                      {formatDZD(calculations.regularAmount)}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800/80">
                    <p className="text-[10px] text-slate-400">
                      {isAr ? "التكوينات" : "Formations"}
                    </p>
                    <p className="font-mono font-bold text-rose-400 mt-0.5">
                      {formatDZD(calculations.formationAmount)}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800/80">
                    <p className="text-[10px] text-slate-400">
                      {isAr ? "الكتب (100%)" : "Livres (100%)"}
                    </p>
                    <p
                      className={`font-mono font-bold mt-0.5 ${
                        includeBooks ? "text-purple-300" : "text-slate-500 line-through"
                      }`}
                    >
                      {formatDZD(calculations.booksAmount)}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800/80">
                    <p className="text-[10px] text-slate-400">
                      {isAr ? "الاقتطاعات" : "Déductions"}
                    </p>
                    <p className="font-mono font-bold text-red-400 mt-0.5">
                      -{formatDZD(calculations.totalDeductions)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase font-semibold">
                      {isAr ? "الصافي للدفع (قسيمة الأستاذ):" : "Net à Payer (Bulletin Enseignant) :"}
                    </p>
                    <p className="text-xl font-black font-mono text-emerald-400">
                      {formatDZD(calculations.netPayout)}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-[10px] text-slate-400">
                      {isAr ? "الإجمالي الخام:" : "Total Brut :"}
                    </p>
                    <p className="text-sm font-bold font-mono text-slate-200">
                      {formatDZD(calculations.totalGross)}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={onClose} className="cursor-pointer">
            {isAr ? "إلغاء" : "Annuler"}
          </Button>

          <div className="flex items-center gap-3">
            {nothingSelected && !isLoading && reportData && (
              <span className="text-xs font-semibold text-rose-600">
                {isAr ? "حدد عنصراً واحداً على الأقل" : "Sélectionnez au moins une rubrique"}
              </span>
            )}
            <Button
              variant="primary"
              size="md"
              onClick={handlePrintPayslip}
              disabled={isLoading || !reportData || nothingSelected}
              leftIcon={<Printer className="w-4 h-4" />}
              className="bg-blue-700 hover:bg-blue-800 text-white font-bold cursor-pointer"
            >
              {isAr ? "استخراج وطباعة القسيمة" : "Générer & Imprimer le Bulletin"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
