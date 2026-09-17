"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import ExportButton from "@/components/ExportButton";
import { Card } from "@/components/ui/Card";

interface RevenueFilterBarProps {
  branches: Array<{ id: number; name: string }>;
  selectedBranchId: number | "all";
  periodMode: "daily" | "weekly" | "monthly";
  dateFrom: string;
  dateTo: string;
}

export default function RevenueFilterBar({
  branches,
  selectedBranchId,
  periodMode,
  dateFrom,
  dateTo,
}: RevenueFilterBarProps) {
  const t = useTranslations("finance");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Updates searchParams and triggers page transition
  const updateQuery = (params: Record<string, string | null>) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));

    for (const [key, val] of Object.entries(params)) {
      if (val === null || val === "" || (key === "branchId" && val === "all")) {
        current.delete(key);
      } else {
        current.set(key, val);
      }
    }

    router.push(`${pathname}?${current.toString()}`);
  };

  // Quick Presets
  const applyPreset = (preset: "today" | "week" | "month" | "all") => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    if (preset === "today") {
      updateQuery({ dateFrom: todayStr, dateTo: todayStr, periodMode: "daily" });
    } else if (preset === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      updateQuery({
        dateFrom: start.toISOString().split("T")[0],
        dateTo: todayStr,
        periodMode: "daily",
      });
    } else if (preset === "month") {
      const firstOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      updateQuery({
        dateFrom: firstOfMonth.toISOString().split("T")[0],
        dateTo: todayStr,
        periodMode: "daily",
      });
    } else if (preset === "all") {
      updateQuery({ dateFrom: "2025-01-01", dateTo: todayStr, periodMode: "monthly" });
    }
  };

  return (
    <Card className="p-4 border-border shadow-xs flex flex-col gap-4 bg-surface">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Branch Filter Buttons / Select */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-muted ml-1">{t("filterBranch")}</span>
          <button
            type="button"
            onClick={() => updateQuery({ branchId: "all" })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              selectedBranchId === "all"
                ? "bg-primary text-white shadow-xs"
                : "bg-surface text-gray-700 hover:bg-surface-subtle border border-border"
            }`}
          >
            {t("allThreeBranchesConsolidated")}
          </button>
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => updateQuery({ branchId: String(b.id) })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                Number(selectedBranchId) === b.id
                  ? "bg-primary text-white shadow-xs"
                  : "bg-surface text-gray-700 hover:bg-surface-subtle border border-border"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>

        {/* Aggregation Mode Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted ml-1">{t("filterAggregation")}</span>
          <div className="flex items-center bg-surface-muted border border-border p-1 rounded-xl shadow-xs text-xs font-medium">
            <button
              type="button"
              onClick={() => updateQuery({ periodMode: "daily" })}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                periodMode === "daily"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted hover:text-gray-900 hover:bg-surface"
              }`}
            >
              {t("modeDaily")}
            </button>
            <button
              type="button"
              onClick={() => updateQuery({ periodMode: "weekly" })}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                periodMode === "weekly"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted hover:text-gray-900 hover:bg-surface"
              }`}
            >
              {t("modeWeekly")}
            </button>
            <button
              type="button"
              onClick={() => updateQuery({ periodMode: "monthly" })}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                periodMode === "monthly"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted hover:text-gray-900 hover:bg-surface"
              }`}
            >
              {t("modeMonthly")}
            </button>
          </div>
        </div>
      </div>

      {/* Date Range & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-border/60">
        {/* Quick Date Presets */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-muted ml-1">{t("quickPeriod")}</span>
          <button
            type="button"
            onClick={() => applyPreset("today")}
            className="px-2.5 py-1 text-xs bg-surface border border-border text-gray-700 hover:bg-surface-subtle rounded-lg transition-colors font-medium cursor-pointer shadow-xs"
          >
            {t("today")}
          </button>
          <button
            type="button"
            onClick={() => applyPreset("week")}
            className="px-2.5 py-1 text-xs bg-surface border border-border text-gray-700 hover:bg-surface-subtle rounded-lg transition-colors font-medium cursor-pointer shadow-xs"
          >
            {t("last7Days")}
          </button>
          <button
            type="button"
            onClick={() => applyPreset("month")}
            className="px-2.5 py-1 text-xs bg-surface border border-border text-gray-700 hover:bg-surface-subtle rounded-lg transition-colors font-medium cursor-pointer shadow-xs"
          >
            {t("thisMonth")}
          </button>
          <button
            type="button"
            onClick={() => applyPreset("all")}
            className="px-2.5 py-1 text-xs bg-surface border border-border text-gray-700 hover:bg-surface-subtle rounded-lg transition-colors font-medium cursor-pointer shadow-xs"
          >
            {t("allPeriods")}
          </button>
        </div>

        {/* Date Inputs & Excel Export */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-1.5 text-xs text-muted font-medium">
            <span>{t("fromLabel")}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => updateQuery({ dateFrom: e.target.value })}
              className="border border-border rounded-lg px-2.5 py-1 text-xs font-mono bg-surface text-gray-800 shadow-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition-colors"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted font-medium">
            <span>{t("toLabel")}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => updateQuery({ dateTo: e.target.value })}
              className="border border-border rounded-lg px-2.5 py-1 text-xs font-mono bg-surface text-gray-800 shadow-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition-colors"
            />
          </div>

          <ExportButton
            type="daily_revenue"
            options={{
              branchId: selectedBranchId === "all" ? "all" : selectedBranchId,
              dateFrom,
              dateTo,
              periodMode,
            }}
            className="h-8 text-xs px-3 rounded-lg shadow-xs"
          />
        </div>
      </div>
    </Card>
  );
}
