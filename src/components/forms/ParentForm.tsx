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
import { parentSchema, ParentSchema } from "@/lib/formValidationSchemas";

import { createParent, updateParent } from "@/lib/actions";
import { toast } from "react-toastify";
import { CldUploadWidget } from "next-cloudinary";

type FormState = {
  success: boolean;
  error: boolean;
  message?: string;
};

const ParentForm = ({
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
  } = useForm<ParentSchema>({
    resolver: zodResolver(parentSchema),
    defaultValues: data
      ? {
          ...data,
          email: data.email ?? "",
          phone: data.phone ?? "",
          address: data.address ?? "",
          img: data.img ?? "",
          students: data.students?.map((s: any) => s.id) || [],
        }
      : {
          students: [],
        },
  });

  const [img, setImg] = useState<any>(
    data?.img ? { secure_url: data.img } : undefined
  );

  const [isStudentsOpen, setIsStudentsOpen] = useState(false);
  const studentsDropdownRef = useRef<HTMLDivElement>(null);
  
  // ADDED: State for the search term
  const [searchTerm, setSearchTerm] = useState("");

  const initialState: FormState = { success: false, error: false, message: "" };
  const actionToRun = type === "create" ? createParent : updateParent;
  const [state, formAction] = useActionState(actionToRun, initialState);

  const onSubmit = (formData: ParentSchema) => {
    setIsSubmitting(true);
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
        state.message || `Parent has been ${type}d successfully!`
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
        studentsDropdownRef.current &&
        !studentsDropdownRef.current.contains(event.target as Node)
      ) {
        setIsStudentsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
    document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const { students } = relatedData;

  // ADDED: Filter students based on the search term
  const filteredStudents = students.filter(
    (student: { name: string; surname: string }) =>
      `${student.name} ${student.surname}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
  );

  return (
    <form className="flex flex-col gap-8" onSubmit={handleSubmit(onSubmit)}>
      {type === "update" && (
        <input type="hidden" {...register("id")} defaultValue={data?.id} />
      )}
      <h1 className="text-xl font-semibold">
        {type === "create" ? "انشاء ولي أمر جديد" : "تحديث ولي الأمر"}
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
        {/* Custom multi-select dropdown for students */}
        <div
          className="flex flex-col gap-2 w-full md:w-1/4 relative"
          ref={studentsDropdownRef}
        >
          <label className="text-xs text-gray-500">الأبناء (التلاميذ)</label>
          <Controller
            name="students"
            control={control}
            render={({ field }) => {
              const safeFieldValue = Array.isArray(field.value)
                ? field.value
                : [];
              const selectedStudentObjects = students.filter((student: any) =>
                safeFieldValue.includes(student.id)
              );
              const getDisplayText = () => {
                if (selectedStudentObjects.length === 0)
                  return "حدد التلاميذ";
                return selectedStudentObjects
                  .map((s: any) => `${s.name} ${s.surname}`)
                  .join(", ");
              };
              return (
                <>
                  <button
                    type="button"
                    className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] text-left flex items-center justify-between truncate"
                    onClick={() => setIsStudentsOpen((prev) => !prev)}
                  >
                    <span
                      className={
                        safeFieldValue.length > 0
                          ? "text-black"
                          : "text-gray-400"
                      }
                    >
                      {getDisplayText()}
                    </span>
                    <Image
                      src="/sort.png"
                      alt="dropdown icon"
                      width={12}
                      height={12}
                      className="flex-shrink-0"
                    />
                  </button>
                  {isStudentsOpen && (
                    <div className="top-full mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg z-10">
                      {/* ADDED: Search input field */}
                      <div className="p-2 border-b border-gray-200">
                        <input
                          type="text"
                          placeholder="ابحث عن تلميذ..."
                          className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onClick={(e) => e.stopPropagation()} // Prevent dropdown from closing on click
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {/* UPDATED: Map over the filtered list */}
                        {filteredStudents.map(
                          (student: {
                            id: string;
                            name: string;
                            surname: string;
                          }) => (
                            <label
                              key={student.id}
                              className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                checked={safeFieldValue.includes(student.id)}
                                onChange={(e) => {
                                  const selectedId = student.id;
                                  if (e.target.checked)
                                    field.onChange([
                                      ...safeFieldValue,
                                      selectedId,
                                    ]);
                                  else
                                    field.onChange(
                                      safeFieldValue.filter(
                                        (id) => id !== selectedId
                                      )
                                    );
                                }}
                              />
                              <span className="text-sm">
                                {student.name} {student.surname}
                              </span>
                            </label>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </>
              );
            }}
          />
          {errors.students?.message && (
            <p className="text-xs text-red-400">
              {errors.students.message.toString()}
            </p>
          )}
        </div>

        <CldUploadWidget
          uploadPreset="school"
          onSuccess={(result, { widget }) => {
            setImg(result.info);
            widget.close();
          }}
        >
          {({ open }) => (
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
          )}
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

export default ParentForm;
