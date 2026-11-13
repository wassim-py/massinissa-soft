"use client";

import React, { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { RevenueDashboardData } from "@/lib/revenue";
import { formatAlgiersDate, getAlgiersTodayDateString } from "@/lib/algiersDate";
import { formatDZD } from "@/lib/algiersDate";
import { Badge } from "@/components/ui/Badge";
import DeclareMissingMoneyModal from "@/components/daily-ledger/DeclareMissingMoneyModal";
import DeclareSurplusMoneyModal from "@/components/daily-ledger/DeclareSurplusMoneyModal";
import MissingMoneyActions from "@/components/finance/MissingMoneyActions";
import SurplusMoneyActions from "@/components/finance/SurplusMoneyActions";
import { AlertTriangle, Coins } from "lucide-react";

interface RevenueDiscrepanciesSectionProps {
  discrepancies: RevenueDashboardData["discrepancies"];
  branches: Array<{ id: number; name: string }>;
  selectedBranchId: number | "all";
  dateFrom: string;
  dateTo: string;
}

export default function RevenueDiscrepanciesSection({
  discrepancies,
  branches,
  selectedBranchId,
  dateFrom,
  dateTo,
}: RevenueDiscrepanciesSectionProps) {
  const t = useTranslations("finance");
  const locale = useLocale();
  const isAr = locale === "ar";

  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "CONFIRMED" | "REJECTED">("ALL");

  const todayStr = getAlgiersTodayDateString();
  const defaultCreateDate = dateTo <= todayStr ? dateTo : todayStr;
  const activeBranchId =
    selectedBranchId !== "all" ? Number(selectedBranchId) : branches[0]?.id || 1;
  const activeBranchName =
    selectedBranchId !== "all"
      ? branches.find((b) => b.id === Number(selectedBranchId))?.name || `Branche #${selectedBranchId}`
      : branches[0]?.name || t("headquartersConsolidated");

  const stats = useMemo(() => {
    let confirmedMissing = 0;
    let confirmedSurplus = 0;
    let pendingCount = 0;
    for (const d of discrepancies) {
      if (d.status === "CONFIRMED") {
        if (d.type === "MISSING") confirmedMissing += d.amount;
        else confirmedSurplus += d.amount;
      } else if (d.status === "PENDING") {
        pendingCount += 1;
      }
    }
    return { confirmedMissing, confirmedSurplus, pendingCount };
  }, [discrepancies]);

  const filteredDiscrepancies = useMemo(() => {
    if (statusFilter === "ALL") return discrepancies;
    return discrepancies.filter((d) => d.status === statusFilter);
  }, [discrepancies, statusFilter]);

  const filterLabels = {
    ALL: isAr ? "الكل" : "Tous",
    PENDING: t("statusPending"),
    CONFIRMED: isAr ? "مؤكد" : "Confirmés",
    REJECTED: t("statusRejected"),
  };

  return (
    <div className="bg-surface rounded-2xl border border-border/80 shadow-xs overflow-hidden">
      {/* Header + Owner Create Buttons */}
      <div className="p-5 border-b border-border/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-surface to-surface-subtle/50">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>{t("discrepanciesRegistryTitle")}</span>
            </h3>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`}
            </span>
            {stats.pendingCount > 0 && (
              <Badge variant="warning" size="sm" withDot>
                {stats.pendingCount} {t("statusPending")}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted mt-1">{t("discrepanciesRegistryDesc")}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <DeclareMissingMoneyModal
            branchId={activeBranchId}
            branchName={activeBranchName}
            isOwner={true}
            selectedDate={defaultCreateDate}
            branches={branches}
          />
          <DeclareSurplusMoneyModal
            branchId={activeBranchId}
            branchName={activeBranchName}
            isOwner={true}
            selectedDate={defaultCreateDate}
            branches={branches}
          />
        </div>
      </div>

      {/* Summary & Status Filter Bar */}
      <div className="px-5 py-3 bg-surface-subtle/60 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {(["ALL", "PENDING", "CONFIRMED", "REJECTED"] as const).map((st) => {
            const count =
              st === "ALL"
                ? discrepancies.length
                : discrepancies.filter((d) => d.status === st).length;
            const active = statusFilter === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer border ${
                  active
                    ? "bg-primary text-white border-primary shadow-xs"
                    : "bg-white text-slate-600 border-border hover:bg-slate-50"
                }`}
              >
                {filterLabels[st]} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 text-xs flex-wrap">
          <span className="inline-flex items-center gap-1.5 font-semibold text-danger">
            <AlertTriangle className="w-3.5 h-3.5" />
            {t("missing")}:{" "}
            <span className="font-mono font-bold">
              -{formatDZD(stats.confirmedMissing, locale)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-success-text">
            <Coins className="w-3.5 h-3.5 text-success" />
            {t("surplus")}:{" "}
            <span className="font-mono font-bold">
              +{formatDZD(stats.confirmedSurplus, locale)}
            </span>
          </span>
        </div>
      </div>

      {/* Table or Empty State */}
      {filteredDiscrepancies.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm font-semibold text-gray-800">{t("emptyDiscrepanciesTitle")}</p>
          <p className="text-xs text-muted mt-1">{t("emptyDiscrepanciesDesc")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-subtle/50 border-b border-border/80 text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">{t("discrepancyDateCol")}</th>
                <th className="py-3 px-4">{t("discrepancyBranchCol")}</th>
                <th className="py-3 px-4">{t("discrepancyTypeCol")}</th>
                <th className="py-3 px-4 text-end">{t("discrepancyAmountCol")}</th>
                <th className="py-3 px-4">{t("discrepancyReasonCol")}</th>
                <th className="py-3 px-4 text-center">{t("discrepancyStatusCol")}</th>
                <th className="py-3 px-4 text-end">{t("discrepancyActionsCol")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-sm">
              {filteredDiscrepancies.map((item) => {
                const isMissing = item.type === "MISSING";
                return (
                  <tr
                    key={`${item.type}-${item.id}`}
                    className="hover:bg-surface-subtle/70 transition-colors"
                  >
                    <td className="py-3 px-4 whitespace-nowrap text-xs font-mono text-slate-700">
                      {formatAlgiersDate(item.date, locale, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-medium text-gray-800">
                      {item.branchName}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <Badge variant={isMissing ? "danger" : "success"} size="sm">
                        {isMissing ? t("missing") : t("surplus")}
                      </Badge>
                    </td>
                    <td
                      className={`py-3 px-4 whitespace-nowrap font-mono font-bold text-end ${
                        isMissing ? "text-danger" : "text-success-text"
                      }`}
                    >
                      {isMissing
                        ? `-${formatDZD(item.amount, locale)}`
                        : `+${formatDZD(item.amount, locale)}`}
                    </td>
                    <td className="py-3 px-4 text-gray-700 max-w-xs truncate" title={item.reason || ""}>
                      {item.reason || "—"}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <Badge
                        variant={
                          item.status === "CONFIRMED"
                            ? isMissing
                              ? "danger"
                              : "success"
                            : item.status === "PENDING"
                              ? "warning"
                              : "secondary"
                        }
                        size="sm"
                        withDot
                      >
                        {item.status === "CONFIRMED"
                          ? isMissing
                            ? t("statusConfirmedDeducted")
                            : t("statusConfirmedAdded")
                          : item.status === "PENDING"
                            ? t("statusPending")
                            : t("statusRejected")}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-end">
                      {isMissing ? (
                        <MissingMoneyActions
                          id={item.id}
                          status={item.status}
                          amount={item.amount}
                          reason={item.reason}
                          date={item.date}
                          branchId={item.branchId}
                          branches={branches}
                        />
                      ) : (
                        <SurplusMoneyActions
                          id={item.id}
                          status={item.status}
                          amount={item.amount}
                          reason={item.reason}
                          date={item.date}
                          branchId={item.branchId}
                          branches={branches}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
