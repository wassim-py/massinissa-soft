"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import InputField from "../InputField";
import Image from "next/image";
import {
  useActionState,
  Dispatch,
  SetStateAction,
  useEffect,
  useState,
  useRef,
  startTransition,
} from "react";
import { useRouter } from "next/navigation";
import { teacherSchema, TeacherSchema } from "@/lib/formValidationSchemas";
import { createTeacher, updateTeacher } from "@/lib/actions";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
import { splitFullName } from "@/lib/utils";

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
  const router = useRouter();
  const tTeachers = useTranslations("teachers");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  const splitResult = splitFullName(data?.name);
  const defaultLastName = data?.surname || splitResult.surname;
  const defaultFirstName = data?.surname ? (data?.name || "") : splitResult.name;

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<TeacherSchema>({
    resolver: zodResolver(teacherSchema),
    defaultValues: data
      ? {
          id: data.id,
          name: defaultFirstName,
          surname: defaultLastName,
          gender: data.gender || data.sex || "MALE",
          phone: data.phone ?? "",
          subjects: Array.isArray(data.subjects)
            ? data.subjects
                .map((s: any) =>
                  typeof s === "number"
                    ? s
                    : typeof s === "string" && !isNaN(Number(s))
                    ? Number(s)
                    : s && typeof s.id === "number"
                    ? s.id
                    : Number(s?.id)
                )
                .filter((id: any): id is number => typeof id === "number" && !isNaN(id))
            : [],
        }
      : {
          name: "",
          surname: "",
          gender: "MALE",
          phone: "",
          subjects: [],
        },
  });

  const [isSubjectsOpen, setIsSubjectsOpen] = useState(false);
  const subjectsDropdownRef = useRef<HTMLDivElement>(null);

  const initialState: FormState = { success: false, error: false, message: "" };
  const actionToRun = type === "create" ? createTeacher : updateTeacher;
  const [state, formAction, isPending] = useActionState<FormState, any>(actionToRun as any, initialState);

  const onSubmit = (formData: TeacherSchema) => {
    startTransition(() => {
      formAction(formData as any);
    });
  };

  useEffect(() => {
    if (state.success) {
      toast.success(
        state.message ||
          (type === "create"
            ? tTeachers("createdSuccessfully")
            : tTeachers("updatedSuccessfully"))
      );
      setOpen(false);
      startTransition(() => {
        router.refresh();
      });
    }
    if (state.error && state.message) {
      toast.error(state.message);
    }
  }, [state, type, setOpen, tTeachers, router]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        subjectsDropdownRef.current &&
        !subjectsDropdownRef.current.contains(event.target as Node)
      ) {
        setIsSubjectsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const { subjects } = relatedData || { subjects: [] };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)}>
      {type === "update" && (
        <input type="hidden" {...register("id")} defaultValue={data?.id} />
      )}
      <h2 className="text-section-title font-bold text-gray-900">
        {type === "create" ? tTeachers("createTitle") : tTeachers("updateTitle")}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Last Name / Family Name (اللقب) */}
        <InputField
          label={tTeachers("surname")}
          name="surname"
          register={register}
          error={errors.surname}
          placeholder={tTeachers("lastNamePlaceholder")}
          className="w-full"
        />

        {/* First Name / Name (الاسم) */}
        <InputField
          label={tTeachers("name")}
          name="name"
          register={register}
          error={errors.name}
          placeholder={tTeachers("firstNamePlaceholder")}
          className="w-full"
        />

        {/* Gender */}
        <div className="flex flex-col gap-1.5 w-full">
          <label className="text-form-label text-gray-700 select-none">{tTeachers("sex")}</label>
          <select
            className="w-full px-3 py-2 text-table-body rounded-lg border border-border bg-surface text-gray-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors h-[42px]"
            {...register("gender")}
            defaultValue={data?.gender || data?.sex || "MALE"}
          >
            <option value="MALE">{tTeachers("male")}</option>
            <option value="FEMALE">{tTeachers("female")}</option>
          </select>
          {errors.gender?.message && (
            <p className="text-form-helper text-danger font-medium">
              {errors.gender.message.toString()}
            </p>
          )}
        </div>

        {/* Phone (Optional) */}
        <InputField
          label={tTeachers("phone")}
          name="phone"
          register={register}
          error={errors.phone}
          placeholder={tTeachers("phonePlaceholder")}
          className="w-full"
        />

        {/* Subjects Dropdown */}
        <div
          className="flex flex-col gap-1.5 w-full sm:col-span-2 relative"
          ref={subjectsDropdownRef}
        >
          <label className="text-form-label text-gray-700 select-none">{tTeachers("subjects")}</label>
          <Controller
            name="subjects"
            control={control}
            render={({ field }) => {
              const safeFieldValue = Array.isArray(field.value) ? field.value : [];
              const selectedSubjectObjects = (subjects || []).filter((subject: any) =>
                safeFieldValue.includes(subject.id)
              );
              const getDisplayText = () => {
                if (selectedSubjectObjects.length === 0) return tTeachers("selectSubjects");
                if (selectedSubjectObjects.length <= 3) {
                  return selectedSubjectObjects.map((s: any) => s.name).join(", ");
                }
                const firstNames = selectedSubjectObjects.slice(0, 3).map((s: any) => s.name).join(", ");
                return `${firstNames}, ${tTeachers("andXMore", { count: selectedSubjectObjects.length - 3 })}`;
              };
              return (
                <>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-table-body rounded-lg border border-border bg-surface text-gray-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors h-[42px] text-left flex items-center justify-between truncate"
                    onClick={() => setIsSubjectsOpen((prev) => !prev)}
                  >
                    <span className={safeFieldValue.length > 0 ? "text-gray-900 font-medium" : "text-muted-light"}>
                      {getDisplayText()}
                    </span>
                    <Image
                      src="/sort.png"
                      alt="dropdown icon"
                      width={12}
                      height={12}
                      className="shrink-0 opacity-60"
                    />
                  </button>
                  {isSubjectsOpen && (
                    <div className="absolute top-full mt-1 w-full bg-surface border border-border rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                      {(subjects || []).length > 0 ? (
                        subjects.map((subject: { id: number; name: string }) => (
                          <label
                            key={subject.id}
                            className="flex items-center gap-2 p-2.5 hover:bg-surface-subtle cursor-pointer border-b border-border/50 last:border-b-0"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                              checked={safeFieldValue.includes(subject.id)}
                              onChange={(e) => {
                                const selectedId = subject.id;
                                if (e.target.checked) {
                                  field.onChange([...safeFieldValue, selectedId]);
                                } else {
                                  field.onChange(safeFieldValue.filter((id) => id !== selectedId));
                                }
                              }}
                            />
                            <span className="text-sm text-gray-800">{subject.name}</span>
                          </label>
                        ))
                      ) : (
                        <div className="p-3 text-xs text-muted text-center">
                          {tTeachers("noSubjectsTaught", { defaultValue: "Aucune matière disponible" })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            }}
          />
          {errors.subjects?.message && (
            <p className="text-form-helper text-danger font-medium">{errors.subjects.message.toString()}</p>
          )}
        </div>
      </div>

      {state?.error && !state.message && (
        <span className="text-red-500 text-xs">{tErrors("general")}</span>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={isPending}
        className="w-full mt-2"
      >
        {isPending
          ? type === "create"
            ? tTeachers("submittingCreate")
            : tTeachers("submittingUpdate")
          : type === "create"
          ? tCommon("create")
          : tCommon("edit")}
      </Button>
    </form>
  );
};

export default TeacherForm;
