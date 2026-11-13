"use client";

import React, { useState, useEffect, useMemo } from "react";
import ReactDOMServer from "react-dom/server";
import {
  X,
  Printer,
  Calendar,
  Building2,
  Layers,
  GraduationCap,
  Wallet,
  BookOpen,
  Copy,
  Loader2,
  AlertCircle,
  Sparkles,
  ArrowRightLeft,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  getGlobalFinanceReportDataAction,
  GlobalFinanceReportData,
} from "@/lib/financeActions";
import {
  GlobalFinanceConsolidatedReport,
} from "@/components/printable/GlobalFinanceConsolidatedReport";
import { toast } from "sonner";
import { useLocale } from "next-intl";
import { buildPrintableReportHtml } from "@/lib/printReportHtml";

interface GlobalFinanceReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: Array<{ id: number; name: string }>;
  initialBranchId?: string;
  initialDateFrom?: string;
  initialDateTo?: string;
  onOpenTransferModal?: (sourceSection?: string) => void;
  locale?: string;
}

function getReportHtml(
  printContent: string,
  isAr: boolean,
  locale: string,
  origin: string
) {
  return buildPrintableReportHtml({
    title: "Rapport Financier Global Consolidé - Direction",
    toolbarTitle: "Rapport Financier Global Consolidé — Direction Générale",
    contentHtml: printContent,
    isAr,
    locale,
    origin,
    includeToolbar: true,
    includeDownloadButton: true,
    downloadFilename: "rapport-financier-global.html",
    autoPrint: true,
  });
}

