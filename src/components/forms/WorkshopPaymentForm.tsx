"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { workshopPaymentSchema, WorkshopPaymentSchema } from "@/lib/formValidationSchemas";
import { addWorkshopPayment, updateWorkshopPayment } from "@/lib/actions";
import { useActionState, useEffect, startTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "react-toastify";
import { Workshop, WorkshopParticipant } from "@prisma/client";
import PrintWorkshopTicketButton from "../PrintWorkshopTicketButton";
import { Button } from "@/components/ui/Button";
import { formatVoucherDisplay } from "@/lib/voucherUtils";

const WorkshopPaymentForm = ({
    participant,
    workshop,
    type,
    data,
    setOpen,
    amountOwedByParticipant,
}: {
    participant: WorkshopParticipant & { Student?: { name: string; phone: string | null } | null; name?: string };
    workshop: Workshop;
    type: 'create' | 'update';
    data?: any;
    setOpen: (isOpen: boolean) => void;
    amountOwedByParticipant?: number;
}) => {
    const router = useRouter();
    const defaultAmount =
      data?.amount !== undefined
        ? Number(data.amount)
        : amountOwedByParticipant && amountOwedByParticipant > 0
        ? amountOwedByParticipant
        : 0;

    const {
        register,
        handleSubmit,
        formState: { errors }
    } = useForm<WorkshopPaymentSchema>({
        resolver: zodResolver(workshopPaymentSchema),
        defaultValues: {
            id: data?.id,
            participantId: participant.id,
            workshopId: workshop.id,
            amount: defaultAmount,
            notes: data?.notes || ""
        }
    });

    const actionToRun = type === 'create' ? addWorkshopPayment : updateWorkshopPayment;
    const [state, formAction, isPending] = useActionState(actionToRun, { success: false, error: false, message: "" });

    useEffect(() => {
        if (state?.success) {
            toast.success(state.message);
            setOpen(false);
            startTransition(() => {
              router.refresh();
            });
        }
        if (state?.error && state.message) {
            toast.error(state.message);
        }
    }, [state, setOpen, router]);

    const t = useTranslations("workshops");
    const tCommon = useTranslations("common");

    const onSubmit = (formData: WorkshopPaymentSchema) => {
        startTransition(() => {
            formAction(formData as any);
        });
    };

    const participantName = participant.Student?.name || participant.name || `${t("student")} #${participant.id}`;
    const branchName = (workshop as any).branch?.name || (workshop as any).Branch?.name;

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 p-4 font-sans">
            <div className="flex justify-between items-center">
                <h2 className="text-section-title font-bold text-gray-900">
                    {type === 'create' ? t("paymentFormCreate") : t("paymentFormUpdate")}
                </h2>
                {type === 'update' && data && (
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
                                phone: participant.Student?.phone || null,
                                chairNumber: (participant as any).chairNumber,
                                gender: (participant as any).gender,
                            },
                            workshop: { title: workshop.title, totalPrice: workshop.totalPrice, branchName }
                        }}
                        amountOwedByParticipant={amountOwedByParticipant || 0}
                    />
                )}
            </div>
            
            {type === 'update' && <input type="hidden" {...register("id")} />}
            <input type="hidden" {...register("participantId")} />
            <input type="hidden" {...register("workshopId")} />

            <div className="flex flex-col gap-2 w-full">
                <label className="text-xs text-gray-500">{t("paidAmountLabel")}</label>
                <input
                    type="number"
                    min="0"
                    step="any"
                    {...register("amount")}
                    className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
                />
                {errors.amount && <p className="text-xs text-red-400">{errors.amount.message}</p>}
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-500">{t("notesLabel")}</label>
                <textarea {...register("notes")} rows={3} className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full" placeholder={t("notesPlaceholder")} />
            </div>
            <Button type="submit" variant="primary" size="lg" disabled={isPending} className="w-full">
                {isPending ? t("saving") : type === 'create' ? t("savePayment") : tCommon("update")}
            </Button>
        </form>
    );
};

export default WorkshopPaymentForm;
