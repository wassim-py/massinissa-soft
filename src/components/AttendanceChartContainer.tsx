import Image from "next/image";
import AttendanceChart from "./AttendanceChart";
import prisma from "@/lib/prisma";
import Link from "next/link";

const AttendanceChartContainer = async () => {
  // Define the display order, starting with Saturday for an Islamic/Arabic week.
  const daysOfWeek = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
  // Corrected spelling of Monday to ensure it matches the child chart component.
  const arabicDaysOfWeek = [
    "السبت",
    "الأحد",
    "الإثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
  ];

  // Initialize the map that will hold our processed data.
  const attendanceMap: { [key: string]: { present: number; absent: number } } =
    {
      Sat: { present: 0, absent: 0 },
      Sun: { present: 0, absent: 0 },
      Mon: { present: 0, absent: 0 },
      Tue: { present: 0, absent: 0 },
      Wed: { present: 0, absent: 0 },
      Thu: { present: 0, absent: 0 },
      Fri: { present: 0, absent: 0 },
    };

  // Helper array to map the result of Date.getDay() (where Sunday is 0) to a string.
  const dayNameFromIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  try {
    const today = new Date();
    const dayOfWeek = today.getDay(); // Sunday = 0, ..., Saturday = 6

    // Calculate the start of the week, assuming the week starts on Saturday.
    const daysSinceSaturday = (dayOfWeek + 1) % 7;
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - daysSinceSaturday);
    startOfWeek.setHours(0, 0, 0, 0);

    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        date: {
          gte: startOfWeek,
        },
      },
      select: {
        date: true,
        present: true,
      },
    });

    // Use a more robust for...of loop to process the records.
    for (const record of attendanceRecords) {
      // Add a guard clause to skip any invalid records, preventing crashes.
      if (!record || typeof record.present !== "boolean") {
        continue;
      }

      const itemDate = new Date(record.date);
      const dayOfWeekIndex = itemDate.getDay();

      // Get the string name of the day (e.g., "Sat") to use as a key.
      const dayName = dayNameFromIndex[dayOfWeekIndex];

      if (dayName && attendanceMap[dayName]) {
        // Check if dayName is valid
        if (record.present) {
          attendanceMap[dayName].present += 1;
        } else {
          attendanceMap[dayName].absent += 1;
        }
      }
    }
  } catch (error) {
    console.error(
      "Failed to fetch or process attendance data for chart:",
      error
    );
  }

  // Convert the processed map into the format the chart component expects,
  // using the Saturday-first display order.
  const dataForChart = daysOfWeek.map((day, index) => ({
    name: arabicDaysOfWeek[index],
    present: attendanceMap[day].present,
    absent: attendanceMap[day].absent,
  }));

  return (
    <div className="bg-white rounded-lg p-4 h-full">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold">الحضور</h1>
        <Link href="list/attendance"><Image src="/moreDark.png" alt="" width={20} height={20} /></Link>
      </div>
      <AttendanceChart data={dataForChart} />
    </div>
  );
};

export default AttendanceChartContainer;
