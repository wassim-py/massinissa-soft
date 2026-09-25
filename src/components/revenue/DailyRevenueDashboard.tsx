"use client";

import { useTranslations, useLocale } from "next-intl";
import { RevenueDashboardData } from "@/lib/revenue";
import RevenueFilterBar from "./RevenueFilterBar";
import RevenueSummaryCards from "./RevenueSummaryCards";
import BranchComparisonChart from "./BranchComparisonChart";
import RevenueAggregationTable from "./RevenueAggregationTable";
import RevenuePaymentsTable from "./RevenuePaymentsTable";
import { Badge } from "@/components/ui/Badge";

interface DailyRevenueDashboardProps {
  data: RevenueDashboardData;
}

export default function DailyRevenueDashboard({ data }: DailyRevenueDashboardProps) {
  const t = useTranslations("finance");
  const locale = useLocale();

  const branchTitle =
    data.selectedBranchId === "all"
      ? t("headquartersConsolidated")
      : (data.branches.find((b) => b.id === Number(data.selectedBranchId))?.name ||
        t("branchTitleWithId", { id: data.selectedBranchId }));

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
      </div>

      {/* Filter and Range Controls */}
      <RevenueFilterBar
        branches={data.branches}
        selectedBranchId={data.selectedBranchId}
        periodMode={data.periodMode}
        dateFrom={data.dateFrom}
        dateTo={data.dateTo}
      />

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

        {/* Detailed Payments & Vouchers Records Table */}
        <RevenuePaymentsTable vouchers={data.vouchers || []} />
      </div>
    </div>
  );
}
