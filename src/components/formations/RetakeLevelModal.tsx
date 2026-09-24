"use client";

import { useState } from "react";
import { recordFormationLumpSumPayment } from "@/lib/formationActions";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";
import { useTranslations, useLocale } from "next-intl";
import { X, AlertTriangle } from "lucide-react";

export default function RetakeLevelModal({
  isOpen,
  onClose,
  student,
  formationClass,
  formationLevel,
  onRetakeCompleted,
}: {
  isOpen: boolean;
  onClose: () => void;
  student: { id: string; name: string; phone?: string | null };
  formationClass: { id: number; name: string };
  formationLevel: { id: number; name: string; lumpSumPrice: number | any };
  onRetakeCompleted?: () => void;
}) {
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const levelPrice = Number(formationLevel?.lumpSumPrice || 0);

  const [paymentMode, setPaymentMode] = useState<"FULL" | "PARTIAL">("FULL");
  const [amount, setAmount] = useState<number>(levelPrice);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const currentRemaining = Math.max(0, levelPrice - (Number(amount) || 0));

  const handleModeChange = (mode: "FULL" | "PARTIAL") => {
    setPaymentMode(mode);
    if (mode === "FULL") {
      setAmount(levelPrice);
    } else {
      setAmount(Math.min(levelPrice, Math.round(levelPrice / 2)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payAmount = Number(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      toast.error("Error: Invalid amount");
      return;
    }

    if (payAmount > levelPrice) {
      toast.error(`Error: Amount exceeds level price (${levelPrice.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD).`);
      return;
    }

    const isPartial = paymentMode === "PARTIAL" && currentRemaining > 0;

    setIsSubmitting(true);
    try {
      const res = await recordFormationLumpSumPayment({
        studentId: student.id,
        classId: formationClass.id,
        amount: payAmount,
        isPartial,
        remainingBalance: isPartial ? currentRemaining : 0,
        notes: notes.trim(),
        isRetake: true,
      });

      if (res.success) {
        toast.success(res.message);
        if (onRetakeCompleted) onRetakeCompleted();
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-amber-600 to-rose-700 px-6 py-4 text-white flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">{t("retakeHeading")}</h2>
            <p className="text-xs text-white/80 mt-0.5">
              {t("retakeSub")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-sm font-sans">
          {/* NOTICE ALERT */}
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-900 text-xs leading-relaxed space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-amber-950 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{t("retakeRuleAlert", { level: formationLevel.name, price: levelPrice.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ") })}</span>
            </div>
          </div>

          {/* SUMMARY INFO */}
          <div className="bg-slate-50 p-4 rounded-xl border border-gray-200 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">{t("student")}</span>
              <span className="font-bold text-gray-800 text-sm">{student.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">{t("currentGroup")}</span>
              <span className="font-semibold text-gray-700">{formationClass.name}</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-gray-200">
              <span className="font-bold text-gray-700">{t("retakeFeeRequired")}</span>
              <span className="text-base font-black text-rose-600">
                {levelPrice.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
              </span>
            </div>
          </div>

          {/* MODALITY */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">
              {t("retakePaymentMethod")}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleModeChange("FULL")}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition text-center ${
                  paymentMode === "FULL"
                    ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                    : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                }`}
              >
                {t("fullPaymentOption", { amount: levelPrice.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ") })}
              </button>

              <button
                type="button"
                onClick={() => handleModeChange("PARTIAL")}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition text-center ${
                  paymentMode === "PARTIAL"
                    ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                    : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                }`}
              >
                {t("partialPaymentOption")}
              </button>
            </div>
          </div>

          {/* AMOUNT INPUT */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {t("amountPaidNow")}
            </label>
            <input
              type="number"
              min="1"
              max={levelPrice}
              step="100"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              disabled={paymentMode === "FULL"}
              className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 outline-none text-base font-black text-emerald-700 disabled:bg-gray-100"
              required
            />
          </div>

          {paymentMode === "PARTIAL" && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center text-xs">
              <span className="font-semibold text-gray-600">{t("remainingAfterPayment")}</span>
              <span className="font-black text-rose-600 text-sm">
                {currentRemaining.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
              </span>
            </div>
          )}

          {/* NOTES */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {t("voucherNotes")}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("voucherNotesPlaceholder")}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 outline-none text-xs"
            />
          </div>

          {/* ACTIONS */}
          <div className="pt-3 border-t border-gray-200 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" variant="danger" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t("submittingVoucher") : t("confirmRetakeBtn")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
