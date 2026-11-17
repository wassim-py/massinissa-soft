"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import InputField from "../InputField";
import { workshopSchema, WorkshopSchema } from "@/lib/formValidationSchemas";
import { createWorkshop, updateWorkshop } from "@/lib/actions";
import { formatAlgiersDateTimeLocal } from "@/lib/algiersDate";

import { useActionState, Dispatch, SetStateAction, useEffect, startTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";

type WorkshopRelatedData = {
  branches?: Array<{ id: number; name: string }>;
  isOwner?: boolean;
  defaultBranchId?: number;
  workshopDetails?: {
    id: number;
    title: string;
    description: string | null;
    totalPrice: number | string;
    guestTeacher: string | null;
    branchId: number;
    sessions?: Array<{ id: number; startsAt: string | Date; endsAt: string | Date }>;
  } | null;
};

const WorkshopForm = ({
  type,
  data,
  setOpen,
  relatedData,
}: {
  type: "create" | "update";
  data?: any;
  setOpen: Dispatch<SetStateAction<boolean>>;
  relatedData?: WorkshopRelatedData;
}) => {
  const router = useRouter();
  const resolvedSource = data || relatedData?.workshopDetails || {};
  const rawSessions =
    data?.sessions && data.sessions.length > 0
      ? data.sessions
      : relatedData?.workshopDetails?.sessions || [];

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<WorkshopSchema>({
    resolver: zodResolver(workshopSchema),
    defaultValues: {
      id: resolvedSource?.id,
      title: resolvedSource?.title || "",
      description: resolvedSource?.description || "",
      teacherName: resolvedSource?.teacherName ?? resolvedSource?.guestTeacher ?? "",
      price:
        resolvedSource?.price !== undefined
          ? Number(resolvedSource.price)
          : resolvedSource?.totalPrice !== undefined
          ? Number(resolvedSource.totalPrice)
          : 0,
      branchId:
        resolvedSource?.branchId ??
        relatedData?.workshopDetails?.branchId ??
        relatedData?.defaultBranchId,
      sessions:
        rawSessions.length > 0
          ? rawSessions.map((s: any) => ({
              id: s.id,
              startTime: formatAlgiersDateTimeLocal(s.startTime ?? s.startsAt),
              endTime: formatAlgiersDateTimeLocal(s.endTime ?? s.endsAt),
            }))
          : [{ startTime: "", endTime: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "sessions",
  });

  const [state, formAction, isPending] = useActionState(
    type === "create" ? createWorkshop : updateWorkshop,
    { success: false, error: false, message: "" }
  );

  const onSubmit = handleSubmit((formData) => {
    startTransition(() => {
      formAction(formData);
    });
  });

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
  const branches = relatedData?.branches || [];
  const showBranchSelect = Boolean(relatedData?.isOwner && branches.length > 0);

  return (
    <form className="flex flex-col gap-6 font-sans" onSubmit={onSubmit}>
      <h1 className="text-section-title font-bold text-gray-900">
        {type === "create" ? t("workshopFormCreate") : t("workshopFormUpdate")}
      </h1>

      {/* Main Details */}
      <div className="flex justify-between flex-wrap gap-4">
        {type === "update" && <input type="hidden" {...register("id")} />}
        <InputField label={t("workshopTitleLabel")} name="title" register={register} error={errors?.title} />
        <InputField label={t("teacherNameLabel")} name="teacherName" register={register} error={errors?.teacherName} />
        <div className="flex flex-col gap-2 w-full md:w-1/4">
            <label className="text-xs text-gray-500">{t("priceLabel")}</label>
            <input
                type="number"
                min="0"
                step="0.01"
                {...register("price")}
                className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
            />
            {errors.price && <p className="text-xs text-red-400">{errors.price.message}</p>}
        </div>
        {showBranchSelect && (
          <div className="flex flex-col gap-2 w-full md:w-1/4">
            <label className="text-xs text-gray-500">{t("branch")}</label>
            <select
              {...register("branchId")}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] bg-white"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      
      <div className="flex flex-col gap-2">
        <label className="text-xs text-gray-500">{t("descriptionLabel")}</label>
        <textarea {...register("description")} rows={3} className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full" />
      </div>
      
      {/* Dynamic Session Fields */}
      <div className="flex flex-col gap-4">
        <label className="text-xs text-gray-500 border-b pb-2 font-medium">{t("sessionsSectionTitle")}</label>
        {fields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-2 p-2 rounded-md bg-gray-50 border">
                <input type="hidden" {...register(`sessions.${index}.id`)} />
                <div className="flex-1 flex flex-col gap-2">
                    <label className="text-xs text-gray-500">{t("startTimeLabel")}</label>
                    <input
                        type="datetime-local"
                        {...register(`sessions.${index}.startTime`)}
                        className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
                    />
                    {errors.sessions?.[index]?.startTime && <p className="text-xs text-red-400">{errors.sessions?.[index]?.startTime?.message}</p>}
                </div>
                <div className="flex-1 flex flex-col gap-2">
                    <label className="text-xs text-gray-500">{t("endTimeLabel")}</label>
                    <input
                        type="datetime-local"
                        {...register(`sessions.${index}.endTime`)}
                        className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
                    />
                    {errors.sessions?.[index]?.endTime && <p className="text-xs text-red-400">{errors.sessions?.[index]?.endTime?.message}</p>}
                </div>
                <Button
                  type="button"
                  variant="soft-danger"
                  size="sm"
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1}
                  className="self-end mb-1"
                >
                    {t("remove")}
                </Button>
            </div>
        ))}
        <Button type="button" variant="soft" size="sm" onClick={() => append({ startTime: '', endTime: '' })} className="self-start">
            {t("addSession")}
        </Button>
        {errors.sessions?.root && <p className="text-xs text-red-400">{errors.sessions.root.message}</p>}
        {errors.sessions?.message && <p className="text-xs text-red-400">{errors.sessions.message}</p>}
      </div>

      {state?.error && !state.message && <span className="text-red-500">Error</span>}
      <Button 
        type="submit" 
        variant="primary"
        size="lg"
        disabled={isPending}
        className="w-full"
      >
        {isPending ? (type === 'create' ? t("submittingCreate") : t("submittingUpdate")) : (type === 'create' ? tCommon("create") : tCommon("update"))}
      </Button>
    </form>
  );
};

export default WorkshopForm;
