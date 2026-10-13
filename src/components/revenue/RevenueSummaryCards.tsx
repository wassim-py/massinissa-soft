"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { RevenueSummary } from "@/lib/revenue";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BookOpen, ExternalLink } from "lucide-react";
import BooksFinanceModal from "@/components/finance/BooksFinanceModal";

interface RevenueSummaryCardsProps {
  summary: RevenueSummary;
}

export default function RevenueSummaryCards({ summary }: RevenueSummaryCardsProps) {
  const t = useTranslations("finance");
  const locale = useLocale();
  const searchParams = useSearchParams();

  const [isBooksModalOpen, setIsBooksModalOpen] = useState(false);

  useEffect(() => {
    if (searchParams?.get("view") === "books") {
      setIsBooksModalOpen(true);
    }
  }, [searchParams]);

  const formatDZD = (num: number) =>
    locale === "ar"
      ? `${num.toLocaleString("ar-DZ")} دج`
      : `${num.toLocaleString("fr-DZ")} DZD`;

  return (
    <div className="space-y-4">
      {/* Top 5 High-Level KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Gross Revenue Card */}
        <Card className="border-border/80 shadow-xs p-5 flex flex-col justify-between bg-surface">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">{t("grossRevenueCardTitle")}</span>
            <Badge variant="success" size="sm" withDot>
              {t("totalFeesBadge")}
            </Badge>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold font-mono text-success-text">
              +{formatDZD(summary.grossRevenue)}
            </p>
            <p className="text-form-helper text-muted mt-1">{t("grossRevenueHelper")}</p>
          </div>
        </Card>

        {/* Refunds Card */}
        <Card className="border-danger-soft/60 shadow-xs p-5 flex flex-col justify-between bg-danger-light/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-danger-text">{t("refundsCardTitle")}</span>
            <Badge variant="danger" size="sm" withDot>
              {t("refundsSeparateBadge")}
            </Badge>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold font-mono text-danger">
              {summary.refunds > 0 ? `-${formatDZD(summary.refunds)}` : formatDZD(0)}
            </p>
            <p className="text-form-helper text-muted mt-1">
              {t("refundsHelper")}
            </p>
          </div>
        </Card>

        {/* Confirmed Missing (Manque) Card */}
        <Card className={`border-border/80 shadow-xs p-5 flex flex-col justify-between ${
          summary.missing > 0 ? "bg-danger-light/25 border-danger-soft/80" : "bg-surface"
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-danger-text">{t("missingCardTitle")}</span>
            <Badge variant="danger" size="sm" withDot>
              {t("missingCardBadge")}
            </Badge>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold font-mono text-danger">
              {summary.missing > 0 ? `-${formatDZD(summary.missing)}` : formatDZD(0)}
            </p>
            <p className="text-form-helper text-muted mt-1">
              {t("missingHelper")}
            </p>
          </div>
        </Card>

        {/* Confirmed Surplus (Excédent) Card */}
        <Card className={`border-border/80 shadow-xs p-5 flex flex-col justify-between ${
          summary.surplus > 0 ? "bg-success-light/25 border-success-soft/80" : "bg-surface"
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-success-text">{t("surplusCardTitle")}</span>
            <Badge variant="success" size="sm" withDot>
              {t("surplusCardBadge")}
            </Badge>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold font-mono text-success-text">
              {summary.surplus > 0 ? `+${formatDZD(summary.surplus)}` : formatDZD(0)}
            </p>
            <p className="text-form-helper text-muted mt-1">
              {t("surplusHelper")}
            </p>
          </div>
        </Card>

        {/* Net Revenue Card */}
        <Card className="border-primary-soft/60 shadow-xs p-5 flex flex-col justify-between bg-primary-light/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-primary-hover">{t("netRevenueCardTitle")}</span>
            <Badge variant="primary" size="sm" withDot>
              {t("actualCashboxBadge")}
            </Badge>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold font-mono text-primary">
              +{formatDZD(summary.netRevenue)}
            </p>
            <p className="text-form-helper text-muted mt-1">
              {t("netRevenueHelper")}
            </p>
          </div>
        </Card>
      </div>

      {/* Breakdown by Voucher Types */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Tuition */}
        <Card className="border-border/80 shadow-xs p-4 bg-surface">
          <div className="flex items-center justify-between text-xs text-muted font-medium">
            <span>{t("tuitionFee")}</span>
            <span className="w-2 h-2 rounded-full bg-primary"></span>
          </div>
          <p className="text-card-title font-bold text-gray-900 mt-2 font-mono">{formatDZD(summary.tuition)}</p>
          <p className="text-form-helper text-muted mt-0.5">{t("tuitionHelper")}</p>
        </Card>

        {/* Inscription */}
        <Card className="border-border/80 shadow-xs p-4 bg-surface">
          <div className="flex items-center justify-between text-xs text-muted font-medium">
            <span>{t("inscriptionFeeLabel")}</span>
            <span className="w-2 h-2 rounded-full bg-success"></span>
          </div>
          <p className="text-card-title font-bold text-gray-900 mt-2 font-mono">{formatDZD(summary.inscription)}</p>
          <p className="text-form-helper text-muted mt-0.5">{t("inscriptionHelper")}</p>
        </Card>

        {/* Books (Clickable with detailed overview) */}
        <Card
          onClick={() => setIsBooksModalOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsBooksModalOpen(true);
            }
          }}
          className="border-border/80 shadow-xs p-4 bg-surface hover:border-primary/60 hover:shadow-md cursor-pointer transition-all duration-200 group relative overflow-hidden focus:outline-hidden focus:ring-2 focus:ring-primary/40"
        >
          <div className="flex items-center justify-between text-xs text-muted font-medium">
            <div className="flex items-center gap-1.5 group-hover:text-primary transition-colors">
              <BookOpen className="w-4 h-4 text-accent group-hover:scale-110 transition-transform" />
              <span className="font-semibold text-sm">{t("bookFee")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10 px-2 py-0.5 rounded-md">
                {locale === "ar" ? "اضغط للتفاصيل" : "Cliquer pour détails"}
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-accent"></span>
            </div>
          </div>
          <p className="text-card-title font-bold text-gray-900 mt-2 font-mono group-hover:text-primary transition-colors">
            {formatDZD(summary.book)}
          </p>
          <div className="flex items-center justify-between mt-0.5">
            <p className="text-form-helper text-muted">{t("bookHelper")}</p>
            <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-primary transition-colors shrink-0" />
          </div>
        </Card>

        {/* Dawarat / Formations */}
        <Card className="border-border/80 shadow-xs p-4 bg-surface">
          <div className="flex items-center justify-between text-xs text-muted font-medium">
            <span>{t("dawaratFormationFee")}</span>
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          </div>
          <p className="text-card-title font-bold text-gray-900 mt-2 font-mono">{formatDZD(summary.atelierFormation)}</p>
          <p className="text-form-helper text-muted mt-0.5">{t("dawaratFormationHelper")}</p>
        </Card>
      </div>

      {/* Books Finance Detail Modal */}
      {isBooksModalOpen && (
        <BooksFinanceModal
          isOpen={isBooksModalOpen}
          onClose={() => setIsBooksModalOpen(false)}
          locale={locale}
        />
      )}
    </div>
  );
}
