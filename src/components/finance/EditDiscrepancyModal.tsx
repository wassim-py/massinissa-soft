"use client";

import React, { useState, useTransition, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { toast } from "react-toastify";
import { updateMissingMoneyAction, updateSurplusMoneyAction } from "@/lib/actions";
import { getAlgiersDateInfo, getAlgiersTodayDateString } from "@/lib/algiersDate";
import { AlertCircle, Coins, Pencil, X } from "lucide-react";

export interface EditDiscrepancyModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "MISSING" | "SURPLUS";
  id: number;
  initialAmount: number;
  initialReason?: string | null;
  initialDate?: string | Date | null;
  initialBranchId?: number;
  branches?: Array<{ id: number; name: string }>;
}

export default function EditDiscrepancyModal({
  isOpen,
  onClose,
  type,
  id,
  initialAmount,
  initialReason,
  initialDate,
  initialBranchId,
  branches,
}: EditDiscrepancyModalProps) {
  const t = useTranslations("dailyLedger");
  const locale = useLocale();
  const isAr = locale === "ar";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const resolveDateStr = (val?: string | Date | null) =>
    val ? getAlgiersDateInfo(val).dateStr : getAlgiersTodayDateString();

  const [amount, setAmount] = useState<string>(String(initialAmount || ""));
  const [reason, setReason] = useState<string>(initialReason || "");
  const [date, setDate] = useState<string>(resolveDateStr(initialDate));
  const [branchId, setBranchId] = useState<number | undefined>(initialBranchId);

  useEffect(() => {
    if (isOpen) {
      setAmount(String(initialAmount || ""));
      setReason(initialReason || "");
      setDate(resolveDateStr(initialDate));
      setBranchId(initialBranchId);
    }
  }, [isOpen, initialAmount, initialReason, initialDate, initialBranchId]);

  if (!isOpen) return null;

  const isMissing = type === "MISSING";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error(isMissing ? t("amountLabel") : t("surplusAmountLabel"));
      return;
    }

    startTransition(async () => {
      try {
        const payload = {
          amount: numAmount,
          reason: reason.trim(),
          date,
          ...(branchId ? { branchId } : {}),
        };
        const res = isMissing
          ? await updateMissingMoneyAction(id, payload)
          : await updateSurplusMoneyAction(id, payload);

        if (res.success) {
          toast.success(res.message);
          onClose();
          router.refresh();
        } else {
          toast.error(res.message);
        }
      } catch (err: any) {
        toast.error(err?.message || "Erreur inattendue");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 text-start animate-in fade-in duration-150">
      <div className="bg-surface rounded-2xl shadow-xl border border-border/80 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
        <div
          className={`flex items-center justify-between p-5 border-b border-border/80 ${
            isMissing ? "bg-danger-light/20" : "bg-success-light/20"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg ${
                isMissing ? "bg-danger-soft text-danger" : "bg-success-light text-success-text"
              }`}
            >
              {isMissing ? <AlertCircle className="w-5 h-5" /> : <Coins className="w-5 h-5 text-success" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5" />
                {isMissing
                  ? isAr
                    ? "تعديل عجز الصندوق (Manque)"
                    : "Modifier un Manque"
                  : isAr
                    ? "تعديل فائض الصندوق (Surplus)"
                    : "Modifier un Surplus"}
              </h3>
              <p className="text-xs text-muted font-medium">#{id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !isPending && onClose()}
            disabled={isPending}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-surface-subtle transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {branches && branches.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {isAr ? "الفرع" : "Branche"}
              </label>
              <select
                value={branchId ?? branches[0].id}
                onChange={(e) => setBranchId(Number(e.target.value))}
                disabled={isPending}
                className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-xl outline-hidden transition-all"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {t("dateLabel")}
            </label>
            <input
              type="date"
              required
              value={date}
              max={getAlgiersTodayDateString()}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-xl font-mono outline-hidden transition-all cursor-pointer"
              disabled={isPending}
            />
            <p className="text-[11px] text-muted mt-1">{t("dateHelper")}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {isMissing ? t("amountLabel") : t("surplusAmountLabel")}
            </label>
            <div className="relative flex items-center">
              <input
                type="number"
                step="any"
                min="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("amountPlaceholder")}
                className="w-full ps-3.5 pe-16 py-2.5 text-sm bg-surface border border-border rounded-xl font-mono outline-hidden transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                disabled={isPending}
                autoFocus
              />
              <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none">
                <span className="px-2.5 py-1 text-xs font-bold font-mono text-gray-500 bg-surface-muted border border-border/80 rounded-md">
                  DZD
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {isMissing ? t("reasonLabel") : t("surplusReasonLabel")}
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isMissing ? t("reasonPlaceholder") : t("surplusReasonPlaceholder")}
              className="w-full px-3.5 py-2 text-sm bg-surface border border-border rounded-xl outline-hidden resize-none transition-all"
              disabled={isPending}
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/80">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => !isPending && onClose()}
              disabled={isPending}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              variant={isMissing ? "danger" : "primary"}
              size="sm"
              isLoading={isPending}
              className={isMissing ? "" : "bg-success hover:bg-success/90"}
            >
              {isAr ? "حفظ التعديلات" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
