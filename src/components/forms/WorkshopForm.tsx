"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import InputField from "../InputField";
import { workshopSchema, WorkshopSchema } from "@/lib/formValidationSchemas";
import { createWorkshop, updateWorkshop } from "@/lib/actions";

import { useActionState, Dispatch, SetStateAction, useEffect, useState, useRef } from "react";
import { toast } from "react-toastify";
import { Teacher, Student } from "@prisma/client";
import Image from "next/image";

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

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "انشاء دورة جديدة" : "تحديث الدورة"}
      </h1>

      {/* Main Details */}
      <div className="flex justify-between flex-wrap gap-4">
        {type === "update" && <input type="hidden" {...register("id")} />}
        <InputField label="اسم الدورة" name="title" register={register} error={errors?.title} />
        <InputField label="اسم الاستاذ" name="teacherName" register={register} error={errors?.teacherName} />
        <div className="flex flex-col gap-2 w-full md:w-1/4">
            <label className="text-xs text-gray-500">السعر</label>
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
        <label className="text-xs text-gray-500">الوصف</label>
        <textarea {...register("description")} rows={3} className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full" />
      </div>
      
      {/* Dynamic Session Fields */}
      <div className="flex flex-col gap-4">
        <label className="text-xs text-gray-500 border-b pb-2 font-medium">حصص الدورة</label>
        {fields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-2 p-2 rounded-md bg-gray-50 border">
                {/* CORRECTED: Replaced InputField with standard inputs to ensure full width */}
                <div className="flex-1 flex flex-col gap-2">
                    <label className="text-xs text-gray-500">زمن البدء</label>
                    <input
                        type="datetime-local"
                        {...register(`sessions.${index}.startTime`)}
                        className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
                    />
                    {errors.sessions?.[index]?.startTime && <p className="text-xs text-red-400">{errors.sessions?.[index]?.startTime?.message}</p>}
                </div>
                <div className="flex-1 flex flex-col gap-2">
                    <label className="text-xs text-gray-500">زمن الانتهاء</label>
                    <input
                        type="datetime-local"
                        {...register(`sessions.${index}.endTime`)}
                        className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
                    />
                    {errors.sessions?.[index]?.endTime && <p className="text-xs text-red-400">{errors.sessions?.[index]?.endTime?.message}</p>}
                </div>
                <button type="button" onClick={() => remove(index)} className="p-2 bg-red-100 text-red-600 rounded-md hover:bg-red-200 self-end mb-1 text-xs font-semibold">
                    حذف
                </button>
            </div>
        ))}
        <button type="button" onClick={() => append({ startTime: '', endTime: '' })} className="text-sm bg-blue-100 text-blue-800 font-semibold p-2 rounded-md hover:bg-blue-200 self-start">
            اضافة حصة
        </button>
        {errors.sessions?.root && <p className="text-xs text-red-400">{errors.sessions.root.message}</p>}
        {errors.sessions?.message && <p className="text-xs text-red-400">{errors.sessions.message}</p>}
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

export default WorkshopForm;
