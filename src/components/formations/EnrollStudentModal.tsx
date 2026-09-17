"use client";

import { useState } from "react";
import { enrollStudentInFormationGroup } from "@/lib/formationActions";
import { toast } from "react-toastify";
import { useTranslations, useLocale } from "next-intl";
import { FormField, Input, Select } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { X, UserPlus, Info } from "lucide-react";

export default function EnrollStudentModal({
  isOpen,
  onClose,
  formationClass,
  students,
}: {
  isOpen: boolean;
  onClose: () => void;
  formationClass: {
    id: number;
    name: string;
    branchName?: string;
    FormationLevel?: { name: string };
  };
  students: Array<{ id: string; name: string; phone?: string | null }>;
}) {
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [studentId, setStudentId] = useState(students[0]?.id || "");
  const [searchTerm, setSearchTerm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) {
      toast.error(locale === "ar" ? "يرجى اختيار التلميذ" : "Veuillez sélectionner un élève");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await enrollStudentInFormationGroup({
        studentId,
        classId: formationClass.id,
      });

      if (res.success) {
        toast.success(res.message);
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || (locale === "ar" ? "حدث خطأ ما" : "Une erreur est survenue"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-border animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-surface-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-section-title font-bold text-gray-900">
                {t("enrollStudentInGroup")}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="neutral" size="sm">
                  {formationClass.name}
                </Badge>
                {formationClass.FormationLevel?.name && (
                  <Badge variant="primary" size="sm">
                    {formationClass.FormationLevel.name}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-gray-800 transition-colors p-1.5 rounded-lg hover:bg-surface"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 font-sans">
          <FormField label={t("searchStudentPlaceholder")}>
            <Input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </FormField>

          <FormField
            label={t("selectStudentLabel")}
            required
            helperText={
              filteredStudents.length > 0
                ? `${filteredStudents.length} ${t("enrolledStudents", { count: filteredStudents.length })}`
                : undefined
            }
          >
            <Select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              size={Math.min(Math.max(filteredStudents.length + 1, 3), 6)}
              required
              className="font-sans"
            >
              {filteredStudents.length === 0 ? (
                <option disabled value="">
                  {t("noStudentFound")}
                </option>
              ) : (
                filteredStudents.map((s) => (
                  <option key={s.id} value={s.id} className="py-1 px-2">
                    {s.name} ({s.id}) {s.phone ? `• ${s.phone}` : ""}
                  </option>
                ))
              )}
            </Select>
          </FormField>

          <div className="flex items-start gap-2.5 bg-primary/5 border border-primary/20 rounded-xl p-3.5 text-xs text-primary leading-relaxed">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{t("inscriptionFeeNote")}</span>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !studentId}
              isLoading={isSubmitting}
              leftIcon={<UserPlus className="w-4 h-4" />}
            >
              {t("confirmEnroll")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
