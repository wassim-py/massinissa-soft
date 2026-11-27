"use client";

import React, { useState } from "react";
import ReactDOMServer from "react-dom/server";
import { useLocale } from "next-intl";
import { buildPrintableReportHtml } from "@/lib/printReportHtml";
import { getTeacherSalaryGrowthAction } from "@/lib/actions";
import { PayslipTicket, PayslipPrintData } from "./printable/PayslipTicket";
import TeacherPayslipConfigModal from "@/components/teachers/TeacherPayslipConfigModal";

interface PrintPayslipButtonProps {
  data: PayslipPrintData;
  payslipId?: number;
  initialBonus?: number;
  initialScope?: "all" | "normal" | "formation";
  enableSelectiveModal?: boolean;
  label?: string;
  className?: string;
}

function toIsoDateOnly(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().split("T")[0];
}

export const PrintPayslipButton = ({
  data,
  payslipId,
  initialBonus = 0,
  initialScope = "all",
  enableSelectiveModal = true,
  label,
  className = "bg-primary hover:bg-primary-hover text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-2 shadow-xs transition-colors",
}: PrintPayslipButtonProps) => {
  const locale = useLocale();
  const isAr = locale === "ar";
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const defaultLabel = isAr ? "طباعة قسيمة الراتب" : "Imprimer le bulletin de paie";
  const buttonTitle = enableSelectiveModal
    ? isAr
      ? "طباعة قسيمة الراتب (اختيار العناصر: الدروس، التكوين، الكتب، الاقتطاعات)"
      : "Imprimer le bulletin de paie (choisir les rubriques : cours, formations, livres, déductions)"
    : defaultLabel;

  const writePayslipToWindow = (printWindow: Window, enrichedData: PayslipPrintData) => {
    const printContent = ReactDOMServer.renderToString(
      <PayslipTicket data={enrichedData} locale={locale} />
    );

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const html = buildPrintableReportHtml({
      title: `${isAr ? "قسيمة راتب" : "Bulletin de paie"} #${enrichedData.id} - ${enrichedData.teacher.name}`,
      contentHtml: printContent,
      isAr,
      locale,
      origin,
      includeToolbar: false,
      autoPrint: true,
      closeAfterPrint: true,
    });

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  };

  const handlePrint = async () => {
    if (enableSelectiveModal) {
      setIsModalOpen(true);
      return;
    }

    if (isLoading) return;
    const printWindow = window.open("", "_blank", "width=900,height=800");
    if (!printWindow) return;

    if (data.salaryHistory && data.salaryHistory.length > 0) {
      writePayslipToWindow(printWindow, data);
      return;
    }

    try {
      setIsLoading(true);
      printWindow.document.open();
      printWindow.document.write(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${
          isAr ? "جاري تحضير القسيمة..." : "Préparation du bulletin..."
        }</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif;color:#334155;background:#f8fafc;"><p style="font-size:14px;font-weight:600;">${
          isAr ? "جاري تحميل بيانات تطور الراتب..." : "Chargement de l'évolution salariale (3 mois)..."
        }</p></body></html>`
      );
      printWindow.document.close();

      const res = await getTeacherSalaryGrowthAction({
        teacherId: data.teacher.id,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        currentGrossAmount: data.grossAmount,
        currentNetAmount: data.netAmount,
        currentSessionsCount: data.sessionsCount,
      });

      if (!printWindow.closed) {
        writePayslipToWindow(printWindow, {
          ...data,
          salaryHistory: res.success ? res.salaryHistory : undefined,
        });
      }
    } catch {
      if (!printWindow.closed) {
        writePayslipToWindow(printWindow, data);
      }
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
        <svg
          className={`w-4 h-4 shrink-0 ${isLoading ? "animate-spin" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
          />
        </svg>
        <span>{label ?? defaultLabel}</span>
      </button>

      {isModalOpen && (
        <TeacherPayslipConfigModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          teacherId={data.teacher.id}
          teacherName={data.teacher.name}
          teacherPhone={data.teacher.phone}
          startDate={toIsoDateOnly(data.periodStart)}
          endDate={toIsoDateOnly(data.periodEnd)}
          payslipId={payslipId}
          initialBonus={initialBonus}
          initialStatus={data.status}
          initialScope={initialScope}
          locale={locale}
        />
      )}
    </>
  );
};

export default PrintPayslipButton;
