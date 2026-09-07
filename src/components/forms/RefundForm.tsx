"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { RefundSchema, refundSchema } from "@/lib/formValidationSchemas";
import { createRefund } from "@/lib/actions";
import Image from "next/image";

// Helper component for the form submission button
const SubmitButton = () => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xl font-semibold w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-red-400 disabled:cursor-not-allowed"
    >
      {pending ? "قيد المعالجة..." : "استرداد المبلغ"}
    </button>
  );
};

type PaymentData = {
    id: number;
    amount: number;
    refunds: { amount: number }[];
    paymentType: 'class' | 'workshop';
};

const RefundForm = ({ payment }: { payment: PaymentData }) => {
  const [isOpen, setIsOpen] = useState(false);
  const modalRef = useRef<HTMLDialogElement>(null);

  const initialState = { success: false, error: false, message: "" };
  
  // MODIFIED: Wrapped the server action to handle FormData parsing and validation
  const [state, formAction] = useFormState(async (prevState: any, formData: FormData) => {
    const dataToValidate = {
        amount: Number(formData.get('amount')),
        notes: formData.get('notes') as string,
        paymentId: formData.get('paymentId') ? Number(formData.get('paymentId')) : undefined,
        workshopPaymentId: formData.get('workshopPaymentId') ? Number(formData.get('workshopPaymentId')) : undefined,
    };

    const validatedFields = refundSchema.safeParse(dataToValidate);

    if (!validatedFields.success) {
        const errorMessage = validatedFields.error.issues.map(issue => issue.message).join(', ');
        return {
            success: false,
            error: true,
            message: errorMessage,
        }
    }
    
    // Call the original server action with the validated data
    return createRefund(prevState, validatedFields.data);

  }, initialState);

  const totalRefunded = payment.refunds.reduce((sum, r) => sum + r.amount, 0);
  const remainingBalance = payment.amount - totalRefunded;

  useEffect(() => {
    if (state.success) {
      setIsOpen(false); // Close modal on successful submission
    }
  }, [state]);

  useEffect(() => {
    if (isOpen) {
      modalRef.current?.showModal();
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    } else {
      modalRef.current?.close();
      document.body.style.overflow = 'auto';
    }
  }, [isOpen]);

  // Don't render the refund button if the payment is fully refunded
  if (remainingBalance <= 0) {
    return (
        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-300 cursor-not-allowed" disabled title="Fully Refunded">
            <Image src="/delete.png" alt="Refund" width={16} height={16} className="opacity-50" />
        </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-red-100 hover:bg-red-200"
        title="Refund Payment"
      >
        <Image src="/delete.png" alt="Refund" width={16} height={16} />
      </button>

      {isOpen && (
        <dialog
          ref={modalRef}
          onClose={() => setIsOpen(false)}
          className="p-0 rounded-lg shadow-xl w-full max-w-md backdrop:bg-black backdrop:opacity-50"
        >
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">استرداد المبلغ</h2>
              <button onClick={() => setIsOpen(false)} className="p-1 rounded-full hover:bg-gray-200">
                <Image src="/close.png" alt="Close" width={20} height={20} />
              </button>
            </div>

            <div className="text-sm bg-blue-50 border border-blue-200 p-3 rounded-md mb-4">
                <p>المبلغ الاصلي: <span className="font-bold">{payment.amount.toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' })}</span></p>
                <p>المبلغ المسترجع: <span className="font-bold text-red-600">{totalRefunded.toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' })}</span></p>
                <p>الرصيد المتبقي: <span className="font-bold text-green-600">{remainingBalance.toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' })}</span></p>
            </div>

            <form action={formAction}>
              {/* Hidden inputs to pass payment IDs */}
              {payment.paymentType === 'class' ? (
                <input type="hidden" name="paymentId" value={payment.id} />
              ) : (
                <input type="hidden" name="workshopPaymentId" value={payment.id} />
              )}

              <div className="mb-4">
                <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
                  مبلغ الاسترجاع
                </label>
                <input
                  type="number"
                  id="amount"
                  name="amount"
                  step="10"
                  max={remainingBalance}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder={`الحد الأقصى: DA ${remainingBalance.toFixed(2)}`}
                />
              </div>

              <div className="mb-6">
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                  سبب الاسترداد (اختياري)
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="مثال: انسحاب الطالب"
                ></textarea>
              </div>

              {state.error && (
                <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md mb-4">
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
