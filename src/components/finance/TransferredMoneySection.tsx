"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { format } from "date-fns";
import { arDZ } from "date-fns/locale";
import {
  ArrowRightLeft,
  Search,
  Building2,
  Coins,
  Layers,
  ArrowRight,
  Filter,
  User,
  Calendar,
  Phone,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";

export interface TransferredRecord {
  id: number;
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  fromClassId: number;
  fromClassName: string;
  fromBranchId: number;
  fromBranchName: string;
  toClassId: number;
  toClassName: string;
  toBranchId: number;
  toBranchName: string;
  isCrossBranch: boolean;
  transferredSessions: number;
  amount: number;
  notes: string | null;
  transferredBy: string;
  transferredAt: string | Date;
}

interface TransferredMoneySectionProps {
  transfers: TransferredRecord[];
  branches: Array<{ id: number; name: string }>;
  locale?: string;
}

export default function TransferredMoneySection({
  transfers,
  branches,
  locale: propLocale,
}: TransferredMoneySectionProps) {
  const t = useTranslations("finance");
  const hookLocale = useLocale();
  const locale = propLocale || hookLocale || "fr";

  const [search, setSearch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL");
  const [transferType, setTransferType] = useState<"ALL" | "CROSS_BRANCH" | "INTRA_BRANCH">("ALL");
  const [sortOrder, setSortOrder] = useState<"DESC" | "ASC">("DESC");

  const formatDZD = (num: number) =>
    locale === "ar"
      ? `${num.toLocaleString("ar-DZ")} دج`
      : `${num.toLocaleString("fr-DZ")} DZD`;

  // Summary Metrics across all records
  const metrics = useMemo(() => {
    let totalAmount = 0;
    let totalCrossBranchAmount = 0;
    let totalSessions = 0;
    let crossBranchCount = 0;

    transfers.forEach((tr) => {
      const amt = Number(tr.amount || 0);
      const sess = Number(tr.transferredSessions || 0);
      totalAmount += amt;
      totalSessions += sess;
      if (tr.isCrossBranch) {
        totalCrossBranchAmount += amt;
        crossBranchCount++;
      }
    });

    return {
      totalAmount,
      totalCrossBranchAmount,
      totalSessions,
      totalCount: transfers.length,
      crossBranchCount,
    };
  }, [transfers]);

  // Filtered and sorted transfers
  const filteredTransfers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return transfers
      .filter((tr) => {
        // Search filter
        if (q) {
          const matchName = tr.studentName.toLowerCase().includes(q);
          const matchPhone = (tr.studentPhone || "").toLowerCase().includes(q);
          const matchFromClass = tr.fromClassName.toLowerCase().includes(q);
          const matchToClass = tr.toClassName.toLowerCase().includes(q);
          const matchAdmin = tr.transferredBy.toLowerCase().includes(q);
          const matchNotes = (tr.notes || "").toLowerCase().includes(q);
          if (!matchName && !matchPhone && !matchFromClass && !matchToClass && !matchAdmin && !matchNotes) {
            return false;
          }
        }

        // Branch filter
        if (selectedBranch !== "ALL") {
          const bId = Number(selectedBranch);
          if (tr.fromBranchId !== bId && tr.toBranchId !== bId) {
            return false;
          }
        }

        // Transfer type filter
        if (transferType === "CROSS_BRANCH" && !tr.isCrossBranch) return false;
        if (transferType === "INTRA_BRANCH" && tr.isCrossBranch) return false;

        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.transferredAt).getTime();
        const timeB = new Date(b.transferredAt).getTime();
        return sortOrder === "DESC" ? timeB - timeA : timeA - timeB;
      });
  }, [transfers, search, selectedBranch, transferType, sortOrder]);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <Card className="p-5 border-border/80 shadow-xs bg-surface">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-section-title font-bold text-gray-900">
                  {t("transfersTitle")}
                </h2>
                <Badge variant="primary" size="sm">
                  {transfers.length} {t("transfersCountUnit")}
                </Badge>
              </div>
              <p className="text-form-helper text-muted mt-0.5">
                {t("transfersSubtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* 4 Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          {/* 1. Total Transferred Amount */}
          <div className="p-4 rounded-xl border border-border/80 bg-surface-muted/50 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-muted font-semibold">
              <span>{t("totalTransferredAmount")}</span>
              <div className="p-1 rounded-md bg-primary-light/60 text-primary">
                <Coins className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold font-mono text-gray-900">
                {formatDZD(metrics.totalAmount)}
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                {t("totalTransferredAmountDesc")}
              </p>
            </div>
          </div>

          {/* 2. Cross-Branch Transferred Amount */}
          <div className="p-4 rounded-xl border border-purple-200/80 bg-purple-50/40 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-purple-900 font-semibold">
              <span>{t("crossBranchTransferredAmount")}</span>
              <div className="p-1 rounded-md bg-purple-100 text-purple-700">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold font-mono text-purple-950">
                {formatDZD(metrics.totalCrossBranchAmount)}
              </p>
              <p className="text-[11px] text-purple-700/80 mt-0.5">
                {metrics.crossBranchCount} {t("crossBranchTransfersCount")}
              </p>
            </div>
          </div>

          {/* 3. Total Sessions Transferred */}
          <div className="p-4 rounded-xl border border-border/80 bg-surface-muted/50 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-muted font-semibold">
              <span>{t("totalSessionsTransferred")}</span>
              <div className="p-1 rounded-md bg-blue-100 text-blue-700">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold font-mono text-gray-900">
                {metrics.totalSessions} {t("sessionsUnit")}
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                {t("totalSessionsTransferredDesc")}
              </p>
            </div>
          </div>

          {/* 4. Total Operations Count */}
          <div className="p-4 rounded-xl border border-border/80 bg-surface-muted/50 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-muted font-semibold">
              <span>{t("totalTransfersCount")}</span>
              <div className="p-1 rounded-md bg-emerald-100 text-emerald-700">
                <ArrowRightLeft className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold font-mono text-gray-900">
                {metrics.totalCount}
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                {t("totalTransfersCountDesc")}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Filter and Search Bar */}
      <Card className="p-4 border-border/80 shadow-xs bg-surface">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("transfersSearchPlaceholder")}
              className="w-full ps-9 pe-4 py-2 text-xs rounded-lg border border-border bg-surface-subtle focus:bg-surface focus:outline-hidden focus:ring-1 focus:ring-primary text-gray-900"
            />
          </div>

          {/* Filters Row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Branch Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <Building2 className="w-3.5 h-3.5 text-muted shrink-0" />
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="px-2.5 py-2 text-xs rounded-lg border border-border bg-surface text-gray-800 font-medium focus:ring-1 focus:ring-primary"
              >
                <option value="ALL">{t("allBranches")}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <Filter className="w-3.5 h-3.5 text-muted shrink-0" />
              <select
                value={transferType}
                onChange={(e) => setTransferType(e.target.value as any)}
                className="px-2.5 py-2 text-xs rounded-lg border border-border bg-surface text-gray-800 font-medium focus:ring-1 focus:ring-primary"
              >
                <option value="ALL">{t("allTransferTypes")}</option>
                <option value="CROSS_BRANCH">{t("crossBranchOnly")}</option>
                <option value="INTRA_BRANCH">{t("intraBranchOnly")}</option>
              </select>
            </div>

            {/* Sort Order */}
            <button
              onClick={() => setSortOrder(sortOrder === "DESC" ? "ASC" : "DESC")}
              className="px-3 py-2 text-xs rounded-lg border border-border bg-surface hover:bg-surface-subtle text-gray-700 font-medium transition-colors cursor-pointer"
              title={sortOrder === "DESC" ? t("sortNewest") : t("sortOldest")}
            >
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-muted" />
                <span>{sortOrder === "DESC" ? t("sortNewest") : t("sortOldest")}</span>
              </span>
            </button>
          </div>
        </div>
      </Card>

      {/* Main Records Table */}
      <Card className="border-border/80 shadow-xs bg-surface overflow-hidden">
        {filteredTransfers.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-muted text-muted flex items-center justify-center mb-3">
              <ArrowRightLeft className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">
              {t("emptyTransfersTitle")}
            </h3>
            <p className="text-xs text-muted max-w-sm">
              {t("emptyTransfersDesc")}
            </p>
          </div>
        ) : (
          <DataTable
            columns={[
              { header: t("colTransferDate"), accessor: "transferredAt" },
              { header: t("colTransferStudent"), accessor: "studentName" },
              { header: t("colTransferFrom"), accessor: "fromClassName" },
              { header: t("colTransferTo"), accessor: "toClassName" },
              { header: t("colTransferRoute"), accessor: "isCrossBranch", align: "center" },
              { header: t("colTransferSessions"), accessor: "transferredSessions", align: "center" },
              { header: t("colTransferAmount"), accessor: "amount", align: "end" },
              { header: t("colTransferBy"), accessor: "transferredBy" },
              { header: t("colTransferNotes"), accessor: "notes" },
            ]}
            data={filteredTransfers}
            renderRow={(item) => (
              <tr
                key={item.id}
                className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
              >
                {/* Date */}
                <td className="p-3.5 text-muted text-xs font-mono whitespace-nowrap">
                  {format(new Date(item.transferredAt), "HH:mm, d MMM yyyy", {
                    locale: locale === "ar" ? arDZ : undefined,
                  })}
                </td>

                {/* Student */}
                <td className="p-3.5">
                  <div className="flex flex-col">
                    <Link
                      href={`/list/students/${item.studentId}`}
                      className="font-bold text-gray-900 hover:text-primary transition-colors flex items-center gap-1.5"
                    >
                      <User className="w-3.5 h-3.5 text-muted" />
                      <span>{item.studentName}</span>
                    </Link>
                    {item.studentPhone && (
                      <span className="text-[11px] text-muted font-mono flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />
                        <span>{item.studentPhone}</span>
                      </span>
                    )}
                  </div>
                </td>

                {/* From Group */}
                <td className="p-3.5">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-gray-900 text-xs">
                      {item.fromClassName}
                    </span>
                    <Badge variant="neutral" size="sm" className="w-fit">
                      {item.fromBranchName}
                    </Badge>
                  </div>
                </td>

                {/* To Group */}
                <td className="p-3.5">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-gray-900 text-xs">
                      {item.toClassName}
                    </span>
                    <Badge variant="neutral" size="sm" className="w-fit">
                      {item.toBranchName}
                    </Badge>
                  </div>
                </td>

                {/* Route */}
                <td className="p-3.5 text-center">
                  {item.isCrossBranch ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                      <span>{item.fromBranchName}</span>
                      <ArrowRight className="w-3 h-3 shrink-0" />
                      <span>{item.toBranchName}</span>
                    </span>
                  ) : (
                    <Badge variant="secondary" size="sm">
                      {t("sameBranchBadge")}
                    </Badge>
                  )}
                </td>

                {/* Sessions */}
                <td className="p-3.5 text-center font-mono font-bold text-gray-900">
                  <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-xs">
                    {item.transferredSessions} {t("sessionsUnit")}
                  </span>
                </td>

                {/* Amount */}
                <td className="p-3.5 text-end font-mono font-bold text-success-text text-sm whitespace-nowrap">
                  {item.amount > 0 ? formatDZD(item.amount) : "—"}
                </td>

                {/* By */}
                <td className="p-3.5 text-xs text-gray-700 font-medium">
                  {item.transferredBy}
                </td>

                {/* Notes */}
                <td className="p-3.5 text-xs text-muted max-w-xs truncate" title={item.notes || ""}>
                  {item.notes || "—"}
                </td>
              </tr>
            )}
          />
        )}
      </Card>
    </div>
  );
}
