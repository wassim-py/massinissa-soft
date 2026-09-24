"use client";

import { Lesson, Class, Teacher, Classroom } from "@prisma/client";
import React, { useState, useEffect } from "react";
import LessonDetailModal from "./LessonDetailModal";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { Clock, User, School, Building2, ClipboardList } from "lucide-react";

export type Day = "SATURDAY" | "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY";

export type TimetableLesson = {
  id: number;
  name: string;
  day: Day;
  startTime: Date | string;
  endTime: Date | string;
  startsAt: Date | string;
  endsAt: Date | string;
  classId?: number;
  teacherId?: string;
  classroomId?: number | null;
  branchId: number;
  branchName?: string;
  isExtra?: boolean;
  isCatchUp?: boolean;
  isFree?: boolean;
  isFormation?: boolean;
  isWorkshop?: boolean;
  workshopId?: number;
  workshopSessionId?: number;
  extraFee?: number | null;
  subject?: { id?: number; name: string } | null;
  class?: { id?: number; name: string } | null;
  teacher?: { id?: string; name: string; surname?: string } | null;
  classroom?: { id?: number; name: string } | null;
  forChildren?: string[];
};

const daysOfWeek: Day[] = [
  "SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY",
];

const timeSlots = [
  "08:00", "09:00", "10:00", "11:00", "12:00", 
  "13:00", "14:00", "15:00", "16:00", "17:00"
];

const today = new Date().toLocaleString('en-GB', { weekday: 'long' }).toUpperCase() as Day;

