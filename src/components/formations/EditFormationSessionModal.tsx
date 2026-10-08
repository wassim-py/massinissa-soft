"use client";

import { useState, useEffect } from "react";
import { updateFormationSession } from "@/lib/formationActions";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField, Input, Select } from "@/components/ui/FormField";
import { useTranslations, useLocale } from "next-intl";
import { Calendar, X } from "lucide-react";

const daysOfWeek = [
  "SATURDAY",
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
] as const;

function getInitialDay(startsAt: Date | string): string {
  try {
    const d = new Date(startsAt);
    const dayStr = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: "Africa/Algiers",
    }).format(d).toUpperCase();
    if (daysOfWeek.includes(dayStr as any)) return dayStr;
    return "SATURDAY";
  } catch {
    return "SATURDAY";
  }
}

function getInitialTime(dateVal: Date | string, fallback: string): string {
  try {
    const d = new Date(dateVal);
    return d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Algiers",
    });
  } catch {
    return fallback;
  }
}

export default function EditFormationSessionModal({
  isOpen,
  onClose,
  session,
  classId,
  className,
  classrooms,
  teachers,
  defaultTeacherId,
  onSessionUpdated,
}: {
  isOpen: boolean;
  onClose: () => void;
  session: {
    id: number;
    startsAt: Date | string;
    endsAt: Date | string;
    teacher?: { id: string; name: string } | null;
    classroom?: { id: number; name: string } | null;
  } | null;
  classId: number;
  className?: string;
  classrooms: Array<{ id: number; name: string }>;
  teachers: Array<{ id: string; name: string }>;
  defaultTeacherId?: string | null;
  onSessionUpdated?: () => void;
}) {
  const t = useTranslations("formations");
  const tLessons = useTranslations("lessons");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const getDayTranslation = (d: string) => {
    const keyMap: Record<string, string> = {
      SATURDAY: "days.saturday",
      SUNDAY: "days.sunday",
      MONDAY: "days.monday",
      TUESDAY: "days.tuesday",
      WEDNESDAY: "days.wednesday",
      THURSDAY: "days.thursday",
      FRIDAY: "days.friday",
    };
    return tLessons(keyMap[d] as any);
  };

  const [day, setDay] = useState<string>("SATURDAY");
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("16:00");
  const [classroomId, setClassroomId] = useState<number>(classrooms[0]?.id || 1);
  const [teacherId, setTeacherId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (session) {
      setDay(getInitialDay(session.startsAt));
      setStartTime(getInitialTime(session.startsAt, "14:00"));
      setEndTime(getInitialTime(session.endsAt, "16:00"));
      setClassroomId(session.classroom?.id || classrooms[0]?.id || 1);
      setTeacherId(session.teacher?.id || defaultTeacherId || teachers[0]?.id || "");
    }
  }, [session, classrooms, teachers, defaultTeacherId]);

  if (!isOpen || !session) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!day || !startTime || !endTime) {
      toast.error(
        locale === "ar"
          ? "يرجى تحديد اليوم وأوقات الحصة."
          : "Veuillez sélectionner le jour et les horaires de la séance."
      );
      return;
    }

    if (startTime >= endTime) {
      toast.error(
        locale === "ar"
          ? "وقت نهاية الحصة يجب أن يكون بعد وقت البداية."
          : "L'heure de fin doit être postérieure à l'heure de début."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await updateFormationSession({
        sessionId: session.id,
        classId,
        day,
        startTime,
        endTime,
        classroomId: Number(classroomId),
        teacherId: teacherId || undefined,
      });

      if (res.success) {
        toast.success(res.message);
        if (onSessionUpdated) onSessionUpdated();
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(
        err?.message ||
          (locale === "ar" ? "فشل في تعديل الحصة." : "Échec de la modification de la séance.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-border animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-surface-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-section-title font-bold text-gray-900">
                {t("editSessionModalTitle")}
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
          <FormField label={tLessons("dayLabel")} required>
            <Select
              value={day}
              onChange={(e) => setDay(e.target.value)}
              required
            >
              {daysOfWeek.map((d) => (
                <option key={d} value={d}>
                  {getDayTranslation(d)}
                </option>
              ))}
            </Select>
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
              {teachers.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.name}
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
              {isSubmitting ? t("saving") : t("editSession")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
