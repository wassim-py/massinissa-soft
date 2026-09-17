"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable, Column } from "@/components/ui/DataTable";
import { TeacherPayrollCalculation } from "@/lib/payroll";
import { Coins, CheckCircle2, Building2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

interface TeacherPayrollSectionProps {
  payroll: TeacherPayrollCalculation | null;
  periodLabel: string;
}

export default function TeacherPayrollSection({
  payroll,
  periodLabel,
}: TeacherPayrollSectionProps) {
  const t = useTranslations("teacherProfile");
  const locale = useLocale();

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  };

  const formatDZD = (num: number) => `${Number(num || 0).toLocaleString(locale)} DZD`;

  if (!payroll) {
    return (
      <Card className="border-border/80 shadow-xs">
        <CardContent className="p-8 text-center text-muted text-table-body">
          {t("noPayrollData", { period: periodLabel })}
        </CardContent>
      </Card>
    );
  }

  const percentage = payroll.percentageOfSessionFee ?? 0;
  const sessions = payroll.sessionDetails || [];

  const sessionColumns: Column[] = [
    { header: t("colDateTime"), accessor: "startsAt" },
    { header: t("colGroup"), accessor: "className" },
    { header: t("colBranch"), accessor: "branchName" },
    { header: t("colType"), accessor: "type", align: "center" },
    { header: t("colStudentsPresent"), accessor: "presentCount", align: "center" },
    { header: t("colSessionPrice"), accessor: "sessionPrice", align: "end" },
    { header: t("colTeacherCut"), accessor: "teacherCut", align: "end" },
    { header: t("colLessonTotal"), accessor: "lessonAmount", align: "end" },
  ];

  return (
    <Card className="border-border/80 shadow-xs">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-primary" />
              <span>{t("payrollTitle")}</span>
            </CardTitle>
            <CardDescription className="mt-1">
              {t("payrollDesc")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="primary" size="md">
              {t("period", { period: periodLabel })}
            </Badge>
            {percentage > 0 && (
              <Badge variant="success" size="md">
                {t("approvedRate", { rate: percentage })}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-2">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Sessions count */}
          <div className="bg-surface-subtle/70 p-4 rounded-xl border border-border/80 flex flex-col justify-between shadow-xs">
            <span className="text-xs text-muted font-medium">{t("completedSessions")}</span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-gray-900">
                {payroll.totalSessions}
              </span>
              <span className="text-xs text-muted">{t("sessionsUnit")}</span>
            </div>
          </div>

          {/* Total Actual Attendances */}
          <div className="bg-surface-subtle/70 p-4 rounded-xl border border-border/80 flex flex-col justify-between shadow-xs">
            <span className="text-xs text-muted font-medium">{t("actualAttendance")}</span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-primary">
                {payroll.totalPresentAttendances ?? 0}
              </span>
              <span className="text-xs text-muted">{t("attendanceUnit")}</span>
            </div>
          </div>

          {/* Gross Amount */}
          <div className="bg-surface-subtle/70 p-4 rounded-xl border border-border/80 flex flex-col justify-between shadow-xs">
            <span className="text-xs text-muted font-medium">{t("grossSalary")}</span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-success-text">
                {formatDZD(payroll.grossAmount)}
              </span>
            </div>
          </div>

          {/* Deductions: Advances & Photocopies */}
          <div className="bg-surface-subtle/70 p-4 rounded-xl border border-border/80 flex flex-col justify-between shadow-xs">
            <span className="text-xs text-muted font-medium">{t("totalDeductions")}</span>
            <div className="mt-1 flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">{t("copiesDeduction")}</span>
                <span className="font-semibold text-warning-text">
                  - {formatDZD(payroll.photocopyDeductions)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">{t("advancesDeduction")}</span>
                <span className="font-semibold text-danger">
                  - {formatDZD(payroll.salaryAdvances)}
                </span>
              </div>
            </div>
          </div>

          {/* Net Amount Due */}
          <div className="bg-emerald-50/70 border-2 border-emerald-300 p-4 rounded-xl flex flex-col justify-between col-span-2 lg:col-span-1 shadow-xs">
            <span className="text-xs font-bold text-emerald-800">{t("netDueAmount")}</span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-black text-emerald-900">
                {formatDZD(payroll.netAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Granular Session Breakdown Table using DataTable */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{t("granularBreakdownTitle")}</span>
            </h4>
            <span className="text-xs text-muted">
              {t("formulaNote", { rate: percentage })}
            </span>
          </div>

          <DataTable
            columns={sessionColumns}
            data={sessions}
            renderRow={(s, idx) => (
              <tr
                key={idx}
                className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
              >
                <td className="p-3.5 text-gray-800 font-medium">
                  {formatDate(s.startsAt)}
                </td>
                <td className="p-3.5 font-semibold text-gray-900">
                  {s.className}
                </td>
                <td className="p-3.5 text-gray-600">
                  {s.branchName}
                </td>
                <td className="p-3.5 text-center">
                  {s.isFree ? (
                    <Badge variant="success" size="sm">{t("lessonTypeFree")}</Badge>
                  ) : s.isExtra ? (
                    <Badge variant="warning" size="sm">{t("lessonTypeExtra")}</Badge>
                  ) : s.isCatchUp ? (
                    <Badge variant="secondary" size="sm">{t("lessonTypeCatchUp")}</Badge>
                  ) : (
                    <Badge variant="neutral" size="sm">{t("lessonTypeNormal")}</Badge>
                  )}
                </td>
                <td className="p-3.5 text-center font-bold text-primary">
                  {s.presentCount} {t("presentUnit")}
                </td>
                <td className="p-3.5 text-end text-gray-700">
                  {formatDZD(s.sessionPrice)}
                </td>
                <td className="p-3.5 text-end text-success-text font-semibold">
                  {formatDZD(Math.round(s.teacherCut))}
                </td>
                <td className="p-3.5 text-end font-bold text-gray-900">
                  {formatDZD(s.lessonAmount)}
                </td>
              </tr>
            )}
            emptyTitle={t("emptyPayrollTitle")}
            emptyDescription={t("emptyPayrollDesc")}
          />
        </div>

        {/* Consolidated Branch Breakdown (§1.3) */}
        {payroll.branchBreakdown.length > 0 && (
          <div className="pt-4 border-t border-border/80">
            <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5 mb-2.5">
              <Building2 className="w-3.5 h-3.5 text-muted-dark" />
              <span>{t("branchBreakdownTitle")}</span>
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {payroll.branchBreakdown.map((b) => (
                <div
                  key={b.branchId}
                  className="bg-surface-subtle/70 p-3.5 rounded-xl border border-border/80 flex items-center justify-between text-xs shadow-xs"
                >
                  <div>
                    <span className="font-semibold text-gray-900 block">{b.branchName}</span>
                    <span className="text-xs text-muted">{b.sessionsCount} {t("sessionsUnit")}</span>
                  </div>
                  <div className="text-end">
                    <span className="font-bold text-success-text text-sm block">
                      {formatDZD(b.amount)}
                    </span>
                    <span className="text-xs text-muted">
                      {t("effectiveRatePerSession", { rate: formatDZD(Math.round(b.effectiveRate)) })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