const Timetable = ({
  lessons = [],
  actions = {},
  relatedDataForForms,
  userRole,
  isCurrentWeek = true,
  currentWeekRange,
}: {
  lessons: TimetableLesson[];
  actions: { [key: number]: React.JSX.Element };
  relatedDataForForms: any;
  userRole: string;
  isCurrentWeek?: boolean;
  currentWeekRange?: { start: Date; end: Date; offset: number };
}) => {
  const t = useTranslations("lessons");
  const locale = useLocale();
  const safeLessons = Array.isArray(lessons) ? lessons : [];

  const getDayTranslation = (day: Day) => {
    const keyMap: Record<Day, string> = {
      SATURDAY: "days.saturday",
      SUNDAY: "days.sunday",
      MONDAY: "days.monday",
      TUESDAY: "days.tuesday",
      WEDNESDAY: "days.wednesday",
      THURSDAY: "days.thursday",
      FRIDAY: "days.friday",
    };
    return t(keyMap[day] as any);
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<TimetableLesson | null>(null);
  const [selectedDay, setSelectedDay] = useState<Day>(
    daysOfWeek.includes(today) ? today : "SATURDAY"
  );
  const [mobileMode, setMobileMode] = useState<"day" | "week">("day");

  const getTakeAttendanceHref = (lesson: TimetableLesson): string => {
    if (lesson.isWorkshop) {
      const wsId = lesson.workshopSessionId || Math.abs(lesson.id);
      return `/list/workshops/${lesson.workshopId}?session=${wsId}`;
    }
    if (lesson.isFormation) {
      return `/list/formations/${lesson.classId}?session=${lesson.id}`;
    }
    return `/list/attendance/take/${lesson.id}`;
  };

  const isLessonToday = (lesson: TimetableLesson): boolean => {
    if (!isCurrentWeek) return false;

    const now = new Date();
    const lessonDate = new Date(lesson.startsAt);

    // Exact calendar day match for one-off / dated sessions
    const isSameDate =
      lessonDate.getFullYear() === now.getFullYear() &&
      lessonDate.getMonth() === now.getMonth() &&
      lessonDate.getDate() === now.getDate();

    if (isSameDate) return true;

    // Recurring normal lesson on today's weekday during current week
    const isOneOff = Boolean(
      lesson.isExtra ||
      lesson.isCatchUp ||
      lesson.isFree ||
      lesson.isFormation ||
      lesson.isWorkshop
    );

    if (!isOneOff) {
      const todayDayName = now.toLocaleString("en-GB", { weekday: "long" }).toUpperCase();
      if (getLessonDay(lesson) === todayDayName) {
        return true;
      }
    }

    return false;
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedLesson(null);
  };

  const handleLessonClick = (lesson: TimetableLesson) => {
    setSelectedLesson(lesson);
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (selectedLesson && !safeLessons.find(l => l.id === selectedLesson.id)) {
      handleCloseModal();
    }
  }, [safeLessons, selectedLesson]);

  const getLessonDay = (lesson: TimetableLesson): Day => {
    return new Date(lesson.startsAt).toLocaleString('en-GB', { weekday: 'long' }).toUpperCase() as Day;
  };

  const findLessonsForSlot = (day: Day, time: string): TimetableLesson[] => {
    return safeLessons.filter((lesson) => {
      const lessonHour = new Date(lesson.startsAt).getHours().toString().padStart(2, '0');
      const lessonTime = `${lessonHour}:00`;
      return getLessonDay(lesson) === day && lessonTime === time;
    });
  };

  const getLessonCardStyle = (lesson: TimetableLesson, isClickable: boolean) => {
    if (lesson.isWorkshop) {
      return `bg-rose-50 border-2 border-rose-500 text-rose-950 p-2 rounded-md text-xs flex flex-col justify-between w-[95%] shadow-sm ${
        isClickable ? 'hover:bg-rose-100 hover:border-rose-600 transition-all cursor-pointer' : 'cursor-default'
      }`;
    }
    if (lesson.isFormation) {
      return `bg-teal-50 border-2 border-teal-500 text-teal-950 p-2 rounded-md text-xs flex flex-col justify-between w-[95%] shadow-sm ${
        isClickable ? 'hover:bg-teal-100 hover:border-teal-600 transition-all cursor-pointer' : 'cursor-default'
      }`;
    }
    if (lesson.isFree) {
      return `bg-emerald-50 border-2 border-emerald-500 text-emerald-950 p-2 rounded-md text-xs flex flex-col justify-between w-[95%] shadow-sm ${
        isClickable ? 'hover:bg-emerald-100 hover:border-emerald-600 transition-all cursor-pointer' : 'cursor-default'
      }`;
    }
    if (lesson.isExtra) {
      return `bg-purple-50 border-2 border-purple-500 text-purple-950 p-2 rounded-md text-xs flex flex-col justify-between w-[95%] shadow-sm ${
        isClickable ? 'hover:bg-purple-100 hover:border-purple-600 transition-all cursor-pointer' : 'cursor-default'
      }`;
    }
    if (lesson.isCatchUp) {
      return `bg-amber-50 border-2 border-amber-500 text-amber-950 p-2 rounded-md text-xs flex flex-col justify-between w-[95%] shadow-sm ${
        isClickable ? 'hover:bg-amber-100 hover:border-amber-600 transition-all cursor-pointer' : 'cursor-default'
      }`;
    }
    return `bg-blue-50 border border-blue-300 text-blue-950 p-2 rounded-md text-xs flex flex-col justify-between w-[95%] shadow-sm ${
      isClickable ? 'hover:bg-blue-100 hover:border-blue-400 transition-all cursor-pointer' : 'cursor-default'
    }`;
  };

  return (
    <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 max-w-full overflow-hidden">
      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-xs">
        <span className="font-semibold text-gray-700">{t("legendTitle")}</span>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-blue-100 border border-blue-400 inline-block"></span>
            <span className="text-blue-950 font-medium">{t("legend.regular")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-purple-100 border-2 border-purple-500 inline-block"></span>
            <span className="text-purple-950 font-medium">{t("legend.extra")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-100 border-2 border-amber-500 inline-block"></span>
            <span className="text-amber-950 font-medium">{t("legend.catchUp")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-100 border-2 border-emerald-500 inline-block"></span>
            <span className="text-emerald-950 font-medium">{t("legend.free")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-teal-100 border-2 border-teal-500 inline-block"></span>
            <span className="text-teal-950 font-medium">{t("legend.formation")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-100 border-2 border-rose-500 inline-block"></span>
            <span className="text-rose-950 font-medium">{t("legend.workshop")}</span>
          </div>
        </div>
      </div>

      {/* Mobile Controls & Day Selector */}
      <div className="md:hidden mb-4 space-y-3">
        {/* Toggle Day Agenda vs Full Week Grid */}
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
          <span className="text-xs font-semibold text-gray-700">{t("displayMode")}</span>
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setMobileMode("day")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                mobileMode === "day"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t("viewByDay")}
            </button>
            <button
              type="button"
              onClick={() => setMobileMode("week")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                mobileMode === "week"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t("viewByWeek")}
            </button>
          </div>
        </div>

        {/* Day Tabs */}
        {mobileMode === "day" && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {daysOfWeek.map((day) => {
              const count = lessons.filter((l) => getLessonDay(l) === day).length;
              const isSelected = selectedDay === day;
              const isCurrent = day === today;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-all flex flex-col items-center min-w-[65px] ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-600 ring-offset-1"
                      : isCurrent
                      ? "bg-blue-50 text-blue-800 border border-blue-200"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <span>{getDayTranslation(day)}</span>
                  <span
                    className={`text-[10px] mt-0.5 ${
                      isSelected ? "text-blue-100" : "text-gray-500"
                    }`}
                  >
                    {t("lessonsCount", { count })}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Selected Day Agenda Cards */}
        {mobileMode === "day" && (
          <div className="space-y-2.5 pt-1">
            {(() => {
              const dayLessons = lessons
                .filter((l) => getLessonDay(l) === selectedDay)
                .sort(
                  (a, b) =>
                    new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
                );

              if (dayLessons.length === 0) {
                return (
                  <div className="text-center py-8 bg-gray-50 rounded-xl border border-gray-200 text-gray-500 text-xs">
                    {t("noLessonsDay", { day: getDayTranslation(selectedDay) })}
                  </div>
                );
              }

              return dayLessons.map((lesson) => {
                const formattedStart = new Date(lesson.startsAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                });
                const formattedEnd = new Date(lesson.endsAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                });
                const isClickable = userRole === "admin";
                const clickHandler = isClickable ? () => handleLessonClick(lesson) : undefined;

                return (
                  <div
                    key={lesson.id}
                    onClick={clickHandler}
                    className={`p-3 rounded-xl border space-y-2 transition-all ${
                      lesson.isWorkshop
                        ? "bg-rose-50/60 border-rose-300 text-rose-950"
                        : lesson.isFormation
                        ? "bg-teal-50/60 border-teal-300 text-teal-950"
                        : lesson.isFree
                        ? "bg-emerald-50/60 border-emerald-300 text-emerald-950"
                        : lesson.isExtra
                        ? "bg-purple-50/60 border-purple-300 text-purple-950"
                        : lesson.isCatchUp
                        ? "bg-amber-50/60 border-amber-300 text-amber-950"
                        : "bg-blue-50/50 border-blue-200 text-blue-950"
                    } ${isClickable ? "cursor-pointer hover:shadow-xs active:scale-[0.99]" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-sm text-gray-900">
                          {lesson.subject?.name || lesson.class?.name || lesson.name}
                        </h4>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {t("group")}:{" "}
                          <span className="font-semibold text-gray-800">
                            {lesson.class?.name || lesson.name}
                          </span>
                        </p>
                      </div>
                      {/* Lesson type badge */}
                      {lesson.isWorkshop && (
                        <span className="bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          {t("workshopBadge")}
                        </span>
                      )}
                      {lesson.isFormation && (
                        <span className="bg-teal-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          {t("formationBadge")}
                        </span>
                      )}
                      {lesson.isFree && (
                        <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          {t("freeBadge")}
                        </span>
                      )}
                      {lesson.isExtra && (
                        <span className="bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          {t("extraBadge")}
                        </span>
                      )}
                      {lesson.isCatchUp && (
                        <span className="bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          {t("catchUpBadge")}
                        </span>
                      )}
                      {!lesson.isWorkshop && !lesson.isFormation && !lesson.isFree && !lesson.isExtra && !lesson.isCatchUp && (
                        <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          {t("regularBadge")}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-xs text-gray-600 pt-1.5 border-t border-gray-200/60 font-medium gap-2">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted shrink-0" />
                        <span>{formattedStart} - {formattedEnd}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 text-muted shrink-0" />
                        <span>{lesson.teacher?.name || t("unspecified")}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <School className="w-3 h-3 text-muted shrink-0" />
                        <span>{lesson.classroom?.name || t("noClassroom")}</span>
                      </span>
                      <span className="text-gray-700 font-semibold bg-gray-100 px-1.5 py-0.5 rounded text-[11px] inline-flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-muted shrink-0" />
                        <span>{lesson.branchName || t("unspecified")}</span>
                      </span>
                    </div>

                    {/* Take Attendance button ONLY on lesson cards for lessons happening TODAY (Requirement 2 & 5) */}
                    {isLessonToday(lesson) && (
                      <div className="pt-1.5">
                        <Link
                          href={getTakeAttendanceHref(lesson)}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center gap-1.5 w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs py-1.5 px-3 rounded-lg shadow-xs transition-colors"
                        >
                          <ClipboardList className="w-3.5 h-3.5" />
                          <span>{t("takeAttendance")}</span>
                        </Link>
                      </div>
                    )}

                    {isClickable && (
                      <div className="text-right pt-0.5">
                        <span className="text-[11px] text-blue-600 font-semibold">
                          {t("clickToEdit")}
                        </span>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* Full Week Grid (shown on desktop or when mobileMode is 'week') */}
      <div
        className={`overflow-x-auto ${
          mobileMode === "day" ? "hidden md:block" : "block"
        }`}
      >
        <div className="min-w-[800px]">
          <div className="grid grid-cols-8 gap-0 border-t border-l border-gray-200 text-center font-bold text-sm bg-gray-50">
            <div className="p-2 border-b border-r border-gray-200">{t("timeHeader")}</div>
            {daysOfWeek.map((day) => (
              <div key={day} className={`p-2 border-b border-r border-gray-200 ${day === today ? 'bg-blue-50 text-blue-700' : ''}`}>
                {getDayTranslation(day)}
              </div>
            ))}
          </div>

          {timeSlots.map((time, idx) => {
            const rowBgClass = idx % 2 === 0 ? "bg-white" : "bg-gray-50/50";
            return (
              <div key={time} className="grid grid-cols-8 gap-0 text-right">
                <div className="p-2 border-b border-l border-r border-gray-200 font-medium text-xs text-gray-500 flex items-center justify-center">
                  {time}
                </div>
                {daysOfWeek.map((day) => {
                  const lessonsInSlot = findLessonsForSlot(day, time);
                  return (
                    <div key={`${day}-${time}`} className={`p-1 border-b border-r border-gray-200 min-h-[100px] flex flex-col gap-1 relative ${rowBgClass}`}>
                      {lessonsInSlot.map((lesson) => {
                        const formattedEndTime = new Date(lesson.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                        const formattedStartTime = new Date(lesson.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                        
                        const lessonDay = getLessonDay(lesson);
                        const isClickable = userRole === 'admin';
                        const clickHandler = isClickable ? () => handleLessonClick(lesson) : undefined;
                        const cardClassName = getLessonCardStyle(lesson, isClickable);

                        let lessonStyle: React.CSSProperties = { position: 'relative', zIndex: 1 };
                        if (userRole === 'teacher' || userRole === 'student') {
                            const start = new Date(lesson.startsAt);
                            const end = new Date(lesson.endsAt);
                            const durationInMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
                            const heightPerMinute = 100 / 60;
                            lessonStyle.height = `${durationInMinutes * heightPerMinute}px`;
                            lessonStyle.position = 'absolute';
                        }
                        
                        return (
                         <div 
                            key={lesson.id} 
                            onClick={clickHandler}
                            style={lessonStyle}
                            className={cardClassName}
                          >
                            <div>
                                <div className="flex flex-wrap items-center gap-1 mb-1.5">
                                  {lesson.isWorkshop && (
                                    <span className="bg-rose-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded shadow-xs">
                                      {t("workshopBadge")}
                                    </span>
                                  )}
                                  {lesson.isFormation && (
                                    <span className="bg-teal-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded shadow-xs">
                                      {t("formationBadge")}
                                    </span>
                                  )}
                                  {lesson.isFree && (
                                    <span className="bg-emerald-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded shadow-xs">
                                      {t("freeBadge")}
                                    </span>
                                  )}
                                  {lesson.isExtra && (
                                    <span className="bg-purple-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded shadow-xs">
                                      {t("extraBadge")}
                                    </span>
                                  )}
                                  {lesson.isCatchUp && (
                                    <span className="bg-amber-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded shadow-xs">
                                      {t("catchUpBadge")}
                                    </span>
                                  )}
                                  {!lesson.isWorkshop && !lesson.isFormation && !lesson.isFree && !lesson.isExtra && !lesson.isCatchUp && (
                                    <span className="bg-blue-600 text-white font-medium text-[10px] px-1.5 py-0.5 rounded shadow-xs">
                                      {t("regularBadge")}
                                    </span>
                                  )}
                                </div>
                                <h4 className="font-bold">{lesson.class?.name || lesson.name}</h4>
                                {(userRole === 'admin' || userRole === 'student' || userRole === 'parent') && (
                                    <p className="text-gray-600 italic mt-0.5">
                                        {lesson.teacher?.name}
                                    </p>
                                )}
                                <div className="flex flex-col mt-2 gap-0.5">
                                    <span className="font-semibold text-gray-800">{lesson.classroom?.name || t("noClassroomAssigned")}</span>
                                    <span className="text-[10px] text-gray-700 font-medium bg-white/80 border border-gray-200/80 px-1 py-0.5 rounded inline-flex items-center gap-1 w-fit">
                                      <Building2 className="w-3 h-3 text-muted shrink-0" />
                                      <span>{lesson.branchName || t("unspecified")}</span>
                                    </span>
                                    <span className="text-[11px] text-gray-500 pt-0.5">{formattedStartTime} - {formattedEndTime}</span>
                                </div>
                            </div>

                            {/* Take Attendance button ONLY on lesson cards for lessons happening TODAY (Requirement 2 & 5) */}
                            {isLessonToday(lesson) && (
                              <div className="mt-2 pt-1 border-t border-gray-200/60">
                                <Link
                                  href={getTakeAttendanceHref(lesson)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center justify-center gap-1 w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-[10px] py-1 px-1.5 rounded shadow-xs transition-colors text-center"
                                >
                                  <ClipboardList className="w-3 h-3" />
                                  <span>{t("takeAttendance")}</span>
                                </Link>
                              </div>
                            )}

                            {userRole === 'parent' && lesson.forChildren && (
                                <div className="mt-auto pt-1">
                                    <p className="text-center text-xs font-semibold bg-green-200 text-green-800 rounded-full px-2 py-1">
                                        {t("forChildren", { names: lesson.forChildren.join(', ') })}
                                    </p>
                                </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {isModalOpen && selectedLesson && (
        <LessonDetailModal
          lesson={selectedLesson as any}
          onClose={handleCloseModal}
          actions={actions[selectedLesson.id]}
          relatedData={relatedDataForForms}
          isToday={isLessonToday(selectedLesson)}
        />
      )}
    </div>
  );
};

export default Timetable;
