"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import InputField from "../InputField";
import { eventSchema, EventSchema } from "@/lib/formValidationSchemas";
import { createEvent, updateEvent } from "@/lib/actions";

import { useActionState, Dispatch, SetStateAction, useEffect, useState, useRef } from "react";
import { toast } from "react-toastify";
import { Class } from "@prisma/client";
import Image from "next/image";

// Helper to format a date for a datetime-local input
const formatDateTimeLocal = (date?: Date | string): string => {
    if (!date) return '';
    const d = new Date(date);
    const timezoneOffset = d.getTimezoneOffset() * 60000;
    const localDate = new Date(d.getTime() - timezoneOffset);
    return localDate.toISOString().slice(0, 16);
};

const EventForm = ({
  type,
  data,
  setOpen,
  relatedData,
}: {
  type: "create" | "update";
  data?: any;
  setOpen: Dispatch<SetStateAction<boolean>>;
  relatedData?: { classes: Class[] };
}) => {

  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<EventSchema>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
        ...data,
        startTime: formatDateTimeLocal(data?.startTime),
        endTime: formatDateTimeLocal(data?.endTime),
        classes: data?.classes?.map((c: Class) => c.id) || [],
    },
  });

  const [isClassesOpen, setIsClassesOpen] = useState(false);
  const classesDropdownRef = useRef<HTMLDivElement>(null);

  const [state, formAction] = useActionState(
    type === "create" ? createEvent : updateEvent,
    { success: false, error: false, message: "" }
  );

  const onSubmit = handleSubmit((formData) => {
  setIsSubmitting(true); // Set loading state to true
  formAction(formData);  // Call the server action
  });

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
      if (
        classesDropdownRef.current &&
        !classesDropdownRef.current.contains(event.target as Node)
      ) {
        setIsClassesOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const { classes } = relatedData || {};

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "انشاء حدث جديد" : "تحديث الحدث"}
      </h1>

      <div className="flex justify-between flex-wrap gap-4">
        {type === "update" && <input type="hidden" {...register("id")} />}
        
        <InputField label="عنوان الحدث" name="title" register={register} error={errors?.title} />
        <InputField label="زمن البدء" name="startTime" type="datetime-local" register={register} error={errors?.startTime} />
        <InputField label="زمن الانتهاء" name="endTime" type="datetime-local" register={register} error={errors?.endTime} />

        <div className="w-full flex flex-col gap-2 relative" ref={classesDropdownRef}>
            <label className="text-xs text-gray-500">الجمهور</label>
            <Controller
                name="classes"
                control={control}
                render={({ field }) => {
                    const safeFieldValue = Array.isArray(field.value) ? field.value : [];
                    const selectedClassObjects = classes?.filter((c: any) => safeFieldValue.includes(c.id)) || [];
                    
                    const getDisplayText = () => {
                        // UPDATED: Display logic now includes "All School"
                        if (safeFieldValue.length === 0) return "كل المدرسة";
                        if (selectedClassObjects.length <= 2) return selectedClassObjects.map((c: any) => c.name).join(", ");
                        const firstTwoNames = selectedClassObjects.slice(0, 2).map((c: any) => c.name).join(", ");
                        return `${firstTwoNames}, and ${selectedClassObjects.length - 2} more`;
                    };

                    return (
                        <>
                            <button type="button" className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] text-left flex items-center justify-between truncate" onClick={() => setIsClassesOpen((prev) => !prev)}>
                                <span className={safeFieldValue.length > 0 ? "text-black" : "text-gray-500"}>{getDisplayText()}</span>
                                <Image src="/sort.png" alt="dropdown icon" width={12} height={12} className="flex-shrink-0"/>
                            </button>
                            {isClassesOpen && (
                                <div className="absolute top-full mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                                    {/* ADDED: "All School" option */}
                                    <label className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer border-b">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                            checked={safeFieldValue.length === 0}
                                            onChange={() => field.onChange([])} // Set value to empty array
                                        />
                                        <span className="text-sm font-semibold text-purple-700">كل المدرسة</span>
                                    </label>
                                    {classes?.map((c: { id: number; name: string }) => (
                                        <label key={c.id} className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                checked={safeFieldValue.includes(c.id)}
                                                onChange={(e) => {
                                                    const selectedId = c.id;
                                                    if (e.target.checked) {
                                                        field.onChange([...safeFieldValue, selectedId]);
                                                    } else {
                                                        field.onChange(safeFieldValue.filter((id) => id !== selectedId));
                                                    }
                                                }}
                                            />
                                            <span className="text-sm">{c.name}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </>
                    );
                }}
            />
            {errors.classes?.message && <p className="text-xs text-red-400">{errors.classes.message.toString()}</p>}
        </div>

        <div className="w-full flex flex-col gap-2">
            <label className="text-xs text-gray-500">الوصف</label>
            <textarea
                rows={4}
                className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
                {...register("description")}
            />
            {errors.description?.message && <p className="text-xs text-red-400">{errors.description.message.toString()}</p>}
        </div>
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

export default EventForm;
