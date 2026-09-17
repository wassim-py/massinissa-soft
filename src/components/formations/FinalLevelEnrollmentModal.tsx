"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { enrollGraduatedStudentsInNewFormation } from "@/lib/formationActions";
import { toast } from "react-toastify";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { CheckCircle2, GraduationCap, Check, Users } from "lucide-react";

interface FinalLevelEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  graduatedStudents: Array<{ id: string; name: string; phone?: string | null }>;
  availableFormations: Array<{
    id: number;
    name: string;
    levelName?: string;
    languageName?: string;
    price?: number;
  }>;
}

export default function FinalLevelEnrollmentModal({
  isOpen,
  onClose,
  graduatedStudents,
  availableFormations,
}: FinalLevelEnrollmentModalProps) {
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(
    graduatedStudents.map((s) => s.id)
  );
  const [selectedClassId, setSelectedClassId] = useState<number | null>(
    availableFormations[0]?.id || null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedStudentIds.length === graduatedStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(graduatedStudents.map((s) => s.id));
    }
  };

  const handleEnroll = async () => {
    if (!selectedClassId) {
      toast.error(
        locale === "ar"
          ? "يرجى اختيار التكوين المستهدف"
          : "Veuillez sélectionner la formation cible."
      );
      return;
    }

    if (selectedStudentIds.length === 0) {
      toast.error(
        locale === "ar"
          ? "يرجى تحديد تلميذ واحد على الأقل"
          : "Veuillez sélectionner au moins un élève."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await enrollGraduatedStudentsInNewFormation({
        studentIds: selectedStudentIds,
        targetClassId: selectedClassId,
      });

      if (res.success) {
        toast.success(res.message);
        onClose();
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xl">
              🎓
            </div>
            <div>
              <h2 className="text-base font-bold">
                {t("enrollInNewFormationTitle")}
              </h2>
              <p className="text-xs text-emerald-100">
                {t("selectedStudentsCount", { count: selectedStudentIds.length })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-xl font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 font-sans text-sm flex-1">
          <p className="text-xs text-gray-600 bg-emerald-50 border border-emerald-200 p-3 rounded-xl leading-relaxed">
            {t("enrollInNewFormationDesc")}
          </p>

          {/* Target Formation Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">
              {t("selectTargetFormation")}
            </label>
            {availableFormations.length === 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                {locale === "ar"
                  ? "لا توجد أفواج تكوينية أخرى نشطة حالياً."
                  : "Aucune autre formation active disponible actuellement."}
              </p>
            ) : (
              <select
                value={selectedClassId || ""}
                onChange={(e) => setSelectedClassId(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-primary outline-none bg-white font-medium"
              >
                {availableFormations.map((form) => (
                  <option key={form.id} value={form.id}>
                    {form.name}{" "}
                    {form.languageName ? `(${form.languageName})` : ""}{" "}
                    {form.price ? `• ${form.price} DZD` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Students Selection */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                {locale === "ar" ? "قائمة الخريجين المؤهلين :" : "Liste des diplômés :"}
              </span>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {selectedStudentIds.length === graduatedStudents.length
                  ? locale === "ar"
                    ? "إلغاء تحديد الكل"
                    : "Tout désélectionner"
                  : t("selectAll")}
              </button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {graduatedStudents.map((s) => {
                const isSelected = selectedStudentIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    onClick={() => toggleStudent(s.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50/50 text-emerald-900"
                        : "border-border hover:bg-surface-subtle text-gray-700"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                          isSelected
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "border-gray-300 bg-white"
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                      <span className="font-semibold text-xs">{s.name}</span>
                    </div>
                    {s.phone && (
                      <span className="text-[11px] text-gray-500 font-mono">
                        {s.phone}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-surface-subtle flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {tCommon("cancel")}
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={handleEnroll}
            isLoading={isSubmitting}
            disabled={availableFormations.length === 0 || selectedStudentIds.length === 0}
            leftIcon={<CheckCircle2 className="w-4 h-4" />}
            className="font-bold shadow-md"
          >
            {t("confirmEnrollInNew")}
          </Button>
        </div>
      </div>
    </div>
  );
}
