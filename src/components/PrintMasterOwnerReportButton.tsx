"use client";

import React, { useRef, useState } from "react";
import ReactDOMServer from "react-dom/server";
import { useLocale } from "next-intl";
import {
  MasterOwnerPayrollReport,
  MasterOwnerPayrollPrintData,
} from "./printable/MasterOwnerPayrollReport";
import { getMasterAccumulatedPayrollReportAction } from "@/lib/actions";
import { buildPrintableReportHtml } from "@/lib/printReportHtml";
import { Download, ExternalLink, FileSpreadsheet, Loader2, Printer, X } from "lucide-react";

interface PrintMasterOwnerReportButtonProps {
  periodStart?: string;
  periodEnd?: string;
  payslipIds?: number[];
  label?: string;
  className?: string;
}

function getLoadingHtml(isAr: boolean, locale: string) {
  return `<!DOCTYPE html>
<html dir="${isAr ? "rtl" : "ltr"}" lang="${locale}">
  <head>
    <meta charset="utf-8">
    <title>${isAr ? "جاري تحضير التقرير الشامل..." : "Génération du rapport global..."}</title>
    <style>
      body {
        margin: 0;
        font-family: system-ui, -apple-system, sans-serif;
        background: #f8fafc;
        color: #0f172a;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }
      .card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 36px 44px;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05);
        text-align: center;
        max-width: 440px;
      }
      .spinner {
        width: 42px;
        height: 42px;
        border: 3.5px solid #e2e8f0;
        border-top-color: #0f172a;
        border-radius: 50%;
        animation: spin 0.75s linear infinite;
        margin: 0 auto 20px;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      h2 { margin: 0 0 8px; font-size: 17px; font-weight: 700; color: #0f172a; }
      p { margin: 0; font-size: 13px; color: #64748b; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="spinner"></div>
      <h2>${isAr ? "جاري تجميع التقرير المالي الشامل..." : "Génération du rapport global en cours..."}</h2>
      <p>${isAr ? "يرجى الانتظار، جاري تجميع الحصص وكشوف الرواتب المحددة." : "Veuillez patienter pendant la consolidation et le calcul des données financières."}</p>
    </div>
  </body>
</html>`;
}

function getMessageHtml(message: string, isError: boolean, isAr: boolean, locale: string) {
  return `<!DOCTYPE html>
<html dir="${isAr ? "rtl" : "ltr"}" lang="${locale}">
  <head>
    <meta charset="utf-8">
    <title>${isError ? (isAr ? "خطأ" : "Erreur") : (isAr ? "تنبيه" : "Information")}</title>
    <style>
      body {
        margin: 0;
        font-family: system-ui, -apple-system, sans-serif;
        background: #f8fafc;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }
      .card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 36px 44px;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);
        text-align: center;
        max-width: 440px;
      }
      .icon {
        font-size: 36px;
        margin-bottom: 16px;
      }
      h2 { margin: 0 0 10px; font-size: 17px; font-weight: 700; color: #0f172a; }
      p { margin: 0 0 20px; font-size: 13px; color: #64748b; line-height: 1.5; }
      button {
        background: #0f172a;
        color: #ffffff;
        border: none;
        padding: 9px 22px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      button:hover { background: #1e293b; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon">${isError ? "⚠️" : "ℹ️"}</div>
      <h2>${isError ? (isAr ? "تعذر إنشاء التقرير" : "Erreur lors de la génération") : (isAr ? "لا توجد بيانات" : "Aucune donnée")}</h2>
      <p>${message}</p>
      <button onclick="window.close()">${isAr ? "إغلاق النافذة" : "Fermer cette fenêtre"}</button>
    </div>
  </body>
</html>`;
}

