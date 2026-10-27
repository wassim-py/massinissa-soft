"use client";

import React, { useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { confirmTeacherPayslipAction } from "@/lib/actions";
import { CheckCircle2, Check, Loader2 } from "lucide-react";

interface ConfirmPayslipButtonProps {
  payslipId: number;
  initialStatus: string;
  onStatusChange?: (newStatus: "PAID" | "DRAFT") => void;
  className?: string;
}

export function ConfirmPayslipButton({
  payslipId,
  initialStatus,
  onStatusChange,
  className,
}: ConfirmPayslipButtonProps) {
  const locale = useLocale();
  const isAr = locale === "ar";
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();

  const isConfirmed = status === "PAID" || status === "VALIDATED" || status === "CONFIRMED";

  const handleToggle = () => {
    const nextConfirm = !isConfirmed;
    startTransition(async () => {
      const res = await confirmTeacherPayslipAction(payslipId, nextConfirm);
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
    return (
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
    );
  }

  return (
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
  );
}

export default ConfirmPayslipButton;
