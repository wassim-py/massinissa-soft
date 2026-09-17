"use client";

import { useTranslations, useLocale } from "next-intl";
import { TimelineBucket } from "@/lib/revenue";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface RevenueAggregationTableProps {
  timeline: TimelineBucket[];
  periodMode: "daily" | "weekly" | "monthly";
}

export default function RevenueAggregationTable({
  timeline,
  periodMode,
}: RevenueAggregationTableProps) {
  const t = useTranslations("finance");
  const locale = useLocale();

  const formatDZD = (num: number) =>
    locale === "ar"
      ? `${num.toLocaleString("ar-DZ")} دج`
      : `${num.toLocaleString("fr-DZ")} DZD`;

  // Compute column totals
  const totalTuition = timeline.reduce((s, r) => s + r.tuition, 0);
  const totalInscription = timeline.reduce((s, r) => s + r.inscription, 0);
  const totalBook = timeline.reduce((s, r) => s + r.book, 0);
  const totalAtelier = timeline.reduce((s, r) => s + r.atelierFormation, 0);
  const totalGross = timeline.reduce((s, r) => s + r.grossRevenue, 0);
  const totalRefunds = timeline.reduce((s, r) => s + r.refunds, 0);
  const totalNet = timeline.reduce((s, r) => s + r.netRevenue, 0);

  return (
    <Card className="border-border shadow-xs overflow-hidden bg-surface">
      <div className="p-5 border-b border-border flex items-center justify-between gap-3">
        <div>
          <h3 className="text-section-title font-bold text-gray-900">
            {t("timelineTableTitle")}
          </h3>
          <p className="text-form-helper text-muted mt-0.5">
            {t("timelineTableDesc")}
          </p>
        </div>
        <Badge variant="neutral" size="sm">
          {t("periodsCount", { count: timeline.length })}
        </Badge>
      </div>

      <div className="overflow-x-auto rounded-b-lg">
        <table className="w-full border-collapse text-start">
          <thead>
            <tr className="bg-surface-muted/60 border-b border-border text-start">
              <th className="py-3.5 px-4 text-table-header text-muted font-semibold tracking-wider text-start">{t("periodDateCol")}</th>
              <th className="py-3.5 px-4 text-table-header text-muted font-semibold tracking-wider text-end">{t("inscriptionCol")}</th>
              <th className="py-3.5 px-4 text-table-header text-muted font-semibold tracking-wider text-end">{t("tuitionCol")}</th>
              <th className="py-3.5 px-4 text-table-header text-muted font-semibold tracking-wider text-end">{t("bookCol")}</th>
              <th className="py-3.5 px-4 text-table-header text-muted font-semibold tracking-wider text-end">{t("atelierFormationCol")}</th>
              <th className="py-3.5 px-4 text-table-header text-success-text font-bold tracking-wider text-end bg-success-light/40">{t("grossTotalCol")}</th>
              <th className="py-3.5 px-4 text-table-header text-danger font-bold tracking-wider text-end bg-danger-light/40">{t("refundsSeparateCol")}</th>
              <th className="py-3.5 px-4 text-table-header text-primary font-bold tracking-wider text-end bg-primary-light/40">{t("netCol")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 text-table-body text-gray-700">
            {timeline.length > 0 ? (
              timeline.map((row) => (
                <tr key={row.key} className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body">
                  <td className="p-3.5 font-semibold text-gray-900">
                    <div>{row.label}</div>
                    {periodMode !== "daily" && (
                      <div className="text-[11px] text-muted font-mono">
                        {row.dateStart} {t("periodTo")} {row.dateEnd}
                      </div>
                    )}
                  </td>
                  <td className="p-3.5 text-end text-gray-700 font-mono">{row.inscription > 0 ? formatDZD(row.inscription) : "-"}</td>
                  <td className="p-3.5 text-end text-gray-700 font-mono">{row.tuition > 0 ? formatDZD(row.tuition) : "-"}</td>
                  <td className="p-3.5 text-end text-gray-700 font-mono">{row.book > 0 ? formatDZD(row.book) : "-"}</td>
                  <td className="p-3.5 text-end text-gray-700 font-mono">{row.atelierFormation > 0 ? formatDZD(row.atelierFormation) : "-"}</td>
                  <td className="p-3.5 text-end font-bold font-mono text-success-text bg-success-light/20">
                    +{formatDZD(row.grossRevenue)}
                  </td>
                  <td className="p-3.5 text-end font-bold font-mono text-danger bg-danger-light/20">
                    {row.refunds > 0 ? `-${formatDZD(row.refunds)}` : "-"}
                  </td>
                  <td className="p-3.5 text-end font-bold font-mono text-primary bg-primary-light/20">
                    {formatDZD(row.netRevenue)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="py-16 px-4 text-center text-muted">
                  {t("noTimelineData")}
                </td>
              </tr>
            )}
          </tbody>
          {timeline.length > 0 && (
            <tfoot className="bg-surface-subtle font-bold border-t-2 border-border text-table-body text-gray-900">
              <tr>
                <td className="p-3.5">{t("totalForPeriod")}</td>
                <td className="p-3.5 text-end font-mono">{formatDZD(totalInscription)}</td>
                <td className="p-3.5 text-end font-mono">{formatDZD(totalTuition)}</td>
                <td className="p-3.5 text-end font-mono">{formatDZD(totalBook)}</td>
                <td className="p-3.5 text-end font-mono">{formatDZD(totalAtelier)}</td>
                <td className="p-3.5 text-end font-mono text-success-text bg-success-light/40">+{formatDZD(totalGross)}</td>
                <td className="p-3.5 text-end font-mono text-danger bg-danger-light/40">-{formatDZD(totalRefunds)}</td>
                <td className="p-3.5 text-end font-mono text-primary bg-primary-light/40">{formatDZD(totalNet)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
