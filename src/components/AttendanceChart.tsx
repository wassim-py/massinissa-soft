"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Define the full list of days in the desired order for the chart's X-axis
const ALL_DAYS = [
  "السبت",
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
];

const AttendanceChart = ({
  data,
}: {
  data: { name: string; present: number; absent: number }[];
}) => {
  // Create a map of the provided data for efficient lookup
  const dataMap = new Map(data.map((item) => [item.name, item]));

  // Create a new, complete data array that includes all days of the week.
  // If a day is missing from the input data, it will be added with 0 for present and absent.
  const chartData = ALL_DAYS.map((day) => ({
    name: day,
    present: dataMap.get(day)?.present || 0,
    absent: dataMap.get(day)?.absent || 0,
  }));

  return (
    <ResponsiveContainer width="100%" height="90%">
      <BarChart width={500} height={300} data={chartData} barSize={20}>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="#e5e7eb"
        />
        <XAxis
          dataKey="name"
          axisLine={false}
          tick={{ fill: "#6b7280" }}
          tickLine={false}
        />
        <YAxis axisLine={false} tick={{ fill: "#6b7280" }} tickLine={false} />
        <Tooltip
          contentStyle={{ borderRadius: "10px", borderColor: "#e5e7eb" }}
          cursor={{ fill: "rgba(243, 244, 246, 0.5)" }}
        />
        <Legend
          align="left"
          verticalAlign="top"
          wrapperStyle={{ paddingTop: "20px", paddingBottom: "40px" }}
        />
        <Bar
          dataKey="present"
          name="حاضر"
          fill="#FAE27C"
          legendType="circle"
          radius={[10, 10, 0, 0]}
        />
        <Bar
          dataKey="absent"
          name="غائب"
          fill="#C3EBFA"
          legendType="circle"
          radius={[10, 10, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default AttendanceChart;
