"use client";

import React, { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BarChart3, UserCheck, UserX, Users } from "lucide-react";

export interface TodayLessonAttendanceData {
  lessonId: number;
  className: string;
  timeSlot: string;
  present: number;
  absent: number;
  excused?: number;
  enrolled?: number;
  total: number;
  rate: number;
  isTeacherAbsent?: boolean;
}

export interface TodayAttendanceChartProps {
  totalPresent: number;
  totalAbsent: number;
  totalExcused?: number;
  totalExpected: number;
  totalExpectedRecorded?: number;
  overallRate: number;
  lessonsData: TodayLessonAttendanceData[];
  branchName: string;
}

export default function TodayAttendanceChart({
  totalPresent,
  totalAbsent,
  totalExcused = 0,
  totalExpected,
  totalExpectedRecorded,
  overallRate,
  lessonsData,
  branchName,
}: TodayAttendanceChartProps) {
  const t = useTranslations("dashboard.todayAttendance");
  const locale = useLocale();

  const recordedLessons = useMemo(
    () => lessonsData.filter((l) => l.total > 0),
    [lessonsData]
  );

  const [viewMode, setViewMode] = useState<"recorded" | "all">("recorded");

  const activeLessons = useMemo(() => {
    if (viewMode === "recorded") {
      return recordedLessons.length > 0 ? recordedLessons : lessonsData;
    }
    return lessonsData;
  }, [viewMode, recordedLessons, lessonsData]);

  // Ensure each entry has a unique chartId and displayLabel with timeSlot
  const chartData = useMemo(() => {
    return activeLessons.map((l) => ({
      ...l,
      chartId: `${l.lessonId}-${l.timeSlot}`,
      displayLabel: `${l.className} (${l.timeSlot})`,
    }));
  }, [activeLessons]);

  const hasData = chartData.length > 0 && (totalPresent > 0 || totalAbsent > 0 || recordedLessons.length > 0);

  return (
    <Card className="border-border/80 shadow-xs">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <span>{t("title")}</span>
            <span className="text-xs font-normal text-muted">
              ({branchName})
            </span>
          </CardTitle>
          <p className="text-xs text-muted mt-0.5">{t("subtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {recordedLessons.length > 0 && lessonsData.length > recordedLessons.length && (
            <div className="flex items-center gap-1 bg-surface-subtle p-1 rounded-lg border border-border text-xs">
              <button
                type="button"
                onClick={() => setViewMode("recorded")}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  viewMode === "recorded"
                    ? "bg-primary text-white shadow-xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t("recordedSessions")} ({recordedLessons.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode("all")}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  viewMode === "all"
                    ? "bg-primary text-white shadow-xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t("allSessions")} ({lessonsData.length})
              </button>
            </div>
          )}

          <Badge
            variant={
              overallRate >= 75
                ? "success"
                : overallRate >= 50
                ? "warning"
                : "danger"
            }
            size="md"
            withDot
          >
            {t("rate")}: {Math.round(overallRate)}%
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-lg font-bold text-emerald-800 leading-none">
                {totalPresent}
              </p>
              <p className="text-[11px] text-emerald-600 font-medium mt-1">
                {t("present")}
              </p>
            </div>
          </div>

          <div className="bg-rose-50/60 border border-rose-100 rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <UserX className="w-4 h-4" />
            </div>
            <div>
              <p className="text-lg font-bold text-rose-800 leading-none">
                {totalAbsent}
              </p>
              <p className="text-[11px] text-rose-600 font-medium mt-1">
                {totalExcused > 0 ? `${t("absent")} (${t("excusedNote", { count: totalExcused })})` : t("absent")}
              </p>
            </div>
          </div>

          <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <p className="text-lg font-bold text-blue-800 leading-none">
                {totalExpected}
              </p>
              <p className="text-[11px] text-blue-600 font-medium mt-1">
                {totalPresent + totalAbsent > 0
                  ? t("recordedOutOfExpected", { recorded: totalPresent + totalAbsent, expected: totalExpected })
                  : t("totalExpected")}
              </p>
            </div>
          </div>

          <div className="bg-surface-subtle border border-border rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-surface text-primary border border-border flex items-center justify-center shrink-0 font-bold text-xs">
              %
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 leading-none">
                {Math.round(overallRate)}%
              </p>
              <p className="text-[11px] text-muted font-medium mt-1">
                {t("rate")}
              </p>
            </div>
          </div>
        </div>

        {/* Chart View */}
        {hasData ? (
          <div className="w-full pt-2 overflow-x-auto overflow-y-hidden scrollbar-thin">
            <div
              style={{
                minWidth: chartData.length > 5 ? `${Math.max(chartData.length * 80, 500)}px` : "100%",
                height: 290,
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 30 }}
                  barGap={4}
                  barSize={20}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis
                    dataKey="displayLabel"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    interval={0}
                    tickFormatter={(val: string) =>
                      val && val.length > 18 ? `${val.slice(0, 17)}…` : val
                    }
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as typeof chartData[0];
                        return (
                          <div className="bg-surface p-3 rounded-lg border border-border shadow-md text-xs space-y-1">
                            <p className="font-bold text-gray-900">
                              {data.className}
                            </p>
                            <p className="text-muted text-[11px]">
                              {data.timeSlot}
                            </p>
                            {Boolean(data.isTeacherAbsent) && (
                              <div className="text-rose-600 font-semibold text-[11px] bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                {locale === "ar" ? "الأستاذ غائب" : "Enseignant absent"}
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-4 text-emerald-600 font-semibold">
                              <span>{t("present")}:</span>
                              <span>{data.present}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-rose-600 font-semibold">
                              <span>{t("absent")}:</span>
                              <span>{data.absent}</span>
                            </div>
                            {Boolean(data.excused && data.excused > 0) && (
                              <div className="flex items-center justify-between gap-4 text-amber-600 text-[11px]">
                                <span>{t("excused")}:</span>
                                <span>{data.excused}</span>
                              </div>
                            )}
                            {Boolean(data.enrolled && data.enrolled > 0) && (
                              <div className="flex items-center justify-between gap-4 text-muted text-[11px]">
                                <span>{t("totalExpected")}:</span>
                                <span>{data.enrolled}</span>
                              </div>
                            )}
                            <div className="mt-1 pt-1 border-t border-border flex items-center justify-between font-bold text-gray-800">
                              <span>{t("rate")}:</span>
                              <span>
                                {data.total > 0
                                  ? `${Math.round(data.rate)}%`
                                  : t("notRecordedYet")}
                              </span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                <Legend
                  verticalAlign="top"
                  wrapperStyle={{ paddingBottom: "15px", fontSize: "12px" }}
                />
                <Bar
                  dataKey="present"
                  name={t("present")}
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="absent"
                  name={t("absent")}
                  fill="#f43f5e"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="py-8 px-4 text-center text-muted text-sm bg-surface-subtle/40 rounded-xl border border-dashed border-border">
            {t("noRecordsYet")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
