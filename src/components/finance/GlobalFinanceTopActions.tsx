"use client";

import React, { useState } from "react";
import { Sparkles, ArrowRightLeft, FileSpreadsheet, Printer, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import GlobalFinanceReportModal from "./GlobalFinanceReportModal";
import SectionTransferModal from "./SectionTransferModal";
import { useLocale } from "next-intl";

interface GlobalFinanceTopActionsProps {
  branches: Array<{ id: number; name: string }>;
  initialBranchId?: string;
  initialDateFrom?: string;
  initialDateTo?: string;
  locale?: string;
}

export default function GlobalFinanceTopActions({
  branches,
  initialBranchId = "all",
  initialDateFrom,
  initialDateTo,
  locale: propLocale,
}: GlobalFinanceTopActionsProps) {
  const currentLocale = useLocale();
  const locale = propLocale || currentLocale || "fr";
  const isAr = locale === "ar";

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferSourceSection, setTransferSourceSection] = useState<string>("PHOTOCOPY_DEDUCTIONS");

  const handleOpenTransferWithSource = (source?: string) => {
    if (source) setTransferSourceSection(source);
    setIsTransferModalOpen(true);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* 1. Global Financial Report Button */}
      <Button
        variant="primary"
        size="sm"
        onClick={() => setIsReportModalOpen(true)}
        leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-300" />}
        className="bg-slate-900 hover:bg-black text-white font-bold text-xs h-[38px] shadow-xs cursor-pointer border border-slate-700"
      >
        {isAr ? "تقرير مالي شامل" : "Rapport Financier Global"}
      </Button>

      {/* 2. Transfer Money Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setTransferSourceSection("PHOTOCOPY_DEDUCTIONS");
          setIsTransferModalOpen(true);
        }}
        leftIcon={<ArrowRightLeft className="w-4 h-4 text-amber-600" />}
        className="border-amber-300 bg-amber-50/70 hover:bg-amber-100/70 text-amber-950 font-bold text-xs h-[38px] shadow-xs cursor-pointer"
      >
        {isAr ? "تحويل أموال بين الأقسام" : "Transférer des Fonds"}
      </Button>

      {/* Global Report Modal */}
      {isReportModalOpen && (
        <GlobalFinanceReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          branches={branches}
          initialBranchId={initialBranchId}
          initialDateFrom={initialDateFrom}
          initialDateTo={initialDateTo}
          onOpenTransferModal={handleOpenTransferWithSource}
          locale={locale}
        />
      )}

      {/* Section Transfer Modal */}
      {isTransferModalOpen && (
        <SectionTransferModal
          isOpen={isTransferModalOpen}
          onClose={() => setIsTransferModalOpen(false)}
          defaultFromSection={transferSourceSection}
          defaultToSection="CAISSE_NOIRE"
          branches={branches}
          locale={locale}
        />
      )}
    </div>
  );
}
