import prisma from "@/lib/prisma";
import BigCalendar from "./BigCalender";
import { adjustScheduleToCurrentWeek } from "@/lib/utils";
import { getTranslations } from "next-intl/server";

const BigCalendarContainer = async ({
  type,
  id,
}: {
  type: "teacherId" | "classId";
  id: string | number;
}) => {
  const tLessons = await getTranslations("lessons");
  let schedule: any[] = [];
  try {
    let rawLessons: any[] = [];
    if (type === "teacherId") {
      rawLessons = await prisma.$queryRaw<any[]>`
        SELECT l.*, c.name as "className"
        FROM "Lesson" l
        LEFT JOIN "Class" c ON c.id = l."classId"
        WHERE l."teacherId" = ${String(id)}
      `;
    } else {
      rawLessons = await prisma.$queryRaw<any[]>`
        SELECT l.*, c.name as "className"
        FROM "Lesson" l
        LEFT JOIN "Class" c ON c.id = l."classId"
        WHERE l."classId" = ${Number(id)}
      `;
    }

    const data = rawLessons.map((lesson) => {
      let tag = "";
      if (lesson.isFree) tag = ` [${tLessons("freeBadge")}]`;
      else if (lesson.isExtra) tag = ` [${tLessons("extraBadge")}]`;
      else if (lesson.isCatchUp) tag = ` [${tLessons("catchUpBadge")}]`;

      return {
        title: `${lesson.className || tLessons("legend.regular")}${tag}`,
        start: new Date(lesson.startsAt),
        end: new Date(lesson.endsAt),
        isExtra: Boolean(lesson.isExtra),
        isCatchUp: Boolean(lesson.isCatchUp),
        isFree: Boolean(lesson.isFree),
      };
    });

    schedule = adjustScheduleToCurrentWeek(data);
  } catch (e) {
    console.error("BigCalendarContainer error:", e);
    schedule = [];
  }

  return (
    <div className="">
      <BigCalendar data={schedule} />
    </div>
  );
};

export default BigCalendarContainer;
