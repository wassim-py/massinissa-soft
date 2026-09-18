"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import InputField from "../InputField";
import {
  useActionState,
  Dispatch,
  SetStateAction,
  useEffect,
  useState,
  useRef,
  useMemo,
} from "react";
import { getStudentSchema, StudentSchema } from "@/lib/formValidationSchemas";
import { createStudent, updateStudent } from "@/lib/actions";
import { toast } from "react-toastify";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";

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
  const t = useTranslations();
  const tCommon = useTranslations("common");
  const tStudents = useTranslations("students");
  const tErrors = useTranslations("errors");

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Localized Zod schema for real-time validation messages in active language
  const schema = useMemo(() => getStudentSchema((key) => t(key as any)), [t]);

  const nameParts = data?.name ? data.name.trim().split(" ") : [];
  const defaultFirstName = data?.surname
    ? data.name
    : nameParts.length > 1
    ? nameParts.slice(0, -1).join(" ")
    : data?.name || "";
  const defaultLastName =
    data?.surname || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : "");

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    setValue,
    watch,
  } = useForm<StudentSchema>({
    resolver: zodResolver(schema),
    defaultValues: data
      ? {
          ...data,
          name: defaultFirstName,
          surname: defaultLastName,
          phone: data.phone ?? "",
          address: data.address ?? "",
          classes: data.classes?.map((c: any) => (typeof c === "object" ? c.id : c)) || [],
          parentPhoneNumbers: Array.isArray(data.parentPhoneNumbers)
            ? data.parentPhoneNumbers.map((p: any) => (typeof p === "string" ? p : p.phone))
            : [],
          birthday: data.birthday
            ? new Date(data.birthday).toISOString().split("T")[0]
            : undefined,
        }
      : {
          name: "",
          surname: "",
          phone: "",
          address: "",
          parentPhoneNumbers: [],
          classes: [],
          birthday: undefined,
        },
  });

  const parentPhones = watch("parentPhoneNumbers") || [];

  const handleAddParentPhone = () => {
    setValue("parentPhoneNumbers", [...parentPhones, ""], { shouldDirty: true });
  };

  const handleParentPhoneChange = (index: number, val: string) => {
    const updated = [...parentPhones];
    updated[index] = val;
    setValue("parentPhoneNumbers", updated, { shouldDirty: true });
  };

  const handleRemoveParentPhone = (index: number) => {
    const updated = parentPhones.filter((_, idx) => idx !== index);
    setValue("parentPhoneNumbers", updated, { shouldDirty: true });
  };

  const [isClassesOpen, setIsClassesOpen] = useState(false);
  const classesDropdownRef = useRef<HTMLDivElement>(null);

  const initialState: FormState = { success: false, error: false, message: "" };
  const actionToRun = type === "create" ? createStudent : updateStudent;
  const [state, formAction] = useActionState(actionToRun, initialState);

  const onSubmit = (formData: StudentSchema) => {
    setIsSubmitting(true);
    formAction(formData as any);
  };

  useEffect(() => {
    if (state.success || state.error) {
      setIsSubmitting(false);
    }
    if (state.success) {
      toast.success(
        state.message ||
          (type === "create"
            ? tStudents("createdSuccess")
            : tStudents("updatedSuccess"))
      );
      setOpen(false);
    }
    if (state.error && state.message) {
      toast.error(state.message || tErrors("general"));
    }
  }, [state, type, setOpen, tStudents, tErrors]);

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

  const { grades = [], classes = [] } = relatedData || {};

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)}>
      {type === "update" && (
        <input type="hidden" {...register("id")} defaultValue={data?.id} />
      )}

      <h1 className="text-section-title font-bold text-start text-gray-900">
        {type === "create"
          ? tStudents("createTitle")
          : tStudents("updateTitle")}
      </h1>

      {/* PERSONAL INFO SECTION */}
      <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
        {tStudents("personalInfo")}
      </span>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label={tStudents("name")}
          name="name"
          register={register}
          error={errors.name}
        />
        <InputField
          label={tStudents("surname")}
          name="surname"
          register={register}
          error={errors.surname}
        />
        <InputField
          label={tStudents("phone")}
          name="phone"
          register={register}
          error={errors.phone}
        />
        <InputField
          label={tStudents("address")}
          name="address"
          register={register}
          error={errors.address}
        />
        <InputField
          label={tStudents("birthday")}
          name="birthday"
          register={register}
          error={errors.birthday}
          type="date"
        />

        {/* GENDER SELECT */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">{tStudents("sex")}</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] bg-white text-gray-700"
            {...register("sex")}
          >
            <option value="MALE">{tStudents("male")}</option>
            <option value="FEMALE">{tStudents("female")}</option>
          </select>
          {errors.sex?.message && (
            <p className="text-xs text-red-400">
              {errors.sex.message.toString()}
            </p>
          )}
        </div>

        {/* GRADE SELECT */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">{tStudents("grade")}</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] bg-white text-gray-700"
            {...register("gradeId")}
          >
            <option value="">{tStudents("selectGrade")}</option>
            {grades.map((grade: { id: number; level?: string; name?: string }) => (
              <option value={grade.id} key={grade.id}>
                {grade.level || grade.name}
              </option>
            ))}
          </select>
          {errors.gradeId?.message && (
            <p className="text-xs text-red-400">
              {errors.gradeId.message.toString()}
            </p>
          )}
        </div>

        {/* CLASSES MULTI-SELECT DROPDOWN */}
        <div
          className="flex flex-col gap-2 w-full md:w-1/4 relative"
          ref={classesDropdownRef}
        >
          <label className="text-xs text-gray-500">{tStudents("classes")}</label>
          <Controller
            name="classes"
            control={control}
            render={({ field }) => {
              const safeFieldValue = Array.isArray(field.value)
                ? field.value
                : [];
              const selectedClassObjects = classes.filter((c: any) =>
                safeFieldValue.includes(c.id)
              );
              const getDisplayText = () => {
                if (selectedClassObjects.length === 0)
                  return tStudents("selectClass");
                if (selectedClassObjects.length <= 2)
                  return selectedClassObjects.map((c: any) => c.name).join(", ");
                const firstTwoNames = selectedClassObjects
                  .slice(0, 2)
                  .map((c: any) => c.name)
                  .join(", ");
                return `${firstTwoNames}, ${tStudents("andMore", {
                  count: (selectedClassObjects.length - 2).toString(),
                })}`;
              };

              return (
                <>
                  <button
                    type="button"
                    className="ring-[1.5px] ring-gray-300 px-3 py-2 rounded-md text-sm w-full h-[42px] flex items-center justify-between bg-white cursor-pointer hover:border-gray-400 transition-colors"
                    onClick={() => setIsClassesOpen((prev) => !prev)}
                  >
                    <span
                      className={`truncate text-start flex-1 min-w-0 me-2 ${
                        safeFieldValue.length > 0
                          ? "text-gray-800 font-medium"
                          : "text-gray-400"
                      }`}
                    >
                      {getDisplayText()}
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200 ${
                        isClassesOpen ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  {isClassesOpen && (
                    <div className="absolute top-full mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg z-20 max-h-48 overflow-y-auto">
                      {classes.map((classItem: { id: number; name: string }) => (
                        <label
                          key={classItem.id}
                          className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            checked={safeFieldValue.includes(classItem.id)}
                            onChange={(e) => {
                              const selectedId = classItem.id;
                              if (e.target.checked)
                                field.onChange([...safeFieldValue, selectedId]);
                              else
                                field.onChange(
                                  safeFieldValue.filter((id) => id !== selectedId)
                                );
                            }}
                          />
                          <span className="text-sm text-gray-700">
                            {classItem.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              );
            }}
          />
          {errors.classes?.message && (
            <p className="text-xs text-red-400">
              {errors.classes.message.toString()}
            </p>
          )}
        </div>
      </div>

      {/* PARENT PHONE NUMBERS SECTION (§7.2) */}
      <div className="flex flex-col gap-3 pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
            {tStudents("parentPhoneNumbers")}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddParentPhone}
            className="text-xs flex items-center gap-1"
          >
            + {tStudents("addParentPhoneNumber")}
          </Button>
        </div>
        {parentPhones.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            {tStudents("noParentPhonesAdded")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {parentPhones.map((phoneVal, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="tel"
                  value={phoneVal}
                  placeholder={tStudents("parentPhonePlaceholder")}
                  onChange={(e) => handleParentPhoneChange(index, e.target.value)}
                  className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm flex-1 h-[42px] bg-white text-gray-700 font-mono"
                  dir="ltr"
                />
                <Button
                  type="button"
                  variant="danger"
                  size="icon-sm"
                  onClick={() => handleRemoveParentPhone(index)}
                  title={tStudents("remove")}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {state?.error && !state.message && (
        <span className="text-red-500 text-sm font-medium">
          {tErrors("general")}
        </span>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={isSubmitting}
        className="w-full mt-2"
      >
        {isSubmitting
          ? type === "create"
            ? tStudents("submittingCreate")
            : tStudents("submittingUpdate")
          : type === "create"
          ? tCommon("create")
          : tCommon("edit")}
      </Button>
    </form>
  );
};

export default StudentForm;
