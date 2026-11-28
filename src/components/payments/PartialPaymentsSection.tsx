"use client";

import React, { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { PartialPaymentItem } from "@/lib/partialPayments";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import dynamic from "next/dynamic";

const PaymentForm = dynamic(() => import("@/components/forms/PaymentForm"), { ssr: false });
import WorkshopPaymentForm from "@/components/forms/WorkshopPaymentForm";
import { formatDZD, formatAlgiersDate } from "@/lib/algiersDate";
import {
  CreditCard,
  Search,
  X,
  Phone,
  CheckCircle2,
  Users,
  Wallet,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type CategoryFilter = "ALL" | "CLASS" | "FORMATION" | "WORKSHOP";
const PAGE_SIZE = 20;

export default function PartialPaymentsSection({
  items,
}: {
  items: PartialPaymentItem[];
}) {
  const locale = useLocale();
  const t = useTranslations("payments");
  const isAr = locale === "ar";

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activePaymentItem, setActivePaymentItem] =
    useState<PartialPaymentItem | null>(null);

  const counts = useMemo(() => {
    return {
      ALL: items.length,
      CLASS: items.filter((i) => i.category === "CLASS").length,
      FORMATION: items.filter((i) => i.category === "FORMATION").length,
      WORKSHOP: items.filter((i) => i.category === "WORKSHOP").length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const numericQ = q.replace(/[^0-9]/g, "");

    return items.filter((item) => {
      if (categoryFilter !== "ALL" && item.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      const matchName = item.studentName.toLowerCase().includes(q);
      const matchTarget = item.targetName.toLowerCase().includes(q);
      const matchPhone = item.studentPhone
        ? item.studentPhone.toLowerCase().includes(q)
        : false;
      const matchVoucher = item.lastVoucherDisplay
        ? item.lastVoucherDisplay.toLowerCase().includes(q)
        : false;
      const matchGlobalId =
        numericQ.length > 0 && item.studentGlobalNumber !== null
          ? String(item.studentGlobalNumber).includes(numericQ)
          : false;
      return (
        matchName || matchTarget || matchPhone || matchVoucher || matchGlobalId
      );
    });
  }, [items, categoryFilter, search]);

  const totalPaidSum = useMemo(
    () => filteredItems.reduce((s, i) => s + i.paidAmount, 0),
    [filteredItems]
  );
  const totalRemainingSum = useMemo(
    () => filteredItems.reduce((s, i) => s + i.remainingAmount, 0),
    [filteredItems]
  );

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = useMemo(
    () =>
      filteredItems.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
      ),
    [filteredItems, currentPage]
  );

  const renderCategoryBadge = (cat: PartialPaymentItem["category"]) => {
    if (cat === "CLASS") {
      return (
        <Badge variant="primary" size="sm">
          {t("partialCatClass")}
        </Badge>
      );
    }
    if (cat === "FORMATION") {
      return (
        <Badge variant="secondary" size="sm">
          {t("partialCatFormation")}
        </Badge>
      );
    }
    return (
      <Badge variant="warning" size="sm">
        {t("partialCatWorkshop")}
      </Badge>
    );
  };

  return (
    <div className="space-y-5 mt-5 font-sans">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 border-border/80 bg-surface-subtle/50 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted font-medium">
              {t("partialStudentsCountLabel")}
            </p>
            <p className="text-xl font-bold text-gray-900 font-mono mt-0.5">
              {filteredItems.length}
            </p>
          </div>
        </Card>

        <Card className="p-4 border-emerald-200/80 bg-emerald-50/30 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-emerald-800 font-medium">
              {t("partialTotalPaidLabel")}
            </p>
            <p className="text-xl font-bold text-emerald-800 font-mono mt-0.5">
              {formatDZD(totalPaidSum, locale)}
            </p>
          </div>
        </Card>

        <Card className="p-4 border-amber-300/80 bg-amber-50/40 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-200/80 text-amber-900 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-amber-900 font-medium">
              {t("partialTotalRemainingLabel")}
            </p>
            <p className="text-xl font-bold text-amber-950 font-mono mt-0.5">
              {formatDZD(totalRemainingSum, locale)}
            </p>
          </div>
        </Card>
      </div>

      {/* Search & Category Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface-subtle/60 p-3.5 rounded-xl border border-border/80">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("partialSearchPlaceholder")}
            className="w-full ps-9 pe-8 py-2 text-xs bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-gray-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: "ALL", label: t("partialFilterAll"), count: counts.ALL },
              { id: "CLASS", label: t("partialCatClass"), count: counts.CLASS },
              {
                id: "FORMATION",
                label: t("partialCatFormation"),
                count: counts.FORMATION,
              },
              {
                id: "WORKSHOP",
                label: t("partialCatWorkshop"),
                count: counts.WORKSHOP,
              },
            ] as const
          ).map((tab) => {
            const active = categoryFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setCategoryFilter(tab.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                  active
                    ? "bg-primary text-white shadow-2xs"
                    : "bg-surface text-gray-700 border border-border hover:bg-surface-muted"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    active
                      ? "bg-white/20 text-white"
                      : "bg-surface-muted text-muted"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table of Partially Paid Students */}
      {filteredItems.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-2xs">
          <table className="min-w-full divide-y divide-border/70 text-start">
            <thead className="bg-surface-muted/80 text-xs font-bold text-gray-700">
              <tr>
                <th className="p-3.5 text-start">{t("studentPhone")}</th>
                <th className="p-3.5 text-start">{t("partialGroupOrWorkshopCol")}</th>
                <th className="p-3.5 text-end">{t("partialTotalFeeCol")}</th>
                <th className="p-3.5 text-end">{t("partialPaidSoFarCol")}</th>
                <th className="p-3.5 text-end">{t("remainingBalance")}</th>
                <th className="p-3.5 text-end">
                  {isAr ? "الإجراء" : "Action"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-sm">
              {paginatedItems.map((item) => (
                <tr
                  key={item.key}
                  className="hover:bg-surface-subtle/60 transition-colors"
                >
                  {/* 1. Student */}
                  <td className="p-3.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.studentGlobalNumber !== null && (
                        <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-surface-muted border border-border text-primary">
                          #{item.studentGlobalNumber}
                        </span>
                      )}
                      <Link
                        href={`/list/students/${item.studentId}`}
                        className="font-bold text-gray-900 hover:text-primary hover:underline transition-colors"
                      >
                        {item.studentName}
                      </Link>
                    </div>
                    {item.studentPhone && (
                      <a
                        href={`tel:${item.studentPhone}`}
                        dir="ltr"
                        className="mt-0.5 inline-flex items-center gap-1 text-xs font-mono text-muted hover:text-primary"
                      >
                        <Phone className="w-3 h-3" />
                        <span>{item.studentPhone}</span>
                      </a>
                    )}
                  </td>

                  {/* 2. Target Class / Formation / Workshop */}
                  <td className="p-3.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={item.targetHref}
                        className="font-semibold text-gray-900 hover:text-primary hover:underline transition-colors"
                      >
                        {item.targetName}
                      </Link>
                      {renderCategoryBadge(item.category)}
                      <Badge variant="neutral" size="sm">
                        {item.branchName}
                      </Badge>
                    </div>
                    {item.levelLabel && (
                      <p className="text-xs text-muted mt-0.5">
                        {item.levelLabel}
                      </p>
                    )}
                  </td>

                  {/* 3. Total Fee */}
                  <td className="p-3.5 text-end font-mono text-xs text-gray-700 whitespace-nowrap">
                    {formatDZD(item.totalFee, locale)}
                  </td>

                  {/* 4. Paid So Far + Last Voucher */}
                  <td className="p-3.5 text-end whitespace-nowrap">
                    <div className="font-mono text-xs font-bold text-emerald-700">
                      {formatDZD(item.paidAmount, locale)}
                    </div>
                    {item.lastVoucherDisplay && (
                      <div className="text-[11px] text-muted font-mono" dir="ltr">
                        {item.lastVoucherDisplay}
                        {item.lastPaymentDate
                          ? ` • ${formatAlgiersDate(item.lastPaymentDate, locale)}`
                          : ""}
                      </div>
                    )}
                  </td>

                  {/* 5. Remaining Balance */}
                  <td className="p-3.5 text-end whitespace-nowrap">
                    <Badge variant="warning" size="sm" className="font-mono font-bold">
                      {formatDZD(item.remainingAmount, locale)}
                    </Badge>
                  </td>

                  {/* 6. Pay Remaining Button */}
                  <td className="p-3.5 text-end whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="primary"
                      leftIcon={<CreditCard className="w-3.5 h-3.5" />}
                      onClick={() => setActivePaymentItem(item)}
                    >
                      {t("payRemainingBtn")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="p-3.5 border-t border-border flex items-center justify-between text-xs text-muted bg-surface-subtle/40">
              <span>
                {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filteredItems.length)}{" "}
                {isAr ? "من" : "sur"} {filteredItems.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-muted disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isAr ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
                <span className="font-mono font-bold text-gray-800 px-1.5">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-muted disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isAr ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-14 px-4 border-2 border-dashed border-border rounded-xl bg-surface-subtle/30">
          <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-800">
            {t("noPartialPaymentsTitle")}
          </p>
          <p className="text-xs text-muted mt-1">{t("noPartialPaymentsDesc")}</p>
        </div>
      )}

      {/* Payment Modal (Regular Class / Formation -> PaymentForm, Dawarat -> WorkshopPaymentForm) */}
      {activePaymentItem && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => setActivePaymentItem(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl relative w-full max-w-md max-h-[92vh] overflow-y-auto border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActivePaymentItem(null)}
              className="absolute top-4 end-4 text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-surface-subtle z-10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {activePaymentItem.category === "WORKSHOP" ? (
              <WorkshopPaymentForm
                type="create"
                participant={activePaymentItem.participantPayload}
                workshop={activePaymentItem.workshopPayload}
                amountOwedByParticipant={activePaymentItem.remainingAmount}
                setOpen={(open) => {
                  if (!open) setActivePaymentItem(null);
                }}
              />
            ) : (
              <PaymentForm
                type="create"
                student={activePaymentItem.studentPayload}
                classData={activePaymentItem.classPayload}
                amountOwedByStudent={activePaymentItem.remainingAmount}
                cycleRemainingFee={activePaymentItem.remainingAmount}
                remainingSessions={activePaymentItem.remainingSessions}
                isBookPaid={activePaymentItem.isBookPaid}
                isCompletingPartial={true}
                setOpen={(open) => {
                  if (!open) setActivePaymentItem(null);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
