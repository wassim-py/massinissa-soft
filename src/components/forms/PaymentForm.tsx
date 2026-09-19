"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { voucherSchema, VoucherSchema } from "@/lib/formValidationSchemas";
import { issueVoucher, editVoucher } from "@/lib/actions";
import { useActionState, useEffect, startTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "react-toastify";
import { Voucher, Student, Class } from "@prisma/client";
import PrintTicketButton from "../PrintTicketButton";
import { Button } from "@/components/ui/Button";
import { formatVoucherDisplay } from "@/lib/voucherUtils";
import { computeStudentSessionFee } from "@/lib/studentBilling";
import { useLocale } from "next-intl";

interface ExtendedStudent extends Student {
  family?: { payerStudentId: string | null } | null;
  enrollments?: Array<{ classId: number; payerStatus?: string }>;
}

const PaymentForm = ({
  student,
  classData,
  type,
  data,
  setOpen,
  sessionsForThisPayment,
  amountOwedByStudent,
}: {
  student: ExtendedStudent;
  classData: Class;
  type: "create" | "update";
  data?: Voucher;
  setOpen: (isOpen: boolean) => void;
  sessionsForThisPayment?: number;
  amountOwedByStudent?: number;
}) => {
  const router = useRouter();
  const t = useTranslations("payments");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const PAYMENT_TYPES = [
    { value: "TUITION_4SESSION", label: t("typeTuition4Session") },
    { value: "INSCRIPTION", label: t("typeInscription") },
    { value: "BOOK", label: t("typeBook") },
  ] as const;

  const isSiblingWaived = Boolean(
    student.family && student.family.payerStudentId && student.family.payerStudentId !== student.id
  );

  const teacherPercentage = (classData as any)?.teacher?.TeacherPayRate?.[0]?.percentageOfSessionFee
    ? Number((classData as any).teacher.TeacherPayRate[0].percentageOfSessionFee)
    : null;

  const enrollment = (student.enrollments as any[])?.find((e) => e.classId === classData.id);
  const currentPayerStatus = enrollment?.payerStatus || (student as any).payerStatus || "NORMAL";

  const feeCalc = computeStudentSessionFee({
    payerStatus: currentPayerStatus,
    pricePerCycle: Number(classData.pricePerCycle || 0),
    teacherPercentage,
    isSiblingWaived,
  });

  const defaultPaymentType = (data?.paymentType as any) || "TUITION_4SESSION";

  const getDefaultAmount = (ptype: string) => {
    if (data?.amount) return Number(data.amount);
    if (ptype === "TUITION_4SESSION") {
      return feeCalc.studentCycleFee;
    }
    if (ptype === "INSCRIPTION") {
      return Number(classData.inscriptionFee || 0);
    }
    if (ptype === "BOOK") {
      return Number(classData.bookFee || 0);
    }
    return 0;
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<VoucherSchema>({
    resolver: zodResolver(voucherSchema) as any,
    defaultValues: {
      id: data?.id,
      studentId: student.id,
      classId: classData.id,
      paymentType: defaultPaymentType,
      amount: getDefaultAmount(defaultPaymentType),
      isPartial: data?.isPartial ?? false,
      completesVoucherId: data?.completesVoucherId ?? null,
      remainingBalance: data?.remainingBalance ? Number(data.remainingBalance) : null,
      feeOverriddenByOwner: false,
      feeOverrideNote: "",
    },
  });

  const selectedPaymentType = watch("paymentType");

  const handleTypeChange = (newType: typeof PAYMENT_TYPES[number]["value"]) => {
    setValue("paymentType", newType);
    setValue("amount", getDefaultAmount(newType));
  };

  const actionToRun = async (prevState: any, formData: any) => {
    if (type === "create") {
      return await issueVoucher(prevState, formData);
    } else {
      if (!data) return { success: false, error: true, message: "Error" };
      return await editVoucher(prevState, {
        voucherId: data.id,
        fieldName: "amount",
        newValue: String(formData.amount),
        amount: formData.amount,
        paymentType: formData.paymentType,
        reason: formData.notes || "Edited via UI",
      });
    }
  };

  const [state, formAction, isPending] = useActionState(actionToRun, {
    success: false,
    error: false,
    message: "",
  });

  useEffect(() => {
    if (state?.success) {
      toast.success(state.message);
      setOpen(false);
      startTransition(() => {
        router.refresh();
      });
    }
    if (state?.error) {
      toast.error(state.message);
    }
  }, [state, setOpen, router]);

  const onSubmit = (formData: VoucherSchema) => {
    startTransition(() => {
      formAction(formData as any);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 p-5 font-sans">
      <div className="flex justify-between items-center border-b border-border pb-3">
        <h2 className="text-section-title font-bold text-gray-900">
          {type === "create"
            ? t("issueVoucherModalTitle")
            : `${t("editVoucherModalTitle")} ${formatVoucherDisplay(data, {
                branchName: (classData as any)?.branch?.name || (classData as any)?.branchName,
                levelName: (classData as any)?.level?.name,
              })}`}
        </h2>
        {type === "update" && data && (
          <PrintTicketButton
            voucher={{ ...data, student, class: classData }}
            sessionsForThisPayment={sessionsForThisPayment}
            amountOwedByStudent={amountOwedByStudent}
          />
        )}
      </div>

      <input type="hidden" {...register("studentId")} />
      <input type="hidden" {...register("classId")} />

      {/* Sibling Waiver Alert */}
      {isSiblingWaived && selectedPaymentType === "TUITION_4SESSION" && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 leading-relaxed">
          <p className="font-bold">{t("siblingDiscountAlertTitle")}</p>
          {t("siblingDiscountAlertBody")}
        </div>
      )}

      {/* Payer Status Alerts (§7.18) */}
      {!isSiblingWaived && selectedPaymentType === "TUITION_4SESSION" && currentPayerStatus === "NON_PAYER" && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-900 leading-relaxed">
          <p className="font-bold">
            {locale === "ar"
              ? "حالة التلميذ في هذا الفوج: معفى من الدفع (Non-payer)"
              : "Régime du groupe : Non-payeur (exonéré)"}
          </p>
          <p className="mt-0.5">
            {locale === "ar"
              ? "يتم إصدار وصل الاشتراك بمبلغ 0 دج ليتمكن التلميذ من استهلاك الرصيد وحساب الحضور كالمعتاد. الأستاذ لا يتقاضى مقابلاً عن حصص هذا التلميذ."
              : "Le bon de cotisation 4 séances est émis à 0 DZD. Les séances consomment le crédit et figurent dans les présences. L'enseignant n'est pas rémunéré pour cet élève."}
          </p>
        </div>
      )}

      {!isSiblingWaived && selectedPaymentType === "TUITION_4SESSION" && currentPayerStatus === "SCHOOL_FEES_ONLY" && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-950 leading-relaxed">
          <p className="font-bold">
            {locale === "ar"
              ? `مستحقات المدرسة فقط (${feeCalc.schoolPercentage}%):`
              : `Frais d'école uniquement (${feeCalc.schoolPercentage}%) :`}
          </p>
          <p className="mt-0.5">
            {locale === "ar"
              ? `يدفع التلميذ حصة المؤسسة فقط (${feeCalc.studentCycleFee.toLocaleString()} دج لـ 4 حصص) بعد إسقاط حصة الأستاذ (${feeCalc.teacherPercentage}%). الأستاذ لا يتقاضى أجراً عن هذا التلميذ.`
              : `L'élève est facturé uniquement de la part école (${feeCalc.studentCycleFee.toLocaleString()} DZD pour 4 séances), la part enseignant (${feeCalc.teacherPercentage}%) étant déduite. L'enseignant n'est pas rémunéré pour cet élève.`}
          </p>
        </div>
      )}

      {/* Payment Type Selection */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-700">{t("paymentTypeLabel")}</label>
        <select
          value={selectedPaymentType}
          onChange={(e) => handleTypeChange(e.target.value as any)}
          className="border border-gray-300 p-2 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          {PAYMENT_TYPES.map((pt) => {
            if (pt.value === "BOOK" && !classData.hasBooks) return null;
            return (
              <option key={pt.value} value={pt.value}>
                {pt.label}
              </option>
            );
          })}
        </select>
        {errors.paymentType && (
          <p className="text-xs text-red-500">{errors.paymentType.message}</p>
        )}
      </div>

      {/* Amount Input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-700">{t("amountDZD")}</label>
        <input
          type="number"
          step="any"
          {...register("amount", { valueAsNumber: true })}
          className="border border-gray-300 p-2 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
        />
        {errors.amount && (
          <p className="text-xs text-red-500">{errors.amount.message}</p>
        )}
      </div>

      {/* Inscription Fee Owner Override */}
      {selectedPaymentType === "INSCRIPTION" && (
        <div className="p-3 bg-gray-50 border rounded-md flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-gray-800">
            <input
              type="checkbox"
              {...register("feeOverriddenByOwner")}
              className="w-4 h-4 text-blue-600 rounded"
            />
            {t("ownerOverrideTitle")}
          </label>
          <input
            type="text"
            placeholder={t("ownerOverridePlaceholder")}
            {...register("feeOverrideNote")}
            className="border border-gray-300 p-1.5 rounded text-xs w-full"
          />
        </div>
      )}

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-700">{t("notesOptional")}</label>
        <input
          type="text"
          placeholder={t("notesPlaceholderGeneral")}
          {...register("notes")}
          className="border border-gray-300 p-2 rounded-md text-sm"
        />
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={isPending}
        className="w-full"
      >
        {type === "create" ? t("confirmIssueVoucherBtn") : t("saveChangesBtn")}
      </Button>
    </form>
  );
};

export default PaymentForm;