"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { workshopPaymentSchema, WorkshopPaymentSchema } from "@/lib/formValidationSchemas";
import { addWorkshopPayment, updateWorkshopPayment } from "@/lib/actions";
import { useActionState, useEffect, useState, startTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "react-toastify";
import { Workshop, WorkshopParticipant } from "@prisma/client";
import PrintWorkshopTicketButton from "../PrintWorkshopTicketButton";
import { Button } from "@/components/ui/Button";
import { formatVoucherDisplay } from "@/lib/voucherUtils";
import { formatDZD } from "@/lib/algiersDate";
import { CheckCircle2 } from "lucide-react";

const WorkshopPaymentForm = ({
  participant,
  workshop,
  type,
  data,
  setOpen,
  amountOwedByParticipant,
  onSuccess,
}: {
  participant:
    | (WorkshopParticipant & { Student?: { name: string; phone: string | null } | null; name?: string })
    | any;
  workshop: Workshop | any;
  type: "create" | "update";
  data?: any;
  setOpen: (isOpen: boolean) => void;
  amountOwedByParticipant?: number;
  onSuccess?: () => void;
}) => {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("workshops");
  const tCommon = useTranslations("common");

  const workshopPrice = Number(workshop.totalPrice ?? workshop.price ?? 0);
  const netAlreadyPaid = Math.max(
    0,
    Number(participant.totalPaid || 0) - Number(participant.totalRefunded || 0)
  );
  const computedOwed =
    amountOwedByParticipant !== undefined
      ? amountOwedByParticipant
      : Math.max(0, workshopPrice - netAlreadyPaid);

  const defaultAmount =
    data?.amount !== undefined
      ? Number(data.amount)
      : computedOwed > 0
      ? computedOwed
      : 0;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<WorkshopPaymentSchema>({
    resolver: zodResolver(workshopPaymentSchema),
    defaultValues: {
      id: data?.id,
      participantId: participant.id,
      workshopId: workshop.id,
      amount: defaultAmount,
      notes: data?.notes || "",
    },
  });

  const watchedAmount = Number(watch("amount") || 0);
  const [issuedVoucher, setIssuedVoucher] = useState<any>(null);

  const actionToRun = type === "create" ? addWorkshopPayment : updateWorkshopPayment;
  const [state, formAction, isPending] = useActionState(actionToRun as any, {
    success: false,
    error: false,
    message: "",
  } as any);

  useEffect(() => {
    if (state?.success) {
      toast.success(state.message);
      onSuccess?.();
      startTransition(() => {
        router.refresh();
      });
      if (type === "create" && state.voucher) {
        setIssuedVoucher(state.voucher);
      } else {
        setOpen(false);
      }
    }
    if (state?.error && state.message) {
      toast.error(state.message);
    }
  }, [state, setOpen, router, type]);

  const onSubmit = (formData: WorkshopPaymentSchema) => {
    startTransition(() => {
      (formAction as any)(formData);
    });
  };

  const participantName =
    participant.Student?.name || participant.name || `${t("student")} #${participant.id}`;
  const participantPhone = participant.Student?.phone || participant.phone || null;
  const branchName =
    (workshop as any).branch?.name ||
    (workshop as any).Branch?.name ||
    (workshop as any).branchName;

  if (issuedVoucher) {
    const remainingAfterThis =
      issuedVoucher.remainingBalance !== null && issuedVoucher.remainingBalance !== undefined
        ? Number(issuedVoucher.remainingBalance)
        : 0;
    const voucherDisplay = formatVoucherDisplay(
      {
        number: issuedVoucher.number || issuedVoucher.id,
        issuedAt: issuedVoucher.issuedAt || new Date(),
        paymentType: "WORKSHOP",
        isRefund: false,
        issuingBranchId: issuedVoucher.issuingBranchId,
        targetBranchId: issuedVoucher.targetBranchId,
        series: issuedVoucher.series,
      },
      { branchName, isWorkshop: true }
    );

    return (
      <div className="flex flex-col gap-4 p-5 font-sans">
        <div className="flex items-center gap-3 text-emerald-700 bg-emerald-50 p-4 rounded-xl border border-emerald-200">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-gray-900">
              {locale === "ar"
                ? `تم إصدار الوصل #${issuedVoucher.number} بنجاح`
                : `Reçu #${issuedVoucher.number} émis avec succès`}
            </h3>
            <p className="text-xs text-emerald-900 mt-0.5">
              {participantName} • {workshop.title} • {formatDZD(Number(issuedVoucher.amount), locale)}
            </p>
          </div>
        </div>

        <div className="p-3.5 bg-surface-subtle rounded-xl border border-border space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted">{locale === "ar" ? "المبلغ المسدد:" : "Montant réglé :"}</span>
            <span className="font-bold font-mono text-success-text">
              {formatDZD(Number(issuedVoucher.amount), locale)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">{locale === "ar" ? "المتبقي بعد الدفع:" : "Reste à payer :"}</span>
            <span className={`font-bold font-mono ${remainingAfterThis > 0 ? "text-amber-700" : "text-emerald-700"}`}>
              {remainingAfterThis > 0
                ? formatDZD(remainingAfterThis, locale)
                : locale === "ar"
                ? "0 دج (خالص بالكامل)"
                : "0 DZD (Soldé)"}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => setOpen(false)}
            className="flex-1"
          >
            {locale === "ar" ? "إغلاق" : "Fermer"}
          </Button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-surface-subtle">
            <span className="text-xs font-semibold text-gray-700">{t("print")}:</span>
            <PrintWorkshopTicketButton
              payment={{
                id: issuedVoucher.number || issuedVoucher.id,
                number: issuedVoucher.number || issuedVoucher.id,
                voucherDisplay,
                amount: Number(issuedVoucher.amount),
                date: issuedVoucher.issuedAt || new Date(),
                isVoided: false,
                isPartial: Boolean(issuedVoucher.isPartial),
                isRefund: false,
                status: "ACTIVE",
                remainingBalance: remainingAfterThis,
                paymentType: "WORKSHOP",
                participant: {
                  name: participantName,
                  phone: participantPhone,
                  chairNumber: participant.chairNumber,
                  gender: participant.gender,
                },
                workshop: {
                  title: workshop.title,
                  totalPrice: workshopPrice,
                  branchName,
                },
              }}
              amountOwedByParticipant={remainingAfterThis}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 p-5 font-sans">
      <div className="flex justify-between items-center border-b border-border pb-3">
        <div>
          <h2 className="text-section-title font-bold text-gray-900">
            {type === "create" ? t("paymentFormCreate") : t("paymentFormUpdate")}
          </h2>
          <p className="text-xs text-muted mt-0.5">
            <span className="font-bold text-gray-800">{participantName}</span> •{" "}
            <span className="text-primary font-semibold">{workshop.title}</span>
          </p>
        </div>
        {type === "update" && data && (
          <PrintWorkshopTicketButton
            payment={{
              ...data,
              voucherDisplay:
                data.voucherDisplay ||
                formatVoucherDisplay(
                  {
                    number: data.number || data.id,
                    issuedAt: data.date || new Date(),
                    paymentType: data.paymentType || "WORKSHOP",
                    isRefund: data.isRefund,
                    refundForVoucherId: data.refundForVoucherId,
                    issuingBranchId: data.issuingBranchId,
                    targetBranchId: data.targetBranchId,
                    series: data.series,
                  },
                  { branchName, isWorkshop: true }
                ),
              participant: {
                name: participantName,
                phone: participantPhone,
                chairNumber: participant.chairNumber,
                gender: participant.gender,
              },
              workshop: { title: workshop.title, totalPrice: workshopPrice, branchName },
            }}
            amountOwedByParticipant={computedOwed}
          />
        )}
      </div>

      {type === "create" && (
        <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-600">{locale === "ar" ? "سعر الدورة:" : "Prix de l'atelier :"}</span>
            <span className="font-mono font-semibold text-gray-900">{formatDZD(workshopPrice, locale)}</span>
          </div>
          {netAlreadyPaid > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">{locale === "ar" ? "المدفوع سابقاً:" : "Déjà payé :"}</span>
              <span className="font-mono font-semibold text-emerald-700">{formatDZD(netAlreadyPaid, locale)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 border-t border-amber-200/80 font-bold text-amber-900">
            <span>{locale === "ar" ? "المبلغ المتبقي:" : "Reste à payer :"}</span>
            <span className="font-mono">{formatDZD(computedOwed, locale)}</span>
          </div>
        </div>
      )}

      {type === "update" && <input type="hidden" {...register("id")} />}
      <input type="hidden" {...register("participantId")} />
      <input type="hidden" {...register("workshopId")} />

      <div className="flex flex-col gap-1.5 w-full">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-700">{t("paidAmountLabel")}</label>
          {type === "create" && computedOwed > 0 && watchedAmount !== computedOwed && (
            <button
              type="button"
              onClick={() => setValue("amount", computedOwed, { shouldValidate: true })}
              className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
            >
              {locale === "ar"
                ? `تحديد كامل المتبقي (${formatDZD(computedOwed, "ar")})`
                : `Tout régler (${formatDZD(computedOwed, "fr")})`}
            </button>
          )}
        </div>
        <input
          type="number"
          min="1"
          max={type === "create" && computedOwed > 0 ? computedOwed : undefined}
          step="any"
          {...register("amount")}
          className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm font-mono font-bold w-full h-[42px]"
        />
        {errors.amount && <p className="text-xs text-red-400">{errors.amount.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-700">{t("notesLabel")}</label>
        <textarea
          {...register("notes")}
          rows={2}
          className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
          placeholder={t("notesPlaceholder")}
        />
      </div>
      <Button type="submit" variant="primary" size="lg" disabled={isPending} className="w-full">
        {isPending ? t("saving") : type === "create" ? t("savePayment") : tCommon("update")}
      </Button>
    </form>
  );
};

export default WorkshopPaymentForm;
