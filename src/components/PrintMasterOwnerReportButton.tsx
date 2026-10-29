"use client";

import React, { useState } from "react";
import ReactDOMServer from "react-dom/server";
import { useLocale } from "next-intl";
import {
  MasterOwnerPayrollReport,
  MasterOwnerPayrollPrintData,
} from "./printable/MasterOwnerPayrollReport";
import { getMasterAccumulatedPayrollReportAction } from "@/lib/actions";
import { FileSpreadsheet, Loader2 } from "lucide-react";

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

function getFullReportHtml(
  printContent: string,
  dataToPrint: MasterOwnerPayrollPrintData,
  isAr: boolean,
  locale: string,
  origin: string
) {
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
    <!-- Persistent top action toolbar (hidden on print) -->
    <div class="no-print" style="position: sticky; top: 0; z-index: 9999; background: #0f172a; color: #fff; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-family: system-ui, -apple-system, sans-serif;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-weight: 700; font-size: 14px; letter-spacing: 0.3px;">Massinissa School — ${isAr ? "التقرير المالي التراكمي الشامل" : "Rapport Financier Consolidé Global"}</span>
        <span style="font-size: 11px; font-weight: 600; background: rgba(255,255,255,0.16); padding: 2px 8px; border-radius: 9999px;">
          ${dataToPrint.teachersCount} ${isAr ? "أساتذة" : "enseignants"}
        </span>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <button onclick="window.print()" style="background: #059669; color: #ffffff; border: none; font-weight: 700; font-size: 13px; padding: 8px 18px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
          🖨️ ${isAr ? "طباعة / حفظ كـ PDF" : "Imprimer / Enregistrer en PDF"}
        </button>
        <button onclick="window.close()" style="background: rgba(255,255,255,0.12); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.2); font-size: 13px; font-weight: 500; padding: 8px 14px; border-radius: 8px; cursor: pointer;">
          ✕ ${isAr ? "إغلاق" : "Fermer"}
        </button>
      </div>
    </div>

    <div style="padding: 20px;">
      ${printContent}
    </div>

    <script>
      function triggerPrint() {
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
      }
    </script>
  </body>
</html>`;
}

function printViaIframe(html: string) {
  let iframe = document.getElementById("master-owner-report-iframe") as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "master-owner-report-iframe";
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
    // This completely bypasses browser popup blockers which trigger on post-await window.open calls.
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

      const fullHtml = getFullReportHtml(
        printContent,
        res.data,
        isAr,
        locale,
        typeof window !== "undefined" ? window.location.origin : ""
      );

      if (printWindow && !printWindow.closed) {
        try {
          printWindow.document.open();
          printWindow.document.write(fullHtml);
          printWindow.document.close();
          printWindow.focus();
        } catch (err) {
          console.error("Writing report to printWindow failed, falling back to iframe:", err);
          printViaIframe(fullHtml);
        }
      } else {
        // Fallback: If popup was blocked by strict browser policy, print seamlessly via hidden iframe
        printViaIframe(fullHtml);
      }
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
  );
};

export default PrintMasterOwnerReportButton;
