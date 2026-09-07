"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import InputField from "../InputField";
import Image from "next/image";
import { useActionState, Dispatch,
  SetStateAction,
  useEffect,
  useState,
  useRef, } from "react";
import { studentSchema, StudentSchema } from "@/lib/formValidationSchemas";
import { createStudent, updateStudent } from "@/lib/actions";
import { toast } from "react-toastify";
import { CldUploadWidget } from "next-cloudinary";

type FormState = {
  success: boolean;
  error: boolean;
  message?: string;
};

const StudentForm = ({
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
  // ADDED: State to manually control the submission pending state
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<StudentSchema>({
    resolver: zodResolver(studentSchema),
    defaultValues: data
      ? {
          ...data,
          email: data.email ?? "",
          phone: data.phone ?? "",
          address: data.address ?? "",
          img: data.img ?? "",
          classes: data.classes?.map((c: any) => c.id) || [],
          birthday: data.birthday
            ? new Date(data.birthday).toISOString().split("T")[0]
            : undefined,
        }
      : {
          classes: [],
        },
  });

  const [img, setImg] = useState<any>(
    data?.img ? { secure_url: data.img } : undefined
  );

  const [isClassesOpen, setIsClassesOpen] = useState(false);
  const classesDropdownRef = useRef<HTMLDivElement>(null);

  const initialState: FormState = { success: false, error: false, message: "" };
  const actionToRun = type === "create" ? createStudent : updateStudent;
  const [state, formAction] = useActionState(actionToRun, initialState);

  // UPDATED: The onSubmit function now controls the pending state
  const onSubmit = (formData: StudentSchema) => {
    setIsSubmitting(true); // Set pending to true when submission starts
    const payload = { ...formData, img: img?.secure_url };
    formAction(payload as any);
  };

  useEffect(() => {
    // When the action is complete (success or error), set pending back to false
    if (state.success || state.error) {
        setIsSubmitting(false);
    }
    if (state.success) {
      toast.success(
        state.message || `Student has been ${type}d successfully!`
      );
      setOpen(false);
    }
    if (state.error && state.message) {
      toast.error(state.message);
    }
  }, [state, type, setOpen]);

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

  const { grades, classes } = relatedData;

  return (
    <form className="flex flex-col gap-8" onSubmit={handleSubmit(onSubmit)}>
      {type === "update" && (
        <input type="hidden" {...register("id")} defaultValue={data?.id} />
      )}

      <h1 className="text-xl font-semibold text-right">
        {type === "create" ? "انشاء تلميذ جديد" : "تحديث التلميذ"}
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
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">المستوى</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
            {...register("gradeId")}
          >
            <option value="">حدد المستوى</option>
            {grades.map((grade: { id: number; level: string }) => (
              <option value={grade.id} key={grade.id}>
                {grade.level}
              </option>
            ))}
          </select>
          {errors.gradeId?.message && (
            <p className="text-xs text-red-400">
              {errors.gradeId.message.toString()}
            </p>
          )}
        </div>
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
                      {classes.map((classItem: { id: number; name: string }) => (
                        <label key={classItem.id} className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer">
                          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" checked={safeFieldValue.includes(classItem.id)}
                            onChange={(e) => {
                              const selectedId = classItem.id;
                              if (e.target.checked) field.onChange([...safeFieldValue, selectedId]);
                              else field.onChange(safeFieldValue.filter((id) => id !== selectedId));
                            }}/>
                          <span className="text-sm">{classItem.name}</span>
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

export default StudentForm;
