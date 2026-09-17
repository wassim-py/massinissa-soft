"use client";

import { useState } from "react";
import { saveFormationAttendance } from "@/lib/formationActions";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";
import { useTranslations, useLocale } from "next-intl";
import { ClipboardCheck, X } from "lucide-react";

type AttendanceStatus = "PRESENT" | "ABSENT";

export default function FormationAttendanceModal({
  isOpen,
  onClose,
  lesson,
  enrolledStudents,
  existingAttendance = [],
  onAttendanceSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  lesson: {
    id: number;
    startsAt: Date | string;
    endsAt: Date | string;
    classroom?: { name: string } | null;
    teacher?: { name: string } | null;
  };
  enrolledStudents: Array<{ id: string; name: string; phone?: string | null }>;
  existingAttendance?: Array<{ id: number; studentId: string; status: string }>;
  onAttendanceSaved?: () => void;
}) {
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(() => {
    const initial: Record<string, AttendanceStatus> = {};
    enrolledStudents.forEach((student) => {
      const rec = existingAttendance.find((a) => a.studentId === student.id);
      initial[student.id] = rec?.status === "PRESENT" ? "PRESENT" : "ABSENT";
    });
    return initial;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleToggle = (studentId: string, status: AttendanceStatus) => {
    setAttendance((prev) => ({
      ...prev,
      [studentId]: status,
    }));
  };

  const handleMarkAll = (status: AttendanceStatus) => {
    const updated: Record<string, AttendanceStatus> = {};
    enrolledStudents.forEach((s) => {
      updated[s.id] = status;
    });
    setAttendance(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await saveFormationAttendance(lesson.id, attendance);
      if (res.success) {
        toast.success(res.message);
        if (onAttendanceSaved) onAttendanceSaved();
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ أثناء حفظ الحضور.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const presentCount = Object.values(attendance).filter((s) => s === "PRESENT").length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-border animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-surface-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-success/10 text-success flex items-center justify-center shrink-0">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-section-title font-bold text-gray-900">
                {t("attendanceModalHeading")}
              </h2>
              <p className="text-xs text-muted font-mono mt-0.5" dir="ltr">
                {new Date(lesson.startsAt).toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                })}{" "}
                • {new Date(lesson.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                {new Date(lesson.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
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

        {/* BODY */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 font-sans">
          {/* QUICK TOGGLES */}
          <div className="flex items-center justify-between bg-surface-subtle p-3 rounded-xl border border-border">
            <span className="text-xs font-bold text-gray-700">
              {t("presentCount", { present: presentCount, total: enrolledStudents.length })}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleMarkAll("PRESENT")}
                className="text-[11px] font-bold text-success-text bg-success-light hover:bg-success-soft px-2.5 py-1 rounded-lg border border-success-soft transition-colors cursor-pointer"
              >
                {t("markAllPresent")}
              </button>
              <button
                type="button"
                onClick={() => handleMarkAll("ABSENT")}
                className="text-[11px] font-bold text-danger-text bg-danger-light hover:bg-danger-soft px-2.5 py-1 rounded-lg border border-danger-soft transition-colors cursor-pointer"
              >
                {t("markAllAbsent")}
              </button>
            </div>
          </div>

          {/* STUDENTS ROSTER */}
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {enrolledStudents.length === 0 ? (
              <p className="text-xs text-muted text-center py-6">
                {t("noStudentsEnrolled")}
              </p>
            ) : (
              enrolledStudents.map((student) => {
                const currentStatus = attendance[student.id] || "ABSENT";
                return (
                  <div
                    key={student.id}
                    className="flex items-center justify-between p-3 border border-border/80 rounded-xl bg-surface-subtle/50 hover:bg-surface hover:border-border transition-colors"
                  >
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{student.name}</p>
                      {student.phone && (
                        <p className="text-[11px] text-muted mt-0.5 font-mono" dir="ltr">{student.phone}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggle(student.id, "PRESENT")}
                        className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                          currentStatus === "PRESENT"
                            ? "bg-success text-white shadow-xs"
                            : "bg-surface border border-border text-gray-700 hover:bg-success-light hover:text-success-text hover:border-success-soft"
                        }`}
                      >
                        {t("present")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggle(student.id, "ABSENT")}
                        className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                          currentStatus === "ABSENT"
                            ? "bg-danger text-white shadow-xs"
                            : "bg-surface border border-border text-gray-700 hover:bg-danger-light hover:text-danger-text hover:border-danger-soft"
                        }`}
                      >
                        {t("absent")}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* SUBMIT BUTTON */}
          <div className="pt-4 border-t border-border flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              disabled={isSubmitting || enrolledStudents.length === 0}
            >
              {isSubmitting ? t("savingAttendance") : t("saveAttendanceBtn")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
