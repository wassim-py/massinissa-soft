"use client";

import { useState } from "react";
import { recordFormationLumpSumPayment } from "@/lib/formationActions";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField, Input } from "@/components/ui/FormField";
import { useTranslations, useLocale } from "next-intl";
import { X, Receipt, BookOpen, CreditCard, CheckCircle2, AlertCircle } from "lucide-react";

export default function FormationPaymentModal({
  isOpen,
  onClose,
  student,
  formationClass,
  formationLevel,
  totalPaid = 0,
  amountOwed = 0,
  isRetake = false,
  previousVouchers = [],
  onPaymentSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  student: { id: string; name: string; phone?: string | null };
  formationClass: {
    id: number;
    name: string;
    hasBooks: boolean;
    bookFee?: number | any;
  };
  formationLevel: {
    id: number;
    name: string;
    lumpSumPrice: number | any;
  };
  totalPaid?: number;
  amountOwed?: number;
  isRetake?: boolean;
  previousVouchers?: any[];
  onPaymentSuccess?: () => void;
}) {
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const levelPrice = Number(formationLevel?.lumpSumPrice || 0);
  const classBookFee = formationClass.hasBooks ? Number(formationClass.bookFee || 0) : 0;
  const isBookPaid = previousVouchers.some(
    (v) => v.paymentType === "BOOK" && !v.isVoided
  );
  const canPayBook = formationClass.hasBooks && classBookFee > 0 && !isBookPaid;

  const tuitionOwed = isRetake
    ? levelPrice
    : amountOwed > 0
    ? amountOwed
    : Math.max(0, levelPrice - totalPaid);

  // Partial voucher detection: look for a voucher with isPartial and remainingBalance > 0
  const activePartialVoucher = previousVouchers.find(
    (v) => v.isPartial && Number(v.remainingBalance || 0) > 0 && !v.isVoided
  );

  const [paymentMode, setPaymentMode] = useState<"FULL" | "PARTIAL">("FULL");
  const [tuitionAmount, setTuitionAmount] = useState<number>(tuitionOwed);
  const [includeBookFee, setIncludeBookFee] = useState<boolean>(
    tuitionOwed === 0 && canPayBook
  );
  const [notes, setNotes] = useState(
    isRetake
      ? locale === "ar"
        ? "إعادة المستوى بعد الرسوب في اختبار المستوى"
        : "Reprise de niveau après échec au test"
      : ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const currentRemaining = Math.max(0, tuitionOwed - (Number(tuitionAmount) || 0));
  const currentTotalPayment =
    (paymentMode === "FULL" ? tuitionOwed : Number(tuitionAmount) || 0) +
    (includeBookFee ? classBookFee : 0);

  const handleModeChange = (mode: "FULL" | "PARTIAL") => {
    setPaymentMode(mode);
    if (mode === "FULL") {
      setTuitionAmount(tuitionOwed);
    } else {
      setTuitionAmount(Math.min(tuitionOwed, Math.round(tuitionOwed / 2)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payAmount = paymentMode === "FULL" ? tuitionOwed : Number(tuitionAmount) || 0;
    const bookFeeToPay = includeBookFee ? classBookFee : 0;

    if (payAmount <= 0 && bookFeeToPay <= 0) {
      toast.error(
        locale === "ar"
          ? "يرجى تحديد مبلغ دفع صالح أو تضمين رسوم الكتب."
          : "Veuillez spécifier un montant de paiement valide ou inclure les frais de livres."
      );
      return;
    }

    if (payAmount > tuitionOwed) {
      toast.error(
        locale === "ar"
          ? `المبلغ المدفوع للتكوين يتجاوز المطلوب (${tuitionOwed.toLocaleString()} د.ج).`
          : `Le montant payé pour la formation dépasse le montant requis (${tuitionOwed.toLocaleString()} DZD).`
      );
      return;
    }

    const isPartial = paymentMode === "PARTIAL" && currentRemaining > 0;

    setIsSubmitting(true);
    try {
      const res = await recordFormationLumpSumPayment({
        studentId: student.id,
        classId: formationClass.id,
        amount: payAmount,
        bookFeeAmount: bookFeeToPay > 0 ? bookFeeToPay : undefined,
        isPartial,
        remainingBalance: isPartial ? currentRemaining : 0,
        completesVoucherId: activePartialVoucher?.id || undefined,
        notes: notes.trim() || undefined,
        isRetake: !!isRetake,
      });

      if (res.success) {
        toast.success(res.message);
        if (onPaymentSuccess) onPaymentSuccess();
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(
        err?.message ||
          (locale === "ar"
            ? "حدث خطأ أثناء تسجيل الدفع."
            : "Une erreur est survenue lors de l'enregistrement du paiement.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-border animate-in fade-in zoom-in-95 duration-200 my-8">
        {/* HEADER */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-surface-subtle">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                isRetake
                  ? "bg-amber-100 text-amber-600"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {isRetake ? (
                <AlertCircle className="w-5 h-5" />
              ) : (
                <Receipt className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-section-title font-bold text-gray-900">
                {isRetake ? t("retakePaymentTitle") : t("lumpSumPaymentTitle")}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {t("lumpSumPaymentSubtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-gray-800 transition-colors p-1.5 rounded-lg hover:bg-surface"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-sm font-sans">
          {/* STUDENT & CLASS SUMMARY */}
          <div className="bg-surface-subtle p-4 rounded-xl border border-border space-y-2.5">
            <div className="flex justify-between items-center text-xs text-muted">
              <span>{t("student")}:</span>
              <span className="font-bold text-gray-900 text-sm">
                {student.name}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs text-muted">
              <span>{t("groupAndLevel")}</span>
              <span className="font-semibold text-gray-700">
                {formationClass.name} • {formationLevel.name}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs text-muted">
              <span>{t("fullLevelPrice")}</span>
              <span className="font-bold text-primary font-mono">
                {levelPrice.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
              </span>
            </div>

            {/* Book fee status in summary */}
            {formationClass.hasBooks && (
              <div className="flex justify-between items-center text-xs text-muted">
                <span className="flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5" />
                  {t("bookFeeFieldLabel")}:
                </span>
                {isBookPaid ? (
                  <Badge variant="success" size="sm" withDot>
                    {t("bookFeePaid")} (
                    {classBookFee.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")}{" "}
                    DZD)
                  </Badge>
                ) : (
                  <span className="font-semibold text-purple-700 font-mono">
                    {classBookFee.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")}{" "}
                    DZD
                  </span>
                )}
              </div>
            )}

            {!isRetake && totalPaid > 0 && (
              <div className="flex justify-between items-center text-xs text-muted pt-2 border-t border-border">
                <span>{t("totalPreviouslyPaid")}</span>
                <span className="font-bold text-emerald-600 font-mono">
                  {totalPaid.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                </span>
              </div>
            )}

            <div className="flex justify-between items-center text-xs pt-2 border-t border-border">
              <span className="font-bold text-gray-800">
                {t("amountToSettle")} ({t("tuitionOnly")}):
              </span>
              <span className="text-base font-black text-rose-600 font-mono">
                {tuitionOwed.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
              </span>
            </div>
          </div>

          {/* ACTIVE PARTIAL NOTICE */}
          {activePartialVoucher && !isRetake && (
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                {t("completesPreviousPartial", {
                  number: activePartialVoucher.number || activePartialVoucher.id,
                  balance: Number(activePartialVoucher.remainingBalance || 0).toLocaleString(
                    locale === "ar" ? "ar-DZ" : "fr-DZ"
                  ),
                })}
              </span>
            </div>
          )}

          {/* TUITION PAYMENT SECTION (if tuition owed) */}
          {tuitionOwed > 0 && (
            <div className="space-y-3">
              <label className="block text-form-label text-gray-700 font-semibold select-none">
                {t("paymentMethod")} ({t("tuitionOnly")})
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleModeChange("FULL")}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition text-center cursor-pointer ${
                    paymentMode === "FULL"
                      ? "bg-primary text-white border-primary shadow-xs"
                      : "bg-surface text-gray-700 border-border hover:bg-surface-subtle"
                  }`}
                >
                  {t("fullPaymentOption", {
                    amount: tuitionOwed.toLocaleString(
                      locale === "ar" ? "ar-DZ" : "fr-DZ"
                    ),
                  })}
                </button>

                <button
                  type="button"
                  onClick={() => handleModeChange("PARTIAL")}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition text-center cursor-pointer ${
                    paymentMode === "PARTIAL"
                      ? "bg-primary text-white border-primary shadow-xs"
                      : "bg-surface text-gray-700 border-border hover:bg-surface-subtle"
                  }`}
                >
                  {t("partialPaymentOption")}
                </button>
              </div>

              <FormField label={t("amountPaidNow")} required>
                <Input
                  type="number"
                  min="1"
                  max={tuitionOwed}
                  step="100"
                  value={tuitionAmount}
                  onChange={(e) => setTuitionAmount(Number(e.target.value))}
                  disabled={paymentMode === "FULL"}
                  className="font-mono text-base font-black text-emerald-700"
                  required
                />
              </FormField>

              {paymentMode === "PARTIAL" && (
                <div className="p-3 bg-surface-subtle border border-border rounded-xl flex justify-between items-center text-xs">
                  <span className="font-semibold text-muted">
                    {t("remainingAfterPayment")}
                  </span>
                  <span className="font-black text-rose-600 text-sm font-mono">
                    {currentRemaining.toLocaleString(
                      locale === "ar" ? "ar-DZ" : "fr-DZ"
                    )}{" "}
                    DZD
                  </span>
                </div>
              )}
            </div>
          )}

          {/* BOOK FEE CHECKBOX / FIELD (per §1.2 hasBooks/bookFee pattern) */}
          {canPayBook && (
            <div className="p-4 bg-purple-50/60 border border-purple-200 rounded-xl space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeBookFee}
                  onChange={(e) => setIncludeBookFee(e.target.checked)}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-gray-300"
                />
                <div className="flex-grow">
                  <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-purple-600" />
                    {t("includeBookFeeLabel", {
                      amount: classBookFee.toLocaleString(
                        locale === "ar" ? "ar-DZ" : "fr-DZ"
                      ),
                    })}
                  </span>
                  <p className="text-[11px] text-purple-700 mt-0.5">
                    {locale === "ar"
                      ? "سيتم استخراج وصل منفصل للكتب المدرسية وفقاً للترقيم التسلسلي (§1.2 / §2.11)."
                      : "Un reçu spécifique aux livres sera émis selon la série séquentielle (§1.2 / §2.11)."}
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* TOTAL NOW HIGHLIGHT */}
          <div className="p-3.5 bg-primary/5 border border-primary/20 rounded-xl flex justify-between items-center">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-gray-800">
                {locale === "ar" ? "إجمالي المبلغ للتحصيل الآن:" : "Total à encaisser maintenant :"}
              </span>
            </div>
            <span className="text-lg font-black text-primary font-mono">
              {currentTotalPayment.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
            </span>
          </div>

          {/* NOTES */}
          <FormField label={t("voucherNotes")}>
            <Input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("voucherNotesPlaceholder")}
            />
          </FormField>

          {/* ACTIONS */}
          <div className="pt-4 border-t border-border flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              variant={isRetake ? "danger" : "primary"}
              size="md"
              disabled={isSubmitting || currentTotalPayment <= 0}
              isLoading={isSubmitting}
              leftIcon={<CheckCircle2 className="w-4 h-4" />}
            >
              {isRetake ? t("confirmRetakeVoucher") : t("confirmAndIssueVoucher")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

