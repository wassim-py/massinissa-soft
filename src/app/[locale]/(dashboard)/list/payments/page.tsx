import prisma from "@/lib/prisma";
import { getAuthSession, getActiveBranchId } from "@/lib/auth";
import Image from "next/image";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { formatVoucherDisplay } from "@/lib/voucherUtils";
import { getTranslations, getLocale } from "next-intl/server";

const FinancialStatCard = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
  badgeVariant: "success" | "danger" | "primary";
}) => (
  <Card className="p-5 border-border/80 shadow-xs flex items-start gap-4">
    <div className="w-12 h-12 rounded-xl bg-surface-subtle flex items-center justify-center shrink-0 border border-border">
      <Image src={icon} alt={label} width={24} height={24} />
    </div>
    <div>
      <p className="text-section-title font-bold text-gray-900">{value}</p>
      <p className="text-form-helper text-muted mt-0.5">{label}</p>
    </div>
  </Card>
);

const TransactionHistory = ({
  transactions,
  t,
  locale,
}: {
  transactions: any[];
  t: any;
  locale: string;
}) => (
  <Card className="border-border/80 shadow-xs">
    <CardContent className="p-5 sm:p-6">
      <h2 className="text-section-title font-bold text-gray-900 mb-4">
        {t("transactionsTitle")}
      </h2>
      <div className="space-y-3">
        {transactions.length > 0 ? (
          transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between p-3.5 bg-surface-muted rounded-lg border border-border/60"
            >
              <div>
                <p
                  className={`text-table-body font-semibold ${
                    tx.isRefund ? "text-danger line-through" : "text-gray-900"
                  }`}
                >
                  <span className="font-mono font-bold" dir="ltr">{tx.formattedVoucher}</span> - {tx.description} ({tx.type})
                </p>
                <p className="text-form-helper text-muted mt-0.5">
                  {new Date(tx.date).toLocaleDateString(locale, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
              <p
                className={`font-bold font-mono text-base ${
                  tx.isRefund ? "text-danger" : "text-success-text"
                }`}
              >
                {tx.isRefund ? t("voidedBadge") : `+${tx.amount.toLocaleString(locale)} DZD`}
              </p>
            </div>
          ))
        ) : (
          <p className="text-center text-muted py-8 text-table-body">
            {t("noTransactions")}
          </p>
        )}
      </div>
    </CardContent>
  </Card>
);

