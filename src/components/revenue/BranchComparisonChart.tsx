"use client";

import { useState } from "react";
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
import { BranchComparisonItem } from "@/lib/revenue";
import { Card } from "@/components/ui/Card";

interface BranchComparisonChartProps {
  data: BranchComparisonItem[];
}

export default function BranchComparisonChart({ data }: BranchComparisonChartProps) {
  const t = useTranslations("finance");
  const locale = useLocale();
  const [viewMode, setViewMode] = useState<"fee_types" | "totals">("fee_types");

  // Format currency for tooltips and axes
  const formatDZD = (value: number) =>
    locale === "ar"
      ? `${value.toLocaleString("ar-DZ")} دج`
      : `${value.toLocaleString("fr-DZ")} DZD`;

  return (
    <Card className="border-border/80 shadow-xs p-5 flex flex-col h-full bg-surface">
      {/* Chart Header with View Mode Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 pb-3 border-b border-border/60">
        <div>
          <h3 className="text-section-title font-bold text-gray-900">
            {t("branchComparisonThree")}
          </h3>
          <p className="text-form-helper text-muted mt-0.5">
            {t("branchComparisonSubtitle")}
          </p>
        </div>

        {/* View Toggle Buttons */}
        <div className="flex items-center bg-surface-muted border border-border p-1 rounded-xl text-xs font-semibold shadow-xs">
          <button
            type="button"
            onClick={() => setViewMode("fee_types")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === "fee_types"
                ? "bg-primary text-white shadow-xs"
                : "text-muted hover:text-gray-900 hover:bg-surface"
            }`}
          >
            {t("toggleFeeTypes")}
          </button>
          <button
            type="button"
            onClick={() => setViewMode("totals")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === "totals"
                ? "bg-primary text-white shadow-xs"
                : "text-muted hover:text-gray-900 hover:bg-surface"
            }`}
          >
            {t("toggleTotalsAndRefunds")}
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === "fee_types" ? (
            <BarChart
              data={data}
              margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
              barGap={4}
              barSize={16}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis
                dataKey="branchName"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#374151", fontWeight: 600, fontSize: 13 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#6B7280", fontSize: 11 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value: any, name: any) => [formatDZD(Number(value)), name]}
                contentStyle={{
                  borderRadius: "0.75rem",
                  borderColor: "#E5E7EB",
                  boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
                  direction: locale === "ar" ? "rtl" : "ltr",
                  textAlign: locale === "ar" ? "right" : "left",
                  fontFamily: "inherit",
                  fontSize: "12px",
                }}
              />
              <Legend
                verticalAlign="top"
                wrapperStyle={{ paddingBottom: "20px", fontSize: "12px" }}
              />
              <Bar
                dataKey="tuition"
                name={t("chartTuition")}
                fill="#0284c7"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="inscription"
                name={t("chartInscription")}
                fill="#10B981"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="book"
                name={t("chartBook")}
                fill="#F59E0B"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="atelierFormation"
                name={t("chartAtelierFormation")}
                fill="#EC4899"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          ) : (
            <BarChart
              data={data}
              margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
              barGap={8}
              barSize={24}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis
                dataKey="branchName"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#374151", fontWeight: 600, fontSize: 13 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#6B7280", fontSize: 11 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value: any, name: any) => [formatDZD(Number(value)), name]}
                contentStyle={{
                  borderRadius: "0.75rem",
                  borderColor: "#E5E7EB",
                  boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
                  direction: locale === "ar" ? "rtl" : "ltr",
                  textAlign: locale === "ar" ? "right" : "left",
                  fontFamily: "inherit",
                  fontSize: "12px",
                }}
              />
              <Legend
                verticalAlign="top"
                wrapperStyle={{ paddingBottom: "20px", fontSize: "12px" }}
              />
              <Bar
                dataKey="grossRevenue"
                name={t("chartGrossRevenue")}
                fill="#10B981"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="refunds"
                name={t("chartRefunds")}
                fill="#EF4444"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="netRevenue"
                name={t("chartNetRevenue")}
                fill="#0284c7"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
