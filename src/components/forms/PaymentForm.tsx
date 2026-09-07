"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { paymentSchema, PaymentSchema } from "@/lib/formValidationSchemas";

import { recordPayment, updatePayment } from "@/lib/actions";
import { useActionState, useEffect } from "react";
import { toast } from "react-toastify";
import { Payment, Student, Class } from "@prisma/client";
import PrintTicketButton from "../PrintTicketButton";

const PaymentForm = ({
    student,
    classData,
    type,
    data,
    setOpen,
    // --- NEW ---
    // Accept the calculated values for printing.
    sessionsForThisPayment,
    amountOwedByStudent,
}: {
    student: Student,
    classData: Class,
    type: 'create' | 'update',
    data?: Payment,
    setOpen: (isOpen: boolean) => void,
    sessionsForThisPayment?: number,
    amountOwedByStudent?: number,
}) => {
    const {
        register,
        handleSubmit,
        formState: { errors }
    } = useForm<PaymentSchema>({
        resolver: zodResolver(paymentSchema),
        defaultValues: {
            id: data?.id,
            studentId: student.id,
            classId: classData.id,
            amount: data?.amount || 0,
            notes: data?.notes || ""
        }
    });

    const actionToRun = type === 'create' ? recordPayment : updatePayment;
    const [state, formAction] = useActionState(actionToRun, { success: false, error: false, message: "" });

    useEffect(() => {
        if (state?.success) {
            toast.success(state.message);
            setOpen(false); // Close the modal on success
        }
        if (state?.error) {
            toast.error(state.message);
        }
    }, [state, setOpen]);

    const onSubmit = (formData: PaymentSchema) => {
        formAction(formData as any);
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 p-4">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold">{type === 'create' ? 'تسجيل دفع' : 'تعديل الدفع'}</h2>
                {/* --- UPDATED ---
                  Pass the new props to the print button. It will only render if the props are provided.
                */}
                {type === 'update' && data && sessionsForThisPayment !== undefined && amountOwedByStudent !== undefined && (
                    <PrintTicketButton 
                        payment={{...data, student, class: classData}} 
                        sessionsForThisPayment={sessionsForThisPayment}
                        amountOwedByStudent={amountOwedByStudent}
                    />
                )}
            </div>
            
            {type === 'update' && <input type="hidden" {...register("id")} />}
            <input type="hidden" {...register("studentId")} />
            <input type="hidden" {...register("classId")} />

            <div className="flex flex-col gap-2 w-full">
                <label className="text-xs text-gray-500">المبلغ المدفوع</label>
                <input
                    type="number"
                    step="0.01"
                    {...register("amount")}
                    className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
                />
                {errors.amount && <p className="text-xs text-red-400">{errors.amount.message}</p>}
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-500">ملاحظات (اختياري)</label>
                <textarea {...register("notes")} rows={3} className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full" placeholder="مثال: شيك رقم 123، تحويل بريدي CCP" />
            </div>
            <button type="submit" className="text-xl font-semibold bg-blue-500 text-white p-2 rounded-md hover:bg-blue-600 transition-colors">
                {type === 'create' ? 'حفظ الدفع' : 'تعديل الدفع'}
            </button>
        </form>
    );
};

export default PaymentForm;