"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import InputField from "../InputField";
import Image from "next/image";
import {
  Dispatch,
  SetStateAction,
  useEffect,
  useState,
  useRef,
} from "react";
import { teacherSchema, TeacherSchema } from "@/lib/formValidationSchemas";
import { useFormState } from "react-dom";
import { createTeacher, updateTeacher } from "@/lib/actions";
import { toast } from "react-toastify";
import { CldUploadWidget } from "next-cloudinary";

// It's good practice to define the shape of our server action state
type FormState = {
  success: boolean;
  error: boolean;
  message?: string;
};

const TeacherForm = ({
  type,
  data,
  setOpen,
  relatedData,
}: {
  type: "create" | "update";
  data?: any;
  setOpen: Dispatch<SetStateAction<boolean>>;
  relatedData?: any;
}) => {

  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<TeacherSchema>({
    resolver: zodResolver(teacherSchema),
    // Pre-fill form with existing data if in "update" mode
    defaultValues: data
      ? {
          ...data,
          email: data.email ?? "",
          phone: data.phone ?? "",
          address: data.address ?? "",
          img: data.img ?? "",
          subjects: data.subjects?.map((s: any) => s.id) || [],
          // ADDED: Handle default values for the new classes field
          classes: data.classes?.map((c: any) => c.id) || [],
          birthday: data.birthday
            ? new Date(data.birthday).toISOString().split("T")[0]
            : undefined,
        }
      : {
          subjects: [],
          // ADDED: Initialize classes as an empty array
          classes: [],
        },
  });

  const [img, setImg] = useState<any>(
    data?.img ? { secure_url: data.img } : undefined
  );

  // State for dropdowns' visibility
  const [isSubjectsOpen, setIsSubjectsOpen] = useState(false);
  const subjectsDropdownRef = useRef<HTMLDivElement>(null);
  const [isClassesOpen, setIsClassesOpen] = useState(false);
  const classesDropdownRef = useRef<HTMLDivElement>(null);

  const initialState: FormState = { success: false, error: false, message: "" };
  const actionToRun = type === "create" ? createTeacher : updateTeacher;
  const [state, formAction] = useFormState(actionToRun, initialState);

  const onSubmit = (formData: TeacherSchema) => {
    setIsSubmitting(true);
    const payload = { ...formData, img: img?.secure_url };
    formAction(payload as any);
  };

  useEffect(() => {
    if (state.success || state.error) {
      setIsSubmitting(false); // <-- ADD THIS LINE
    }
    if (state.success) {
      toast.success(state.message);
      setOpen(false);
    }
    if (state.error) {
      toast.error(state.message);
    }
  }, [state, setOpen]);

  // Effect to close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        subjectsDropdownRef.current &&
        !subjectsDropdownRef.current.contains(event.target as Node)
      ) {
        setIsSubjectsOpen(false);
      }
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

  const { subjects, classes } = relatedData;

  return (
    <form className="flex flex-col gap-8" onSubmit={handleSubmit(onSubmit)}>
      {type === "update" && (
        <input type="hidden" {...register("id")} defaultValue={data?.id} />
      )}
      <h1 className="text-xl font-semibold text-right">
        {type === "create" ? "انشاء استاذ جديد" : "تحديث الاستاذ"}
      </h1>
      <span className="text-xs text-gray-400 font-medium">
        معلومات تسجيل الدخول
      </span>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="اسم المستخدم"
          name="username"
          register={register}
          error={errors?.username}
        />
        <InputField
          label="البريد الالكتروني"
          name="email"
          register={register}
          error={errors?.email}
        />
        <InputField
          label="كلمة المرور"
          name="password"
          type="password"
          placeholder={type === "update" ? "اتركه فارغًا إذا لم ترغب في تغييره" : ""}
          register={register}
          error={errors?.password}
        />
      </div>
      <span className="text-xs text-gray-400 font-medium">
        المعلومات الشخصية
      </span>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="الاسم"
          name="name"
          register={register}
          error={errors.name}
        />
        <InputField
          label="اللقب"
          name="surname"
          register={register}
          error={errors.surname}
        />
        <InputField
          label="رقم الهاتف"
          name="phone"
          register={register}
          error={errors.phone}
        />
        <InputField
          label="العنوان"
          name="address"
          register={register}
          error={errors.address}
        />
        <InputField
          label="تاريخ الميلاد"
          name="birthday"
          register={register}
          error={errors.birthday}
          type="date"
        />
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">الجنس</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
            {...register("sex")}
          >
            <option value="MALE">ذكر</option>
            <option value="FEMALE">انثى</option>
          </select>
          {errors.sex?.message && (
            <p className="text-xs text-red-400">
              {errors.sex.message.toString()}
            </p>
          )}
        </div>

        {/* Subjects Dropdown */}
        <div
          className="flex flex-col gap-2 w-full md:w-1/4 relative"
          ref={subjectsDropdownRef}
        >
          <label className="text-xs text-gray-500">المادة</label>
          <Controller
            name="subjects"
            control={control}
            render={({ field }) => {
              const safeFieldValue = Array.isArray(field.value) ? field.value : [];
              const selectedSubjectObjects = subjects.filter((subject: any) =>
                safeFieldValue.includes(subject.id)
              );
              const getDisplayText = () => {
                if (selectedSubjectObjects.length === 0) return "حدد المادة (المواد)";
                if (selectedSubjectObjects.length <= 2) return selectedSubjectObjects.map((s: any) => s.name).join(", ");
                const firstTwoNames = selectedSubjectObjects.slice(0, 2).map((s: any) => s.name).join(", ");
                return `${firstTwoNames}, and ${selectedSubjectObjects.length - 2} more`;
              };
              return (
                <>
                  <button type="button" className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] text-left flex items-center justify-between truncate" onClick={() => setIsSubjectsOpen((prev) => !prev)}>
                    <span className={safeFieldValue.length > 0 ? "text-black" : "text-gray-400"}>{getDisplayText()}</span>
                    <Image src="/sort.png" alt="dropdown icon" width={12} height={12} className="flex-shrink-0"/>
                  </button>
                  {isSubjectsOpen && (
                    <div className="top-full mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                      {subjects.map((subject: { id: number; name: string }) => (
                        <label key={subject.id} className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer">
                          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" checked={safeFieldValue.includes(subject.id)}
                            onChange={(e) => {
                              const selectedId = subject.id;
                              if (e.target.checked) field.onChange([...safeFieldValue, selectedId]);
                              else field.onChange(safeFieldValue.filter((id) => id !== selectedId));
                            }}/>
                          <span className="text-sm">{subject.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              );
            }}
          />
          {errors.subjects?.message && (<p className="text-xs text-red-400">{errors.subjects.message.toString()}</p>)}
        </div>

        {/* ADDED: Classes Dropdown */}
        <div
          className="flex flex-col gap-2 w-full md:w-1/4 relative"
          ref={classesDropdownRef}
        >
          <label className="text-xs text-gray-500">القسم</label>
          <Controller
            name="classes"
            control={control}
            render={({ field }) => {
              const safeFieldValue = Array.isArray(field.value) ? field.value : [];
              const selectedClassObjects = classes.filter((c: any) =>
                safeFieldValue.includes(c.id)
              );
              const getDisplayText = () => {
                if (selectedClassObjects.length === 0) return "حدد القسم (الاقسام)";
                if (selectedClassObjects.length <= 2) return selectedClassObjects.map((c: any) => c.name).join(", ");
                const firstTwoNames = selectedClassObjects.slice(0, 2).map((c: any) => c.name).join(", ");
                return `${firstTwoNames}, and ${selectedClassObjects.length - 2} more`;
              };
              return (
                <>
                  <button type="button" className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] text-left flex items-center justify-between truncate" onClick={() => setIsClassesOpen((prev) => !prev)}>
                    <span className={safeFieldValue.length > 0 ? "text-black" : "text-gray-400"}>{getDisplayText()}</span>
                    <Image src="/sort.png" alt="dropdown icon" width={12} height={12} className="flex-shrink-0"/>
                  </button>
                  {isClassesOpen && (
                    <div className="top-full mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                      {classes.map((c: { id: number; name: string }) => (
                        <label key={c.id} className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer">
                          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" checked={safeFieldValue.includes(c.id)}
                            onChange={(e) => {
                              const selectedId = c.id;
                              if (e.target.checked) field.onChange([...safeFieldValue, selectedId]);
                              else field.onChange(safeFieldValue.filter((id) => id !== selectedId));
                            }}/>
                          <span className="text-sm">{c.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              );
            }}
          />
          {errors.classes?.message && (<p className="text-xs text-red-400">{errors.classes.message.toString()}</p>)}
        </div>

        <CldUploadWidget
          uploadPreset="school"
          onSuccess={(result: any, { widget }) => {
            setImg(result.info);
            widget.close();
          }}
        >
          {({ open }) => {
            return (
              <div className="flex items-center gap-4">
                <Image
                  src={img?.secure_url || data?.img || "/noAvatar.png"}
                  alt=""
                  width={40}
                  height={40}
                  className="rounded-full object-cover"
                />
                <div
                  className="text-xs text-gray-500 flex items-center gap-2 cursor-pointer"
                  onClick={() => open()}
                >
                  <Image src="/upload.png" alt="" width={28} height={28} />
                  <span>رفع صورة</span>
                </div>
              </div>
            );
          }}
        </CldUploadWidget>
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

export default TeacherForm;
