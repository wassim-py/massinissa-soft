"use client";

import React from "react";
import ReactDOMServer from "react-dom/server";
import { useLocale } from "next-intl";
import { buildPrintableReportHtml } from "@/lib/printReportHtml";
import { PayslipTicket, PayslipPrintData } from "./printable/PayslipTicket";

interface PrintPayslipButtonProps {
  data: PayslipPrintData;
  label?: string;
  className?: string;
}

export const PrintPayslipButton = ({
  data,
  label,
  className = "bg-primary hover:bg-primary-hover text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-2 shadow-xs transition-colors",
}: PrintPayslipButtonProps) => {
  const locale = useLocale();
  const isAr = locale === "ar";
  const defaultLabel = isAr ? "طباعة قسيمة الراتب" : "Imprimer le bulletin de paie";

  const handlePrint = () => {
    const printContent = ReactDOMServer.renderToString(
      <PayslipTicket data={data} locale={locale} />
    );

    const printWindow = window.open("", "_blank", "width=900,height=800");

    if (printWindow) {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const html = buildPrintableReportHtml({
        title: `${isAr ? "قسيمة راتب" : "Bulletin de paie"} #${data.id} - ${data.teacher.name}`,
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
    }
  };

  return (
    <button type="button" onClick={handlePrint} className={className}>
      <svg
        className="w-4 h-4"
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
  );
};

export default PrintPayslipButton;
