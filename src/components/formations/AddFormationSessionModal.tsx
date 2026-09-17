"use client";

import { useState } from "react";
import { addFormationSession } from "@/lib/formationActions";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField, Input, Select } from "@/components/ui/FormField";
import { useTranslations, useLocale } from "next-intl";
import { CalendarPlus, X } from "lucide-react";

export default function AddFormationSessionModal({
  isOpen,
  onClose,
  classId,
  className,
  branchId,
  classrooms,
  teachers,
  defaultTeacherId,
  onSessionAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  classId: number;
  className?: string;
  branchId: number;
  classrooms: Array<{ id: number; name: string }>;
  teachers: Array<{ id: string; name: string }>;
  defaultTeacherId?: string | null;
  onSessionAdded?: () => void;
}) {
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("16:00");
  const [classroomId, setClassroomId] = useState<number>(classrooms[0]?.id || 1);
  const [teacherId, setTeacherId] = useState<string>(defaultTeacherId || teachers[0]?.id || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!date || !startTime || !endTime) {
      toast.error(
        locale === "ar"
          ? "يرجى إدخال التاريخ وأوقات الحصة."
          : "Veuillez saisir la date et les horaires de la séance."
      );
      return;
    }

    const startsAt = new Date(`${date}T${startTime}:00`);
    const endsAt = new Date(`${date}T${endTime}:00`);

    if (endsAt <= startsAt) {
      toast.error(
        locale === "ar"
          ? "وقت نهاية الحصة يجب أن يكون بعد وقت البداية."
          : "L'heure de fin doit être postérieure à l'heure de début."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await addFormationSession({
        classId,
        startsAt,
        endsAt,
        classroomId: Number(classroomId),
        teacherId: teacherId || undefined,
      });

      if (res.success) {
        toast.success(res.message);
        if (onSessionAdded) onSessionAdded();
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(
        err?.message ||
          (locale === "ar" ? "فشل في برمجة الحصة." : "Échec de la planification de la séance.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-border animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-surface-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <CalendarPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-section-title font-bold text-gray-900">
                {t("addSessionModalTitle")}
              </h2>
              {className && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="primary" size="sm">
                    {className}
                  </Badge>
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <FormField label={t("sessionDateLabel")} required>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label={t("startTimeLabel")} required>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </FormField>
            <FormField label={t("endTimeLabel")} required>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </FormField>
          </div>

          <FormField label={t("roomLabel")} required>
            <Select
              value={classroomId}
              onChange={(e) => setClassroomId(Number(e.target.value))}
              required
            >
              {classrooms.map((cr) => (
                <option key={cr.id} value={cr.id}>
                  {cr.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label={t("teacherLabel", { name: "" })}>
            <Select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              <option value="">
                {locale === "ar"
                  ? "اختر الأستاذ (اختياري)"
                  : "Sélectionner un enseignant (facultatif)"}
              </option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="pt-4 border-t border-border flex justify-end gap-3 mt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              {isSubmitting ? t("saving") : t("addSession")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
