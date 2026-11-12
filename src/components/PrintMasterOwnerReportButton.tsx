"use client";

import React, { useRef, useState } from "react";
import ReactDOMServer from "react-dom/server";
import { useLocale } from "next-intl";
import {
  MasterOwnerPayrollReport,
  MasterOwnerPayrollPrintData,
} from "./printable/MasterOwnerPayrollReport";
import { getMasterAccumulatedPayrollReportAction } from "@/lib/actions";
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
  const autoPrint = options?.autoPrint ?? true;
  const includeToolbar = options?.includeToolbar ?? true;
  const safeFilename = (options?.filename || "rapport-paie-enseignants.html").replace(/[^0-9A-Za-z._-]/g, "");

  return `<!DOCTYPE html>
<html dir="${isAr ? "rtl" : "ltr"}" lang="${locale}">
  <head>
    <meta charset="utf-8">
    <base href="${origin}/">
    <title>${isAr ? "التقرير المالي التراكمي الشامل - المالك" : "Rapport Financier Consolidé Global - Propriétaire"}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap" rel="stylesheet">
    <style>
      .font-mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace !important;
      }
      [dir="rtl"] {
        font-family: 'Tajawal', system-ui, -apple-system, sans-serif !important;
      }
      body {
        font-family: system-ui, -apple-system, sans-serif;
        background-color: #fff;
        color: #000;
        margin: 0;
        padding: 0;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      @media print {
        body {
          margin: 0;
          padding: 0;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .no-print { display: none !important; }
        @page {
          size: A4 portrait;
          margin: 8mm;
        }
      }
      /* Fallback essential styles in case Tailwind CDN is blocked or slow */
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #9ca3af; padding: 6px 10px; }
      th { background-color: #e5e7eb; }
      .flex { display: flex; }
      .justify-between { justify-content: space-between; }
      .items-center { align-items: center; }
      .grid { display: grid; }
      .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .gap-4 { gap: 1rem; }
    </style>
  </head>
  <body>
    ${includeToolbar ? `<!-- Persistent top action toolbar (hidden on print) -->
    <div class="no-print" style="position: sticky; top: 0; z-index: 9999; background: #0f172a; color: #fff; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-family: system-ui, -apple-system, sans-serif;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-weight: 700; font-size: 14px; letter-spacing: 0.3px;">Massinissa School — ${isAr ? "التقرير المالي التراكمي الشامل" : "Rapport Financier Consolidé Global"}</span>
        <span style="font-size: 11px; font-weight: 600; background: rgba(255,255,255,0.16); padding: 2px 8px; border-radius: 9999px;">
          ${dataToPrint.teachersCount} ${isAr ? "أساتذة" : "enseignants"}
        </span>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <button onclick="downloadReport()" style="background: #2563eb; color: #ffffff; border: none; font-weight: 700; font-size: 13px; padding: 8px 16px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
          ⬇️ ${isAr ? "تحميل التقرير (HTML)" : "Télécharger (.html)"}
        </button>
        <button onclick="window.print()" style="background: #059669; color: #ffffff; border: none; font-weight: 700; font-size: 13px; padding: 8px 18px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
          🖨️ ${isAr ? "طباعة / حفظ كـ PDF" : "Imprimer / Enregistrer en PDF"}
        </button>
        <button onclick="window.close()" style="background: rgba(255,255,255,0.12); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.2); font-size: 13px; font-weight: 500; padding: 8px 14px; border-radius: 8px; cursor: pointer;">
          ✕ ${isAr ? "إغلاق" : "Fermer"}
        </button>
      </div>
    </div>` : ""}

    <div style="padding: 20px;">
      ${printContent}
    </div>

    <script data-report-script>
      function downloadReport() {
        try {
          var clone = document.documentElement.cloneNode(true);
          var scripts = clone.querySelectorAll('script[data-report-script]');
          for (var i = 0; i < scripts.length; i++) scripts[i].remove();
          var blob = new Blob(['<!DOCTYPE html>' + clone.outerHTML], { type: 'text/html;charset=utf-8' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = '${safeFilename}';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
        } catch (e) {
          console.error("Download error:", e);
        }
      }
      ${autoPrint ? `
      function triggerPrint() {
        if (window.__masterReportPrinted) return;
        window.__masterReportPrinted = true;
        setTimeout(function() {
          try {
            window.focus();
            window.print();
          } catch (e) {
            console.error("Auto-print error:", e);
          }
        }, 400);
      }
      if (document.readyState === 'complete') {
        triggerPrint();
      } else {
        window.addEventListener('load', triggerPrint);
      }` : ""}
    </script>
  </body>
</html>`;
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
