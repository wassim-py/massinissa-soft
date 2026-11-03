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
import TeacherReportConfigModal from "@/components/teachers/TeacherReportConfigModal";

interface PrintOwnerConsolidationButtonProps {
  data?: OwnerTeacherConsolidationPrintData | null;
  payslipId?: number;
  label?: string;
  className?: string;
  showIcon?: boolean;
  enableSelectiveModal?: boolean;
}

function getLoadingHtml(isAr: boolean, locale: string) {
  return `<!DOCTYPE html>
<html dir="${isAr ? "rtl" : "ltr"}" lang="${locale}">
  <head>
    <meta charset="utf-8">
    <title>${isAr ? "جاري تحضير التقرير..." : "Génération du rapport..."}</title>
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
      .spinner {
        width: 40px;
        height: 40px;
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
      <h2>${isAr ? "جاري استخراج تقرير المالك..." : "Génération du rapport propriétaire..."}</h2>
      <p>${isAr ? "يرجى الانتظار، جاري تجميع الحصص والمستحقات." : "Veuillez patienter pendant le calcul des parts et séances."}</p>
    </div>
  </body>
</html>`;
}

function getReportHtml(
  printContent: string,
  teacherName: string,
  isAr: boolean,
  locale: string,
  origin: string
) {
  return `<!DOCTYPE html>
<html dir="${isAr ? "rtl" : "ltr"}" lang="${locale}">
  <head>
    <meta charset="utf-8">
    <base href="${origin}/">
    <title>Rapport Consolidé Propriétaire - ${teacherName}</title>
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
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #9ca3af; padding: 6px 10px; }
      th { background-color: #e5e7eb; }
    </style>
  </head>
  <body>
    <div class="no-print" style="position: sticky; top: 0; z-index: 9999; background: #0f172a; color: #fff; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-family: system-ui, -apple-system, sans-serif;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-weight: 700; font-size: 14px;">Rapport Consolidé Propriétaire — ${teacherName}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <button onclick="window.print()" style="background: #059669; color: #ffffff; border: none; font-weight: 700; font-size: 13px; padding: 8px 18px; border-radius: 8px; cursor: pointer;">
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
            console.error("Print trigger error:", e);
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
  let iframe = document.getElementById("owner-consolidation-report-iframe") as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "owner-consolidation-report-iframe";
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

export const PrintOwnerConsolidationButton = ({
  data: initialData,
  payslipId,
  label,
  className = "bg-slate-900 hover:bg-black text-white font-medium px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer",
  showIcon = true,
  enableSelectiveModal = true,
}: PrintOwnerConsolidationButtonProps) => {
  const locale = useLocale();
  const isAr = locale === "ar";
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState<{
    teacherId: string;
    teacherName: string;
    teacherPhone?: string | null;
    startDate: string;
    endDate: string;
  } | null>(null);

  const defaultLabel = label || (isAr ? "المالك" : "Propriétaire");
  const buttonTitle = isAr
    ? "تقرير المالك (تحديد العناصر: الدروس، الكتب، التكوين، الاقتطاعات)"
    : "Rapport consolidé propriétaire (Sélection des rubriques : cours, livres, formations)";

  const renderAndPrint = (dataToPrint: OwnerTeacherConsolidationPrintData, targetWindow: Window | null) => {
    const printContent = ReactDOMServer.renderToString(
      <OwnerTeacherConsolidationReport data={dataToPrint} locale={locale} />
    );
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const html = getReportHtml(printContent, dataToPrint.teacher.name, isAr, locale, origin);

    if (targetWindow && !targetWindow.closed) {
      try {
        targetWindow.document.open();
        targetWindow.document.write(html);
        targetWindow.document.close();
        targetWindow.focus();
      } catch (err) {
        console.error("Failed to write to window, falling back to iframe:", err);
        printViaIframe(html);
      }
    } else {
      printViaIframe(html);
    }
  };

  const handleClick = async () => {
    if (enableSelectiveModal) {
      if (initialData) {
        setModalData({
          teacherId: initialData.teacher.id,
          teacherName: initialData.teacher.name,
          teacherPhone: initialData.teacher.phone,
          startDate: new Date(initialData.periodStart).toISOString().split("T")[0],
          endDate: new Date(initialData.periodEnd).toISOString().split("T")[0],
        });
        setIsModalOpen(true);
        return;
      }

      if (payslipId) {
        try {
          setIsLoading(true);
          const res = await getTeacherPayslipConsolidatedReportAction(payslipId);
          if (res.success && res.data) {
            setModalData({
              teacherId: res.data.teacher.id,
              teacherName: res.data.teacher.name,
              teacherPhone: res.data.teacher.phone,
              startDate: new Date(res.data.periodStart).toISOString().split("T")[0],
              endDate: new Date(res.data.periodEnd).toISOString().split("T")[0],
            });
            setIsModalOpen(true);
          } else {
            alert(res.message || "Erreur lors de la récupération de la fiche.");
          }
        } catch (e: any) {
          console.error("Fetch payslip error:", e);
          alert("Erreur lors de la préparation du rapport.");
        } finally {
          setIsLoading(false);
        }
        return;
      }
    }

    // Direct print fallback if selective modal is disabled
    let printWindow: Window | null = null;
    try {
      printWindow = window.open("", "_blank", "width=950,height=850");
    } catch {
      printWindow = null;
    }

    if (initialData) {
      renderAndPrint(initialData, printWindow);
      return;
    }

    if (!payslipId) return;

    if (printWindow) {
      try {
        printWindow.document.open();
        printWindow.document.write(getLoadingHtml(isAr, locale));
        printWindow.document.close();
      } catch (err) {
        console.warn("Could not write loading screen:", err);
      }
    }

    try {
      setIsLoading(true);
      const res = await getTeacherPayslipConsolidatedReportAction(payslipId);
      if (res.success && res.data) {
        renderAndPrint(res.data, printWindow);
      } else {
        const errorMsg = res.message || "Erreur lors de la récupération du rapport consolidé";
        if (printWindow && !printWindow.closed) {
          printWindow.close();
        }
        alert(errorMsg);
      }
    } catch (err: any) {
      console.error("Print consolidation report error:", err);
      if (printWindow && !printWindow.closed) {
        printWindow.close();
      }
      alert("Erreur lors de la génération du rapport");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
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

      {isModalOpen && modalData && (
        <TeacherReportConfigModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          teacherId={modalData.teacherId}
          teacherName={modalData.teacherName}
          teacherPhone={modalData.teacherPhone}
          startDate={modalData.startDate}
          endDate={modalData.endDate}
          payslipId={payslipId}
          locale={locale}
        />
      )}
    </>
  );
};

export default PrintOwnerConsolidationButton;
