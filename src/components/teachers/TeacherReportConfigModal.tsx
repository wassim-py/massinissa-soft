"use client";

import React, { useState, useEffect, useMemo } from "react";
import ReactDOMServer from "react-dom/server";
import {
  X,
  Printer,
  CheckCircle2,
  BookOpen,
  GraduationCap,
  Calendar,
  DollarSign,
  FileText,
  Loader2,
  AlertCircle,
  Percent,
  Minus,
  Plus,
  Coins,
  Layers,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  getTeacherSelectiveReportDataAction,
  TeacherSelectiveReportData,
} from "@/lib/financeActions";
import {
  OwnerTeacherConsolidationReport,
  OwnerTeacherConsolidationPrintData,
} from "@/components/printable/OwnerTeacherConsolidationReport";
import { toast } from "sonner";
import { useLocale } from "next-intl";
import { buildPrintableReportHtml } from "@/lib/printReportHtml";

interface TeacherReportConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherId: string;
  teacherName: string;
  teacherPhone?: string | null;
  startDate: string;
  endDate: string;
  locale?: string;
  payslipId?: number;
}

function getReportHtml(
  printContent: string,
  teacherName: string,
  isAr: boolean,
  locale: string,
  origin: string
) {
  return buildPrintableReportHtml({
    title: `Rapport Consolidé Propriétaire - ${teacherName}`,
    toolbarTitle: `Rapport Consolidé Propriétaire — ${teacherName}`,
    contentHtml: printContent,
    isAr,
    locale,
    origin,
    includeToolbar: true,
    includeDownloadButton: true,
    downloadFilename: `rapport-enseignant-${teacherName.replace(/[^0-9A-Za-z_-]/g, "_")}.html`,
    autoPrint: true,
  });
}

