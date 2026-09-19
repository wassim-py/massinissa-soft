import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getTranslations, getLocale } from "next-intl/server";

const TodaysSchedule = async ({ studentId }: { studentId?: string }) => {
  const { userId } = await auth();
  const t = await getTranslations("dashboard");
  const locale = await getLocale();

  const targetUserId = studentId || userId;

  if (!targetUserId) {
    return (
      <Card className="p-5 text-center">
        <p className="text-gray-500 text-sm">{t("userNotIdentified")}</p>
      </Card>
    );
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const todayDow = startOfDay.getDay();

  const userCondition: Prisma.LessonWhereInput = studentId
    ? {
        class: {
          enrollments: {
            some: {
              studentId: studentId,
            },
          },
        },
      }
    : { teacherId: targetUserId };

  const candidateLessons = await prisma.lesson.findMany({
    where: {
      ...userCondition,
      OR: [
        {
          startsAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        {
          isExtra: false,
          isCatchUp: false,
          isFree: false,
          class: {
            isFormation: false,
          },
        },
      ],
    },
    include: {
      class: true,
      classroom: true,
      teacher: true,
    },
    orderBy: {
      startsAt: "asc",
    },
  });

  const todaysLessons = candidateLessons
    .filter((l) => {
      const isOneOff = Boolean(
        l.isExtra || l.isCatchUp || l.isFree || l.class?.isFormation
      );
      if (isOneOff) {
        const d = new Date(l.startsAt);
        return d >= startOfDay && d <= endOfDay;
      }
      return new Date(l.startsAt).getDay() === todayDow;
    })
    .map((l) => {
      const isOneOff = Boolean(
        l.isExtra || l.isCatchUp || l.isFree || l.class?.isFormation
      );
      if (!isOneOff) {
        const durationMs =
          new Date(l.endsAt).getTime() - new Date(l.startsAt).getTime();
        const projectedStartsAt = new Date(l.startsAt);
        projectedStartsAt.setFullYear(
          startOfDay.getFullYear(),
          startOfDay.getMonth(),
          startOfDay.getDate()
        );
        const projectedEndsAt = new Date(
          projectedStartsAt.getTime() + durationMs
        );
        return {
          ...l,
          startsAt: projectedStartsAt,
          endsAt: projectedEndsAt,
        };
      }
      return l;
    })
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );

  return (
    <Card className="p-6 h-full font-sans">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-section-title font-bold text-gray-900">
          {t("todaysScheduleTitle")}
        </h1>
        <Badge variant="neutral" size="sm">
          {new Date().toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ", { weekday: "long" })}
        </Badge>
      </div>
      <div className="space-y-3">
        {todaysLessons.length > 0 ? (
          todaysLessons.map((lesson) => {
            const startTime = new Date(lesson.startsAt).toLocaleTimeString(
              "en-GB",
              { hour: "2-digit", minute: "2-digit", hour12: false }
            );
            const endTime = new Date(lesson.endsAt).toLocaleTimeString(
              "en-GB",
              { hour: "2-digit", minute: "2-digit", hour12: false }
            );

            return (
              <div
                key={lesson.id}
                className="flex items-center gap-4 p-3 bg-surface-subtle rounded-xl border border-border"
              >
                <div className="w-20 text-center">
                  <p className="font-bold text-gray-900 text-sm">{startTime}</p>
                  <p className="text-xs text-gray-500">{t("toTime", { time: endTime })}</p>
                </div>
                <div className="w-px bg-border self-stretch"></div>
                <div className="flex-grow">
                  <p className="font-bold text-gray-900 text-sm">{lesson.class.name}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-600 mt-1">
                    <span>
                      <strong className="text-gray-500">{t("room")}:</strong>{" "}
                      {lesson.classroom?.name || t("withoutRoom")}
                    </span>
                    {studentId && (
                      <>
                        <span>|</span>
                        <span>
                          <strong className="text-gray-500">{t("teacher")}:</strong>{" "}
                          {lesson.teacher.name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-10">
            <p className="text-gray-500 text-sm">{t("noLessonsToday")}</p>
          </div>
        )}
      </div>
    </Card>
  );
};

export default TodaysSchedule;
