"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import InputField from "../InputField";
import { subjectSchema, SubjectSchema } from "@/lib/formValidationSchemas";
import { createSubject, updateSubject } from "@/lib/actions";
import { useActionState, Dispatch,
  SetStateAction,
  useEffect,
  useState,
  useRef, } from "react";
import { toast } from "react-toastify";
import Image from "next/image";

const SubjectForm = ({
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
  } = useForm<SubjectSchema>({
    resolver: zodResolver(subjectSchema),
    defaultValues: data
      ? {
          ...data,
          teachers: data.teachers?.map((t: any) => t.id) || [],
        }
      : {
          teachers: [],
        },
  });

  const initialState = {
    success: false,
    error: false,
    message: "",
  };

  const [state, formAction] = useActionState(
    type === "create" ? createSubject : updateSubject,
    initialState
  );

  const onSubmit = handleSubmit((formData) => {
    setIsSubmitting(true);
    formAction(formData);
  });

  const [isTeachersOpen, setIsTeachersOpen] = useState(false);
  const teachersDropdownRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    // When the action is complete (success or error), set pending back to false
    if (state.success || state.error) {
        setIsSubmitting(false);
    }
    if (state.success) {
      toast.success(
        state.message || `Subject has been ${type}d successfully!`
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
        teachersDropdownRef.current &&
        !teachersDropdownRef.current.contains(event.target as Node)
      ) {
        setIsTeachersOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const { teachers } = relatedData;

  const filteredTeachers = teachers.filter(
    (teacher: { name: string; surname: string }) =>
      `${teacher.name} ${teacher.surname}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
  );

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "انشاء مادة جديدة" : "تحديث المادة"}
      </h1>

      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="اسم المادة"
          name="name"
          register={register}
          error={errors?.name}
        />
        {type === "update" && (
          <input type="hidden" {...register("id")} defaultValue={data?.id} />
        )}

        {/* === START: CUSTOM MULTI-SELECT DROPDOWN FOR TEACHERS === */}
        {/* FIX: Changed md:w-1/4 to md:w-1/2 to make the dropdown wider */}
        <div
          className="flex flex-col gap-2 w-full md:w-1/2 relative"
          ref={teachersDropdownRef}
        >
          <label className="text-xs text-gray-500">الاساتذة</label>
          <Controller
            name="teachers"
            control={control}
            render={({ field }) => {
              const safeFieldValue = Array.isArray(field.value)
                ? field.value
                : [];
              const selectedTeacherObjects = teachers.filter((teacher: any) =>
                safeFieldValue.includes(teacher.id)
              );
              const getDisplayText = () => {
                if (selectedTeacherObjects.length === 0)
                  return "حدد استاذ (اساتذة)";
                return selectedTeacherObjects
                  .map((t: any) => `${t.name} ${t.surname}`)
                  .join(", ");
              };
              return (
                <>
                  <button
                    type="button"
                    className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] text-left flex items-center justify-between truncate"
                    onClick={() => setIsTeachersOpen((prev) => !prev)}
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
                  {isTeachersOpen && (
                    <div className="top-full mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg z-10">
                      <div className="p-2 border-b border-gray-200">
                        <input
                          type="text"
                          placeholder="ابحث عن استاذ..."
                          className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {filteredTeachers.map(
                          (teacher: {
                            id: string;
                            name: string;
                            surname: string;
                          }) => (
                            <label
                              key={teacher.id}
                              className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                checked={safeFieldValue.includes(teacher.id)}
                                onChange={(e) => {
                                  const selectedId = teacher.id;
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
                                {teacher.name} {teacher.surname}
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
          {errors.teachers?.message && (
            <p className="text-xs text-red-400">
              {errors.teachers.message.toString()}
            </p>
          )}
        </div>
        {/* === END: CUSTOM MULTI-SELECT DROPDOWN === */}
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

export default SubjectForm;
