"use client";

import { useFormStatus } from "react-dom";
import { useTranslations, useLocale } from "next-intl";
import { useActionState } from "react";
import { useEffect, useRef, useState } from "react";
import { RefundSchema, refundSchema } from "@/lib/formValidationSchemas";
import { createRefund } from "@/lib/actions";
import Image from "next/image";
import { Button } from "@/components/ui/Button";

// Helper component for the form submission button
const SubmitButton = () => {
  const { pending } = useFormStatus();
  const t = useTranslations("payments");
  return (
    <Button
      type="submit"
      variant="danger"
      size="lg"
      disabled={pending}
      className="w-full"
    >
      {pending ? t("processingRefund") : t("confirmRefundBtn")}
    </Button>
  );
};

export type PaymentData = {
  id: number;
  amount: number;
  refunds: { amount: number }[];
  paymentType?: string;
  voucherId?: number;
};

const RefundForm = ({ payment }: { payment: PaymentData }) => {
  const t = useTranslations("payments");
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const modalRef = useRef<HTMLDialogElement>(null);

  const initialState = { success: false, error: false, message: "" };

  const [state, formAction] = useActionState(async (prevState: any, formData: FormData) => {
    const rawVoucherId = formData.get("voucherId") || formData.get("paymentId") || payment.voucherId || payment.id;
    const dataToValidate = {
      voucherId: Number(rawVoucherId),
      amount: Number(formData.get("amount")),
      reason: (formData.get("reason") || formData.get("notes") || "") as string,
    };

    const validatedFields = refundSchema.safeParse(dataToValidate);

    if (!validatedFields.success) {
      const errorMessage = validatedFields.error.issues.map((issue) => issue.message).join(", ");
      return {
        success: false,
        error: true,
        message: errorMessage,
      };
    }

    return createRefund(prevState, validatedFields.data);
  }, initialState);

  const totalRefunded = payment.refunds.reduce((sum, r) => sum + r.amount, 0);
  const remainingBalance = payment.amount - totalRefunded;

  useEffect(() => {
    if (state.success) {
      setIsOpen(false);
    }
  }, [state]);

  useEffect(() => {
    if (isOpen) {
      modalRef.current?.showModal();
      document.body.style.overflow = "hidden";
    } else {
      modalRef.current?.close();
      document.body.style.overflow = "auto";
    }
  }, [isOpen]);

  if (payment.paymentType === "INSCRIPTION") {
    return null;
  }

  if (remainingBalance <= 0) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        disabled
        className="opacity-40 cursor-not-allowed"
        title={t("fullyRefunded")}
      >
        <Image src="/delete.png" alt="Refund" width={16} height={16} className="opacity-50" />
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="soft-danger"
        size="icon-sm"
        onClick={() => setIsOpen(true)}
        title={t("refundModalTitle")}
      >
        <Image src="/delete.png" alt="Refund" width={16} height={16} />
      </Button>

      {isOpen && (
        <dialog
          ref={modalRef}
          onClose={() => setIsOpen(false)}
          className="p-0 rounded-xl border border-border shadow-xl w-full max-w-md backdrop:bg-black/50"
        >
          <div className="p-6 font-sans bg-surface">
            <div className="flex justify-between items-center mb-4 border-b border-border pb-2">
              <h2 className="text-section-title font-bold text-gray-900">{t("refundModalTitle")}</h2>
              <button onClick={() => setIsOpen(false)} className="p-1 rounded-full hover:bg-gray-200">
                <Image src="/close.png" alt="Close" width={18} height={18} />
              </button>
            </div>

            <div className="text-xs bg-blue-50 border border-blue-200 p-3 rounded-md mb-4 space-y-1">
              <div className="flex justify-between">
                <span>{t("originalAmount")}</span>
                <span className="font-bold">{payment.amount.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>{t("previouslyRefunded")}</span>
                <span className="font-bold">{totalRefunded.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD</span>
              </div>
              <div className="flex justify-between text-green-700 font-bold">
                <span>{t("availableForRefund")}</span>
                <span>{remainingBalance.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD</span>
              </div>
            </div>

            <form action={formAction}>
              <input type="hidden" name="voucherId" value={payment.voucherId || payment.id} />

              <div className="mb-4">
                <label htmlFor="amount" className="block text-xs font-bold text-gray-700 mb-1">
                  {t("refundAmountLabel")} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="amount"
                  name="amount"
                  step="100"
                  min="1"
                  max={remainingBalance}
                  defaultValue={remainingBalance}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-red-500 text-xs font-mono"
                  placeholder={t("maxRefundPlaceholder", { max: remainingBalance.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ") })}
                />
              </div>

              <div className="mb-5">
                <label htmlFor="reason" className="block text-xs font-bold text-gray-700 mb-1">
                  {t("refundReasonLabel")} <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="reason"
                  name="reason"
                  rows={3}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-red-500 text-xs"
                  placeholder={t("refundReasonPlaceholder")}
                ></textarea>
              </div>

              {state.error && (
                <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-md mb-4 border border-red-200">
                  {state.message}
                </p>
              )}

              <SubmitButton />
            </form>
          </div>
        </dialog>
      )}
    </>
  );
};

export default RefundForm;
