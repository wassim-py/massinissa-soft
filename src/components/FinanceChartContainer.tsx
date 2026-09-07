import prisma from "@/lib/prisma";
import FinanceChart from "./FinanceChart";

// This is a Server Component that fetches and processes data.
const FinanceChartContainer = async () => {
  // 1. Define the Algerian Arabic month names.
  const algerianMonths = [
    "جانفي",
    "فيفري",
    "مارس",
    "أفريل",
    "ماي",
    "جوان",
    "جويلية",
    "أوت",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
  ];

  // 2. Initialize a default data structure using the Algerian month names.
  let monthlyData = algerianMonths.map((monthName) => ({
    name: monthName,
    income: 0,
    expense: 0, // 'expense' will represent refunds
  }));

  try {
    // 3. Fetch all payments and refunds from the database in parallel.
    const [payments, workshopPayments, refunds] = await Promise.all([
      prisma.payment.findMany(),
      prisma.workshopPayment.findMany(),
      prisma.refund.findMany(),
    ]);

    // 4. Process all income (class and workshop payments).
    payments.forEach((payment) => {
      const month = new Date(payment.date).getMonth();
      monthlyData[month].income += payment.amount;
    });
    workshopPayments.forEach((payment) => {
      const month = new Date(payment.date).getMonth();
      monthlyData[month].income += payment.amount;
    });

    // 5. Process all outcomes (refunds).
    refunds.forEach((refund) => {
      const month = new Date(refund.date).getMonth();
      monthlyData[month].expense += refund.amount;
    });
  } catch (error) {
    console.error("Failed to fetch finance data for chart:", error);
  }

  // 6. Render the client chart component, passing the processed data as a prop
  return <FinanceChart data={monthlyData} />;
};

export default FinanceChartContainer;
