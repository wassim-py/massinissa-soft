"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { registerParticipantSchema, RegisterParticipantSchema } from "@/lib/formValidationSchemas";
import { registerParticipant, updateWorkshopParticipant } from "@/lib/actions";

import { useActionState, Dispatch, SetStateAction, useEffect, useState, startTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";

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
        name: data?.Student?.name || data?.name || "",
        phone: data?.Student?.phone || data?.phone || "",
        gender: data?.gender || "MALE",
        workshopId: workshopId,
    },
  });

  const actionToRun = type === "create" ? registerParticipant : updateWorkshopParticipant;
  const [state, formAction, isPending] = useActionState(actionToRun, { success: false, error: false, message: "" });

  const onSubmit = (formData: FormSchema) => {
    setIsSubmitting(true);
    const payload = {
        ...formData,
        ...(type === 'update' && { id: data.id }),
    };
    startTransition(() => {
      formAction(payload as any);
    });
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

  const t = useTranslations("workshops");
  const tCommon = useTranslations("common");

  return (
    <form className="flex flex-col gap-6 p-4 font-sans" onSubmit={handleSubmit(onSubmit)}>
      <h1 className="text-section-title font-bold text-gray-900">
        {type === "create" ? t("participantFormCreate") : t("participantFormUpdate")}
      </h1>

      <div className="flex flex-col gap-4">
        {type === "update" && <input type="hidden" {...register("id")} />}
        <input type="hidden" {...register("workshopId")} />
        
        <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-500">{t("fullNameLabel")}</label>
            <input {...register("name")} className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]" />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-500">{t("genderLabel")}</label>
            <select
              {...register("gender")}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] bg-white text-gray-800"
              defaultValue={data?.gender || "MALE"}
            >
              <option value="MALE">{t("male")}</option>
              <option value="FEMALE">{t("female")}</option>
            </select>
            {errors.gender && <p className="text-xs text-red-400">{errors.gender.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-500">{t("phoneLabel")}</label>
            <input {...register("phone")} className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]" />
            {errors.phone && <p className="text-xs text-red-400">{errors.phone.message}</p>}
        </div>

        {type === 'create' && (
            <div className="border-t pt-4 mt-2 space-y-4">
                 <p className="text-sm font-medium text-gray-600">{t("initialPaymentTitle")}</p>
                 <div className="flex flex-col gap-2 w-full">
                    <label className="text-xs text-gray-500">{t("paidAmountLabel")}</label>
                    <input
                        type="number"
                        step="any"
                        {...register("amount")}
                        className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
                    />
                    {errors.amount && <p className="text-xs text-red-400">{errors.amount.message}</p>}
                </div>
                 <div className="flex flex-col gap-2">
                    <label className="text-xs text-gray-500">{t("notesLabel")}</label>
                    <textarea {...register("notes")} rows={2} className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full" placeholder={t("notesPlaceholder")} />
                </div>
            </div>
        )}
      </div>

      {state?.error && !state.message && <span className="text-red-500">Error</span>}
      <Button 
        type="submit" 
        variant="primary"
        size="lg"
        disabled={isSubmitting || isPending}
        className="w-full"
      >
        {isSubmitting || isPending ? (type === 'create' ? t("submittingCreate") : t("submittingUpdate")) : (type === 'create' ? tCommon("create") : tCommon("update"))}
      </Button>
    </form>
  );
};

export default WorkshopParticipantForm;
