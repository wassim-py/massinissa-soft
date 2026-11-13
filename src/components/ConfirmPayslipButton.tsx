"use client";

import React, { useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { confirmTeacherPayslipAction } from "@/lib/actions";
import { OUTCOME_FUNDING_SOURCES, getOutcomeFundingSourceMeta, normalizeOutcomeFundingSource, type OutcomeFundingSource } from "@/lib/financeConstants";
import { CheckCircle2, Check, Loader2 } from "lucide-react";

interface ConfirmPayslipButtonProps {
  payslipId: number;
  initialStatus: string;
  initialFundingSource?: string | null;
  onStatusChange?: (newStatus: "PAID" | "DRAFT") => void;
  className?: string;
  showFundingSourceSelector?: boolean;
}

export function ConfirmPayslipButton({
  payslipId,
  initialStatus,
  initialFundingSource,
  onStatusChange,
  className,
  showFundingSourceSelector = true,
}: ConfirmPayslipButtonProps) {
  const locale = useLocale();
  const isAr = locale === "ar";
  const [status, setStatus] = useState(initialStatus);
  const [fundingSource, setFundingSource] = useState<OutcomeFundingSource>(
    normalizeOutcomeFundingSource(initialFundingSource)
  );
  const [isPending, startTransition] = useTransition();

  const isConfirmed = status === "PAID" || status === "VALIDATED" || status === "CONFIRMED";

  const handleToggle = () => {
    const nextConfirm = !isConfirmed;
    startTransition(async () => {
      const res = await confirmTeacherPayslipAction(payslipId, nextConfirm, fundingSource);
      if (res.success && res.status) {
        const nextStatus = res.status as "PAID" | "DRAFT";
        setStatus(nextStatus);
        onStatusChange?.(nextStatus);
      } else {
        alert(res.message || "Erreur");
      }
    });
  };

  if (isConfirmed) {
    const sourceMeta = getOutcomeFundingSourceMeta(fundingSource, locale);
    return (
      <div className="inline-flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          disabled={isPending}
          onClick={handleToggle}
          className={
            className ||
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors shadow-xs cursor-pointer"
          }
          title={
            isAr
              ? "كشف مؤكد ومخصوم من الإيرادات (اضغط لإلغاء التأكيد)"
              : "Fiche confirmée et décaissée (cliquer pour annuler la confirmation)"
          }
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
          ) : (
            <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          )}
          <span>{isAr ? "مؤكد" : "Confirmé"}</span>
        </button>
        {showFundingSourceSelector && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${sourceMeta.pillClass}`}>
            {sourceMeta.shortLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      {showFundingSourceSelector && (
        <select
          value={fundingSource}
          disabled={isPending}
          onChange={(e) => setFundingSource(normalizeOutcomeFundingSource(e.target.value))}
          className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-700"
          title={isAr ? "مصدر التمويل" : "Source de financement"}
        >
          {OUTCOME_FUNDING_SOURCES.map((src) => {
            const meta = getOutcomeFundingSourceMeta(src, locale);
            return (
              <option key={src} value={src}>
                {meta.shortLabel}
              </option>
            );
          })}
        </select>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={handleToggle}
        className={
          className ||
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs cursor-pointer"
        }
        title={
          isAr
            ? "تأكيد وصرف كشف الراتب وخصمه من الصافي الإجمالي"
            : "Confirmer la fiche de paie et mettre à jour le revenu net"
        }
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>{isAr ? "تأكيد الصرف" : "Confirmer"}</span>
      </button>
    </div>
  );
}

export default ConfirmPayslipButton;
