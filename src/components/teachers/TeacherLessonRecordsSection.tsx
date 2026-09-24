"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, Column } from "@/components/ui/DataTable";
import { Layers } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

export interface LessonRecordItem {
  id: number;
  startsAt: Date | string;
  endsAt: Date | string;
  className: string;
  branchName: string;
  classroomName: string;
  isExtra: boolean;
  extraFee?: number | null;
  isCatchUp: boolean;
  isFree: boolean;
  presentCount: number;
  absentCount: number;
  totalAttendances: number;
}

export interface MonthLessonData {
  label: string;
  lessons: LessonRecordItem[];
}

function formatDate(date: Date | string, locale: string) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function TeacherLessonRecordsSection({
  thisMonth,
  lastMonth,
}: {
  thisMonth: MonthLessonData;
  lastMonth: MonthLessonData;
}) {
  const t = useTranslations("teacherProfile");
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<"thisMonth" | "lastMonth">("thisMonth");

  const currentMonthData = activeTab === "thisMonth" ? thisMonth : lastMonth;
  const lessons = currentMonthData.lessons;

  // Breakdown counts
  const normalCount = lessons.filter((l) => !l.isExtra && !l.isCatchUp && !l.isFree).length;
  const extraCount = lessons.filter((l) => l.isExtra).length;
  const catchUpCount = lessons.filter((l) => l.isCatchUp).length;
  const freeCount = lessons.filter((l) => l.isFree).length;
  const totalLessons = lessons.length;

  const lessonColumns: Column<LessonRecordItem>[] = [
    { header: t("colDateTime"), accessor: "startsAt" },
    { header: t("colGroup"), accessor: "className" },
    { header: t("colBranchRoom"), accessor: "branchName" },
    { header: t("colType"), accessor: "type", align: "center" },
    { header: t("colAttendanceRate"), accessor: "attendanceRate", align: "center" },
    { header: t("colPresentAbsent"), accessor: "attendanceCount", align: "center" },
  ];

  return (
    <Card className="border-border/80 shadow-xs">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              <span>{t("lessonRecordsTitleFull")}</span>
            </CardTitle>
            <CardDescription className="mt-1">
              {t("lessonRecordsDescFull")}
            </CardDescription>
          </div>

          {/* Tab Switcher Buttons */}
          <div className="flex items-center gap-1.5 bg-surface-subtle p-1 rounded-xl border border-border/80 shrink-0">
            <Button
              type="button"
              variant={activeTab === "thisMonth" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("thisMonth")}
              className="text-xs"
            >
              {t("thisMonth")} ({thisMonth.label})
            </Button>
            <Button
              type="button"
              variant={activeTab === "lastMonth" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("lastMonth")}
              className="text-xs"
            >
              {t("lastMonth")} ({lastMonth.label})
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-2">
        {/* Breakdown KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
          {/* Total */}
          <div className="bg-surface-subtle/70 p-3.5 rounded-xl border border-border/80 flex flex-col justify-between shadow-xs">
            <span className="text-xs text-muted font-medium">{t("totalLessonsKpi")}</span>
            <span className="text-2xl font-bold text-gray-900 mt-1 block">
              {totalLessons}
            </span>
          </div>

          {/* Normal */}
          <div className="bg-surface-subtle/70 p-3.5 rounded-xl border border-border/80 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-700 font-medium">{t("normalLessonsKpi")}</span>
              <Badge variant="neutral" size="sm">{t("lessonTypeNormal")}</Badge>
            </div>
            <span className="text-2xl font-bold text-gray-900 mt-1 block">
              {normalCount}
            </span>
          </div>

          {/* Extra */}
          <div className="bg-surface-subtle/70 p-3.5 rounded-xl border border-border/80 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-800 font-medium">{t("extraLessonsKpi")}</span>
              <Badge variant="warning" size="sm">{t("lessonTypeExtra")}</Badge>
            </div>
            <span className="text-2xl font-bold text-amber-900 mt-1 block">
              {extraCount}
            </span>
          </div>

          {/* Catch-up */}
          <div className="bg-surface-subtle/70 p-3.5 rounded-xl border border-border/80 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs text-indigo-800 font-medium">{t("catchUpLessonsKpi")}</span>
              <Badge variant="secondary" size="sm">{t("lessonTypeCatchUp")}</Badge>
            </div>
            <span className="text-2xl font-bold text-indigo-900 mt-1 block">
              {catchUpCount}
            </span>
          </div>

          {/* Free */}
          <div className="bg-surface-subtle/70 p-3.5 rounded-xl border border-border/80 flex flex-col justify-between col-span-2 sm:col-span-1 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-800 font-medium">{t("freeLessonsKpi")}</span>
              <Badge variant="success" size="sm">{t("lessonTypeFree")}</Badge>
            </div>
            <span className="text-2xl font-bold text-emerald-900 mt-1 block">
              {freeCount}
            </span>
          </div>
        </div>

        {/* Lesson Records DataTable */}
        <DataTable
          columns={lessonColumns}
          data={lessons}
          renderRow={(lesson) => (
            <tr
              key={lesson.id}
              className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
            >
              <td className="p-3.5 text-gray-800 font-medium">
                {formatDate(lesson.startsAt, locale)}
              </td>
              <td className="p-3.5 font-semibold text-gray-900">
                {lesson.className}
              </td>
              <td className="p-3.5 text-gray-600">
                <span>{lesson.branchName}</span>
                <span className="text-muted text-xs ms-1">({lesson.classroomName})</span>
              </td>
              <td className="p-3.5 text-center">
                {lesson.isFree ? (
                  <Badge variant="success" size="sm">{t("lessonTypeFree")}</Badge>
                ) : lesson.isExtra ? (
                  <Badge variant="warning" size="sm">{t("lessonTypeExtra")}</Badge>
                ) : lesson.isCatchUp ? (
                  <Badge variant="secondary" size="sm">{t("lessonTypeCatchUp")}</Badge>
                ) : (
                  <Badge variant="neutral" size="sm">{t("lessonTypeNormal")}</Badge>
                )}
              </td>
              <td className="p-3.5 text-center">
                {lesson.totalAttendances > 0 ? (
                  <span className="font-semibold text-gray-900">
                    {Math.round((lesson.presentCount / lesson.totalAttendances) * 100)}%
                  </span>
                ) : (
                  <span className="text-muted">-</span>
                )}
              </td>
              <td className="p-3.5 text-center text-xs">
                <span className="text-success-text font-bold">
                  {t("presentCountUnit", { count: lesson.presentCount })}
                </span>
                <span className="text-muted mx-1">/</span>
                <span className="text-danger font-medium">
                  {t("absentCountUnit", { count: lesson.absentCount })}
                </span>
              </td>
            </tr>
          )}
          emptyTitle={t("emptyLessonsTitle")}
          emptyDescription={t("emptyLessonsDesc", { period: currentMonthData.label })}
        />
      </CardContent>
    </Card>
  );
}
