"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { registerParticipantSchema, RegisterParticipantSchema } from "@/lib/formValidationSchemas";
import {
  registerParticipant,
  updateWorkshopParticipant,
  searchStudentsForWorkshopAction,
} from "@/lib/actions";

import { useActionState, Dispatch, SetStateAction, useEffect, useState, startTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";

type FormSchema = RegisterParticipantSchema & { id?: number };

type StudentSuggestion = {
  id: string;
  name: string;
  phone: string | null;
  sex: string;
  globalNumber?: number | null;
  registeredBranch?: { name: string } | null;
};

const WorkshopParticipantForm = ({
  type,
  workshopId,
  data,
  setOpen,
}: {
  type: "create" | "update";
  workshopId: number;
  data?: any;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) => {
  const router = useRouter();
  const locale = useLocale();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<StudentSuggestion[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentSuggestion | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormSchema>({
    resolver: zodResolver(registerParticipantSchema),
    defaultValues: {
        ...data,
        studentId: data?.studentId || undefined,
        name: data?.Student?.name || data?.name || "",
        phone: data?.Student?.phone || data?.phone || "",
        gender: data?.gender || "MALE",
        workshopId: workshopId,
    },
  });

  useEffect(() => {
    if (type !== "create" || selectedStudent) return;
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchStudentsForWorkshopAction(trimmed);
        setSuggestions(res as StudentSuggestion[]);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, type, selectedStudent]);

  const handleSelectExistingStudent = (stu: StudentSuggestion) => {
    setSelectedStudent(stu);
    setValue("studentId", stu.id);
    setValue("name", stu.name, { shouldValidate: true });
    setValue("phone", stu.phone || "", { shouldValidate: true });
    if (stu.sex === "MALE" || stu.sex === "FEMALE") {
      setValue("gender", stu.sex, { shouldValidate: true });
    }
    setSearchQuery("");
    setSuggestions([]);
  };

  const handleClearExistingStudent = () => {
    setSelectedStudent(null);
    setValue("studentId", undefined);
    setValue("name", "");
    setValue("phone", "");
  };

  const actionToRun = type === "create" ? registerParticipant : updateWorkshopParticipant;
  const [state, formAction, isPending] = useActionState(actionToRun, { success: false, error: false, message: "" });

  const onSubmit = (formData: FormSchema) => {
    setIsSubmitting(true);
    const payload = {
        ...formData,
        ...(type === 'update' && { id: data.id }),
    };
    startTransition(() => {
      formAction(payload as any);
    });
  };

  useEffect(() => {
    if (state.success || state.error) {
      setIsSubmitting(false);
    }
    if (state?.success) {
      toast.success(state.message);
      setOpen(false);
      startTransition(() => {
        router.refresh();
      });
    }
    if (state?.error && state.message) {
      toast.error(state.message);
    }
  }, [state, setOpen, router]);

  const t = useTranslations("workshops");
  const tCommon = useTranslations("common");

  return (
    <form className="flex flex-col gap-6 p-4 font-sans" onSubmit={handleSubmit(onSubmit)}>
      <h1 className="text-section-title font-bold text-gray-900">
        {type === "create" ? t("participantFormCreate") : t("participantFormUpdate")}
      </h1>

      <div className="flex flex-col gap-4">
        {type === "update" && <input type="hidden" {...register("id")} />}
        <input type="hidden" {...register("workshopId")} />
        <input type="hidden" {...register("studentId")} />

        {type === "create" && (
          <div className="flex flex-col gap-1.5 bg-blue-50/60 p-3 rounded-lg border border-blue-200">
            <label className="text-xs font-semibold text-blue-900">
              {locale === "ar" ? "ربط بتلميذ مسجل مسبقاً (اختياري)" : "Lier à un élève existant (optionnel)"}
            </label>
            {selectedStudent ? (
              <div className="flex items-center justify-between bg-white px-3 py-2 rounded border border-blue-300 text-xs">
                <span className="font-semibold text-gray-800">
                  {selectedStudent.name} {selectedStudent.phone ? `(${selectedStudent.phone})` : ""}
                </span>
                <button
                  type="button"
                  onClick={handleClearExistingStudent}
                  className="text-red-600 font-bold hover:underline"
                >
                  {locale === "ar" ? "إلغاء الربط" : "Détacher"}
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={locale === "ar" ? "ابحث بالاسم أو الهاتف..." : "Rechercher par nom ou téléphone..."}
                  className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-xs w-full bg-white"
                />
                {isSearching && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    {locale === "ar" ? "جاري البحث..." : "Recherche..."}
                  </p>
                )}
                {suggestions.length > 0 && (
                  <ul className="mt-1 max-h-40 overflow-y-auto bg-white border border-gray-200 rounded-md divide-y shadow-sm">
                    {suggestions.map((stu) => (
                      <li key={stu.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectExistingStudent(stu)}
                          className="w-full text-start px-3 py-2 text-xs hover:bg-blue-50 flex items-center justify-between"
                        >
                          <span className="font-semibold text-gray-800">{stu.name}</span>
                          <span className="text-gray-500">{stu.phone || stu.registeredBranch?.name || ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
        
        <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-500">{t("fullNameLabel")}</label>
            <input {...register("name")} className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]" />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-500">{t("genderLabel")}</label>
            <select
              {...register("gender")}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] bg-white text-gray-800"
              defaultValue={data?.gender || "MALE"}
            >
              <option value="MALE">{t("male")}</option>
              <option value="FEMALE">{t("female")}</option>
            </select>
            {errors.gender && <p className="text-xs text-red-400">{errors.gender.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-500">{t("phoneLabel")}</label>
            <input {...register("phone")} className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]" />
            {errors.phone && <p className="text-xs text-red-400">{errors.phone.message}</p>}
        </div>

        {type === 'create' && (
            <div className="border-t pt-4 mt-2 space-y-4">
                 <p className="text-sm font-medium text-gray-600">{t("initialPaymentTitle")}</p>
                 <div className="flex flex-col gap-2 w-full">
                    <label className="text-xs text-gray-500">{t("paidAmountLabel")}</label>
                    <input
                        type="number"
                        step="any"
                        {...register("amount")}
                        className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
                    />
                    {errors.amount && <p className="text-xs text-red-400">{errors.amount.message}</p>}
                </div>
                 <div className="flex flex-col gap-2">
                    <label className="text-xs text-gray-500">{t("notesLabel")}</label>
                    <textarea {...register("notes")} rows={2} className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full" placeholder={t("notesPlaceholder")} />
                </div>
            </div>
        )}
      </div>

      {state?.error && !state.message && <span className="text-red-500">Error</span>}
      <Button 
        type="submit" 
        variant="primary"
        size="lg"
        disabled={isSubmitting || isPending}
        className="w-full"
      >
        {isSubmitting || isPending ? (type === 'create' ? t("submittingCreate") : t("submittingUpdate")) : (type === 'create' ? tCommon("create") : tCommon("update"))}
      </Button>
    </form>
  );
};

export default WorkshopParticipantForm;