const PaymentsListPage = async (props: {
  searchParams: Promise<{ studentId?: string; search?: string; branchId?: string; page?: string }>;
}) => {
  const searchParams = await props.searchParams;
  const t = await getTranslations("payments");
  const locale = await getLocale();
  const session = await getAuthSession();
  const role = session.role;
  const activeBranchId = await getActiveBranchId();

  if (role === "teacher") {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-8">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {t("unauthorizedTitle")}
          </Badge>
          <p className="text-table-body text-muted">
            {t("unauthorizedDesc")}
          </p>
        </div>
      </Card>
    );
  }

  // Render Student/Parent View (scoped to that student's own records)
  if (role === "student" || role === "parent") {
    const activeStudentId = session.userId;

    const studentData = activeStudentId
      ? await prisma.student.findUnique({
          where: { id: activeStudentId },
          select: {
            vouchers: {
              select: {
                id: true,
                number: true,
                paymentType: true,
                amount: true,
                isVoided: true,
                issuedAt: true,
                class: { select: { id: true, name: true, branch: { select: { id: true, name: true } }, level: { select: { id: true, name: true } } } },
                series: { select: { scope: true, id: true, level: { select: { id: true, name: true } }, issuingBranch: { select: { id: true, name: true } }, targetBranch: { select: { id: true, name: true } } } },
                workshop: { select: { id: true, title: true } },
              },
              orderBy: { issuedAt: "desc" },
            },
            enrollments: { select: { class: { select: { id: true, name: true } } } },
          },
        })
      : null;

    const allTransactions = (studentData?.vouchers || []).map((v: any) => ({
      id: `voucher-${v.id}`,
      number: v.number,
      formattedVoucher: formatVoucherDisplay(v),
      type: v.paymentType,
      description: v.class?.name || v.workshop?.title || "ورشة عمل / دورة",
      date: v.issuedAt,
      amount: Number(v.amount),
      isRefund: v.isVoided,
    }));

    const totalPaid = allTransactions
      .filter((tx) => !tx.isRefund)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalVoided = allTransactions
      .filter((tx) => tx.isRefund)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const netPaid = totalPaid;
    const lastPayment = allTransactions.find((tx) => !tx.isRefund);

    return (
      <Card className="flex-1 w-full border-border/80 shadow-xs font-sans">
        <CardContent className="p-4 sm:p-5 md:p-6">
          <div className="mb-6 border-b border-border pb-4">
            <h1 className="text-page-title text-gray-900">
              {t("financialSummaryTitle")}
            </h1>
            <p className="text-form-helper text-muted mt-1">
              {t("financialSummarySubtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
            <FinancialStatCard
              label={t("activeVouchersAmount")}
              value={`${netPaid.toLocaleString(locale)} DZD`}
              icon="/finance.png"
              badgeVariant="success"
            />
            <FinancialStatCard
              label={t("voidedVouchersAmount")}
              value={`${totalVoided.toLocaleString(locale)} DZD`}
              icon="/close.png"
              badgeVariant="danger"
            />
            <FinancialStatCard
              label={t("lastPaymentDate")}
              value={
                lastPayment
                  ? new Date(lastPayment.date).toLocaleDateString(locale)
                  : t("none")
              }
              icon="/date.png"
              badgeVariant="primary"
            />
          </div>

          <TransactionHistory transactions={allTransactions} t={t} locale={locale} />
        </CardContent>
      </Card>
    );
  }

  // RENDER ADMIN VIEW (Class List with Link to Class Payment Grid)
  // BRANCH SCOPING (§1.0 & Phase 16):
  // - Branch Admin sees only groups at their own branch.
  // - Owner gets filter tabs to see the whole school or filter to a specific branch.
  const { search, branchId: selectedBranchParam, page } = searchParams;
  const isOwner = session.isOwner;
  const pageNum = page ? parseInt(page, 10) : 1;
  const p = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;

  let branchFilter: number | undefined;
  if (!isOwner) {
    branchFilter = activeBranchId;
  } else if (selectedBranchParam && selectedBranchParam !== "all") {
    branchFilter = Number(selectedBranchParam);
  }

  const classWhere = {
    ...(branchFilter ? { branchId: branchFilter } : {}),
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [branches, totalClassesCount, classesData] = await Promise.all([
    prisma.branch.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
    prisma.class.count({ where: classWhere }),
    prisma.class.findMany({
      where: classWhere,
      skip: ITEM_PER_PAGE * (p - 1),
      take: ITEM_PER_PAGE,
      select: {
        id: true,
        name: true,
        branchId: true,
        pricePerCycle: true,
        branch: { select: { id: true, name: true } },
        level: { select: { id: true, name: true } },
        _count: {
          select: { enrollments: true },
        },
      },
      orderBy: [
        { branchId: "asc" },
        { name: "asc" },
      ],
    }),
  ]);

  return (
    <Card className="flex-1 w-full border-border/80 shadow-xs font-sans">
      <CardContent className="p-4 sm:p-5 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h1 className="text-page-title text-gray-900 font-bold">
              {t("classesGridTitle")}
            </h1>
            <p className="text-form-helper text-muted mt-1">
              {t("classesGridSubtitle")}
            </p>
          </div>

          {/* Owner Branch Filter Tabs */}
          {isOwner ? (
            <FilterTabs
              tabs={[
                {
                  id: "all",
                  label: t("allBranchesTab"),
                  href: "/list/payments?branchId=all",
                },
                ...branches.map((b) => ({
                  id: String(b.id),
                  label: b.name,
                  href: `/list/payments?branchId=${b.id}`,
                })),
              ]}
              activeTab={selectedBranchParam || "all"}
            />
          ) : (
            <Badge variant="primary" size="md">
              {t("currentBranchScope", { id: activeBranchId })}
            </Badge>
          )}
        </div>

        <div className="mt-6">
          <PageHeader
            title=""
            searchPlaceholder={t("searchClassPlaceholder")}
            createAction={null}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 mt-4">
          {classesData.map((c) => (
            <Link
              href={`/list/payments/class/${c.id}`}
              key={c.id}
              className="block group h-full"
            >
              <Card className="h-full border-border/80 group-hover:border-primary/50 group-hover:shadow-md transition-all flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center shrink-0">
                      <Image src="/finance.png" alt="finance icon" width={20} height={20} />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {c.level && (
                        <Badge variant="secondary" size="sm">
                          {c.level.name}
                        </Badge>
                      )}
                      <Badge variant="primary" size="sm">
                        {c.branch.name}
                      </Badge>
                    </div>
                  </div>
                  <CardTitle className="text-card-title font-bold text-gray-900 group-hover:text-primary transition-colors line-clamp-1">
                    {c.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 pb-4 text-xs space-y-2 text-muted">
                  <div className="flex justify-between items-center">
                    <span>{t("pricePerCycle")}</span>
                    <strong className="text-gray-900 font-mono text-xs">
                      {Number(c.pricePerCycle || 0).toLocaleString(locale)} DZD
                    </strong>
                  </div>
                  <div className="flex justify-between items-center border-t border-border/60 pt-2">
                    <span>{t("totalEnrolled")} :</span>
                    <strong className="text-primary font-bold">
                      {t("enrolledCount", { count: c._count.enrollments })}
                    </strong>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {classesData.length === 0 && (
            <div className="col-span-full text-center py-16 px-4 border-2 border-dashed border-border rounded-xl">
              <p className="text-table-body text-muted">
                {search
                  ? t("noClassesMatchingSearch", { search })
                  : t("noClassesFound")}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          <Pagination count={totalClassesCount} />
        </div>
      </CardContent>
    </Card>
  );
};

export default PaymentsListPage;
