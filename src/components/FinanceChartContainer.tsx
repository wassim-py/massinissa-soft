import FinanceChart from "./FinanceChart";
import prisma from "@/lib/prisma";
import { getTranslations } from "next-intl/server";

const FinanceChartContainer = async () => {
  const monthKeys = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ] as const;

  const monthlyData = monthKeys.map((key) => ({
    key,
    income: 0,
    expense: 0,
  }));

  try {
    const [rows, refundRows] = await Promise.all([
      prisma.$queryRaw<
        Array<{ amount: number | string; issuedAt: Date }>
      >`
        SELECT amount, "issuedAt" FROM "Voucher"
      `,
      prisma.$queryRaw<
        Array<{ amount: number | string; refundedAt: Date }>
      >`
        SELECT amount, "refundedAt" FROM "Refund"
      `,
    ]);
    rows.forEach((row) => {
      const month = new Date(row.issuedAt).getMonth();
      monthlyData[month].income += Number(row.amount);
    });
    refundRows.forEach((row) => {
      const month = new Date(row.refundedAt).getMonth();
      monthlyData[month].expense += Number(row.amount);
    });
  } catch {
    // Keep zero defaults
  }

  const t = await getTranslations("dashboard.financeChart");

  const dataForChart = monthlyData.map((item) => ({
    name: t(`months.${item.key}` as any),
    income: item.income,
    expense: item.expense,
  }));

  return (
    <FinanceChart
      data={dataForChart}
      title={t("title")}
      incomeLabel={t("income")}
      expenseLabel={t("expense")}
    />
  );
};

export default FinanceChartContainer;
