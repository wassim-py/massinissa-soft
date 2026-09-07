"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import InputField from "../InputField";
import { LessonSchema, lessonSchema } from "@/lib/formValidationSchemas";
import { createLesson, updateLesson } from "@/lib/actions";

import { useActionState, Dispatch, SetStateAction, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Day, Subject, Class, Teacher, Classroom } from "@prisma/client";

type FormState = {
  success: boolean;
  error: boolean;
  message: string;
};

// =================================================================
// DATA TYPES
// These types define the shape of the data we expect from the parent page.
// =================================================================

// ADDED: Type for a Subject that includes the teachers who teach it.
type SubjectWithTeachers = Subject & {
  teachers: { id: string }[];
};

// CHANGED: Renamed for clarity, this type was already present.
type TeacherWithSubjects = Teacher & {
  subjects: { id: number }[];
};

const LessonForm = ({
  type,
  data,
  setOpen,
  relatedData,
}: {
  type: "create" | "update";
  data?: any;
  setOpen: Dispatch<SetStateAction<boolean>>;
  // CHANGED: Updated the type for relatedData to reflect the new data shapes
  relatedData?: {
    subjects: SubjectWithTeachers[];
    classes: Class[];
    teachers: TeacherWithSubjects[];
    classrooms: Classroom[];
  };
}) => {

  const [isSubmitting, setIsSubmitting] = useState(false);
  const formatTime = (date: Date | string | undefined) => {
    if (!date) return "";
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<LessonSchema>({
    resolver: zodResolver(lessonSchema),
    defaultValues: data
      ? { ...data, startTime: formatTime(data.startTime), endTime: formatTime(data.endTime) }
      : {},
  });

  const { subjects: allSubjects, classes, teachers: allTeachers, classrooms } = relatedData || {};
  const daysOfWeek: Day[] = ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

  const dayNamesArabic: Record<Day, string> = {
  SATURDAY: "السبت",
  SUNDAY: "الاحد",
  MONDAY: "الاثنين",
  TUESDAY: "الثلاثاء",
  WEDNESDAY: "الاربعاء",
  THURSDAY: "الخميس",
  FRIDAY: "الجمعة",
};


  // =================================================================
  // TWO-WAY FILTERING LOGIC
  // =================================================================
  
  // ADDED: State to hold the available teachers based on subject selection
  const [availableTeachers, setAvailableTeachers] = useState<TeacherWithSubjects[]>(allTeachers || []);
  
  // State for available subjects (already existed)
  const [availableSubjects, setAvailableSubjects] = useState<SubjectWithTeachers[]>(allSubjects || []);
  
  // Watch for changes in both dropdowns
  const selectedTeacherId = watch("teacherId");
  const selectedSubjectId = watch("subjectId"); // ADDED: Watch for subject changes

  // EFFECT 1: Handle filtering Subjects when a Teacher is selected
  useEffect(() => {
    // When a teacher is selected, filter the subjects
    if (selectedTeacherId) {
      const selectedTeacher = allTeachers?.find((t) => t.id === selectedTeacherId);
      const teacherSubjectIds = selectedTeacher?.subjects?.map((s) => s.id) || [];
      setAvailableSubjects(allSubjects?.filter((s) => teacherSubjectIds.includes(s.id)) || []);
      
      // When filtering by teacher, the teacher list should be full
      setAvailableTeachers(allTeachers || []);
      
      // Reset the subject field if the selected teacher doesn't teach the currently selected subject
      const currentSubjectIsTaught = teacherSubjectIds.includes(Number(selectedSubjectId));
      if (!currentSubjectIsTaught) {
        setValue("subjectId", 0);
      }

    } else {
      // If no teacher is selected, show all subjects
      setAvailableSubjects(allSubjects || []);
    }
  }, [selectedTeacherId, allTeachers, allSubjects, setValue, selectedSubjectId]);

  // ADDED: EFFECT 2: Handle filtering Teachers when a Subject is selected
  useEffect(() => {
    // When a subject is selected, filter the teachers
    if (selectedSubjectId && Number(selectedSubjectId) > 0) {
      const selectedSubject = allSubjects?.find((s) => s.id === Number(selectedSubjectId));
      const subjectTeacherIds = selectedSubject?.teachers?.map((t) => t.id) || [];
      setAvailableTeachers(allTeachers?.filter((t) => subjectTeacherIds.includes(t.id)) || []);

      // When filtering by subject, the subject list should be full
      setAvailableSubjects(allSubjects || []);
      
      // Reset the teacher field if the selected subject isn't taught by the currently selected teacher
      const currentTeacherTeaches = subjectTeacherIds.includes(String(selectedTeacherId));
      if (!currentTeacherTeaches) {
        setValue("teacherId", "");
      }
      
    } else {
      // If no subject is selected, show all teachers
      setAvailableTeachers(allTeachers || []);
    }
  }, [selectedSubjectId, allSubjects, allTeachers, setValue, selectedTeacherId]);
  
  // =================================================================
  
  const initialState: FormState = { success: false, error: false, message: "" };
  const actionToRun = type === "create" ? createLesson : updateLesson;
  const [state, formAction] = useActionState(actionToRun, initialState);

  const onSubmit = handleSubmit((formData) => {
    setIsSubmitting(true);
    formAction(formData);
  });

  useEffect(() => {
    if (state.success || state.error) {
    setIsSubmitting(false);
    }
    if (state.success) {
      toast.success(state.message || `Lesson has been ${type}d successfully!`);
      setOpen(false);
    }
    if (state.error && state.message) {
      toast.error(state.message);
    }
  }, [state, type, setOpen]);

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      {type === "update" && (
        <input type="hidden" {...register("id")} defaultValue={data?.id} />
      )}
      <h1 className="text-xl font-semibold">
        {type === "create" ? "برمجة حصة جديدة" : "تحديث الحصة"}
      </h1>

      <div className="flex justify-between flex-wrap gap-4">
        <InputField label="اسم الحصة (مثال: مراجعة أسبوعية)" name="name" register={register} error={errors?.name}/>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">القاعة</label>
          <select className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]" {...register("classroomId")}>
            <option value="">حدد القاعة</option>
            {classrooms?.map((room) => (
              <option value={room.id} key={room.id}>{room.name}</option>
            ))}
          </select>
          {errors.classroomId?.message && (<p className="text-xs text-red-400">{errors.classroomId.message.toString()}</p>)}
        </div>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">يوم من الاسبوع</label>
          <select className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]" {...register("day")}>
            <option value="">حدد اليوم</option>
            {daysOfWeek.map((day) => (
              <option value={day} key={day}>{dayNamesArabic[day]}</option>
            ))}
          </select>
          {errors.day?.message && (<p className="text-xs text-red-400">{errors.day.message.toString()}</p>)}
        </div>
        <InputField label="وقت البدء" name="startTime" type="time" register={register} error={errors?.startTime}/>
        <InputField label="وقت الانتهاء" name="endTime" type="time" register={register} error={errors?.endTime}/>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">القسم</label>
          <select className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]" {...register("classId")}>
            <option value="">حدد القسم</option>
            {classes?.map((c) => (
              <option value={c.id} key={c.id}>{c.name}</option>
            ))}
          </select>
          {errors.classId?.message && (<p className="text-xs text-red-400">{errors.classId.message.toString()}</p>)}
        </div>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">الاستاذ</label>
          {/* CHANGED: This dropdown now maps over `availableTeachers` */}
          <select className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]" {...register("teacherId")}>
            <option value="">حدد الاستاذ</option>
            {availableTeachers.map((t) => (
              <option value={t.id} key={t.id}>{t.name} {t.surname}</option>
            ))}
          </select>
          {errors.teacherId?.message && (<p className="text-xs text-red-400">{errors.teacherId.message.toString()}</p>)}
        </div>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">المادة</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
            {...register("subjectId")}
            // CHANGED: The disabled property is removed to allow two-way filtering
          >
            <option value={0}>حدد المادة</option>
            {/* CHANGED: This dropdown continues to map over `availableSubjects` */}
            {availableSubjects.map((subject) => (
              <option value={subject.id} key={subject.id}>{subject.name}</option>
            ))}
          </select>
          {errors.subjectId?.message && (<p className="text-xs text-red-400">{errors.subjectId.message.toString()}</p>)}
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

export default LessonForm;