"use client";

import { Class, Lesson, Teacher, Classroom } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { ClipboardList } from "lucide-react";

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
  workshopId?: number;
  workshopSessionId?: number;
  classId?: number;
};

const LessonDetailModal = ({
  lesson,
  onClose,
  actions,
  relatedData,
  isToday = false,
}: {
  lesson: TimetableLesson;
  onClose: () => void;
  actions: React.ReactNode;
  relatedData: any;
  isToday?: boolean;
}) => {
  const t = useTranslations("lessons");
  const locale = useLocale();

  const dayName = new Date(lesson.startsAt).toLocaleDateString(
    locale === "ar" ? "ar-DZ" : "fr-FR",
    { weekday: "long" }
  );

  const getTakeAttendanceHref = () => {
    if (lesson.isWorkshop) {
      const wsId = lesson.workshopSessionId || Math.abs(lesson.id);
      return `/list/workshops/${lesson.workshopId}?session=${wsId}`;
    }
    if (lesson.isFormation) {
      return `/list/formations/${lesson.classId}?session=${lesson.id}`;
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

        <div className="border-b pb-3 mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            {lesson.class?.name || lesson.name}
          </h2>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="font-semibold text-gray-600">{t("teacher")}:</span>
            <span className="text-gray-800 font-medium">
              {(lesson.teacher?.surname ? `${lesson.teacher.surname} ${lesson.teacher.name}` : lesson.teacher?.name) || t("unspecified")}
            </span>
          </div>
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
          {isToday ? (
            <Link
              href={getTakeAttendanceHref()}
              className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold py-2 px-3.5 rounded-lg shadow-xs transition-colors"
            >
              <ClipboardList className="w-4 h-4" />
              <span>{t("takeAttendanceToday")}</span>
            </Link>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LessonDetailModal;
