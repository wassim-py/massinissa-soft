"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import InputField from "../InputField";
import { examSchema, ExamSchema } from "@/lib/formValidationSchemas";
import { createExam, updateExam } from "@/lib/actions";
import { useFormState } from "react-dom";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Class, Classroom, Subject, Teacher } from "@prisma/client";

// Helper function to format a Date object for the 'datetime-local' input.
// It converts a date to the 'YYYY-MM-DDTHH:MM' format in the user's local timezone.
const formatDateTimeLocal = (date?: Date | string): string => {
    if (!date) return '';
    const d = new Date(date);
    // Create a new date object that is adjusted for the timezone offset.
    // This ensures the time displayed in the input matches the user's local time, not UTC.
    const timezoneOffset = d.getTimezoneOffset() * 60000; // offset in milliseconds
    const localDate = new Date(d.getTime() - timezoneOffset);
    // Return the date in the format required by datetime-local input
    return localDate.toISOString().slice(0, 16);
};


type RelatedData = {
  subjects: (Subject & { teachers: { id: string }[] })[];
  classes: Class[];
  teachers: (Teacher & { subjects: { id: number }[] })[];
  classrooms: Classroom[];
};

const ExamForm = ({
  type,
  data,
  setOpen,
  relatedData,
}: {
  type: "create" | "update";
  data?: any;
  setOpen: Dispatch<SetStateAction<boolean>>;
  relatedData?: RelatedData;
}) => {

  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<ExamSchema>({
    resolver: zodResolver(examSchema),
    defaultValues: {
        ...data,
        startTime: formatDateTimeLocal(data?.startTime),
        endTime: formatDateTimeLocal(data?.endTime),
    },
  });

  const { subjects: allSubjects, classes, teachers: allTeachers, classrooms } = relatedData || {};

  const [availableTeachers, setAvailableTeachers] = useState(allTeachers || []);
  const [availableSubjects, setAvailableSubjects] = useState(allSubjects || []);
  const selectedTeacherId = watch("teacherId");
  const selectedSubjectId = watch("subjectId");

  useEffect(() => {
    if (selectedTeacherId) {
      const selectedTeacher = allTeachers?.find((t) => t.id === selectedTeacherId);
      const teacherSubjectIds = selectedTeacher?.subjects?.map((s) => s.id) || [];
      setAvailableSubjects(allSubjects?.filter((s) => teacherSubjectIds.includes(s.id)) || []);
      setAvailableTeachers(allTeachers || []);
      const currentSubjectIsTaught = teacherSubjectIds.includes(Number(selectedSubjectId));
      if (!currentSubjectIsTaught) {
        setValue("subjectId", 0);
      }
    } else {
      setAvailableSubjects(allSubjects || []);
    }
  }, [selectedTeacherId, allTeachers, allSubjects, setValue, selectedSubjectId]);

  useEffect(() => {
    if (selectedSubjectId && Number(selectedSubjectId) > 0) {
      const selectedSubject = allSubjects?.find((s) => s.id === Number(selectedSubjectId));
      const subjectTeacherIds = selectedSubject?.teachers?.map((t) => t.id) || [];
      setAvailableTeachers(allTeachers?.filter((t) => subjectTeacherIds.includes(t.id)) || []);
      setAvailableSubjects(allSubjects || []);
      const currentTeacherTeaches = subjectTeacherIds.includes(String(selectedTeacherId));
      if (!currentTeacherTeaches) {
        setValue("teacherId", "");
      }
    } else {
      setAvailableTeachers(allTeachers || []);
    }
  }, [selectedSubjectId, allSubjects, allTeachers, setValue, selectedTeacherId]);

  const [state, formAction] = useFormState(
    type === "create" ? createExam : updateExam,
    { success: false, error: false, message: "" }
  );

  const onSubmit = handleSubmit((formData) => {
  setIsSubmitting(true);
  formAction(formData);
  });

  useEffect(() => {
    // ADDED: Optional chaining to safely access state properties
    if (state?.success || state?.error) {
      setIsSubmitting(false);
    }
    if (state?.success) {
      toast.success(state.message || `Exam has been ${type}d successfully!`);
      setOpen(false);
    }
    if (state?.error && state.message) {
      toast.error(state.message);
    }
  }, [state, type, setOpen]);

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "برمجة امتحان جديد" : "تحديث الامتحان"}
      </h1>

      <div className="flex justify-between flex-wrap gap-4">
        {type === "update" && <input type="hidden" {...register("id")} />}
        
        <InputField label="زمن وتاريخ البدء" name="startTime" type="datetime-local" register={register} error={errors?.startTime} />
        <InputField label="زمن وتاريخ الانتهاء" name="endTime" type="datetime-local" register={register} error={errors?.endTime} />
        
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">الاستاذ</label>
          <select className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]" {...register("teacherId")}>
            <option value="">حدد الاستاذ</option>
            {availableTeachers.map((t) => (
              <option value={t.id} key={t.id}>{t.name} {t.surname}</option>
            ))}
          </select>
          {errors.teacherId?.message && <p className="text-xs text-red-400">{errors.teacherId.message.toString()}</p>}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">المادة</label>
          <select className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]" {...register("subjectId")}>
            <option value={0}>حدد المادة</option>
            {availableSubjects.map((subject) => (
              <option value={subject.id} key={subject.id}>{subject.name}</option>
            ))}
          </select>
          {errors.subjectId?.message && <p className="text-xs text-red-400">{errors.subjectId.message.toString()}</p>}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">القسم</label>
          <select className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]" {...register("classId")}>
            <option value="">حدد القسم</option>
            {classes?.map((c) => (
              <option value={c.id} key={c.id}>{c.name}</option>
            ))}
          </select>
          {errors.classId?.message && <p className="text-xs text-red-400">{errors.classId.message.toString()}</p>}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">القاعة</label>
          <select className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]" {...register("classroomId")}>
            <option value="">حدد القاعة</option>
            {classrooms?.map((room) => (
              <option value={room.id} key={room.id}>{room.name}</option>
            ))}
          </select>
          {errors.classroomId?.message && <p className="text-xs text-red-400">{errors.classroomId.message.toString()}</p>}
        </div>
      </div>

      {/* ADDED: Optional chaining to safely access state properties */}
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

export default ExamForm;
