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
  label?: string;
  className?: string;
}

export const PrintMasterOwnerReportButton = ({
  periodStart,
  periodEnd,
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

  const openPrintWindow = (dataToPrint: MasterOwnerPayrollPrintData) => {
    const printContent = ReactDOMServer.renderToString(
      <MasterOwnerPayrollReport data={dataToPrint} locale={locale} />
    );

    const printWindow = window.open("", "_blank", "width=1000,height=900");

    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="ltr" lang="fr">
          <head>
            <meta charset="utf-8">
            <base href="${window.location.origin}/">
            <title>Rapport Financier Consolidé Global - Propriétaire</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap" rel="stylesheet">
            <style>
              .font-mono {
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace !important;
              }
              body {
                font-family: system-ui, -apple-system, sans-serif;
                background-color: #fff;
                color: #000;
                margin: 0;
                padding: 15px;
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
                .no-print { display: none; }
                @page {
                  size: A4 portrait;
                  margin: 8mm;
                }
              }
            </style>
          </head>
          <body>
            ${printContent}
          </body>
        </html>
      `);

      printWindow.document.close();
      printWindow.focus();

      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  };

  const handlePrint = async () => {
    try {
      setIsLoading(true);
      const res = await getMasterAccumulatedPayrollReportAction({
        periodStart,
        periodEnd,
      });

      if (res.success && res.data) {
        if (res.data.teachers.length === 0) {
          alert(
            isAr
              ? "لا توجد كشوف رواتب محفوظة في هذه الفترة لتجميعها."
              : "Aucune fiche de paie générée trouvée pour cette période."
          );
          return;
        }
        openPrintWindow(res.data);
      } else {
        alert(res.message || "Erreur lors de la récupération du rapport cumulé");
      }
    } catch (err: any) {
      console.error("Print master payroll report error:", err);
      alert("Erreur lors de la génération du rapport");
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
