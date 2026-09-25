import BackButton from "@/components/BackButton";
import prisma from "@/lib/prisma";
import { getAuthSession, getActiveBranchId } from "@/lib/auth";
import { getDailyBranchLedgerData } from "@/lib/revenue";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import Pagination from "@/components/Pagination";
import { ITEM_PER_PAGE } from "@/lib/settings";
import DeclareMissingMoneyModal from "@/components/daily-ledger/DeclareMissingMoneyModal";
import DeclareSurplusMoneyModal from "@/components/daily-ledger/DeclareSurplusMoneyModal";
import Link from "next/link";
import { format } from "date-fns";
import { arDZ } from "date-fns/locale";
import { getTranslations, getLocale } from "next-intl/server";
import { AlertCircle, ArrowDownRight, ArrowUpRight, Banknote, Calendar, CheckCircle2, Clock, Coins, PlusCircle, ShieldAlert, Sparkles, Store, Wallet } from "lucide-react";
import MissingMoneyActions from "@/components/finance/MissingMoneyActions";
import SurplusMoneyActions from "@/components/finance/SurplusMoneyActions";

interface PageProps {
  searchParams: Promise<{
    branchId?: string;
    page?: string;
  }>;
}

export default async function DailyBranchLedgerPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const session = await getAuthSession();
  const t = await getTranslations("dailyLedger");
  const locale = await getLocale();

  // Strict §7.11 check: Only branch admin (for their own branch) and owner (for any branch)
  const isOwner = session.isOwner;
  const isBranchAdmin = session.isBranchAdmin;

  if (!isOwner && !isBranchAdmin) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-12 border-danger-soft">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {t("unauthorizedTitle")}
          </Badge>
          <p className="text-table-body text-muted">
            {t("unauthorizedDesc")}
          </p>
          <div className="mt-2">
            <BackButton />
          </div>
        </div>
      </Card>
    );
  }

  // Branch determination:
  // Branch admin is locked strictly to their own branch.
  // Owner defaults to active branch or first available branch, but can query any branch.
  let selectedBranchId: number;
  if (!isOwner) {
    const userBranchId = session.branchIds[0];
    if (!userBranchId) {
      return (
        <Card className="p-8 text-center max-w-md mx-auto my-12 border-warning-soft">
          <div className="flex flex-col items-center gap-3">
            <Badge variant="warning" size="md" withDot>
              {t("unauthorizedTitle")}
            </Badge>
            <p className="text-table-body text-muted">
              Aucune branche assignée à votre profil administrateur.
            </p>
          </div>
        </Card>
      );
    }
    selectedBranchId = userBranchId;
  } else {
    // Owner can switch branches
    if (searchParams.branchId) {
      selectedBranchId = parseInt(searchParams.branchId, 10);
    } else {
      const activeBranchId = await getActiveBranchId();
      selectedBranchId = activeBranchId;
    }
  }

  const [ledgerData, allBranches] = await Promise.all([
    getDailyBranchLedgerData(selectedBranchId),
    prisma.branch.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
  ]);

  if (!ledgerData) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-12 border-danger-soft">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md">
            Branche introuvable
          </Badge>
        </div>
      </Card>
    );
  }

  const { branch, summary, missingMoneyList, surplusMoneyList, todayVouchers } = ledgerData;

  const discrepancies = [
    ...missingMoneyList.map((m) => ({ ...m, type: "MISSING" as const })),
    ...surplusMoneyList.map((s) => ({ ...s, type: "SURPLUS" as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const formatDZD = (num: number) =>
    locale === "ar"
      ? `${num.toLocaleString("ar-DZ")} دج`
      : `${num.toLocaleString("fr-DZ")} DZD`;

  const formattedToday = format(new Date(), "d MMMM yyyy", {
    locale: locale === "ar" ? arDZ : undefined,
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <Card className="p-5 border-border/80 shadow-xs bg-surface">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-page-title text-gray-900">
                  {t("title")}
                </h1>
                <Badge variant="primary" size="sm">
                  {branch.name}
                </Badge>
              </div>
              <p className="text-form-helper text-muted mt-1">
                {t("subtitle")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Today Date Badge */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-surface-muted border border-border text-xs font-semibold text-gray-800">
              <Calendar className="w-4 h-4 text-primary" />
              <span>{formattedToday}</span>
            </div>
          </div>
        </div>

        {/* Owner Branch Switcher (§7.11: owner can view any branch) */}
        {isOwner && (
          <div className="mt-4 pt-4 border-t border-border/60 flex items-center gap-2 flex-wrap text-xs">
            <span className="font-semibold text-muted">{t("ownerSwitchBranch")}</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {allBranches.map((b) => (
                <Link
                  key={b.id}
                  href={`/list/daily-ledger?branchId=${b.id}`}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    b.id === selectedBranchId
                      ? "bg-primary text-white shadow-xs"
                      : "bg-surface text-gray-700 hover:bg-surface-subtle border border-border"
                  }`}
                >
                  {b.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* SECTION 1: CAISSE RECONCILIATION OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Gross Collected Today */}
        <Card className="border-border/80 shadow-xs p-5 bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">
              {t("grossCollected")}
            </span>
            <div className="p-1.5 rounded-lg bg-success-light/50 text-success">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold font-mono text-success-text">
              +{formatDZD(summary.grossRevenue)}
            </p>
            <p className="text-[11px] text-muted mt-1 leading-snug">
              {t("grossCollectedHelper")}
            </p>
          </div>
        </Card>

        {/* Refunds Today */}
        <Card className="border-border/80 shadow-xs p-5 bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">
              {t("refundsToday")}
            </span>
            <div className="p-1.5 rounded-lg bg-danger-light/50 text-danger">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold font-mono text-danger">
              {summary.refunds > 0 ? `-${formatDZD(summary.refunds)}` : formatDZD(0)}
            </p>
            <p className="text-[11px] text-muted mt-1 leading-snug">
              {t("refundsHelper")}
            </p>
          </div>
        </Card>

        {/* Confirmed Missing Money ('Manque') */}
        <Card className={`border-border/80 shadow-xs p-5 flex flex-col justify-between ${
          summary.confirmedMissing > 0 ? "bg-danger-light/25 border-danger-soft" : "bg-surface"
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-danger-text">
              {t("confirmedMissing")}
            </span>
            <div className="p-1.5 rounded-lg bg-danger-soft text-danger">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold font-mono text-danger">
              {summary.confirmedMissing > 0 ? `-${formatDZD(summary.confirmedMissing)}` : formatDZD(0)}
            </p>
            <p className="text-[11px] text-muted mt-1 leading-snug">
              {t("confirmedMissingHelper")}
            </p>
          </div>
        </Card>

        {/* Confirmed Surplus Money ('Surplus') */}
        <Card className={`border-border/80 shadow-xs p-5 flex flex-col justify-between ${
          summary.confirmedSurplus > 0 ? "bg-success-light/25 border-success-soft" : "bg-surface"
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-success-text">
              {t("confirmedSurplus")}
            </span>
            <div className="p-1.5 rounded-lg bg-success-light text-success-text">
              <Coins className="w-4 h-4 text-success" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold font-mono text-success-text">
              {summary.confirmedSurplus > 0 ? `+${formatDZD(summary.confirmedSurplus)}` : formatDZD(0)}
            </p>
            <p className="text-[11px] text-muted mt-1 leading-snug">
              {t("confirmedSurplusHelper")}
            </p>
          </div>
        </Card>

        {/* Net Reconciled Cash in Box */}
        <Card className="border-primary-soft shadow-xs p-5 bg-primary-light/20 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-primary-hover">
              {t("netCashInBox")}
            </span>
            <div className="p-1.5 rounded-lg bg-primary text-white">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold font-mono text-primary">
              {formatDZD(summary.netCash)}
            </p>
            <p className="text-[11px] text-muted mt-1 leading-snug">
              {t("netCashInBoxHelper")}
            </p>
          </div>
        </Card>
      </div>

      {/* SECTION 2: BREAKDOWN BY FEE TYPE (§7.11 & §1.1) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-section-title font-bold text-gray-900 flex items-center gap-2">
            <Coins className="w-5 h-5 text-primary" />
            <span>Détail par type de frais ({formattedToday})</span>
          </h2>
          <span className="text-xs text-muted font-medium">
            Source : Grand Livre Journalier
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Inscription Fees */}
          <Card className="border-border/80 shadow-xs p-5 bg-surface hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between text-xs text-muted font-semibold">
              <span>{t("inscriptionFees")}</span>
              <span className="w-2.5 h-2.5 rounded-full bg-success"></span>
            </div>
            <p className="text-2xl font-bold font-mono text-gray-900 mt-3">
              {formatDZD(summary.inscription)}
            </p>
            <p className="text-form-helper text-muted mt-1">
              {t("inscriptionFeesHelper")}
            </p>
          </Card>

          {/* 2. Book Fees */}
          <Card className="border-border/80 shadow-xs p-5 bg-surface hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between text-xs text-muted font-semibold">
              <span>{t("bookFees")}</span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            </div>
            <p className="text-2xl font-bold font-mono text-gray-900 mt-3">
              {formatDZD(summary.book)}
            </p>
            <p className="text-form-helper text-muted mt-1">
              {t("bookFeesHelper")}
            </p>
          </Card>

          {/* 3. Tuition / Lesson Fees */}
          <Card className="border-border/80 shadow-xs p-5 bg-surface hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between text-xs text-muted font-semibold">
              <span>{t("tuitionFees")}</span>
              <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>
            </div>
            <p className="text-2xl font-bold font-mono text-gray-900 mt-3">
              {formatDZD(summary.tuition)}
            </p>
            <p className="text-form-helper text-muted mt-1">
              {t("tuitionFeesHelper")}
            </p>
          </Card>

          {/* 4. Formation / Dawarat Fees */}
          <Card className="border-border/80 shadow-xs p-5 bg-surface hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between text-xs text-muted font-semibold">
              <span>{t("dawaratFormationFees")}</span>
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            </div>
            <p className="text-2xl font-bold font-mono text-gray-900 mt-3">
              {formatDZD(summary.atelierFormation)}
            </p>
            <p className="text-form-helper text-muted mt-1">
              {t("dawaratFormationFeesHelper")}
            </p>
          </Card>
        </div>
      </div>

      {/* SECTION 3: CASHBOX DISCREPANCIES (MISSING & SURPLUS) */}
      <Card className="border-border/80 shadow-xs bg-surface">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border/80">
            <div>
              <h3 className="text-section-title font-bold text-gray-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-primary" />
                <span>{t("discrepanciesSectionTitle")}</span>
              </h3>
              <p className="text-form-helper text-muted mt-0.5">
                {t("discrepanciesSectionDesc")}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <DeclareMissingMoneyModal
                branchId={branch.id}
                branchName={branch.name}
              />
              <DeclareSurplusMoneyModal
                branchId={branch.id}
                branchName={branch.name}
              />
            </div>
          </div>

          <DataTable
            columns={[
              { header: t("colType"), accessor: "type" },
              { header: t("colDate"), accessor: "createdAt" },
              { header: t("colAmount"), accessor: "amount", align: "end" },
              { header: t("colReason"), accessor: "reason" },
              { header: t("colStatus"), accessor: "status", align: "center" },
              ...(isOwner ? [{ header: "Actions", accessor: "actions", align: "end" as const }] : []),
            ]}
            data={discrepancies}
            renderRow={(item) => (
              <tr
                key={`${item.type}-${item.id}`}
                className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
              >
                <td className="p-3.5">
                  <Badge variant={item.type === "MISSING" ? "danger" : "success"} size="sm">
                    {item.type === "MISSING" ? t("manque") : t("surplus")}
                  </Badge>
                </td>
                <td className="p-3.5 text-muted text-xs">
                  {format(new Date(item.createdAt), "HH:mm, d MMM", {
                    locale: locale === "ar" ? arDZ : undefined,
                  })}
                </td>
                <td
                  className={`p-3.5 font-mono font-bold text-end ${
                    item.type === "MISSING" ? "text-danger" : "text-success-text"
                  }`}
                >
                  {item.type === "MISSING" ? `-${formatDZD(item.amount)}` : `+${formatDZD(item.amount)}`}
                </td>
                <td className="p-3.5 text-gray-800 font-medium">
                  {item.reason || "—"}
                </td>
                <td className="p-3.5 text-center">
                  <Badge
                    variant={
                      item.status === "CONFIRMED"
                        ? item.type === "MISSING" ? "danger" : "success"
                        : item.status === "PENDING"
                        ? "warning"
                        : "secondary"
                    }
                    size="sm"
                    withDot
                  >
                    {item.status === "CONFIRMED"
                      ? item.type === "MISSING" ? t("statusConfirmed") : t("statusConfirmedSurplus")
                      : item.status === "PENDING"
                      ? t("statusPending")
                      : t("statusRejected")}
                  </Badge>
                </td>
                {isOwner && (
                  <td className="p-3.5 text-end">
                    {item.type === "MISSING" ? (
                      <MissingMoneyActions id={item.id} status={item.status} />
                    ) : (
                      <SurplusMoneyActions id={item.id} status={item.status} />
                    )}
                  </td>
                )}
              </tr>
            )}
            emptyTitle={t("noDiscrepanciesToday")}
            emptyDescription=""
          />
        </CardContent>
      </Card>

      {/* SECTION 4: TODAY'S VOUCHERS / RECEIPTS (AUDIT TRAIL) */}
      <Card className="border-border/80 shadow-xs bg-surface">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-section-title font-bold text-gray-900">
                {t("todayVouchersTitle")}
              </h3>
              <Badge variant="secondary" size="sm">
                {todayVouchers.length}
              </Badge>
            </div>
            <p className="text-form-helper text-muted mt-0.5">
              {t("todayVouchersDesc")}
            </p>
          </div>

          {(() => {
            const pageNum = searchParams.page ? parseInt(searchParams.page, 10) : 1;
            const p = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
            const paginatedTodayVouchers = todayVouchers.slice((p - 1) * ITEM_PER_PAGE, p * ITEM_PER_PAGE);

            return (
              <DataTable
                columns={[
                  { header: t("colVoucherNum"), accessor: "number" },
                  { header: t("colStudent"), accessor: "studentName" },
                  { header: t("colTarget"), accessor: "className" },
                  { header: t("colPaymentType"), accessor: "paymentType" },
                  { header: t("colTime"), accessor: "issuedAt" },
                  { header: "Montant", accessor: "amount", align: "end" },
                ]}
                data={paginatedTodayVouchers}
                renderRow={(v) => (
                  <tr
                    key={v.id}
                    className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
                  >
                    <td className="p-3.5 font-mono text-xs font-bold text-primary" dir="ltr">
                      #{v.number}
                    </td>
                    <td className="p-3.5 font-semibold text-gray-900">
                      {v.studentName}
                    </td>
                    <td className="p-3.5 text-gray-700">{v.className}</td>
                    <td className="p-3.5">
                      <Badge
                        variant={
                          v.paymentType === "INSCRIPTION"
                            ? "success"
                            : v.paymentType === "BOOK"
                            ? "warning"
                            : v.paymentType === "WORKSHOP" || v.paymentType === "FORMATION"
                            ? "secondary"
                            : "primary"
                        }
                        size="sm"
                      >
                        {v.paymentType}
                      </Badge>
                    </td>
                    <td className="p-3.5 text-muted text-xs">
                      {format(new Date(v.issuedAt), "HH:mm")}
                    </td>
                    <td className="p-3.5 font-mono font-bold text-success-text text-end">
                      +{formatDZD(v.amount)}
                    </td>
                  </tr>
                )}
                emptyTitle={t("noVouchersToday")}
                emptyDescription=""
                pagination={<Pagination count={todayVouchers.length} />}
              />
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