function getReportFilename(periodStart?: string, periodEnd?: string) {
  const sanitize = (v?: string) => (v ? v.slice(0, 10).replace(/[^0-9A-Za-z_-]/g, "") : "");
  const s = sanitize(periodStart);
  const e = sanitize(periodEnd);
  if (s && e) return `rapport-paie-enseignants-${s}_${e}.html`;
  if (s || e) return `rapport-paie-enseignants-${s || e}.html`;
  return "rapport-paie-enseignants.html";
}

function downloadHtmlFile(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getFullReportHtml(
  printContent: string,
  dataToPrint: MasterOwnerPayrollPrintData,
  isAr: boolean,
  locale: string,
  origin: string,
  options?: { autoPrint?: boolean; includeToolbar?: boolean; filename?: string }
) {
  return buildPrintableReportHtml({
    title: isAr
      ? "التقرير المالي التراكمي الشامل - المالك"
      : "Rapport Financier Consolidé Global - Propriétaire",
    toolbarTitle: `Massinissa School — ${
      isAr ? "التقرير المالي التراكمي الشامل" : "Rapport Financier Consolidé Global"
    }`,
    toolbarBadge: `${dataToPrint.teachersCount} ${isAr ? "أساتذة" : "enseignants"}`,
    contentHtml: printContent,
    isAr,
    locale,
    origin,
    includeToolbar: options?.includeToolbar ?? true,
    includeDownloadButton: true,
    downloadFilename: options?.filename || "rapport-paie-enseignants.html",
    autoPrint: options?.autoPrint ?? true,
  });
}

export const PrintMasterOwnerReportButton = ({
  periodStart,
  periodEnd,
  payslipIds,
  label,
  className = "bg-slate-900 hover:bg-black text-white font-semibold px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 shadow-xs transition-colors cursor-pointer",
}: PrintMasterOwnerReportButtonProps) => {
  const locale = useLocale();
  const isAr = locale === "ar";
  const [isLoading, setIsLoading] = useState(false);
  const [previewReport, setPreviewReport] = useState<{
    iframeHtml: string;
    downloadHtml: string;
    filename: string;
    teachersCount: number;
  } | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);

  const defaultLabel = label || (isAr ? "التقرير الشامل" : "Rapport Global");
  const buttonTitle = isAr
    ? "التقرير المالي التراكمي الشامل للمالك"
    : "Rapport financier global consolidé pour le propriétaire";

  const handlePrint = async () => {
    if (payslipIds && payslipIds.length === 0) {
      alert(
        isAr
          ? "لا توجد كشوف رواتب مطابقة للفلاتر المحددة."
          : "Aucune fiche de paie ne correspond aux filtres sélectionnés."
      );
      return;
    }

    // 1. Open popup window SYNCHRONOUSLY directly inside the user click gesture
    // This bypasses browser popup blockers on post-await window.open calls.
    let printWindow: Window | null = null;
    try {
      printWindow = window.open("", "_blank", "width=1050,height=900");
    } catch {
      printWindow = null;
    }

    // 2. Immediately display a clean loading animation inside the opened window
    if (printWindow) {
      try {
        printWindow.document.open();
        printWindow.document.write(getLoadingHtml(isAr, locale));
        printWindow.document.close();
      } catch (err) {
        console.warn("Could not write loading screen to printWindow:", err);
      }
    }

    try {
      setIsLoading(true);
      const res = await getMasterAccumulatedPayrollReportAction({
        periodStart,
        periodEnd,
        payslipIds,
      });

      if (!res.success || !res.data) {
        const errorMsg =
          res.message ||
          (isAr
            ? "حدث خطأ أثناء استرجاع التقرير"
            : "Erreur lors de la récupération du rapport cumulé");
        if (printWindow && !printWindow.closed) {
          try {
            printWindow.document.open();
            printWindow.document.write(getMessageHtml(errorMsg, true, isAr, locale));
            printWindow.document.close();
          } catch {}
        }
        alert(errorMsg);
        return;
      }

      if (res.data.teachers.length === 0) {
        const emptyMsg = isAr
          ? "لا توجد كشوف رواتب محفوظة في هذه الفترة لتجميعها."
          : "Aucune fiche de paie générée trouvée pour cette période.";
        if (printWindow && !printWindow.closed) {
          try {
            printWindow.document.open();
            printWindow.document.write(getMessageHtml(emptyMsg, false, isAr, locale));
            printWindow.document.close();
          } catch {}
        }
        alert(emptyMsg);
        return;
      }

      const printContent = ReactDOMServer.renderToString(
        <MasterOwnerPayrollReport data={res.data} locale={locale} />
      );
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const filename = getReportFilename(periodStart, periodEnd);

      const popupHtml = getFullReportHtml(printContent, res.data, isAr, locale, origin, {
        autoPrint: true,
        includeToolbar: true,
        filename,
      });
      const modalIframeHtml = getFullReportHtml(printContent, res.data, isAr, locale, origin, {
        autoPrint: false,
        includeToolbar: false,
        filename,
      });
      const downloadHtml = getFullReportHtml(printContent, res.data, isAr, locale, origin, {
        autoPrint: false,
        includeToolbar: true,
        filename,
      });

      if (printWindow && !printWindow.closed) {
        try {
          printWindow.document.open();
          printWindow.document.write(popupHtml);
          printWindow.document.close();
          printWindow.focus();
          return;
        } catch (err) {
          console.error("Writing report to printWindow failed, opening preview modal:", err);
        }
      }

      // Fallback when popup is blocked or closed: open an in-page preview modal with explicit
      // user-gesture Print / PDF and HTML download buttons so export never fails silently.
      setPreviewReport({
        iframeHtml: modalIframeHtml,
        downloadHtml,
        filename,
        teachersCount: res.data.teachersCount,
      });
    } catch (err: any) {
      console.error("Print master payroll report error:", err);
      const errorMsg = isAr ? "خطأ أثناء إنشاء التقرير" : "Erreur lors de la génération du rapport";
      if (printWindow && !printWindow.closed) {
        try {
          printWindow.document.open();
          printWindow.document.write(getMessageHtml(errorMsg, true, isAr, locale));
          printWindow.document.close();
        } catch {}
      }
      alert(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handlePrint}
        disabled={isLoading}
        className={className}
        title={buttonTitle}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-white" />
        ) : (
          <FileSpreadsheet className="w-4 h-4 shrink-0 text-emerald-400" />
        )}
        <span>{isLoading ? (isAr ? "جاري تجميع التقرير..." : "Génération du rapport...") : defaultLabel}</span>
      </button>

      {previewReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-5xl h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-bold text-sm">
                  {isAr ? "التقرير المالي التراكمي الشامل" : "Rapport Financier Consolidé Global"}
                </span>
                <span className="text-[11px] font-semibold bg-white/15 px-2.5 py-0.5 rounded-full">
                  {previewReport.teachersCount} {isAr ? "أساتذة" : "enseignants"}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => downloadHtmlFile(previewReport.downloadHtml, previewReport.filename)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isAr ? "تحميل (.html)" : "Télécharger (.html)"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([previewReport.downloadHtml], { type: "text/html;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank");
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{isAr ? "فتح في نافذة جديدة" : "Nouvel onglet"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cw = previewIframeRef.current?.contentWindow;
                    if (cw) {
                      cw.focus();
                      cw.print();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isAr ? "طباعة / حفظ PDF" : "Imprimer / PDF"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewReport(null)}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                  title={isAr ? "إغلاق" : "Fermer"}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <iframe
              ref={previewIframeRef}
              srcDoc={previewReport.iframeHtml}
              title={isAr ? "معاينة التقرير المالي الشامل" : "Aperçu du rapport financier global"}
              className="flex-1 w-full bg-white border-0"
            />
          </div>
        </div>
      )}
    </>
  );
};

export default PrintMasterOwnerReportButton;
