"use client";

import { useTranslations, useLocale } from "next-intl";
import { RevenueSummary } from "@/lib/revenue";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface RevenueSummaryCardsProps {
  summary: RevenueSummary;
}

export default function RevenueSummaryCards({ summary }: RevenueSummaryCardsProps) {
  const t = useTranslations("finance");
  const locale = useLocale();

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

        {/* Books */}
        <Card className="border-border/80 shadow-xs p-4 bg-surface">
          <div className="flex items-center justify-between text-xs text-muted font-medium">
            <span>{t("bookFee")}</span>
            <span className="w-2 h-2 rounded-full bg-accent"></span>
          </div>
          <p className="text-card-title font-bold text-gray-900 mt-2 font-mono">{formatDZD(summary.book)}</p>
          <p className="text-form-helper text-muted mt-0.5">{t("bookHelper")}</p>
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
    </div>
  );
}
