"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { workshopPaymentSchema, WorkshopPaymentSchema } from "@/lib/formValidationSchemas";
import { useFormState } from "react-dom";
import { addWorkshopPayment, updateWorkshopPayment } from "@/lib/actions";
import { useEffect } from "react";
import { toast } from "react-toastify";
import { Workshop, WorkshopParticipant, WorkshopPayment } from "@prisma/client";
import PrintWorkshopTicketButton from "../PrintWorkshopTicketButton"; // Import the new print button

const WorkshopPaymentForm = ({
    participant, // Changed from participantId
    workshop, // Changed from workshopId
    type,
    data,
    setOpen,
    amountOwedByParticipant,
}: {
    participant: WorkshopParticipant;
    workshop: Workshop;
    type: 'create' | 'update';
    data?: WorkshopPayment;
    setOpen: (isOpen: boolean) => void;
    amountOwedByParticipant?: number;
}) => {
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
            amount: data?.amount || 0,
            notes: data?.notes || ""
        }
    });

    const actionToRun = type === 'create' ? addWorkshopPayment : updateWorkshopPayment;
    const [state, formAction] = useFormState(actionToRun, { success: false, error: false, message: "" });

    useEffect(() => {
        if (state?.success) {
            toast.success(state.message);
            setOpen(false);
        }
        if (state?.error) {
            toast.error(state.message);
        }
    }, [state, setOpen]);

    const onSubmit = (formData: WorkshopPaymentSchema) => {
        formAction(formData as any);
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 p-4">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold">{type === 'create' ? 'تسجيل دفع جديد' : 'تعديل الدفع'}</h2>
            </div>

            {type === 'update' && <input type="hidden" {...register("id")} />}
            <input type="hidden" {...register("participantId")} />
            <input type="hidden" {...register("workshopId")} />

            <div className="flex flex-col gap-2 w-full">
                <label className="text-xs text-gray-500">المبلغ المدفوع</label>
                <input
                    type="number"
                    step="any"
                    {...register("amount")}
                    className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
                />
                {errors.amount && <p className="text-xs text-red-400">{errors.amount.message}</p>}
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-500">ملاحظات (اختياري)</label>
                <textarea {...register("notes")} rows={3} className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full" placeholder="مثال: تم الدفع نقدًا" />
            </div>
            <button type="submit" className="text-xl font-semibold bg-blue-500 text-white p-2 rounded-md hover:bg-blue-600 transition-colors">
                {type === 'create' ? 'حفظ الدفع' : 'تعديل الدفع'}
            </button>
        </form>
    );
};

export default WorkshopPaymentForm;
