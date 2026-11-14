"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  ATTENDANCE_BROADCAST_CHANNEL,
  ATTENDANCE_UPDATED_EVENT,
} from "@/lib/attendanceEvents";
import type {
  TodayAttendanceSummary,
  TodayLessonAttendanceData,
} from "@/lib/dashboardAttendance";
import {
  BarChart3,
  UserCheck,
  UserX,
  Users,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  UserPlus,
  Clock,
  Radio,
} from "lucide-react";

export type { TodayAttendanceSummary, TodayLessonAttendanceData };

export interface TodayAttendanceChartProps {
  initialSummary: TodayAttendanceSummary;
  branchName: string;
}

interface HoveredTooltipState {
  lesson: TodayLessonAttendanceData;
  left: number;
  top: number;
  placeAbove: boolean;
}

const POLL_INTERVAL_MS = 5000;
const NICE_STEPS = [1, 2, 3, 4, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100];

function computeNiceScale(rawMax: number): { max: number; ticks: number[] } {
  const target = Math.max(4, Math.ceil(rawMax * 1.1));
  let chosenStep = NICE_STEPS[NICE_STEPS.length - 1];
  for (const step of NICE_STEPS) {
    if (step * 4 >= target) {
      chosenStep = step;
      break;
    }
  }
  if (chosenStep * 4 < target) {
    chosenStep = Math.ceil(target / 4);
  }
  const max = chosenStep * 4;
  return {
    max,
    ticks: [chosenStep * 4, chosenStep * 3, chosenStep * 2, chosenStep, 0],
  };
}

