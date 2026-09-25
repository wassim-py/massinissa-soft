"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { RevenueDashboardVoucher } from "@/lib/revenue";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Search, Receipt, ChevronLeft, ChevronRight, Filter, User, Building2, Calendar, Phone } from "lucide-react";
import { format } from "date-fns";
import { arDZ } from "date-fns/locale";

interface RevenuePaymentsTableProps {
  vouchers: RevenueDashboardVoucher[];
}

export default function RevenuePaymentsTable({ vouchers }: RevenuePaymentsTableProps) {
  const t = useTranslations("finance");
  const locale = useLocale();

  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const formatDZD = (num: number) =>
    locale === "ar"
      ? `${num.toLocaleString("ar-DZ")} دج`
      : `${num.toLocaleString("fr-DZ")} DZD`;

  // Extract unique branches
  const uniqueBranches = useMemo(() => {
    const map = new Map<number, string>();
    vouchers.forEach((v) => {
      if (v.branchId && v.branchName) {
        map.set(v.branchId, v.branchName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [vouchers]);

  // Filter vouchers based on search, type, and branch
  const filteredVouchers = useMemo(() => {
    const s = search.trim().toLowerCase();

    return vouchers.filter((v) => {
      // Type filter
      if (selectedType !== "ALL") {
        if (selectedType === "TUITION" && !v.paymentType.startsWith("TUITION")) return false;
        if (selectedType === "INSCRIPTION" && v.paymentType !== "INSCRIPTION") return false;
        if (selectedType === "BOOK" && v.paymentType !== "BOOK") return false;
        if (selectedType === "FORMATION" && v.paymentType !== "WORKSHOP" && v.paymentType !== "FORMATION") return false;
      }

      // Branch filter
      if (selectedBranch !== "ALL" && String(v.branchId) !== selectedBranch) {
        return false;
      }

      // Search filter
      if (s) {
        const matchName = v.studentName.toLowerCase().includes(s);
        const matchNumber = String(v.number).includes(s);
        const matchClass = v.className.toLowerCase().includes(s);
        const matchPhone = v.studentPhone ? v.studentPhone.includes(s) : false;
        if (!matchName && !matchNumber && !matchClass && !matchPhone) return false;
      }

      return true;
    });
  }, [vouchers, search, selectedType, selectedBranch]);

  // Total amount of filtered vouchers
  const filteredSum = useMemo(() => {
    return filteredVouchers
      .filter((v) => !v.isVoided)
      .reduce((sum, v) => sum + v.amount, 0);
  }, [filteredVouchers]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredVouchers.length / pageSize) || 1;
  const currentPage = Math.min(page, totalPages);
  const paginatedVouchers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredVouchers.slice(start, start + pageSize);
  }, [filteredVouchers, currentPage, pageSize]);

  const getPaymentTypeBadge = (type: string) => {
    switch (type) {
      case "INSCRIPTION":
        return <Badge variant="success" size="sm">{t("inscriptionCol")}</Badge>;
      case "TUITION_4SESSION":
      case "TUITION":
      case "CATCHUP":
      case "EXTRA_SESSION":
        return <Badge variant="primary" size="sm">{t("tuitionCol")}</Badge>;
      case "BOOK":
        return <Badge variant="warning" size="sm">{t("bookCol")}</Badge>;
      case "WORKSHOP":
      case "FORMATION":
        return <Badge variant="secondary" size="sm">{t("atelierFormationCol")}</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{type}</Badge>;
    }
  };

  return (
    <Card className="border-border shadow-xs overflow-hidden bg-surface">
      {/* Header */}
      <div className="p-5 border-b border-border space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-section-title font-bold text-gray-900">
                  {t("detailedPaymentsTitle")}
                </h3>
                <Badge variant="primary" size="sm">
                  {vouchers.length}
                </Badge>
              </div>
              <p className="text-form-helper text-muted mt-0.5">
                {t("detailedPaymentsDesc")}
              </p>
            </div>
          </div>

          {/* Sum badge */}
          <div className="flex items-center gap-2 bg-success-light/40 border border-success-soft/60 px-3.5 py-1.5 rounded-xl">
            <span className="text-xs font-semibold text-success-text">
              {t("totalFilteredAmount")}
            </span>
            <span className="font-mono font-bold text-sm text-success-text">
              +{formatDZD(filteredSum)}
            </span>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-2">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-muted absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t("searchVoucherPlaceholder")}
              className="w-full ps-9 pe-4 py-1.5 text-xs bg-surface border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Type selector */}
            <div className="flex items-center bg-surface-muted border border-border p-0.5 rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => { setSelectedType("ALL"); setPage(1); }}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  selectedType === "ALL" ? "bg-primary text-white shadow-xs" : "text-muted hover:text-gray-900"
                }`}
              >
                {t("filterAllTypes")}
              </button>
              <button
                type="button"
                onClick={() => { setSelectedType("TUITION"); setPage(1); }}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  selectedType === "TUITION" ? "bg-primary text-white shadow-xs" : "text-muted hover:text-gray-900"
                }`}
              >
                {t("tuitionCol")}
              </button>
              <button
                type="button"
                onClick={() => { setSelectedType("INSCRIPTION"); setPage(1); }}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  selectedType === "INSCRIPTION" ? "bg-primary text-white shadow-xs" : "text-muted hover:text-gray-900"
                }`}
              >
                {t("inscriptionCol")}
              </button>
              <button
                type="button"
                onClick={() => { setSelectedType("BOOK"); setPage(1); }}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  selectedType === "BOOK" ? "bg-primary text-white shadow-xs" : "text-muted hover:text-gray-900"
                }`}
              >
                {t("bookCol")}
              </button>
            </div>

            {/* Branch selector if multiple branches exist */}
            {uniqueBranches.length > 1 && (
              <select
                value={selectedBranch}
                onChange={(e) => { setSelectedBranch(e.target.value); setPage(1); }}
                className="px-2.5 py-1.5 text-xs bg-surface border border-border rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="ALL">{t("allThreeBranchesConsolidated")}</option>
                {uniqueBranches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}

            {/* Page size selector */}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1.5 text-xs bg-surface border border-border rounded-xl text-muted font-medium focus:outline-none"
            >
              <option value="15">15 / page</option>
              <option value="30">30 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-start">
          <thead>
            <tr className="bg-surface-muted/60 border-b border-border text-start">
              <th className="py-3 px-4 text-table-header text-muted font-semibold tracking-wider text-start">
                {t("voucherNumCol")}
              </th>
              <th className="py-3 px-4 text-table-header text-muted font-semibold tracking-wider text-start">
                {t("dateCol")}
              </th>
              <th className="py-3 px-4 text-table-header text-muted font-semibold tracking-wider text-start">
                {t("studentCol")}
              </th>
              <th className="py-3 px-4 text-table-header text-muted font-semibold tracking-wider text-start">
                {t("classAndBranchCol")}
              </th>
              <th className="py-3 px-4 text-table-header text-muted font-semibold tracking-wider text-start">
                {t("paymentTypeCol")}
              </th>
              <th className="py-3 px-4 text-table-header text-muted font-semibold tracking-wider text-start">
                {t("issuerCol")}
              </th>
              <th className="py-3 px-4 text-table-header text-muted font-semibold tracking-wider text-end">
                {t("amountCol")}
              </th>
              <th className="py-3 px-4 text-table-header text-muted font-semibold tracking-wider text-center">
                {t("statusCol")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 text-table-body text-gray-700">
            {paginatedVouchers.length > 0 ? (
              paginatedVouchers.map((v) => {
                const dateObj = new Date(v.issuedAt);
                const formattedDate = format(dateObj, "dd/MM/yyyy");
                const formattedTime = format(dateObj, "HH:mm");

                return (
                  <tr
                    key={v.id}
                    className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
                  >
                    {/* Voucher number */}
                    <td className="p-3.5 font-mono font-bold text-primary text-xs" dir="ltr">
                      #{v.number}
                    </td>

                    {/* Date and time */}
                    <td className="p-3.5 text-xs text-muted font-mono whitespace-nowrap">
                      <div>{formattedDate}</div>
                      {formattedTime !== "00:00" && formattedTime !== "12:00" && (
                        <div className="text-[11px] text-muted-dark">{formattedTime}</div>
                      )}
                    </td>

                    {/* Student */}
                    <td className="p-3.5">
                      <Link
                        href={`/list/students/${v.studentId}`}
                        className="font-semibold text-gray-900 hover:text-primary transition-colors block"
                      >
                        {v.studentName}
                      </Link>
                      {v.studentPhone && (
                        <div className="text-[11px] text-muted flex items-center gap-1 mt-0.5" dir="ltr">
                          <Phone className="w-3 h-3" />
                          <span>{v.studentPhone}</span>
                        </div>
                      )}
                    </td>

                    {/* Class & Branch */}
                    <td className="p-3.5">
                      <div className="font-medium text-gray-900">{v.className}</div>
                      <div className="mt-1">
                        <Badge variant="neutral" size="sm">
                          {v.branchName}
                        </Badge>
                      </div>
                    </td>

                    {/* Payment type */}
                    <td className="p-3.5 whitespace-nowrap">
                      {getPaymentTypeBadge(v.paymentType)}
                    </td>

                    {/* Issued by */}
                    <td className="p-3.5 text-xs text-muted whitespace-nowrap">
                      {v.issuedBy === "system_import" ? "Excel Import" : v.issuedBy}
                    </td>

                    {/* Amount */}
                    <td className="p-3.5 text-end font-bold font-mono text-success-text whitespace-nowrap">
                      +{formatDZD(v.amount)}
                    </td>

                    {/* Status */}
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <Badge
                        variant={v.isVoided ? "danger" : "success"}
                        size="sm"
                        withDot
                      >
                        {v.isVoided ? t("voided") || "Annulé" : t("active") || "Actif"}
                      </Badge>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="py-16 px-4 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Receipt className="w-8 h-8 text-muted/60" />
                    <p className="font-medium text-gray-700">{t("noPaymentsFound")}</p>
                    <p className="text-xs text-muted max-w-sm">{t("noPaymentsFoundDesc")}</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {filteredVouchers.length > 0 && (
        <div className="p-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted">
          <div>
            Affichage de <span className="font-semibold text-gray-900">{(currentPage - 1) * pageSize + 1}</span> à{" "}
            <span className="font-semibold text-gray-900">
              {Math.min(currentPage * pageSize, filteredVouchers.length)}
            </span>{" "}
            sur <span className="font-semibold text-gray-900">{filteredVouchers.length}</span> reçus
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-subtle disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-medium text-gray-900">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-subtle disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
