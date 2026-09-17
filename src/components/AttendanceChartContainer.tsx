import Image from "next/image";
import AttendanceChart from "./AttendanceChart";
import prisma from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";

const AttendanceChartContainer = async () => {
  const daysOfWeek = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"] as const;

  const attendanceMap: Record<string, { present: number; absent: number }> = {
    Sat: { present: 0, absent: 0 },
    Sun: { present: 0, absent: 0 },
    Mon: { present: 0, absent: 0 },
    Tue: { present: 0, absent: 0 },
    Wed: { present: 0, absent: 0 },
    Thu: { present: 0, absent: 0 },
    Fri: { present: 0, absent: 0 },
  };

  const dayNameFromIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  try {
    const today = new Date();
    const dayOfWeek = today.getDay(); // Sunday = 0, ..., Saturday = 6

    const daysSinceSaturday = (dayOfWeek + 1) % 7;
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - daysSinceSaturday);
    startOfWeek.setHours(0, 0, 0, 0);

    const rows = await prisma.$queryRaw<
      Array<{ status: string; startsAt: Date }>
    >`
      SELECT a.status, l."startsAt"
      FROM "Attendance" a
      JOIN "Lesson" l ON a."lessonId" = l.id
      WHERE l."startsAt" >= ${startOfWeek}
    `.catch(() => []);

    for (const record of rows) {
      if (!record || !record.startsAt) {
        continue;
      }

      const itemDate = new Date(record.startsAt);
      const dayOfWeekIndex = itemDate.getDay();
      const dayName = dayNameFromIndex[dayOfWeekIndex];

      if (dayName && attendanceMap[dayName]) {
        if (record.status === "PRESENT") {
          attendanceMap[dayName].present += 1;
        } else {
          attendanceMap[dayName].absent += 1;
        }
      }
    }
  } catch {
    // Keep zero defaults
  }

  const t = await getTranslations("dashboard.attendanceChart");

  const dataForChart = daysOfWeek.map((day) => ({
    name: t(`days.${day}` as any),
    present: attendanceMap[day].present,
    absent: attendanceMap[day].absent,
  }));

  return (
    <Card className="p-6 h-full flex flex-col justify-between">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-section-title font-bold text-gray-900">{t("title")}</h1>
        <Link href="/list/attendance">
          <Image src="/moreDark.png" alt="" width={20} height={20} />
        </Link>
      </div>
      <AttendanceChart
        data={dataForChart}
        presentLabel={t("present")}
        absentLabel={t("absent")}
      />
    </Card>
  );
};

export default AttendanceChartContainer;
