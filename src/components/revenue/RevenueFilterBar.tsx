"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import ExportButton from "@/components/ExportButton";
import { Card } from "@/components/ui/Card";
import { Calendar, SlidersHorizontal } from "lucide-react";

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

  // Helper date calculations
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const firstOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const firstOfMonthStr = firstOfMonth.toISOString().split("T")[0];

  // Active time tab resolution (merging Aggregation Mode & Date Range)
  const isToday = dateFrom === todayStr && dateTo === todayStr && periodMode === "daily";
  const isWeek = dateFrom === weekStartStr && dateTo === todayStr && periodMode === "weekly";
  const isMonth = dateFrom === firstOfMonthStr && dateTo === todayStr && periodMode === "monthly";
  const isAll = dateFrom === "2025-01-01" && dateTo === todayStr && periodMode === "monthly";
  const isCustom = !isToday && !isWeek && !isMonth && !isAll;

  const [showCustomInputs, setShowCustomInputs] = useState(isCustom);

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

  // Unified single time tab applicator: combines Range & Aggregation Mode in one action
  const applyTimeTab = (tab: "today" | "week" | "month" | "all" | "custom") => {
    if (tab === "today") {
      setShowCustomInputs(false);
      updateQuery({ dateFrom: todayStr, dateTo: todayStr, periodMode: "daily" });
    } else if (tab === "week") {
      setShowCustomInputs(false);
      updateQuery({ dateFrom: weekStartStr, dateTo: todayStr, periodMode: "weekly" });
    } else if (tab === "month") {
      setShowCustomInputs(false);
      updateQuery({ dateFrom: firstOfMonthStr, dateTo: todayStr, periodMode: "monthly" });
    } else if (tab === "all") {
      setShowCustomInputs(false);
      updateQuery({ dateFrom: "2025-01-01", dateTo: todayStr, periodMode: "monthly" });
    } else if (tab === "custom") {
      setShowCustomInputs(true);
    }
  };

  return (
    <Card className="p-4 border-border shadow-xs flex flex-col gap-3.5 bg-surface">
      {/* Scope: Branch Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
      </div>

      {/* Unified Time Filter Tabs: Merges Aggregation Mode, Time Range & Export Action */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-3 border-t border-border/60">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-muted ml-1">{t("filterTimeTabs")}</span>
          
          <div className="flex items-center bg-surface-muted border border-border p-1 rounded-xl shadow-xs text-xs font-medium flex-wrap gap-0.5">
            <button
              type="button"
              onClick={() => applyTimeTab("today")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                isToday
                  ? "bg-primary text-white shadow-xs font-semibold"
                  : "text-muted hover:text-gray-900 hover:bg-surface"
              }`}
            >
              {t("tabTodayDaily")}
            </button>
            <button
              type="button"
              onClick={() => applyTimeTab("week")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                isWeek
                  ? "bg-primary text-white shadow-xs font-semibold"
                  : "text-muted hover:text-gray-900 hover:bg-surface"
              }`}
            >
              {t("tabWeekWeekly")}
            </button>
            <button
              type="button"
              onClick={() => applyTimeTab("month")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                isMonth
                  ? "bg-primary text-white shadow-xs font-semibold"
                  : "text-muted hover:text-gray-900 hover:bg-surface"
              }`}
            >
              {t("tabMonthMonthly")}
            </button>
            <button
              type="button"
              onClick={() => applyTimeTab("all")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                isAll
                  ? "bg-primary text-white shadow-xs font-semibold"
                  : "text-muted hover:text-gray-900 hover:bg-surface"
              }`}
            >
              {t("tabAllMonthly")}
            </button>
            <button
              type="button"
              onClick={() => applyTimeTab("custom")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                isCustom || showCustomInputs
                  ? "bg-primary text-white shadow-xs font-semibold"
                  : "text-muted hover:text-gray-900 hover:bg-surface"
              }`}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>{t("tabCustom")}</span>
            </button>
          </div>
        </div>

        {/* Custom Date Pickers & Excel Export (always aligned together) */}
        <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap">
          {(isCustom || showCustomInputs) && (
            <div className="flex items-center gap-2 bg-surface-muted/60 p-1 rounded-xl border border-border">
              <div className="flex items-center gap-1.5 text-xs text-muted font-medium">
                <span>{t("fromLabel")}</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => updateQuery({ dateFrom: e.target.value })}
                  className="border border-border rounded-lg px-2 py-1 text-xs font-mono bg-surface text-gray-800 shadow-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition-colors"
                />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted font-medium">
                <span>{t("toLabel")}</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => updateQuery({ dateTo: e.target.value })}
                  className="border border-border rounded-lg px-2 py-1 text-xs font-mono bg-surface text-gray-800 shadow-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition-colors"
                />
              </div>
            </div>
          )}

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
