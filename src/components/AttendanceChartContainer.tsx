import Image from "next/image";
import AttendanceChart from "./AttendanceChart";
import prisma from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { getActiveBranchId } from "@/lib/auth";

const AttendanceChartContainer = async (props?: { branchId?: number }) => {
  const activeBranchId = props?.branchId ?? (await getActiveBranchId());
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
    const now = new Date();
    // Helper to extract date and weekday information in Africa/Algiers timezone (UTC+1)
    const algiersFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Algiers",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
    const parts = algiersFormatter.formatToParts(now);
    const m: Record<string, string> = {};
    parts.forEach((p) => {
      m[p.type] = p.value;
    });
    const aYear = parseInt(m.year, 10);
    const aMonth = parseInt(m.month, 10);
    const aDay = parseInt(m.day, 10);

    const algeriaDate = new Date(Date.UTC(aYear, aMonth - 1, aDay, 12, 0, 0));
    const dayOfWeek = algeriaDate.getUTCDay(); // Sunday = 0, ..., Saturday = 6

    const daysSinceSaturday = (dayOfWeek + 1) % 7;
    // Start of week Saturday 00:00 Algiers = Friday 23:00 UTC
    const startOfWeek = new Date(
      Date.UTC(aYear, aMonth - 1, aDay - daysSinceSaturday, -1, 0, 0, 0)
    );
    // End of week Friday 23:59:59.999 Algiers = Friday 22:59:59.999 UTC
    const endOfWeek = new Date(
      Date.UTC(aYear, aMonth - 1, aDay - daysSinceSaturday + 6, 22, 59, 59, 999)
    );

    const rows = activeBranchId
      ? await prisma.$queryRaw<Array<{ status: string; startsAt: Date }>>`
          SELECT a.status, l."startsAt"
          FROM "Attendance" a
          JOIN "Lesson" l ON a."lessonId" = l.id
          WHERE l."startsAt" >= ${startOfWeek} AND l."startsAt" <= ${endOfWeek}
            AND l."branchId" = ${activeBranchId}
        `.catch(() => [])
      : await prisma.$queryRaw<Array<{ status: string; startsAt: Date }>>`
          SELECT a.status, l."startsAt"
          FROM "Attendance" a
          JOIN "Lesson" l ON a."lessonId" = l.id
          WHERE l."startsAt" >= ${startOfWeek} AND l."startsAt" <= ${endOfWeek}
        `.catch(() => []);

    for (const record of rows) {
      if (!record || !record.startsAt) {
        continue;
      }

      // Convert startsAt to Africa/Algiers day
      const itemDate = new Date(record.startsAt);
      const itemFormatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Algiers",
        weekday: "short",
      });
      const dayShort = itemFormatter.format(itemDate); // "Sat", "Sun", etc.

      if (dayShort && attendanceMap[dayShort]) {
        if (record.status === "PRESENT") {
          attendanceMap[dayShort].present += 1;
        } else {
          attendanceMap[dayShort].absent += 1;
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