export default function TeacherReportConfigModal({
  isOpen,
  onClose,
  teacherId,
  teacherName,
  teacherPhone,
  startDate,
  endDate,
  locale: propLocale,
  payslipId,
}: TeacherReportConfigModalProps) {
  const currentLocale = useLocale();
  const locale = propLocale || currentLocale || "fr";
  const isAr = locale === "ar";

  const [isLoading, setIsLoading] = useState(true);
  const [reportData, setReportData] = useState<TeacherSelectiveReportData | null>(null);

  // Selective check boxes
  const [includeRegularLessons, setIncludeRegularLessons] = useState(true);
  const [includeFormationCourses, setIncludeFormationCourses] = useState(true);
  const [includeBooks, setIncludeBooks] = useState(true);
  const [includeAdvances, setIncludeAdvances] = useState(true);
  const [includePhotocopy, setIncludePhotocopy] = useState(true);
  const [customBonus, setCustomBonus] = useState<number>(0);

  // Load teacher selective data
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;
    setIsLoading(true);

    getTeacherSelectiveReportDataAction(teacherId, startDate, endDate).then((res) => {
      if (isCancelled) return;
      setIsLoading(false);
      if (res.success && res.data) {
        setReportData(res.data);
      } else {
        toast.error(res.message || "Erreur lors du chargement des données de l'enseignant.");
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, teacherId, startDate, endDate]);

  const formatDZD = (num: number) =>
    isAr
      ? `${num.toLocaleString("ar-DZ")} دج`
      : `${num.toLocaleString("fr-DZ")} DZD`;

  // Calculated numbers based on selected checkboxes
  const calculations = useMemo(() => {
    if (!reportData) {
      return {
        regularCut: 0,
        regularSchoolCut: 0,
        formationCut: 0,
        formationSchoolCut: 0,
        booksCut: 0,
        totalGross: 0,
        advancesDeducted: 0,
        photocopyDeducted: 0,
        totalDeductions: 0,
        netPayout: 0,
        schoolRevenue: 0,
      };
    }

    const regularCut = includeRegularLessons ? reportData.regularLessons.totalTeacherCut : 0;
    const regularSchoolCut = includeRegularLessons ? reportData.regularLessons.totalSchoolCut : 0;

    const formationCut = includeFormationCourses ? reportData.formationCourses.totalTeacherCut : 0;
    const formationSchoolCut = includeFormationCourses ? reportData.formationCourses.totalSchoolCut : 0;

    const booksCut = includeBooks ? reportData.booksFinance.totalBooksFees : 0;

    const totalGross = regularCut + formationCut + booksCut;

    const advancesDeducted = includeAdvances ? reportData.salaryAdvances.total : 0;
    const photocopyDeducted = includePhotocopy ? reportData.photocopyDeductions.total : 0;
    const totalDeductions = advancesDeducted + photocopyDeducted;

    const netPayout = Math.max(0, totalGross + customBonus - totalDeductions);
    const schoolRevenue = regularSchoolCut + formationSchoolCut + photocopyDeducted;

    return {
      regularCut,
      regularSchoolCut,
      formationCut,
      formationSchoolCut,
      booksCut,
      totalGross,
      advancesDeducted,
      photocopyDeducted,
      totalDeductions,
      netPayout,
      schoolRevenue,
    };
  }, [
    reportData,
    includeRegularLessons,
    includeFormationCourses,
    includeBooks,
    includeAdvances,
    includePhotocopy,
    customBonus,
  ]);

  if (!isOpen) return null;

  const handlePrintReport = () => {
    if (!reportData) return;

    let targetWindow: Window | null = null;
    try {
      targetWindow = window.open("", "_blank", "width=950,height=850");
    } catch {
      targetWindow = null;
    }

    const printData: OwnerTeacherConsolidationPrintData = {
      id: payslipId,
      periodStart: startDate,
      periodEnd: endDate,
      status: "CALCULATED",
      teacher: {
        id: reportData.teacher.id,
        name: reportData.teacher.name,
        phone: reportData.teacher.phone,
      },
      includeRegularLessons,
      includeFormationCourses,
      includeBooks,
      // Regular groups
      groups: reportData.regularLessons.groups.map((g) => ({
        teacherName: reportData.teacher.name,
        groupName: g.className,
        branchName: g.branchName,
        payableLessons: g.payableLessonsCount,
        teacherCut: g.teacherAmount,
        schoolCut: g.schoolAmount,
        totalTuition: g.tuitionGross,
      })),
      totalPayableLessons: reportData.regularLessons.totalLessonsCount,
      totalTeacherCut: reportData.regularLessons.totalTeacherCut,
      totalSchoolCut: reportData.regularLessons.totalSchoolCut,
      // Formation groups
      formationGroups: reportData.formationCourses.groups.map((g) => ({
        teacherName: reportData.teacher.name,
        groupName: g.className,
        branchName: g.branchName,
        payableLessons: g.payableLessonsCount,
        teacherCut: g.teacherAmount,
        schoolCut: g.schoolAmount,
        totalTuition: g.tuitionGross,
      })),
      totalFormationLessons: reportData.formationCourses.totalLessonsCount,
      totalFormationTeacherCut: reportData.formationCourses.totalTeacherCut,
      totalFormationSchoolCut: reportData.formationCourses.totalSchoolCut,
      // Books
      books: reportData.booksFinance.books,
      totalBooksCopies: reportData.booksFinance.totalCopiesSold,
      totalBooksFees: reportData.booksFinance.totalBooksFees,
      // Deductions
      bonus: customBonus,
      salaryAdvances: calculations.advancesDeducted,
      salaryAdvanceDetails: includeAdvances ? reportData.salaryAdvances.details : [],
      photocopyDeductions: calculations.photocopyDeducted,
      netTeacherPayout: calculations.netPayout,
      netSchoolRevenue: calculations.schoolRevenue,
      generatedAt: new Date(),
    };

    const printContent = ReactDOMServer.renderToString(
      <OwnerTeacherConsolidationReport data={printData} locale={locale} />
    );

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const html = getReportHtml(printContent, reportData.teacher.name, isAr, locale, origin);

    if (targetWindow && !targetWindow.closed) {
      try {
        targetWindow.document.open();
        targetWindow.document.write(html);
        targetWindow.document.close();
        targetWindow.focus();
      } catch (e) {
        console.error("Window print error:", e);
      }
    } else {
      // Fallback when popup is blocked: open the generated HTML inside a new tab via Blob URL or download
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rapport-enseignant-${reportData.teacher.name.replace(/[^0-9A-Za-z_-]/g, "_")}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in-50 zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
              <FileText className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {isAr ? "خيارات استخراج تقرير الأستاذ" : "Options du Rapport Enseignant"}
                <Badge variant="primary" size="sm">
                  {teacherName}
                </Badge>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {isAr
                  ? "حدد العناصر المراد تضمينها في هذا التقرير والراتب الشهري"
                  : "Sélectionnez les rubriques à inclure dans le calcul et le rapport"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-sm font-medium text-gray-600">
                {isAr ? "جاري تجميع حسابات الأستاذ..." : "Calcul des parts et récupération des données..."}
              </p>
            </div>
          ) : !reportData ? (
            <div className="p-6 text-center text-gray-500">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
              <p className="text-sm">{isAr ? "تعذر تحميل البيانات" : "Impossible de charger les données."}</p>
            </div>
          ) : (
            <>
              {/* Period banner */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <span className="font-semibold">
                    {isAr ? "الفترة:" : "Période :"} {new Date(startDate).toLocaleDateString(locale)} —{" "}
                    {new Date(endDate).toLocaleDateString(locale)}
                  </span>
                </div>
                <span className="text-slate-500">
                  {isAr ? "المعرف:" : "ID :"} {teacherId}
                </span>
              </div>

              {/* Selective Checkboxes List */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  {isAr ? "العناصر المالية القابلة للتضمين:" : "Rubriques financières à inclure :"}
                </p>

                {/* 1. Main Lessons Finance */}
                <label className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer ${
                  includeRegularLessons
                    ? "bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-300/40"
                    : "bg-gray-50/60 border-gray-200 hover:bg-gray-50"
                }`}>
                  <input
                    type="checkbox"
                    checked={includeRegularLessons}
                    onChange={(e) => setIncludeRegularLessons(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <GraduationCap className="w-4 h-4 text-emerald-600" />
                        {isAr ? "مستحقات الدروس العادية (محرك الرواتب الرئيسي)" : "Séances de Cours Réguliers (Moteur principal)"}
                      </span>
                      <span className="text-xs font-mono font-bold text-emerald-700">
                        +{formatDZD(reportData.regularLessons.totalTeacherCut)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {isAr
                        ? `${reportData.regularLessons.totalLessonsCount} حصة مستحقة عبر ${reportData.regularLessons.groups.length} أفواج عادية (حصة المؤسسة: ${formatDZD(reportData.regularLessons.totalSchoolCut)})`
                        : `${reportData.regularLessons.totalLessonsCount} séances payables réparties sur ${reportData.regularLessons.groups.length} groupe(s) (Part école : ${formatDZD(reportData.regularLessons.totalSchoolCut)})`}
                    </p>
                  </div>
                </label>

                {/* 2. Formation Courses */}
                <label className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer ${
                  includeFormationCourses
                    ? "bg-rose-50/60 border-rose-300 ring-1 ring-rose-300/40"
                    : "bg-gray-50/60 border-gray-200 hover:bg-gray-50"
                }`}>
                  <input
                    type="checkbox"
                    checked={includeFormationCourses}
                    onChange={(e) => setIncludeFormationCourses(e.target.checked)}
                    disabled={reportData.formationCourses.groups.length === 0}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500 disabled:opacity-40"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-rose-600" />
                        {isAr ? "دورات التكوين والورشات (Formations / Dawarat)" : "Formations & Ateliers (Dawarat)"}
                      </span>
                      <span className="text-xs font-mono font-bold text-rose-700">
                        +{formatDZD(reportData.formationCourses.totalTeacherCut)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {reportData.formationCourses.groups.length > 0
                        ? isAr
                          ? `${reportData.formationCourses.totalLessonsCount} حصة تكوين عبر ${reportData.formationCourses.groups.length} أفواج تكوينية (حصة المؤسسة: ${formatDZD(reportData.formationCourses.totalSchoolCut)})`
                          : `${reportData.formationCourses.totalLessonsCount} séances de formation sur ${reportData.formationCourses.groups.length} groupe(s) (Part école : ${formatDZD(reportData.formationCourses.totalSchoolCut)})`
                        : isAr
                        ? "لا توجد دورات تكوين مسجلة لهذا الأستاذ في هذه الفترة"
                        : "Aucune séance de formation dispensée sur cette période"}
                    </p>
                  </div>
                </label>

                {/* 3. Books Section */}
                <label className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer ${
                  includeBooks
                    ? "bg-indigo-50/60 border-indigo-300 ring-1 ring-indigo-300/40"
                    : "bg-gray-50/60 border-gray-200 hover:bg-gray-50"
                }`}>
                  <input
                    type="checkbox"
                    checked={includeBooks}
                    onChange={(e) => setIncludeBooks(e.target.checked)}
                    disabled={reportData.booksFinance.totalCopiesSold === 0 && reportData.booksFinance.totalBooksFees === 0}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-indigo-600" />
                        {isAr ? "مستحقات وكتيبات التكوين / الكتب (هذا الشهر)" : "Frais & Ventes de Livres (Ce mois)"}
                      </span>
                      <span className="text-xs font-mono font-bold text-indigo-700">
                        +{formatDZD(reportData.booksFinance.totalBooksFees)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {reportData.booksFinance.totalCopiesSold > 0 || reportData.booksFinance.totalBooksFees > 0
                        ? isAr
                          ? `تم بيع/توزيع ${reportData.booksFinance.totalCopiesSold} نسخة لكتيبات هذا الأستاذ خلال الشهر`
                          : `${reportData.booksFinance.totalCopiesSold} exemplaire(s) distribué(s)/encaissé(s) pour cet enseignant`
                        : isAr
                        ? "لا توجد مبيعات كتب مسجلة لهذا الأستاذ في هذه الفترة"
                        : "Aucune vente ou distribution de livre sur cette période"}
                    </p>
                  </div>
                </label>
              </div>

              {/* Deductions Options */}
              <div className="space-y-2 pt-2 border-t border-gray-200">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  {isAr ? "الاقتطاعات والتسويات:" : "Déductions & Ajustements :"}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Advances */}
                  <label className={`flex items-center gap-2.5 p-3 rounded-lg border text-xs cursor-pointer ${
                    includeAdvances ? "bg-red-50/60 border-red-200 text-red-900" : "bg-gray-50 border-gray-200 text-gray-500"
                  }`}>
                    <input
                      type="checkbox"
                      checked={includeAdvances}
                      onChange={(e) => setIncludeAdvances(e.target.checked)}
                      disabled={reportData.salaryAdvances.total === 0}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-40"
                    />
                    <div className="flex-1 flex justify-between items-center">
                      <span>{isAr ? "خصم التسبيقات على الراتب" : "Avances sur salaire"}</span>
                      <span className="font-mono font-bold">-{formatDZD(reportData.salaryAdvances.total)}</span>
                    </div>
                  </label>

                  {/* Photocopy */}
                  <label className={`flex items-center gap-2.5 p-3 rounded-lg border text-xs cursor-pointer ${
                    includePhotocopy ? "bg-amber-50/60 border-amber-200 text-amber-900" : "bg-gray-50 border-gray-200 text-gray-500"
                  }`}>
                    <input
                      type="checkbox"
                      checked={includePhotocopy}
                      onChange={(e) => setIncludePhotocopy(e.target.checked)}
                      disabled={reportData.photocopyDeductions.total === 0}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500 disabled:opacity-40"
                    />
                    <div className="flex-1 flex justify-between items-center">
                      <span>{isAr ? "خصم تكاليف تصوير المستندات" : "Frais de photocopie"}</span>
                      <span className="font-mono font-bold">-{formatDZD(reportData.photocopyDeductions.total)}</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Dynamic Live Net Simulation Box */}
              <div className="bg-slate-900 text-white rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-300 pb-2 border-b border-slate-800">
                  <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-200">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    {isAr ? "المحاكاة الفورية لمستحقات الأستاذ:" : "Simulation en direct du versement :"}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {includeRegularLessons && !includeFormationCourses && !includeBooks && (isAr ? "دروس فقط" : "Cours seulement")}
                    {!includeRegularLessons && includeFormationCourses && !includeBooks && (isAr ? "تكوين فقط" : "Formation seulement")}
                    {!includeRegularLessons && !includeFormationCourses && includeBooks && (isAr ? "كتب فقط" : "Livres seulement")}
                    {includeRegularLessons && includeFormationCourses && !includeBooks && (isAr ? "دروس + تكوين" : "Cours + Formation")}
                    {includeRegularLessons && !includeFormationCourses && includeBooks && (isAr ? "دروس + كتب" : "Cours + Livres")}
                    {!includeRegularLessons && includeFormationCourses && includeBooks && (isAr ? "تكوين + كتب" : "Formation + Livres")}
                    {includeRegularLessons && includeFormationCourses && includeBooks && (isAr ? "شامل الكل" : "Tout inclus")}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-slate-800/80">
                    <p className="text-[10px] text-slate-400">{isAr ? "الدروس العادية" : "Cours Réguliers"}</p>
                    <p className="font-mono font-bold text-emerald-400 mt-0.5">
                      {formatDZD(calculations.regularCut)}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800/80">
                    <p className="text-[10px] text-slate-400">{isAr ? "التكوينات" : "Formations"}</p>
                    <p className="font-mono font-bold text-rose-400 mt-0.5">
                      {formatDZD(calculations.formationCut)}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800/80">
                    <p className="text-[10px] text-slate-400">{isAr ? "الكتب والكتيبات" : "Livres & Manuels"}</p>
                    <p className="font-mono font-bold text-indigo-300 mt-0.5">
                      {formatDZD(calculations.booksCut)}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800/80">
                    <p className="text-[10px] text-slate-400">{isAr ? "إجمالي الاقتطاعات" : "Déductions"}</p>
                    <p className="font-mono font-bold text-red-400 mt-0.5">
                      -{formatDZD(calculations.totalDeductions)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase font-semibold">
                      {isAr ? "صافي الراتب المستحق للصرف:" : "Net Réel à Verser à l'Enseignant :"}
                    </p>
                    <p className="text-xl font-black font-mono text-emerald-400">
                      {formatDZD(calculations.netPayout)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400">
                      {isAr ? "مردود المؤسسة:" : "Rendement École :"}
                    </p>
                    <p className="text-sm font-bold font-mono text-slate-200">
                      {formatDZD(calculations.schoolRevenue)}
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

          <Button
            variant="primary"
            size="md"
            onClick={handlePrintReport}
            disabled={isLoading || !reportData}
            leftIcon={<Printer className="w-4 h-4" />}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
          >
            {isAr ? "استخراج وطباعة التقرير" : "Générer & Imprimer le Rapport"}
          </Button>
        </div>
      </div>
    </div>
  );
}