export default function GlobalFinanceReportModal({
  isOpen,
  onClose,
  branches,
  initialBranchId = "all",
  initialDateFrom,
  initialDateTo,
  onOpenTransferModal,
  locale: propLocale,
}: GlobalFinanceReportModalProps) {
  const currentLocale = useLocale();
  const locale = propLocale || currentLocale || "fr";
  const isAr = locale === "ar";

  // Initial date presets strictly following selected date if provided
  const getInitialDates = () => {
    if (initialDateFrom && initialDateTo) {
      return { start: initialDateFrom, end: initialDateTo };
    }
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const start = initialDateFrom || new Date(Date.UTC(y, m, 1)).toISOString().split("T")[0];
    const end = initialDateTo || new Date(Date.UTC(y, m + 1, 0)).toISOString().split("T")[0];
    return { start, end };
  };

  const initialDates = getInitialDates();
  const [dateFrom, setDateFrom] = useState(initialDates.start);
  const [dateTo, setDateTo] = useState(initialDates.end);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(initialBranchId);

  useEffect(() => {
    if (isOpen) {
      if (initialDateFrom && initialDateFrom !== dateFrom) {
        setDateFrom(initialDateFrom);
      }
      if (initialDateTo && initialDateTo !== dateTo) {
        setDateTo(initialDateTo);
      }
    }
  }, [isOpen, initialDateFrom, initialDateTo]);

  // The 5 Selective Boxes
  const [includeFormationIncomes, setIncludeFormationIncomes] = useState(true);
  const [includeInscriptionFees, setIncludeInscriptionFees] = useState(true);
  const [includeCaisseNoire, setIncludeCaisseNoire] = useState(true);
  const [includePhotocopyDeductions, setIncludePhotocopyDeductions] = useState(true);
  const [includeFormationBooks, setIncludeFormationBooks] = useState(true);

  // Data state
  const [isLoading, setIsLoading] = useState(true);
  const [reportData, setReportData] = useState<GlobalFinanceReportData | null>(null);

  // Fetch data
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const res = await getGlobalFinanceReportDataAction({
        dateFrom,
        dateTo,
        branchId: selectedBranchId === "all" ? "all" : Number(selectedBranchId),
      });

      if (res.success && res.data) {
        setReportData(res.data);
      } else {
        toast.error(res.message || "Erreur lors du chargement des données.");
      }
    } catch {
      toast.error("Erreur de connexion.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, dateFrom, dateTo, selectedBranchId]);

  const formatDZD = (num: number) =>
    isAr
      ? `${num.toLocaleString("ar-DZ")} دج`
      : `${num.toLocaleString("fr-DZ")} DZD`;

  // Dynamic live sum of selected categories
  const selectedGrandTotal = useMemo(() => {
    if (!reportData) return 0;
    let sum = 0;
    if (includeFormationIncomes) sum += reportData.formationIncomes.total;
    if (includeInscriptionFees) sum += reportData.inscriptionFees.total;
    if (includePhotocopyDeductions) sum += reportData.photocopyDeductions.totalAmount;
    if (includeFormationBooks) sum += reportData.formationBooks.totalAmount;
    return sum;
  }, [
    reportData,
    includeFormationIncomes,
    includeInscriptionFees,
    includePhotocopyDeductions,
    includeFormationBooks,
  ]);

  if (!isOpen) return null;

  const handlePrint = () => {
    if (!reportData) return;

    let targetWindow: Window | null = null;
    try {
      targetWindow = window.open("", "_blank", "width=1000,height=900");
    } catch {
      targetWindow = null;
    }

    const selections = {
      includeFormationIncomes,
      includeInscriptionFees,
      includeCaisseNoire,
      includePhotocopyDeductions,
      includeFormationBooks,
    };

    const printContent = ReactDOMServer.renderToString(
      <GlobalFinanceConsolidatedReport
        data={reportData}
        selections={selections}
        locale={locale}
      />
    );

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const html = getReportHtml(printContent, isAr, locale, origin);

    if (targetWindow && !targetWindow.closed) {
      try {
        targetWindow.document.open();
        targetWindow.document.write(html);
        targetWindow.document.close();
        targetWindow.focus();
      } catch (e) {
        console.error("Window print error:", e);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in-50 zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
              <Sparkles className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {isAr ? "خيارات التقرير المالي الشامل" : "Options du Rapport Financier Global"}
                <Badge variant="primary" size="sm">
                  Direction
                </Badge>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {isAr
                  ? "اختر الفروع والتدفقات المالية الخمسة المراد استخراجها في هذا التقرير"
                  : "Sélectionnez les rubriques financières et la période du rapport"}
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
          {/* Filters Bar: Period & Branch */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div>
              <label className="font-semibold text-gray-700 block mb-1">
                {isAr ? "الفرع / المقر:" : "Branche / Établissement :"}
              </label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-hidden"
              >
                <option value="all">
                  {isAr ? "جميع الفروع (المقر الموحد)" : "Toutes les branches (Siège consolidé)"}
                </option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-gray-700 block mb-1">
                {isAr ? "من تاريخ:" : "Du (Date début) :"}
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-mono font-medium focus:ring-2 focus:ring-primary focus:outline-hidden"
              >
              </input>
            </div>

            <div>
              <label className="font-semibold text-gray-700 block mb-1">
                {isAr ? "إلى تاريخ:" : "Au (Date fin) :"}
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-mono font-medium focus:ring-2 focus:ring-primary focus:outline-hidden"
              >
              </input>
            </div>
          </div>

          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-sm font-medium text-gray-600">
                {isAr ? "جاري تجميع البيانات المالية..." : "Agrégation des flux financiers..."}
              </p>
            </div>
          ) : !reportData ? (
            <div className="p-6 text-center text-gray-500">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
              <p className="text-sm">{isAr ? "تعذر تحميل البيانات" : "Impossible de charger les données financières."}</p>
            </div>
          ) : (
            <>
              {/* Selective Checkboxes for the 5 Streams */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center justify-between">
                  <span>{isAr ? "التدفقات المالية الخمسة (حدد ما تريد تضمينه):" : "Les 5 Rubriques Financières (Cochez pour inclure) :"}</span>
                  <span className="text-primary font-normal normal-case">
                    {isAr ? "معاينة فورية للمبالغ" : "Aperçu en direct"}
                  </span>
                </p>

                {/* 1. Formation Incomes */}
                <label className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer ${
                  includeFormationIncomes
                    ? "bg-rose-50/60 border-rose-300 ring-1 ring-rose-300/40"
                    : "bg-gray-50/60 border-gray-200 hover:bg-gray-50"
                }`}>
                  <input
                    type="checkbox"
                    checked={includeFormationIncomes}
                    onChange={(e) => setIncludeFormationIncomes(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-rose-600" />
                        {isAr ? "1. مداخيل التكوينات والورشات (Formation Incomes)" : "1. Revenus des Formations & Dawarat"}
                      </span>
                      <span className="text-xs font-mono font-bold text-rose-700">
                        +{formatDZD(reportData.formationIncomes.total)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {isAr
                        ? `${reportData.formationIncomes.vouchersCount} وصل قبض عبر ${reportData.formationIncomes.items.length} تكوينات/ورشات`
                        : `${reportData.formationIncomes.vouchersCount} reçus encaissés sur ${reportData.formationIncomes.items.length} formation(s)`}
                    </p>
                  </div>
                </label>

                {/* 2. Inscription Fees */}
                <label className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer ${
                  includeInscriptionFees
                    ? "bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-300/40"
                    : "bg-gray-50/60 border-gray-200 hover:bg-gray-50"
                }`}>
                  <input
                    type="checkbox"
                    checked={includeInscriptionFees}
                    onChange={(e) => setIncludeInscriptionFees(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <GraduationCap className="w-4 h-4 text-emerald-600" />
                        {isAr ? "2. حقوق التسجيل وإعادة التسجيل (Inscription Fees)" : "2. Frais d'Inscription & Réinscriptions"}
                      </span>
                      <span className="text-xs font-mono font-bold text-emerald-700">
                        +{formatDZD(reportData.inscriptionFees.total)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {isAr
                        ? `${reportData.inscriptionFees.vouchersCount} تلميذ مسجل عبر الفروع`
                        : `${reportData.inscriptionFees.vouchersCount} inscriptions enregistrées sur la période`}
                    </p>
                  </div>
                </label>

                {/* 3. Caisse Noire */}
                <label className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer ${
                  includeCaisseNoire
                    ? "bg-slate-100 border-slate-300 ring-1 ring-slate-300/40"
                    : "bg-gray-50/60 border-gray-200 hover:bg-gray-50"
                }`}>
                  <input
                    type="checkbox"
                    checked={includeCaisseNoire}
                    onChange={(e) => setIncludeCaisseNoire(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-slate-800 focus:ring-slate-700"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <Wallet className="w-4 h-4 text-slate-800" />
                        {isAr ? "3. وضعية وحركات الصندوق الأسود (Caisse Noire)" : "3. Mouvements & Solde de la Caisse Noire"}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-800">
                        {isAr ? "الرصيد: " : "Solde : "}
                        {formatDZD(reportData.caisseNoire.endingBalance)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {isAr
                        ? `إيداعات: +${formatDZD(reportData.caisseNoire.totalDeposited)} | سحوبات: -${formatDZD(reportData.caisseNoire.totalWithdrawn)}`
                        : `Dépôts : +${formatDZD(reportData.caisseNoire.totalDeposited)} | Retraits : -${formatDZD(reportData.caisseNoire.totalWithdrawn)}`}
                    </p>
                  </div>
                </label>

                {/* 4. Photocopy Deductions */}
                <label className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer ${
                  includePhotocopyDeductions
                    ? "bg-amber-50/60 border-amber-300 ring-1 ring-amber-300/40"
                    : "bg-gray-50/60 border-gray-200 hover:bg-gray-50"
                }`}>
                  <input
                    type="checkbox"
                    checked={includePhotocopyDeductions}
                    onChange={(e) => setIncludePhotocopyDeductions(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <Copy className="w-4 h-4 text-amber-600" />
                        {isAr ? "4. اقتطاعات تصوير المستندات من الأساتذة (Photocopy Deductions)" : "4. Déductions Photocopies Enseignants (Récupérées)"}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-amber-800">
                          +{formatDZD(reportData.photocopyDeductions.totalAmount)}
                        </span>
                        {onOpenTransferModal && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onOpenTransferModal("PHOTOCOPY_DEDUCTIONS");
                            }}
                            className="text-[10px] bg-amber-600 text-white font-semibold px-2 py-0.5 rounded hover:bg-amber-700 cursor-pointer flex items-center gap-1 shadow-xs"
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            {isAr ? "تحويل إلى الصندوق الأسود" : "Transférer vers Caisse Noire"}
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {isAr
                        ? `تم استرجاع تكلفة ${reportData.photocopyDeductions.totalPages} صفحة مخصومة من رواتب ${reportData.photocopyDeductions.teachersCount} أستاذ`
                        : `${reportData.photocopyDeductions.totalPages} pages récupérées auprès de ${reportData.photocopyDeductions.teachersCount} enseignant(s)`}
                    </p>
                  </div>
                </label>

                {/* 5. Formation Books */}
                <label className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer ${
                  includeFormationBooks
                    ? "bg-indigo-50/60 border-indigo-300 ring-1 ring-indigo-300/40"
                    : "bg-gray-50/60 border-gray-200 hover:bg-gray-50"
                }`}>
                  <input
                    type="checkbox"
                    checked={includeFormationBooks}
                    onChange={(e) => setIncludeFormationBooks(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-indigo-600" />
                        {isAr ? "5. مبيعات كتب التكوين والكتيبات (Formation Books)" : "5. Livres de Formation & Manuels Vendus"}
                      </span>
                      <span className="text-xs font-mono font-bold text-indigo-700">
                        +{formatDZD(reportData.formationBooks.totalAmount)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {isAr
                        ? `${reportData.formationBooks.totalCopies} نسخة مباعة عبر ${reportData.formationBooks.items.length} عنوان`
                        : `${reportData.formationBooks.totalCopies} exemplaires vendus sur ${reportData.formationBooks.items.length} titre(s)`}
                    </p>
                  </div>
                </label>
              </div>

              {/* Dynamic Grand Total Card */}
              <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-slate-400 uppercase font-semibold">
                    {isAr ? "إجمالي التدفقات المالية المحددة :" : "Total Consolidé des Flux Sélectionnés :"}
                  </p>
                  <p className="text-2xl font-black font-mono text-emerald-400 mt-0.5">
                    +{formatDZD(selectedGrandTotal)}
                  </p>
                </div>
                {includeCaisseNoire && (
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400">
                      {isAr ? "رصيد الصندوق الأسود :" : "Solde Caisse Noire :"}
                    </p>
                    <p className="text-base font-bold font-mono text-slate-200">
                      {formatDZD(reportData.caisseNoire.endingBalance)}
                    </p>
                  </div>
                )}
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
            onClick={handlePrint}
            disabled={isLoading || !reportData}
            leftIcon={<Printer className="w-4 h-4" />}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
          >
            {isAr ? "استخراج وطباعة التقرير الشامل" : "Générer & Imprimer le Rapport Global"}
          </Button>
        </div>
      </div>
    </div>
  );
}
