"use client";

import { Class, Lesson, Teacher, Classroom } from "@prisma/client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { ClipboardList, UserX, AlertTriangle } from "lucide-react";
import { toast } from "react-toastify";
import { toggleTeacherLessonAbsenceAction } from "@/lib/actions";

type TimetableLesson = {
  id: number;
  name?: string;
  class?: { id?: number; name?: string } | null;
  teacher?: { id?: string; name?: string; surname?: string } | null;
  classroom?: { id?: number; name?: string } | null;
  subject?: { id?: number; name?: string } | null;
  branchId: number;
  branchName?: string;
  startsAt: Date | string;
  endsAt: Date | string;
  isExtra?: boolean;
  isCatchUp?: boolean;
  isFree?: boolean;
  isFormation?: boolean;
  isWorkshop?: boolean;
  isTeacherAbsent?: boolean;
  workshopId?: number;
  workshopSessionId?: number;
  classId?: number;
  level?: { id?: number; name?: string } | null;
};

const LessonDetailModal = ({
  lesson,
  onClose,
  actions,
  relatedData,
  isToday = false,
  canManage = true,
  onLessonUpdated,
}: {
  lesson: TimetableLesson;
  onClose: () => void;
  actions: React.ReactNode;
  relatedData: any;
  isToday?: boolean;
  canManage?: boolean;
  onLessonUpdated?: (lessonId: number, isTeacherAbsent: boolean) => void;
}) => {
  const t = useTranslations("lessons");
  const locale = useLocale();

  const [isTeacherAbsent, setIsTeacherAbsent] = useState<boolean>(Boolean(lesson.isTeacherAbsent));
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  const handleToggleAbsence = async () => {
    if (isUpdating || lesson.isWorkshop || lesson.id <= 0) return;
    const nextVal = !isTeacherAbsent;
    setIsTeacherAbsent(nextVal);
    setIsUpdating(true);

    try {
      const res = await toggleTeacherLessonAbsenceAction({
        lessonId: lesson.id,
        isTeacherAbsent: nextVal,
      });

      if (res.success) {
        toast.success(res.message);
        onLessonUpdated?.(lesson.id, nextVal);
      } else {
        setIsTeacherAbsent(!nextVal); // revert
        toast.error(res.message || "Erreur");
      }
    } catch {
      setIsTeacherAbsent(!nextVal); // revert
      toast.error(locale === "ar" ? "خطأ في الاتصال بالخادم" : "Erreur de connexion au serveur");
    } finally {
      setIsUpdating(false);
    }
  };

  const dayName = new Date(lesson.startsAt).toLocaleDateString(
    locale === "ar" ? "ar-DZ" : "fr-FR",
    { weekday: "long" }
  );

  const getTakeAttendanceHref = () => {
    if (lesson.isWorkshop) {
      const wsId = lesson.workshopSessionId || Math.abs(lesson.id);
      return `/list/workshops/${lesson.workshopId}?session=${wsId}`;
    }
    return `/list/attendance/take/${lesson.id}`;
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center font-sans p-4"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <div className="bg-white p-6 rounded-xl shadow-xl relative w-full max-w-lg mx-auto border border-border">
        <button
          onClick={onClose}
          className={`absolute top-4 ${
            locale === "ar" ? "left-4" : "right-4"
          } text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors`}
        >
          <Image src="/close.png" alt="close" width={16} height={16} />
        </button>

        <div className="border-b pb-3 mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-gray-900">
            {lesson.class?.name || lesson.name}
          </h2>
          {isTeacherAbsent && (
            <span className="inline-flex items-center gap-1.5 bg-rose-600 text-white text-xs px-2.5 py-1 rounded-full font-bold shadow-xs">
              <UserX className="w-3.5 h-3.5" />
              <span>{locale === "ar" ? "أستاذ غائب" : "Enseignant absent"}</span>
            </span>
          )}
        </div>

        <div className="space-y-3 text-sm">
          {/* Teacher Absence Toggler */}
          {!lesson.isWorkshop && lesson.id > 0 && (
            <div className={`p-3.5 rounded-xl border transition-all ${
              isTeacherAbsent
                ? "bg-rose-50/90 border-rose-300 text-rose-950 shadow-xs"
                : "bg-surface-subtle/60 border-border text-gray-700"
            }`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isTeacherAbsent ? "bg-rose-100 text-rose-700" : "bg-gray-100 text-gray-600"
                  }`}>
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

                {canManage && (
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={handleToggleAbsence}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:opacity-50 ${
                      isTeacherAbsent ? "bg-rose-600" : "bg-gray-300"
                    }`}
                    role="switch"
                    aria-checked={isTeacherAbsent}
                    aria-label={locale === "ar" ? "تبديل حالة غياب الأستاذ" : "Basculer l'absence de l'enseignant"}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        isTeacherAbsent
                          ? (locale === "ar" ? "-translate-x-5" : "translate-x-5")
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <span className="font-semibold text-gray-600">{t("teacher")}:</span>
            <span className="text-gray-800 font-medium">
              {(lesson.teacher?.surname ? `${lesson.teacher.surname} ${lesson.teacher.name}` : lesson.teacher?.name) || t("unspecified")}
            </span>
          </div>
          {lesson.level?.name && (
            <div className="flex justify-between">
              <span className="font-semibold text-gray-600">{t("level")}:</span>
              <span className="text-gray-800 font-medium">
                {lesson.level.name}
              </span>
            </div>
          )}
          {lesson.subject?.name && (
            <div className="flex justify-between">
              <span className="font-semibold text-gray-600">{t("subject")}:</span>
              <span className="text-gray-800 font-medium">
                {lesson.subject.name}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="font-semibold text-gray-600">{t("branch")}:</span>
            <span className="text-gray-800 font-medium">
              {lesson.branchName || t("unspecified")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-gray-600">{t("dayLabel")}:</span>
            <span className="text-gray-800 font-medium">
              {dayName}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-gray-600">{t("timeLabel")}:</span>
            <span className="text-gray-800 font-mono" dir="ltr">
              {new Date(lesson.startsAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              -{" "}
              {new Date(lesson.endsAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-gray-600">{t("room")}:</span>
            <span className="text-gray-800">{lesson.classroom?.name || t("unspecified")}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-600">{t("lessonType")}</span>
            <div className="flex flex-wrap gap-1.5">
              {lesson.isWorkshop && (
                <span className="bg-rose-100 text-rose-800 text-xs px-2 py-0.5 rounded-full font-bold border border-rose-300">
                  {t("workshopBadge")}
                </span>
              )}
              {lesson.isFormation && (
                <span className="bg-teal-100 text-teal-800 text-xs px-2 py-0.5 rounded-full font-bold border border-teal-300">
                  {t("formationBadge")}
                </span>
              )}
              {lesson.isFree && (
                <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-bold border border-emerald-300">
                  {t("legend.free")}
                </span>
              )}
              {lesson.isExtra && (
                <span className="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full font-bold border border-purple-300">
                  {t("legend.extra")}
                </span>
              )}
              {lesson.isCatchUp && (
                <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-bold border border-amber-300">
                  {t("legend.catchUp")}
                </span>
              )}
              {!lesson.isWorkshop && !lesson.isFormation && !lesson.isFree && !lesson.isExtra && !lesson.isCatchUp && (
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-medium border border-blue-300">
                  {t("legend.regular")}
                </span>
              )}
            </div>
          </div>
          {lesson.isFree && (
            <div className="p-2.5 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-md text-xs">
              {t("freeNote")}
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Link
              href={getTakeAttendanceHref()}
              className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold py-2 px-3.5 rounded-lg shadow-xs transition-colors"
            >
              <ClipboardList className="w-4 h-4" />
              <span>{isToday ? t("takeAttendanceToday") : t("takeAttendance")}</span>
            </Link>
            {isTeacherAbsent && (
              <span className="text-[11px] text-rose-600 font-medium">
                {locale === "ar" ? "الأستاذ غائب - رصيد التلاميذ لن يُمس" : "Prof absent - crédits non débités"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LessonDetailModal;
