"use client";

import React, { useState } from "react";
import ReactDOMServer from "react-dom/server";
import { useLocale } from "next-intl";
import {
  OwnerTeacherConsolidationReport,
  OwnerTeacherConsolidationPrintData,
} from "./printable/OwnerTeacherConsolidationReport";
import { getTeacherPayslipConsolidatedReportAction } from "@/lib/actions";
import { Printer, Loader2 } from "lucide-react";

interface PrintOwnerConsolidationButtonProps {
  data?: OwnerTeacherConsolidationPrintData | null;
  payslipId?: number;
  label?: string;
  className?: string;
  showIcon?: boolean;
}

export const PrintOwnerConsolidationButton = ({
  data: initialData,
  payslipId,
  label,
  className = "bg-slate-900 hover:bg-black text-white font-medium px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer",
  showIcon = true,
}: PrintOwnerConsolidationButtonProps) => {
  const locale = useLocale();
  const isAr = locale === "ar";
  const [isLoading, setIsLoading] = useState(false);

  const defaultLabel = label || (isAr ? "المالك" : "Propriétaire");
  const buttonTitle = isAr
    ? "تقرير المالك (5 أعمدة: الأستاذ، الفوج، الحصص، حصة الأستاذ، حصة المدرسة)"
    : "Rapport consolidé propriétaire (5 colonnes : Enseignant, Groupe, Séances, Part Enseignant, Part École)";

  const openPrintWindow = (dataToPrint: OwnerTeacherConsolidationPrintData) => {
    const printContent = ReactDOMServer.renderToString(
      <OwnerTeacherConsolidationReport data={dataToPrint} locale={locale} />
    );

    const printWindow = window.open("", "_blank", "width=950,height=850");

    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="ltr" lang="fr">
          <head>
            <meta charset="utf-8">
            <base href="${window.location.origin}/">
            <title>Rapport Consolidé Propriétaire - ${dataToPrint.teacher.name}</title>
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
    if (initialData) {
      openPrintWindow(initialData);
      return;
    }

    if (!payslipId) return;

    try {
      setIsLoading(true);
      const res = await getTeacherPayslipConsolidatedReportAction(payslipId);
      if (res.success && res.data) {
        openPrintWindow(res.data);
      } else {
        alert(res.message || "Erreur lors de la récupération du rapport consolidé");
      }
    } catch (err: any) {
      console.error("Print consolidation report error:", err);
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
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : showIcon ? (
        <Printer className="w-3.5 h-3.5 shrink-0" />
      ) : null}
      <span>{isLoading ? (isAr ? "جاري التحميل..." : "Chargement...") : defaultLabel}</span>
    </button>
  );
};

export default PrintOwnerConsolidationButton;
