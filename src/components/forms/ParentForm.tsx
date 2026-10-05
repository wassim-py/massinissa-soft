"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import Image from "next/image";
import {
  useActionState,
  Dispatch,
  SetStateAction,
  useEffect,
  useState,
  useRef,
  useMemo,
  startTransition,
} from "react";
import { useRouter } from "next/navigation";
import { parentSchema, ParentSchema } from "@/lib/formValidationSchemas";
import { splitFullName } from "@/lib/utils";

import { createParent, updateParent } from "@/lib/actions";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";
import { useTranslations, useLocale } from "next-intl";

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
  const router = useRouter();
  const tParents = useTranslations("parents");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const locale = useLocale();

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    watch,
    setValue,
  } = useForm<ParentSchema>({
    resolver: zodResolver(parentSchema),
    defaultValues: data
      ? {
          id: data.id ? String(data.id) : undefined,
          name: data.name ?? "",
          payerStudentId:
            data.payerStudentId ||
            (data.students?.[0]?.id || data.students?.[0] || undefined),
          discountPercentage:
            data.discountPercentage != null ? Number(data.discountPercentage) : 50,
          students:
            data.students?.map((s: any) => (typeof s === "object" ? s.id : s)) || [],
        }
      : {
          name: "",
          payerStudentId: undefined,
          discountPercentage: 50,
          students: [],
        },
  });

  const [isStudentsOpen, setIsStudentsOpen] = useState(false);
  const studentsDropdownRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const isNameManuallyEdited = useRef(Boolean(data?.name));

  const { students = [] } = relatedData || {};

  const getStudentFamilyName = (s: any): string => {
    if (!s) return "";
    if (s.surname && s.surname.trim()) return s.surname.trim();
    const raw = s.fullName || s.name || "";
    const split = splitFullName(raw);
    return split.surname || raw;
  };

  const formatStudent = (s: any): string => {
    if (!s) return "";
    if (s.fullName) return s.fullName;
    if (s.surname && s.name) return `${s.surname} ${s.name}`;
    return s.name || s.surname || "";
  };

  const watchedStudents = watch("students") || [];
  const currentPayerId = watch("payerStudentId");

  const selectedStudentsList = useMemo(() => {
    if (!Array.isArray(watchedStudents)) return [];
    return students.filter((s: any) => watchedStudents.includes(s.id));
  }, [watchedStudents, students]);

  const handleToggleStudent = (
    studentId: string,
    currentSelected: string[],
    onChange: (val: string[]) => void
  ) => {
    const isSelected = currentSelected.includes(studentId);
    const newSelected = isSelected
      ? currentSelected.filter((id) => id !== studentId)
      : [...currentSelected, studentId];

    onChange(newSelected);

    // Update payerStudentId synchronously on user action
    let nextPayer = currentPayerId;
    if (newSelected.length > 0) {
      if (!currentPayerId || !newSelected.includes(currentPayerId)) {
        nextPayer = newSelected[0];
        setValue("payerStudentId", nextPayer);
      }
    } else {
      nextPayer = undefined;
      setValue("payerStudentId", null);
    }

    // Auto-fetch family name directly from the selected student's family name
    if (!isNameManuallyEdited.current) {
      if (newSelected.length > 0) {
        const primaryStudent =
          students.find((s: any) => s.id === nextPayer) ||
          students.find((s: any) => s.id === newSelected[0]);
        const detectedLastName = getStudentFamilyName(primaryStudent);
        if (detectedLastName) {
          setValue("name", detectedLastName, { shouldValidate: true });
        }
      } else if (type === "create") {
        setValue("name", "", { shouldValidate: true });
      }
    }
  };

  const initialState: FormState = { success: false, error: false, message: "" };
  const actionToRun = type === "create" ? createParent : updateParent;
  const [state, formAction, isPending] = useActionState(actionToRun, initialState);

  const onSubmit = (formData: ParentSchema) => {
    let finalName = (formData.name || "").trim();
    if (!finalName && selectedStudentsList.length > 0) {
      const primaryStudent =
        selectedStudentsList.find((s: any) => s.id === formData.payerStudentId) ||
        selectedStudentsList[0];
      finalName = getStudentFamilyName(primaryStudent);
    }
    startTransition(() => {
      formAction({
        ...formData,
        name: finalName,
      } as any);
    });
  };

  useEffect(() => {
    if (state.success) {
      toast.success(
        state.message ||
          (type === "create"
            ? tParents("createdSuccessfully")
            : tParents("updatedSuccessfully"))
      );
      setOpen(false);
      startTransition(() => {
        router.refresh();
      });
    }
    if (state.error && state.message) {
      toast.error(state.message);
    }
  }, [state, type, setOpen, tParents, router]);

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

  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return students;
    const term = searchTerm.toLowerCase();
    return students.filter((student: any) => {
      const formatted = formatStudent(student).toLowerCase();
      return formatted.includes(term);
    });
  }, [students, searchTerm]);

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)}>
      {type === "update" && (
        <input type="hidden" {...register("id")} defaultValue={data?.id} />
      )}
      <h1 className="text-section-title font-bold text-gray-900">
        {type === "create" ? tParents("createTitle") : tParents("updateTitle")}
      </h1>

      <span className="text-xs text-gray-400 font-medium">
        {tParents("personalInfo")}
      </span>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Custom multi-select dropdown for students */}
        <div
          className="flex flex-col gap-2 w-full relative"
          ref={studentsDropdownRef}
        >
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-700 font-semibold">
              {tParents("students")} <span className="text-red-500">*</span>
            </label>
            {selectedStudentsList.length > 0 && (
              <span className="text-[11px] text-primary font-semibold">
                {selectedStudentsList.length} {locale === "ar" ? "تلميذ" : "élève(s)"}
              </span>
            )}
          </div>
          <Controller
            name="students"
            control={control}
            render={({ field }) => {
              const safeFieldValue = Array.isArray(field.value) ? field.value : [];
              const selectedStudentObjects = students.filter((student: any) =>
                safeFieldValue.includes(student.id)
              );
              const getDisplayText = () => {
                if (selectedStudentObjects.length === 0)
                  return tParents("selectStudents");
                if (selectedStudentObjects.length <= 2)
                  return selectedStudentObjects.map(formatStudent).join(", ");
                const firstTwoNames = selectedStudentObjects
                  .slice(0, 2)
                  .map(formatStudent)
                  .join(", ");
                return `${firstTwoNames}, ${tParents("andXMore", {
                  count: selectedStudentObjects.length - 2,
                })}`;
              };

              return (
                <>
                  <button
                    type="button"
                    className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] text-left flex items-center justify-between truncate bg-white"
                    onClick={() => setIsStudentsOpen((prev) => !prev)}
                  >
                    <span
                      className={
                        safeFieldValue.length > 0 ? "text-gray-900 font-medium truncate" : "text-gray-400 truncate"
                      }
                    >
                      {getDisplayText()}
                    </span>
                    <Image
                      src="/sort.png"
                      alt="dropdown icon"
                      width={12}
                      height={12}
                      className="shrink-0 ms-2"
                    />
                  </button>
                  {isStudentsOpen && (
                    <div className="absolute top-full mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg z-20 max-h-60 flex flex-col">
                      <div className="p-2 border-b border-gray-200">
                        <input
                          type="text"
                          placeholder={tParents("searchStudentPlaceholder")}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="overflow-y-auto">
                        {filteredStudents.length > 0 ? (
                          filteredStudents.map((student: any) => (
                            <label
                              key={student.id}
                              className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                checked={safeFieldValue.includes(student.id)}
                                onChange={() =>
                                  handleToggleStudent(
                                    student.id,
                                    safeFieldValue,
                                    field.onChange
                                  )
                                }
                              />
                              <span className="text-sm text-gray-800">
                                {formatStudent(student)}
                              </span>
                            </label>
                          ))
                        ) : (
                          <p className="p-2 text-sm text-gray-500">
                            {tParents("noStudentsFound")}
                          </p>
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

        {/* Family Name (auto-fetched directly from the student's family name / last name) */}
        <div className="flex flex-col gap-2 w-full">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-700 font-semibold">
              {tParents("name")} <span className="text-red-500">*</span>
            </label>
            {selectedStudentsList.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const primary =
                    selectedStudentsList.find((s: any) => s.id === currentPayerId) ||
                    selectedStudentsList[0];
                  const last = getStudentFamilyName(primary);
                  setValue("name", last, { shouldValidate: true });
                  isNameManuallyEdited.current = false;
                }}
                className="text-[11px] text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 font-medium"
              >
                {tParents("fetchFromStudent")}
              </button>
            )}
          </div>
          <input
            type="text"
            {...register("name", {
              onChange: () => {
                isNameManuallyEdited.current = true;
              },
            })}
            placeholder={
              locale === "ar"
                ? "يتم جلبه تلقائياً من لقب التلميذ..."
                : "Extrait automatiquement du nom de l'élève..."
            }
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          />
          <span className="text-[11px] text-gray-400">
            {tParents("familyNameHelper")}
          </span>
          {errors.name && (
            <p className="text-xs text-red-400">{errors.name.message}</p>
          )}
        </div>

        {/* Primary Payer Selector */}
        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-700 font-semibold">
            {locale === "ar"
              ? "التلميذ الدافع الرئيسي (كامل السعر)"
              : "Élève payeur principal (plein tarif)"}
          </label>
          <select
            {...register("payerStudentId", {
              onChange: (e) => {
                const newPayerId = e.target.value;
                if (!isNameManuallyEdited.current && newPayerId) {
                  const primaryStudent = students.find((s: any) => s.id === newPayerId);
                  const lastName = getStudentFamilyName(primaryStudent);
                  if (lastName) {
                    setValue("name", lastName, { shouldValidate: true });
                  }
                }
              },
            })}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {selectedStudentsList.length === 0 ? (
              <option value="">
                {locale === "ar"
                  ? "حدد التلاميذ أولاً"
                  : "Sélectionnez d'abord des élèves"}
              </option>
            ) : (
              selectedStudentsList.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {formatStudent(s)}
                </option>
              ))
            )}
          </select>
          {errors.payerStudentId && (
            <p className="text-xs text-red-400">{errors.payerStudentId.message}</p>
          )}
        </div>

        {/* Sibling Discount Percentage */}
        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-700 font-semibold">
            {locale === "ar" ? "نسبة تخفيض الإخوة (%)" : "Taux remise fratrie (%)"}
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              {...register("discountPercentage", { valueAsNumber: true })}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <span className="absolute end-3 top-2.5 text-xs text-gray-400 font-bold">%</span>
          </div>
          <span className="text-[11px] text-gray-400">
            {locale === "ar"
              ? "افتراضي: 50% (نصف السعر للإخوة)"
              : "Défaut : 50% (moitié prix fratrie)"}
          </span>
          {errors.discountPercentage && (
            <p className="text-xs text-red-400">{errors.discountPercentage.message}</p>
          )}
        </div>
      </div>

      {state?.error && !state.message && (
        <span className="text-red-500">{tErrors("general")}</span>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={isPending}
        className="w-full"
      >
        {isPending
          ? type === "create"
            ? tParents("submittingCreate")
            : tParents("submittingUpdate")
          : type === "create"
          ? tCommon("create")
          : tCommon("edit")}
      </Button>
    </form>
  );
};

export default ParentForm;
