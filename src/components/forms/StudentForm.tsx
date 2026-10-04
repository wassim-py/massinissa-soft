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
  startTransition,
} from "react";
import { useRouter } from "next/navigation";
import { getStudentSchema, StudentSchema } from "@/lib/formValidationSchemas";
import { createStudent, updateStudent, checkStudentDuplicateAction } from "@/lib/actions";
import { toast } from "react-toastify";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/Button";
import { X, Search, AlertTriangle, CreditCard, UserCheck, ShieldAlert } from "lucide-react";
import { splitFullName } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

type FormState = {
  success: boolean;
  error: boolean;
  message: string;
  student?: any;
};

const StudentForm = ({
  type,
  data,
  setOpen,
  relatedData,
  onSuccess,
  onSwitchToExisting,
}: {
  type: "create" | "update";
  data?: any;
  setOpen: Dispatch<SetStateAction<boolean>>;
  relatedData?: any;
  onSuccess?: (result?: any) => void;
  onSwitchToExisting?: (student: any) => void;
}) => {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const tCommon = useTranslations("common");
  const tStudents = useTranslations("students");
  const tErrors = useTranslations("errors");

  // Localized Zod schema for real-time validation messages in active language
  const schema = useMemo(() => getStudentSchema((key) => t(key as any)), [t]);

  const splitResult = splitFullName(data?.name);
  const defaultLastName = data?.surname || splitResult.surname;
  const defaultFirstName = data?.surname ? (data?.name || "") : splitResult.name;

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
          sex: data.sex || "MALE",
          gradeId: data.gradeId ? Number(data.gradeId) : undefined,
          registeredBranchId: data.registeredBranchId ? Number(data.registeredBranchId) : undefined,
          familyId: data.familyId ? Number(data.familyId) : undefined,
          ...data,
          name: defaultFirstName,
          surname: defaultLastName,
          phone: data.phone ?? "",
          address: data.address ?? "",
          classes: data.classes?.map((c: any) => (typeof c === "object" ? c.id : Number(c))) || [],
          parentPhoneNumbers: Array.isArray(data.parentPhoneNumbers)
            ? data.parentPhoneNumbers.map((p: any) => (typeof p === "string" ? p : p.phone))
            : [],
          birthday: data.birthday && !isNaN(new Date(data.birthday).getTime())
            ? new Date(data.birthday).toISOString().split("T")[0]
            : undefined,
        }
      : {
          name: "",
          surname: "",
          phone: "",
          address: "",
          sex: "MALE",
          parentPhoneNumbers: [],
          classes: [],
          birthday: undefined,
          familyId: undefined,
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

  const watchedName = watch("name");
  const watchedSurname = watch("surname");
  const watchedGradeId = watch("gradeId");

  const submitModeRef = useRef<"create" | "create_and_pay">("create");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSubmittingMode, setActiveSubmittingMode] = useState<"create" | "create_and_pay">("create");
  const [duplicateCandidates, setDuplicateCandidates] = useState<any[]>([]);
  const [duplicateBypassed, setDuplicateBypassed] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<StudentSchema | null>(null);

  // Debounced duplicate detection
  useEffect(() => {
    if (type !== "create") return;
    const cleanFirst = watchedName ? watchedName.trim() : "";
    const cleanLast = watchedSurname ? watchedSurname.trim() : "";

    if (cleanFirst.length < 2 || cleanLast.length < 2) {
      setDuplicateCandidates([]);
      return;
    }

    const timer = setTimeout(() => {
      checkStudentDuplicateAction({
        name: cleanFirst,
        surname: cleanLast,
        excludeStudentId: data?.id,
      }).then((res) => {
        if (res.hasDuplicate) {
          setDuplicateCandidates(res.duplicates);
        } else {
          setDuplicateCandidates([]);
        }
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [watchedName, watchedSurname, type, data?.id]);

  const [isClassesOpen, setIsClassesOpen] = useState(false);
  const [classSearchTerm, setClassSearchTerm] = useState("");
  const classesDropdownRef = useRef<HTMLDivElement>(null);

  const executeStudentSubmit = async (
    formData: StudentSchema,
    mode: "create" | "create_and_pay"
  ) => {
    setIsSubmitting(true);
    setActiveSubmittingMode(mode);
    try {
      const initialState = { success: false, error: false, message: "" };
      const res = await (type === "create"
        ? createStudent(initialState, formData)
        : updateStudent(initialState, formData));

      if (res.success) {
        toast.success(
          res.message ||
            (type === "create"
              ? tStudents("createdSuccess")
              : tStudents("updatedSuccess"))
        );
        const andPay = mode === "create_and_pay";
        const selectedClassId = formData.classes && formData.classes.length > 0 ? Number(formData.classes[0]) : null;
        const targetClass = selectedClassId ? classes.find((c: any) => Number(c.id) === selectedClassId) : null;

        if (andPay && !selectedClassId) {
          toast.warning(
            locale === "ar"
              ? "تنبيه: يجب اختيار فوج دراسي لفتح نافذة الدفع مباشرة"
              : "Veuillez sélectionner au moins un groupe pour ouvrir le paiement direct"
          );
        }

        if (onSuccess) {
          onSuccess({
            ...res,
            andPay: andPay && Boolean(targetClass),
            student: (res as any).student,
            classData: targetClass,
          });
        } else {
          setOpen(false);
          startTransition(() => {
            router.refresh();
          });
        }
      } else {
        toast.error(res.message || tErrors("general"));
      }
    } catch (err: any) {
      toast.error(err?.message || tErrors("general"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = (formData: StudentSchema) => {
    const mode = submitModeRef.current;
    if (
      type === "create" &&
      duplicateCandidates.length > 0 &&
      !duplicateBypassed
    ) {
      setPendingFormData(formData);
      setShowDuplicateModal(true);
      return;
    }

    executeStudentSubmit(formData, mode);
  };

  const handleConfirmDuplicateBypass = () => {
    setDuplicateBypassed(true);
    setShowDuplicateModal(false);
    if (pendingFormData) {
      executeStudentSubmit(pendingFormData, submitModeRef.current);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        classesDropdownRef.current &&
        !classesDropdownRef.current.contains(event.target as Node)
      ) {
        setIsClassesOpen(false);
        setClassSearchTerm("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const { grades = [], classes = [], families = [] } = relatedData || {};

  const filteredClasses = useMemo(() => {
    let list = classes;
    if (watchedGradeId) {
      list = list.filter(
        (c: any) => !c.levelId || Number(c.levelId) === Number(watchedGradeId)
      );
    }
    if (!classSearchTerm.trim()) return list;
    const term = classSearchTerm.toLowerCase().trim();
    return list.filter((c: any) => c.name.toLowerCase().includes(term));
  }, [classes, watchedGradeId, classSearchTerm]);

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(handleFormSubmit)}>
      {type === "update" && (
        <input type="hidden" {...register("id")} defaultValue={data?.id} />
      )}
      {data?.registeredBranchId && (
        <input
          type="hidden"
          {...register("registeredBranchId")}
          defaultValue={data.registeredBranchId}
        />
      )}

      <div className="flex flex-col gap-1">
        <h1 className="text-section-title font-bold text-start text-gray-900">
          {type === "create"
            ? data?.targetClassName
              ? (locale === "ar"
                  ? `تسجيل تلميذ في فوج ${data.targetClassName}`
                  : `Inscrire un élève dans ${data.targetClassName}`)
              : tStudents("createTitle")
            : tStudents("updateTitle")}
        </h1>
        {data?.targetClassName && (
          <p className="text-xs text-muted">
            {locale === "ar"
              ? `سيتم تسجيل التلميذ وإضافته مباشرة إلى هذا الفوج`
              : `L'élève sera inscrit et ajouté directement à ce groupe`}
          </p>
        )}
      </div>

      {/* PERSONAL INFO SECTION */}
      <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
        {tStudents("personalInfo")}
      </span>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label={tStudents("surname")}
          name="surname"
          register={register}
          error={errors.surname}
        />
        <InputField
          label={tStudents("name")}
          name="name"
          register={register}
          error={errors.name}
        />

        {/* Live Duplicate Warning Banner */}
        {duplicateCandidates.length > 0 && !duplicateBypassed && (
          <div className="w-full p-3 bg-amber-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-950 shadow-2xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <p className="font-bold">
                  {locale === "ar"
                    ? `تنبيه: يوجد تلميذ مسجل بنفس الاسم: #${duplicateCandidates[0].globalNumber} ${duplicateCandidates[0].name}`
                    : `Attention : Un élève avec ce nom existe déjà : #${duplicateCandidates[0].globalNumber} ${duplicateCandidates[0].name}`}
                </p>
                <p className="text-[11px] text-amber-800">
                  {locale === "ar"
                    ? `الفرع: ${duplicateCandidates[0].branchName} • الهاتف: ${duplicateCandidates[0].phone || "غير محدد"}`
                    : `Siège : ${duplicateCandidates[0].branchName} • Tél : ${duplicateCandidates[0].phone || "Non renseigné"}`}
                </p>
              </div>
            </div>
            {onSwitchToExisting && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onSwitchToExisting(duplicateCandidates[0])}
                className="bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-900 font-bold shrink-0 self-end sm:self-center"
              >
                {locale === "ar" ? "تسجيل هذا التلميذ" : "Inscrire cet élève"}
              </Button>
            )}
          </div>
        )}

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

        {/* GRADE SELECT WITH REVERSE FILTERING */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">{tStudents("grade")}</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] bg-white text-gray-700"
            {...register("gradeId", {
              onChange: (e) => {
                const newGradeId = e.target.value ? Number(e.target.value) : undefined;
                if (newGradeId) {
                  const currentClasses = watch("classes") || [];
                  const validClasses = currentClasses.filter((cid: number) => {
                    const cls = classes.find((c: any) => c.id === cid);
                    return !cls || !cls.levelId || Number(cls.levelId) === Number(newGradeId);
                  });
                  if (validClasses.length !== currentClasses.length) {
                    setValue("classes", validClasses);
                  }
                }
              },
            })}
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
                    <div className="absolute top-full mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg z-20 flex flex-col max-h-60 overflow-hidden">
                      {watchedGradeId && (
                        <div className="px-2.5 py-1.5 bg-blue-50 text-blue-800 text-[11px] font-semibold border-b border-blue-100 flex items-center justify-between">
                          <span>
                            {locale === "ar"
                              ? `أفواج المستوى المحدد (${filteredClasses.length})`
                              : `Groupes de ce niveau (${filteredClasses.length})`}
                          </span>
                        </div>
                      )}
                      {/* Search bar for classes */}
                      <div className="p-2 border-b border-gray-200 sticky top-0 bg-white z-10">
                        <div className="relative flex items-center">
                          <Search className="w-3.5 h-3.5 text-gray-400 absolute start-2 pointer-events-none" />
                          <input
                            type="text"
                            placeholder={locale === "ar" ? "بحث عن فوج..." : "Rechercher un groupe..."}
                            className="w-full ps-7 pe-7 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                            value={classSearchTerm}
                            onChange={(e) => setClassSearchTerm(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                          {classSearchTerm && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setClassSearchTerm("");
                              }}
                              className="absolute end-1.5 text-gray-400 hover:text-gray-600 p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="overflow-y-auto max-h-48 divide-y divide-gray-100">
                        {filteredClasses.length > 0 ? (
                          filteredClasses.map((classItem: { id: number; name: string; levelId?: number }) => (
                            <label
                              key={classItem.id}
                              className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer text-xs"
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                checked={safeFieldValue.includes(classItem.id)}
                                onChange={(e) => {
                                  const selectedId = classItem.id;
                                  if (e.target.checked) {
                                    field.onChange([...safeFieldValue, selectedId]);
                                    if (classItem.levelId) {
                                      setValue("gradeId", Number(classItem.levelId), { shouldValidate: true });
                                    }
                                  } else {
                                    field.onChange(
                                      safeFieldValue.filter((id: number) => id !== selectedId)
                                    );
                                  }
                                }}
                              />
                              <span className="text-gray-700 font-medium">
                                {classItem.name}
                              </span>
                            </label>
                          ))
                        ) : (
                          <p className="p-3 text-center text-xs text-gray-400">
                            {locale === "ar" ? "لم يتم العثور على أي فوج" : "Aucun groupe trouvé"}
                          </p>
                        )}
                      </div>
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

        {/* FAMILY (SIBLING DISCOUNT GROUP) SELECT */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 font-medium">
            {locale === "ar" ? "العائلة / خصم الإخوة (اختياري)" : "Famille / Remise fratrie (Optionnel)"}
          </label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] bg-white text-gray-700"
            {...register("familyId")}
          >
            <option value="">
              {locale === "ar" ? "-- بدون عائلة (سعر عادي 100%) --" : "-- Aucune famille (Plein tarif) --"}
            </option>
            {families.map((fam: any) => (
              <option value={fam.id} key={fam.id}>
                {fam.name} {fam.studentNames ? `(${fam.studentNames})` : ""} - {fam.discountPercentage}%
              </option>
            ))}
          </select>
          {errors.familyId?.message && (
            <p className="text-xs text-red-400">
              {errors.familyId.message.toString()}
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
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dual action buttons or update button */}
      {type === "create" ? (
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full mt-2">
          <Button
            type="submit"
            variant="outline"
            size="lg"
            disabled={isSubmitting}
            isLoading={isSubmitting && activeSubmittingMode === "create"}
            className="w-full sm:flex-1"
            onClick={() => {
              submitModeRef.current = "create";
            }}
          >
            {isSubmitting && activeSubmittingMode === "create"
              ? tStudents("submittingCreate")
              : tCommon("create")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={isSubmitting}
            isLoading={isSubmitting && activeSubmittingMode === "create_and_pay"}
            className="w-full sm:flex-1 bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white"
            onClick={() => {
              submitModeRef.current = "create_and_pay";
            }}
            leftIcon={<CreditCard className="w-4 h-4" />}
          >
            {isSubmitting && activeSubmittingMode === "create_and_pay"
              ? tStudents("submittingCreate")
              : locale === "ar"
              ? "تسجيل ودفع وصل"
              : "Inscrire et Payer"}
          </Button>
        </div>
      ) : (
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={isSubmitting}
          isLoading={isSubmitting}
          className="w-full mt-2"
          onClick={() => {
            submitModeRef.current = "create";
          }}
        >
          {isSubmitting ? tStudents("submittingUpdate") : tCommon("edit")}
        </Button>
      )}

      {/* Duplicate Confirmation Modal */}
      {showDuplicateModal && duplicateCandidates.length > 0 && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4 font-sans">
          <div className="bg-surface rounded-xl border border-border shadow-2xl p-5 sm:p-6 max-w-lg w-full space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-amber-700">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h3 className="font-bold text-base text-gray-900">
                  {locale === "ar"
                    ? "تنبيه: تلميذ مسجل بنفس الاسم مسبقاً"
                    : "Attention : Élève avec le même nom détecté"}
                </h3>
                <p className="text-xs text-muted">
                  {locale === "ar"
                    ? "تم العثور على تلميذ مسجل بنفس الاسم واللقب في قاعدة البيانات"
                    : "Un élève portant le même nom et prénom est déjà enregistré."}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs space-y-1.5 text-amber-950">
              <div className="flex items-center gap-2 font-bold text-sm">
                <span>#{duplicateCandidates[0].globalNumber}</span>
                <span>{duplicateCandidates[0].name}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-muted">
                <span>{duplicateCandidates[0].branchName}</span>
                {duplicateCandidates[0].phone && <span>• {duplicateCandidates[0].phone}</span>}
                {duplicateCandidates[0].classes?.length > 0 && (
                  <span>
                    •{" "}
                    {locale === "ar"
                      ? `الأفواج: ${duplicateCandidates[0].classes.join(", ")}`
                      : `Groupes : ${duplicateCandidates[0].classes.join(", ")}`}
                  </span>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              {locale === "ar"
                ? "هل ترغب في تسجيل هذا التلميذ المسجل مسبقاً في هذا الفوج، أو تأكيد إنشاء تلميذ جديد تماماً يحمل نفس الاسم (حالة تشابه أسماء)؟"
                : "Souhaitez-vous inscrire cet élève existant dans ce groupe, ou confirmer la création d'un nouvel élève portant le même nom (homonyme) ?"}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowDuplicateModal(false)}
                className="w-full sm:w-auto"
              >
                {locale === "ar" ? "تعديل البيانات" : "Vérifier la saisie"}
              </Button>
              {onSwitchToExisting && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setShowDuplicateModal(false);
                    onSwitchToExisting(duplicateCandidates[0]);
                  }}
                  className="w-full sm:w-auto bg-primary text-white"
                >
                  {locale === "ar" ? "تسجيل التلميذ الموجود" : "Inscrire l'élève existant"}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleConfirmDuplicateBypass}
                className="w-full sm:w-auto text-amber-800 hover:bg-amber-50"
              >
                {locale === "ar" ? "تأكيد وإنشاء تلميذ جديد" : "Créer quand même"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
};

export default StudentForm;
