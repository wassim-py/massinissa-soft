"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { RevenueDashboardData } from "@/lib/revenue";
import RevenueFilterBar from "./RevenueFilterBar";
import RevenueSummaryCards from "./RevenueSummaryCards";
import BranchComparisonChart from "./BranchComparisonChart";
import RevenueAggregationTable from "./RevenueAggregationTable";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";

interface DailyRevenueDashboardProps {
  data: RevenueDashboardData;
}

export default function DailyRevenueDashboard({ data }: DailyRevenueDashboardProps) {
  const t = useTranslations("finance");
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<"overview" | "raw_ledger">("overview");

  const branchTitle =
    data.selectedBranchId === "all"
      ? t("headquartersConsolidated")
      : (data.branches.find((b) => b.id === Number(data.selectedBranchId))?.name ||
        t("branchTitleWithId", { id: data.selectedBranchId }));

  const formatDZD = (num: number) =>
    locale === "ar"
      ? `${num.toLocaleString("ar-DZ")} دج`
      : `${num.toLocaleString("fr-DZ")} DZD`;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border/80">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-section-title font-bold text-gray-900">
              {t("dailyRevenueTitle")}
            </h2>
            <Badge variant="primary" size="sm">
              {branchTitle}
            </Badge>
          </div>
          <p className="text-form-helper text-muted mt-0.5">
            {t("dailyRevenueDocHelper")}
          </p>
        </div>

        {/* Tab switch between analytics overview and raw ledger */}
        <div className="flex items-center bg-surface border border-border p-1 rounded-xl shadow-xs text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === "overview"
                ? "bg-primary text-white shadow-xs"
                : "text-muted hover:text-gray-900 hover:bg-surface-subtle"
            }`}
          >
            {t("analyticsOverviewTab")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("raw_ledger")}
            className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === "raw_ledger"
                ? "bg-primary text-white shadow-xs"
                : "text-muted hover:text-gray-900 hover:bg-surface-subtle"
            }`}
          >
            {t("rawLedgerTab")}
          </button>
        </div>
      </div>

      {/* Filter and Range Controls */}
      <RevenueFilterBar
        branches={data.branches}
        selectedBranchId={data.selectedBranchId}
        periodMode={data.periodMode}
        dateFrom={data.dateFrom}
        dateTo={data.dateTo}
      />

      {activeTab === "overview" ? (
        <div className="space-y-6">
          {/* Summary Metric Cards */}
          <RevenueSummaryCards summary={data.summary} />

          {/* Branch Comparison Chart */}
          <div className="w-full">
            <BranchComparisonChart data={data.branchComparison} />
          </div>

          {/* Aggregation Table */}
          <RevenueAggregationTable
            timeline={data.timeline}
            periodMode={data.periodMode}
          />
        </div>
      ) : (
        /* Raw DailyLedger Entries Table */
        <Card className="border-border/80 shadow-xs overflow-hidden bg-surface">
          <CardContent className="p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-section-title font-bold text-gray-900">
                {t("ledgerEntriesTitle")}
              </h3>
              <p className="text-form-helper text-muted mt-0.5">
                {t("ledgerEntriesHelper")}
              </p>
            </div>

            <DataTable
              columns={[
                { header: t("ledgerIdCol"), accessor: "id" },
                { header: t("ledgerDateCol"), accessor: "date" },
                { header: t("ledgerBranchCol"), accessor: "branchName" },
                { header: t("ledgerTypeCol"), accessor: "type" },
                { header: t("ledgerAmountCol"), accessor: "amount", align: "end" },
              ]}
              data={data.recentLedgerEntries}
              renderRow={(entry) => (
                <tr key={entry.id} className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body">
                  <td className="p-3.5 font-mono text-muted text-xs">#{entry.id}</td>
                  <td className="p-3.5 font-medium text-gray-700">
                    {new Date(entry.date).toISOString().split("T")[0]}
                  </td>
                  <td className="p-3.5 font-semibold text-gray-900">
                    {entry.branchName}
                  </td>
                  <td className="p-3.5">
                    <Badge
                      variant={
                        entry.type === "REFUND"
                          ? "danger"
                          : entry.type === "TUITION"
                          ? "primary"
                          : entry.type === "INSCRIPTION"
                          ? "success"
                          : entry.type === "BOOK"
                          ? "warning"
                          : "secondary"
                      }
                      size="sm"
                    >
                      {entry.type}
                    </Badge>
                  </td>
                  <td
                    className={`p-3.5 font-bold font-mono text-end ${
                      entry.type === "REFUND" ? "text-danger" : "text-success-text"
                    }`}
                  >
                    {entry.type === "REFUND" ? "-" : "+"}
                    {formatDZD(entry.amount)}
                  </td>
                </tr>
              )}
              emptyTitle={t("noLedgerEntriesTitle")}
              emptyDescription={t("noLedgerEntriesDesc")}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
