"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { UserX } from "lucide-react";
import { toast } from "react-toastify";
import { toggleTeacherLessonAbsenceAction } from "@/lib/actions";
import { notifyAttendanceChanged } from "@/lib/attendanceEvents";
import { executeWithRetry } from "@/lib/retryUtils";

export interface TeacherAbsenceToggleProps {
  lessonId: number;
  isTeacherAbsent: boolean;
  dateStr?: string;
  canManage?: boolean;
  disabled?: boolean;
  variant?: "modal" | "banner";
  onOptimisticChange?: (nextValue: boolean) => void;
  onSuccess?: (resolvedLessonId: number, nextValue: boolean, dateStr?: string) => void;
  onUpdatingChange?: (isUpdating: boolean) => void;
}

/**
 * Reusable toggle switch for marking/unmarking a teacher absent for a specific lesson session.
 * Preserves student session credits (0 consumed) and records the absence for payroll.
 */
const TeacherAbsenceToggle = ({
  lessonId,
  isTeacherAbsent,
  dateStr,
  canManage = false,
  disabled = false,
  variant = "modal",
  onOptimisticChange,
  onSuccess,
  onUpdatingChange,
}: TeacherAbsenceToggleProps) => {
  const locale = useLocale();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleToggle = async () => {
    if (isUpdating || disabled || !canManage || lessonId <= 0) return;

    const nextVal = !isTeacherAbsent;
    onOptimisticChange?.(nextVal);
    setIsUpdating(true);
    onUpdatingChange?.(true);

    try {
      const res = await executeWithRetry(() =>
        toggleTeacherLessonAbsenceAction({
          lessonId,
          isTeacherAbsent: nextVal,
          dateStr: dateStr || undefined,
        })
      );

      if (res.success) {
        const resolvedId = (res as any).lessonId || lessonId;
        toast.success(res.message);
        notifyAttendanceChanged({
          lessonId: resolvedId,
          source: "teacher-absence-toggle",
        });
        onSuccess?.(resolvedId, nextVal, dateStr);
      } else {
        onOptimisticChange?.(!nextVal);
        toast.error(res.message || "Erreur");
      }
    } catch {
      onOptimisticChange?.(!nextVal);
      toast.error(
        locale === "ar"
          ? "خطأ في الاتصال بالخادم"
          : "Erreur de connexion au serveur"
      );
    } finally {
      setIsUpdating(false);
      onUpdatingChange?.(false);
    }
  };

  if (variant === "banner" && !canManage) {
    if (!isTeacherAbsent) return null;
    return (
      <div className="p-3.5 mb-4 bg-rose-50 border-2 border-rose-300 rounded-xl flex items-center justify-between gap-3 text-rose-950 text-sm shadow-xs font-sans">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block shrink-0" />
          <div>
            <strong className="font-bold">
              {locale === "ar"
                ? "الأستاذ غائب في هذه الحصة :"
                : "Enseignant absent pour cette séance :"}
            </strong>{" "}
            {locale === "ar"
              ? "تسجيل الحضور في هذه الحصة لن يخصم من رصيد حصص التلاميذ (0 حصة مستهلكة)، وسيتم احتساب غياب الأستاذ في جدول الأجور."
              : "Faire l'appel pour cette séance ne débitera pas le crédit des élèves (0 séance décomptée). L'absence de l'enseignant est enregistrée dans sa paie."}
          </div>
        </div>
        <span className="bg-rose-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-xs flex items-center gap-1 shrink-0">
          <UserX className="w-3.5 h-3.5" />
          <span>{locale === "ar" ? "أستاذ غائب" : "Prof absent"}</span>
        </span>
      </div>
    );
  }

  const switchControl = canManage ? (
    <button
      type="button"
      disabled={isUpdating || disabled}
      onClick={handleToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        isTeacherAbsent ? "bg-rose-600" : "bg-gray-300"
      }`}
      role="switch"
      aria-checked={isTeacherAbsent}
      aria-label={
        locale === "ar"
          ? "تبديل حالة غياب الأستاذ"
          : "Basculer l'absence de l'enseignant"
      }
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          isTeacherAbsent
            ? locale === "ar"
              ? "-translate-x-5"
              : "translate-x-5"
            : "translate-x-0"
        }`}
      />
    </button>
  ) : null;

  if (variant === "banner") {
    if (isTeacherAbsent) {
      return (
        <div className="p-3.5 mb-4 bg-rose-50 border-2 border-rose-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-950 text-sm shadow-xs font-sans transition-all">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <UserX className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <strong className="font-bold">
                  {locale === "ar"
                    ? "الأستاذ غائب في هذه الحصة :"
                    : "Enseignant absent pour cette séance :"}
                </strong>
                <span className="bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-2xs">
                  {locale === "ar" ? "مسجل كغائب" : "Marqué absent"}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-rose-900/90 mt-0.5 leading-snug">
                {locale === "ar"
                  ? "تسجيل الحضور في هذه الحصة لن يخصم من رصيد حصص التلاميذ (0 حصة مستهلكة)، وسيتم احتساب غياب الأستاذ في جدول الأجور."
                  : "Faire l'appel pour cette séance ne débitera pas le crédit des élèves (0 séance décomptée). L'absence de l'enseignant est enregistrée dans sa paie."}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 border-t sm:border-t-0 border-rose-200/80 pt-2 sm:pt-0">
            <span className="bg-rose-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-xs flex items-center gap-1 shrink-0">
              <UserX className="w-3.5 h-3.5" />
              <span>{locale === "ar" ? "أستاذ غائب" : "Prof absent"}</span>
            </span>
            {switchControl}
          </div>
        </div>
      );
    }

    return (
      <div className="p-3.5 mb-4 bg-surface-subtle/70 border border-border rounded-xl flex items-center justify-between gap-3 text-gray-700 text-sm shadow-xs font-sans transition-all">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center shrink-0">
            <UserX className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs sm:text-sm font-bold text-gray-900 block">
              {locale === "ar" ? "غياب الأستاذ" : "Enseignant absent"}
            </span>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">
              {locale === "ar"
                ? "في حال غياب الأستاذ: رصيد التلاميذ لن يُخصم (0 حصة مستهلكة) وسيتم تسجيل الغياب في كشف راتب الأستاذ."
                : "En cas d'absence de l'enseignant : le crédit des élèves reste intact (0 séance décomptée) et l'absence est reportée sur la paie."}
            </p>
          </div>
        </div>
        {switchControl}
      </div>
    );
  }

  // Modal variant
  return (
    <div
      className={`p-3.5 rounded-xl border transition-all ${
        isTeacherAbsent
          ? "bg-rose-50/90 border-rose-300 text-rose-950 shadow-xs"
          : "bg-surface-subtle/60 border-border text-gray-700"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              isTeacherAbsent
                ? "bg-rose-100 text-rose-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            <UserX className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-900">
                {locale === "ar" ? "غياب الأستاذ" : "Enseignant absent"}
              </span>
              {isTeacherAbsent && (
                <span className="bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {locale === "ar" ? "مسجل كغائب" : "Marqué absent"}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">
              {locale === "ar"
                ? "رصيد التلاميذ لن يخصم، وسيتم تسجيل الغياب في كشف راتب الأستاذ."
                : "Le crédit des élèves reste intact et l'absence est reportée sur la paie."}
            </p>
          </div>
        </div>

        {switchControl}
      </div>
    </div>
  );
};

export default TeacherAbsenceToggle;