export default function TodayAttendanceChart({
  initialSummary,
  branchName,
}: TodayAttendanceChartProps) {
  const t = useTranslations("dashboard.todayAttendance");
  const locale = useLocale();
  const isRtl = locale === "ar";

  const [summary, setSummary] = useState<TodayAttendanceSummary>(initialSummary);
  const [viewMode, setViewMode] = useState<"recorded" | "all">("recorded");
  const [isUpdating, setIsUpdating] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [hoveredTooltip, setHoveredTooltip] = useState<HoveredTooltipState | null>(null);

  const scrollTrackRef = useRef<HTMLDivElement | null>(null);

  // Sync client state cleanly if server renders new branch or updated SSR payload
  useEffect(() => {
    setSummary(initialSummary);
  }, [initialSummary]);

  // Wire live updates: DOM custom events, Biometric live stream, BroadcastChannel, focus & 5s poll
  useEffect(() => {
    const branchId = summary.branchId;
    let isDisposed = false;
    let inFlight = false;
    let queued = false;

    const fetchLatestSummary = async () => {
      if (isDisposed) return;
      if (inFlight) {
        queued = true;
        return;
      }

      inFlight = true;
      setIsUpdating(true);
      try {
        do {
          queued = false;
          const res = await fetch(
            `/api/dashboard/today-attendance?branchId=${encodeURIComponent(String(branchId))}`,
            { cache: "no-store" }
          );
          if (!res.ok || isDisposed) continue;
          const fresh: TodayAttendanceSummary = await res.json();
          if (!isDisposed) {
            setSummary((prev) => (prev.branchId !== branchId ? prev : fresh));
          }
        } while (queued && !isDisposed);
      } catch {
        // Silently tolerate transient network issues during live polling
      } finally {
        inFlight = false;
        if (!isDisposed) {
          setIsUpdating(false);
        }
      }
    };

    const triggerRefresh = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void fetchLatestSummary();
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void fetchLatestSummary();
      }
    };

    window.addEventListener("biometric-attendance-marked", triggerRefresh);
    window.addEventListener(ATTENDANCE_UPDATED_EVENT, triggerRefresh);
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    let channel: BroadcastChannel | null = null;
    try {
      if ("BroadcastChannel" in window) {
        channel = new BroadcastChannel(ATTENDANCE_BROADCAST_CHANNEL);
        channel.onmessage = () => triggerRefresh();
      }
    } catch {
      channel = null;
    }

    const intervalId = setInterval(triggerRefresh, POLL_INTERVAL_MS);

    return () => {
      isDisposed = true;
      window.removeEventListener("biometric-attendance-marked", triggerRefresh);
      window.removeEventListener(ATTENDANCE_UPDATED_EVENT, triggerRefresh);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      if (channel) {
        channel.close();
      }
      clearInterval(intervalId);
    };
  }, [summary.branchId]);

  const lessonsData = summary.lessonsData;
  const recordedLessons = useMemo(
    () => lessonsData.filter((l) => l.total > 0),
    [lessonsData]
  );

  const activeLessons = useMemo(() => {
    if (viewMode === "recorded") {
      return recordedLessons.length > 0 ? recordedLessons : lessonsData;
    }
    return lessonsData;
  }, [viewMode, recordedLessons, lessonsData]);

  const hasRecords =
    lessonsData.length > 0 &&
    (summary.totalPresent > 0 || summary.totalAbsent > 0 || recordedLessons.length > 0);

  const shouldRenderChart = activeLessons.length > 0 && (hasRecords || viewMode === "all");

  const { max: yMax, ticks: yTicks } = useMemo(() => {
    const rawMax = activeLessons.reduce(
      (acc, l) => Math.max(acc, l.present, l.absent),
      0
    );
    return computeNiceScale(rawMax);
  }, [activeLessons]);

  const checkOverflow = useCallback(() => {
    const el = scrollTrackRef.current;
    if (!el) {
      setHasOverflow(false);
      return;
    }
    setHasOverflow(el.scrollWidth > el.clientWidth + 8);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = scrollTrackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => checkOverflow());
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeLessons.length, checkOverflow]);

  const handleScrollStep = (direction: "prev" | "next") => {
    const el = scrollTrackRef.current;
    if (!el) return;
    const step = Math.max(320, Math.round(el.clientWidth * 0.65));
    const delta =
      direction === "next" ? (isRtl ? -step : step) : isRtl ? step : -step;
    el.scrollBy({ left: delta, behavior: "smooth" });
  };

  const formattedUpdatedTime = useMemo(() => {
    if (!summary.updatedAt) return "";
    return new Date(summary.updatedAt).toLocaleTimeString(
      locale === "ar" ? "ar-DZ" : "fr-FR",
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "Africa/Algiers",
      }
    );
  }, [summary.updatedAt, locale]);

  const handleColumnHover = (
    e: React.MouseEvent<HTMLAnchorElement> | React.FocusEvent<HTMLAnchorElement>,
    lesson: TodayLessonAttendanceData
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const placeAbove = rect.top > 250;
    const left = Math.max(
      140,
      Math.min(window.innerWidth - 140, rect.left + rect.width / 2)
    );
    const top = placeAbove
      ? rect.top - 10
      : Math.min(window.innerHeight - 220, rect.bottom + 10);

    setHoveredTooltip({
      lesson,
      left,
      top,
      placeAbove,
    });
  };

  const recordedTotal = summary.totalPresent + summary.totalAbsent;

  return (
    <Card className="border-border/80 shadow-sm min-w-0 overflow-hidden bg-white">
      <CardHeader className="flex flex-col gap-3 pb-4 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg sm:text-xl font-extrabold text-slate-900 flex flex-wrap items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <BarChart3 className="w-5 h-5" />
              </span>
              <span>{t("title")}</span>
              <span className="text-sm font-semibold text-slate-500">
                ({branchName})
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border transition-colors ${
                  isUpdating
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}
                title={formattedUpdatedTime ? t("updatedAt", { time: formattedUpdatedTime }) : t("live")}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                {t("live")}
              </span>
            </CardTitle>
            <p className="text-xs sm:text-sm text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{t("subtitle")}</span>
              <span className="text-primary font-semibold inline-flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" />
                {t("clickToTakeAttendance")}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {lessonsData.length > recordedLessons.length && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs sm:text-sm">
                <button
                  type="button"
                  onClick={() => setViewMode("recorded")}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    viewMode === "recorded"
                      ? "bg-primary text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {t("recordedSessions")} ({recordedLessons.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("all")}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    viewMode === "all"
                      ? "bg-primary text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {t("allSessions")} ({lessonsData.length})
                </button>
              </div>
            )}

            <Badge
              variant={
                summary.overallRate >= 75
                  ? "success"
                  : summary.overallRate >= 50
                  ? "warning"
                  : "danger"
              }
              size="md"
              withDot
              className="text-xs sm:text-sm font-bold px-3 py-1.5"
            >
              {t("rate")}: {Math.round(summary.overallRate)}%
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Enlarged KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-emerald-50/75 border border-emerald-200/80 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <p className="text-2xl sm:text-3xl font-extrabold text-emerald-900 leading-none tabular-nums">
                  {summary.totalPresent}
                </p>
                {summary.totalCatchUp > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-xs font-bold text-sky-700 bg-sky-100 border border-sky-200 px-1.5 py-0.5 rounded-md">
                    +{summary.totalCatchUp}
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-emerald-700 font-semibold mt-1 truncate">
                {t("present")}
              </p>
              {summary.totalCatchUp > 0 && (
                <p className="text-[11px] font-semibold text-sky-700 mt-0.5 truncate">
                  {t("catchUpNote", { count: summary.totalCatchUp })}
                </p>
              )}
            </div>
          </div>

          <div className="bg-rose-50/75 border border-rose-200/80 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <UserX className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl sm:text-3xl font-extrabold text-rose-900 leading-none tabular-nums">
                {summary.totalAbsent}
              </p>
              <p className="text-xs sm:text-sm text-rose-700 font-semibold mt-1 truncate">
                {t("absent")}
              </p>
              {summary.totalExcused > 0 && (
                <p className="text-[11px] font-semibold text-amber-700 mt-0.5 truncate">
                  {t("excusedNote", { count: summary.totalExcused })}
                </p>
              )}
            </div>
          </div>

          <div className="bg-blue-50/75 border border-blue-200/80 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl sm:text-3xl font-extrabold text-blue-900 leading-none tabular-nums">
                {summary.totalExpected}
              </p>
              <p className="text-xs sm:text-sm text-blue-700 font-semibold mt-1 leading-tight">
                {recordedTotal > 0
                  ? t("recordedOutOfExpected", {
                      recorded: recordedTotal,
                      expected: summary.totalExpected,
                    })
                  : t("totalExpected")}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-white text-primary border border-slate-200 flex items-center justify-center shrink-0 font-extrabold text-base">
              %
            </div>
            <div className="min-w-0">
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-none tabular-nums">
                {Math.round(summary.overallRate)}%
              </p>
              <p className="text-xs sm:text-sm text-slate-600 font-semibold mt-1 truncate">
                {t("rate")}
              </p>
              {formattedUpdatedTime && (
                <p className="text-[11px] font-medium text-slate-400 mt-0.5 flex items-center gap-1 truncate">
                  <Radio className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>{formattedUpdatedTime}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Chart View */}
        {shouldRenderChart ? (
          <div className="space-y-4">
            {/* Legend + Scroll Controls Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm font-semibold text-slate-700">
                <span className="inline-flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-sm bg-emerald-500 shadow-xs shrink-0" />
                  <span>{t("regularPresent")}</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-sm bg-sky-500 ring-2 ring-sky-200 shadow-xs shrink-0" />
                  <span>{t("catchUp")}</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-sm bg-rose-500 shadow-xs shrink-0" />
                  <span>{t("absent")}</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                  {t("groupsCount", { count: activeLessons.length })}
                </span>
                {hasOverflow && (
                  <div className="flex items-center gap-1.5">
                    <span className="hidden md:inline text-xs text-slate-400 me-1">
                      {t("scrollHint")}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleScrollStep("prev")}
                      aria-label={t("scrollPrev")}
                      className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center shadow-sm transition-colors cursor-pointer"
                    >
                      {isRtl ? (
                        <ChevronRight className="w-4 h-4" />
                      ) : (
                        <ChevronLeft className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleScrollStep("next")}
                      aria-label={t("scrollNext")}
                      className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center shadow-sm transition-colors cursor-pointer"
                    >
                      {isRtl ? (
                        <ChevronLeft className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Interactive Scrollable Column Chart */}
            <div className="flex items-stretch min-w-0 rounded-2xl border border-slate-200/80 bg-slate-50/40 p-2 sm:p-4">
              {/* Pinned Y-Axis aligned to exact plot height */}
              <div
                aria-hidden="true"
                className="w-10 sm:w-12 shrink-0 flex flex-col select-none pe-2"
              >
                <div className="mt-10 h-[260px] sm:h-[300px] relative">
                  {yTicks.map((tick) => {
                    const pct = (tick / yMax) * 100;
                    return (
                      <div
                        key={tick}
                        style={{ bottom: `${pct}%` }}
                        className="absolute inset-x-0 translate-y-1/2 flex justify-end"
                      >
                        <span className="text-xs sm:text-sm font-bold text-slate-400 tabular-nums">
                          {tick}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Scrollable Group Columns Container */}
              <div
                ref={scrollTrackRef}
                onScroll={() => setHoveredTooltip(null)}
                className="flex-1 min-w-0 overflow-x-auto scrollbar-thin pb-2"
              >
                <div className="relative min-w-full w-max flex items-stretch gap-3 sm:gap-4 px-1">
                  {activeLessons.map((lesson) => {
                    const totalPresentHeightPct =
                      yMax > 0 ? Math.min(100, (lesson.present / yMax) * 100) : 0;
                    const catchUpSharePct =
                      lesson.present > 0 ? (lesson.catchUp / lesson.present) * 100 : 0;
                    const absentHeightPct =
                      yMax > 0 ? Math.min(100, (lesson.absent / yMax) * 100) : 0;

                    const href = `/list/attendance/take/${lesson.lessonId}?date=${encodeURIComponent(
                      summary.dateStr
                    )}`;

                    return (
                      <Link
                        key={`${lesson.lessonId}-${lesson.timeSlot}`}
                        href={href}
                        prefetch={false}
                        onMouseEnter={(e) => handleColumnHover(e, lesson)}
                        onMouseLeave={() => setHoveredTooltip(null)}
                        onFocus={(e) => handleColumnHover(e, lesson)}
                        onBlur={() => setHoveredTooltip(null)}
                        className="group relative flex-1 min-w-[168px] sm:min-w-[188px] max-w-[260px] shrink-0 rounded-2xl border border-slate-200/70 bg-white/90 hover:bg-white hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-all duration-200 px-3 pt-2 pb-3 flex flex-col"
                      >
                        {/* Plot Area (exact match to Y-axis height + top label headroom) */}
                        <div className="relative mt-8 h-[260px] sm:h-[300px] border-b-2 border-slate-200 group-hover:border-primary/40 transition-colors flex items-end justify-center gap-3 sm:gap-4 px-2">
                          {/* Background Y-Axis Horizontal Gridlines */}
                          {yTicks
                            .filter((tick) => tick > 0)
                            .map((tick) => (
                              <div
                                key={tick}
                                style={{ bottom: `${(tick / yMax) * 100}%` }}
                                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-200/80"
                              />
                            ))}

                          {/* Presence Column (Regular + Catch-Up Students) */}
                          <div className="relative h-full w-12 sm:w-14 flex flex-col justify-end items-center z-10">
                            {/* Floating Total + CatchUp Pill above the column */}
                            <div
                              style={{
                                bottom: `calc(${
                                  lesson.present > 0 ? Math.max(totalPresentHeightPct, 3) : 0
                                }% + 6px)`,
                              }}
                              className="absolute inset-x-0 flex flex-col items-center gap-0.5 transition-all duration-500 ease-out pointer-events-none"
                            >
                              {lesson.catchUp > 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-extrabold bg-sky-100 text-sky-800 border border-sky-300 shadow-sm leading-none whitespace-nowrap">
                                  <UserPlus className="w-2.5 h-2.5" />+{lesson.catchUp}
                                </span>
                              )}
                              <span
                                className={`text-sm sm:text-base font-extrabold tabular-nums leading-none ${
                                  lesson.present > 0 ? "text-emerald-700" : "text-slate-300"
                                }`}
                              >
                                {lesson.present}
                              </span>
                            </div>

                            {/* Stacked Bar Column */}
                            <div
                              style={{
                                height:
                                  lesson.present > 0
                                    ? `${Math.max(totalPresentHeightPct, 3)}%`
                                    : "3px",
                              }}
                              className={`w-full rounded-t-xl overflow-hidden flex flex-col justify-end transition-all duration-500 ease-out ${
                                lesson.present > 0
                                  ? "shadow-sm group-hover:brightness-105"
                                  : "bg-slate-200/80"
                              }`}
                            >
                              {lesson.catchUp > 0 && (
                                <div
                                  style={{ height: `${catchUpSharePct}%` }}
                                  className="w-full min-h-[6px] bg-gradient-to-t from-sky-500 to-cyan-400 border-b border-white/60 transition-all duration-500 ease-out"
                                />
                              )}
                              {lesson.regularPresent > 0 && (
                                <div className="w-full flex-1 bg-gradient-to-t from-emerald-600 to-emerald-400 transition-all duration-500 ease-out" />
                              )}
                            </div>
                          </div>

                          {/* Absent Column */}
                          <div className="relative h-full w-12 sm:w-14 flex flex-col justify-end items-center z-10">
                            <div
                              style={{
                                bottom: `calc(${
                                  lesson.absent > 0 ? Math.max(absentHeightPct, 3) : 0
                                }% + 6px)`,
                              }}
                              className="absolute inset-x-0 flex flex-col items-center transition-all duration-500 ease-out pointer-events-none"
                            >
                              <span
                                className={`text-sm sm:text-base font-extrabold tabular-nums leading-none ${
                                  lesson.absent > 0 ? "text-rose-600" : "text-slate-300"
                                }`}
                              >
                                {lesson.absent}
                              </span>
                            </div>

                            <div
                              style={{
                                height:
                                  lesson.absent > 0
                                    ? `${Math.max(absentHeightPct, 3)}%`
                                    : "3px",
                              }}
                              className={`w-full rounded-t-xl transition-all duration-500 ease-out ${
                                lesson.absent > 0
                                  ? "bg-gradient-to-t from-rose-600 to-rose-400 shadow-sm group-hover:brightness-105"
                                  : "bg-slate-200/80"
                              }`}
                            />
                          </div>
                        </div>

                        {/* Spacious Wrapped Group Metadata & Clickable Call-to-Action */}
                        <div className="pt-3 flex-1 flex flex-col justify-between items-center text-center gap-2">
                          <div className="space-y-1.5 w-full">
                            <p
                              className="text-sm sm:text-[15px] font-extrabold text-slate-900 group-hover:text-primary leading-snug line-clamp-2 break-words transition-colors"
                              title={lesson.className}
                            >
                              {lesson.className}
                            </p>

                            <div className="flex flex-wrap items-center justify-center gap-1.5">
                              <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md tabular-nums">
                                <Clock className="w-3 h-3 text-slate-500" />
                                {lesson.timeSlot}
                              </span>

                              {lesson.total > 0 ? (
                                <span
                                  className={`text-xs font-extrabold px-2 py-0.5 rounded-md tabular-nums ${
                                    lesson.rate >= 75
                                      ? "bg-emerald-100 text-emerald-800"
                                      : lesson.rate >= 50
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-rose-100 text-rose-800"
                                  }`}
                                >
                                  {Math.round(lesson.rate)}%
                                </span>
                              ) : (
                                <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                  {t("notRecordedYet")}
                                </span>
                              )}
                            </div>

                            {lesson.isTeacherAbsent && (
                              <span className="inline-block text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                                {t("teacherAbsent")}
                              </span>
                            )}
                          </div>

                          <div className="w-full pt-1.5 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500">
                            <span>{t("enrolledCount", { count: lesson.enrolled })}</span>
                            <span className="inline-flex items-center gap-0.5 text-primary font-bold group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-transform">
                              {t("takeAttendanceAction")}
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-10 px-4 text-center space-y-3 bg-slate-50/70 rounded-2xl border border-dashed border-slate-300">
            <p className="text-slate-600 text-sm sm:text-base font-medium">
              {t("noRecordsYet")}
            </p>
            {lessonsData.length > 0 && viewMode === "recorded" && (
              <button
                type="button"
                onClick={() => setViewMode("all")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors cursor-pointer"
              >
                {t("showAllSessions")} ({lessonsData.length})
              </button>
            )}
          </div>
        )}
      </CardContent>

      {/* Non-clipping Fixed Viewport Hover Tooltip */}
      {hoveredTooltip && (
        <div
          role="tooltip"
          style={{
            left: `${hoveredTooltip.left}px`,
            top: `${hoveredTooltip.top}px`,
            transform: hoveredTooltip.placeAbove
              ? "translate(-50%, -100%)"
              : "translate(-50%, 0)",
          }}
          className="fixed z-50 pointer-events-none w-64 bg-white/95 backdrop-blur-sm p-3.5 rounded-2xl border border-slate-200 shadow-xl text-xs sm:text-sm space-y-2"
        >
          <div className="border-b border-slate-100 pb-2">
            <p className="font-extrabold text-slate-900 leading-snug">
              {hoveredTooltip.lesson.className}
            </p>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">
              {hoveredTooltip.lesson.timeSlot}
            </p>
          </div>

          {Boolean(hoveredTooltip.lesson.isTeacherAbsent) && (
            <div className="text-rose-700 font-bold text-xs bg-rose-50 px-2 py-1 rounded-lg border border-rose-200">
              {t("teacherAbsent")}
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4 text-emerald-700 font-bold">
              <span>{t("present")}:</span>
              <span className="tabular-nums">{hoveredTooltip.lesson.present}</span>
            </div>
            {hoveredTooltip.lesson.catchUp > 0 && (
              <div className="ps-2.5 space-y-0.5 text-xs border-s-2 border-sky-300">
                <div className="flex items-center justify-between text-slate-600">
                  <span>{t("regularPresent")}:</span>
                  <span className="font-bold tabular-nums">
                    {hoveredTooltip.lesson.regularPresent}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sky-700 font-bold">
                  <span>{t("catchUp")}:</span>
                  <span className="tabular-nums">+{hoveredTooltip.lesson.catchUp}</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 text-rose-600 font-bold">
              <span>{t("absent")}:</span>
              <span className="tabular-nums">{hoveredTooltip.lesson.absent}</span>
            </div>
            {hoveredTooltip.lesson.excused > 0 && (
              <div className="flex items-center justify-between gap-4 text-amber-700 text-xs font-semibold">
                <span>{t("excused")}:</span>
                <span className="tabular-nums">{hoveredTooltip.lesson.excused}</span>
              </div>
            )}
            {hoveredTooltip.lesson.enrolled > 0 && (
              <div className="flex items-center justify-between gap-4 text-slate-500 text-xs font-semibold">
                <span>{t("totalExpected")}:</span>
                <span className="tabular-nums">{hoveredTooltip.lesson.enrolled}</span>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between font-extrabold text-slate-900">
            <span>{t("rate")}:</span>
            <span>
              {hoveredTooltip.lesson.total > 0
                ? `${Math.round(hoveredTooltip.lesson.rate)}%`
                : t("notRecordedYet")}
            </span>
          </div>

          <div className="pt-1 text-center text-xs font-bold text-primary">
            {t("clickToTakeAttendance")}
          </div>
        </div>
      )}
    </Card>
  );
}
