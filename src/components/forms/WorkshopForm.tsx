"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import InputField from "../InputField";
import { workshopSchema, WorkshopSchema } from "@/lib/formValidationSchemas";
import { createWorkshop, updateWorkshop } from "@/lib/actions";

import { useActionState, Dispatch, SetStateAction, useEffect, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "react-toastify";
import { Teacher, Student } from "@prisma/client";
import Image from "next/image";
import { Button } from "@/components/ui/Button";

// Helper to format a date for a datetime-local input
const formatDateTimeLocal = (date?: Date | string): string => {
    if (!date) return '';
    const d = new Date(date);
    const timezoneOffset = d.getTimezoneOffset() * 60000;
    const localDate = new Date(d.getTime() - timezoneOffset);
    return localDate.toISOString().slice(0, 16);
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
  relatedData?: { teachers: Teacher[], students: Student[] };
}) => {

  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<WorkshopSchema>({
    resolver: zodResolver(workshopSchema),
    defaultValues: {
        ...data,
        price: data?.price || 0,
        teacherName: data?.teacherName || "",
        sessions: data?.sessions?.map((s: any) => ({
            startTime: formatDateTimeLocal(s.startTime),
            endTime: formatDateTimeLocal(s.endTime),
        })) || [{ startTime: '', endTime: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "sessions",
  });

  const [state, formAction] = useActionState(
    type === "create" ? createWorkshop : updateWorkshop,
    { success: false, error: false, message: "" }
  );

  const onSubmit = handleSubmit((formData) => {
  setIsSubmitting(true); // Set loading state to true
  formAction(formData);  // Call the server action
  });

  const [isTeachersOpen, setIsTeachersOpen] = useState(false);
  const teachersDropdownRef = useRef<HTMLDivElement>(null);
  const [isStudentsOpen, setIsStudentsOpen] = useState(false);
  const studentsDropdownRef = useRef<HTMLDivElement>(null);

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
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (teachersDropdownRef.current && !teachersDropdownRef.current.contains(event.target as Node)) {
        setIsTeachersOpen(false);
      }
      if (studentsDropdownRef.current && !studentsDropdownRef.current.contains(event.target as Node)) {
        setIsStudentsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const t = useTranslations("workshops");
  const tCommon = useTranslations("common");

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
                step="0.01"
                {...register("price")}
                className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
            />
            {errors.price && <p className="text-xs text-red-400">{errors.price.message}</p>}
        </div>
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
                <Button type="button" variant="soft-danger" size="sm" onClick={() => remove(index)} className="self-end mb-1">
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
        disabled={isSubmitting}
        className="w-full"
      >
        {isSubmitting ? (type === 'create' ? t("submittingCreate") : t("submittingUpdate")) : (type === 'create' ? tCommon("create") : tCommon("update"))}
      </Button>
    </form>
  );
};

export default WorkshopForm;
