"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/Card";

const FinanceChart = ({
  data,
  title = "Finances",
  incomeLabel = "Revenus",
  expenseLabel = "Dépenses",
}: {
  data: any[];
  title?: string;
  incomeLabel?: string;
  expenseLabel?: string;
}) => {
  return (
    <Card className="w-full h-full p-6">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-section-title font-bold text-gray-900">{title}</h1>
        <Link href="/list/finance">
          <Image src="/moreDark.png" alt="" width={20} height={20} />
        </Link>
      </div>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart
          width={500}
          height={300}
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#ddd" />
          <XAxis
            dataKey="name"
            axisLine={false}
            tick={{ fill: "#6b7280" }}
            tickLine={false}
            tickMargin={10}
          />
          <YAxis
            axisLine={false}
            tick={{ fill: "#6b7280" }}
            tickLine={false}
            tickMargin={20}
          />
          <Tooltip />
          <Legend
            align="center"
            verticalAlign="top"
            wrapperStyle={{ paddingTop: "10px", paddingBottom: "30px" }}
          />
          <Line
            type="monotone"
            dataKey="income"
            name={incomeLabel}
            stroke="#C3EBFA"
            strokeWidth={5}
          />
          <Line
            type="monotone"
            dataKey="expense"
            name={expenseLabel}
            stroke="#CFCEFF"
            strokeWidth={5}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
};

export default FinanceChart;
