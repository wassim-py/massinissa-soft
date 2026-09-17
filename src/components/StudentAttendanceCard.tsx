import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";

const StudentAttendanceCard = async ({ id }: { id: string }) => {
  const t = await getTranslations("attendance");
  let percentage = 100;
  try {
    const attendance = await prisma.$queryRaw<Array<{ id: number; status: string }>>`
      SELECT id, status FROM "Attendance" WHERE "studentId" = ${id}
    `;
    const totalDays = attendance.length;
    const presentDays = attendance.filter((day) => day.status === "PRESENT").length;
    if (totalDays > 0) {
      percentage = Math.round((presentDays / totalDays) * 100);
    }
  } catch (err) {
    console.error("Error in StudentAttendanceCard:", err);
  }

  return (
    <div className="">
      <h1 className="text-xl font-semibold">{percentage}%</h1>
      <span className="text-sm text-gray-400">{t("title")}</span>
    </div>
  );
};

export default StudentAttendanceCard;
