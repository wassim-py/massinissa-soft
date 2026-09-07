"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { registerParticipantSchema, RegisterParticipantSchema } from "@/lib/formValidationSchemas";
import { registerParticipant, updateWorkshopParticipant } from "@/lib/actions";

import { useActionState, Dispatch, SetStateAction, useEffect, useState } from "react";
import { toast } from "react-toastify";

type FormSchema = RegisterParticipantSchema & { id?: number };

const WorkshopParticipantForm = ({
  type,
  workshopId,
  data,
  setOpen,
}: {
  type: "create" | "update";
  workshopId: number;
  data?: any;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormSchema>({
    resolver: zodResolver(registerParticipantSchema),
    defaultValues: {
        ...data,
        workshopId: workshopId,
    },
  });

  const actionToRun = type === "create" ? registerParticipant : updateWorkshopParticipant;
  const [state, formAction] = useActionState(actionToRun, { success: false, error: false, message: "" });

  const onSubmit = (formData: FormSchema) => {
    setIsSubmitting(true);
    const payload = {
        ...formData,
        ...(type === 'update' && { id: data.id }),
    };
    formAction(payload as any);
  };

  useEffect(() => {
    if (state.success || state.error) {
      setIsSubmitting(false); // Reset loading state
    }
    if (state?.success) {
      toast.success(state.message);
      setOpen(false);
    }
    if (state?.error) {
      toast.error(state.message);
    }
  }, [state, setOpen]);

  return (
    <form className="flex flex-col gap-8 p-4" onSubmit={handleSubmit(onSubmit)}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "تسجيل تلميذ جديد" : "تحديث التلميذ"}
      </h1>

      <div className="flex flex-col gap-4">
        {type === "update" && <input type="hidden" {...register("id")} />}
        <input type="hidden" {...register("workshopId")} />
        
        {/* CORRECTED: Replaced InputField with standard, styled inputs to ensure full width */}
        <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-500">الاسم الكامل</label>
            <input {...register("name")} className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]" />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-500">البريد الالكتروني</label>
            <input type="email" {...register("email")} className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]" />
            {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-500">رقم الهاتف</label>
            <input {...register("phone")} className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]" />
            {errors.phone && <p className="text-xs text-red-400">{errors.phone.message}</p>}
        </div>

        {type === 'create' && (
            <div className="border-t pt-4 mt-2 space-y-4">
                 <p className="text-sm font-medium text-gray-600">الدفع الاولي (اختياري)</p>
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
                    <label className="text-xs text-gray-500">ملاحظات الدفع</label>
                    <textarea {...register("notes")} rows={2} className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full" placeholder="مثال: تم الدفع نقدًا" />
                </div>
            </div>
        )}
      </div>

      {state?.error && !state.message && <span className="text-red-500">حدث خطأ ما!</span>}
      <button 
        type="submit" 
        disabled={isSubmitting}
        className="text-xl font-semibold bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-md transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (type === 'create' ? "قيد الإنشاء..." : "قيد التحديث...") : (type === 'create' ? "إنشاء" : "تحديث")}
      </button>
    </form>
  );
};

export default WorkshopParticipantForm;
