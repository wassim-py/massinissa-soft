import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getTranslations, getLocale } from "next-intl/server";
import { getAlgiersDateInfo, resolveRecurringLessonsForDate } from "@/lib/utils";

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

  const now = new Date();
  const todayInfo = getAlgiersDateInfo(now);
  const startOfDay = new Date(
    Date.UTC(todayInfo.year, todayInfo.month - 1, todayInfo.day, -1, 0, 0, 0)
  );
  const endOfDay = new Date(
    Date.UTC(todayInfo.year, todayInfo.month - 1, todayInfo.day, 22, 59, 59, 999)
  );

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
            isCompleted: false,
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

  const todaysLessons = resolveRecurringLessonsForDate(
    candidateLessons.filter((l) => !l.class?.isCompleted),
    now
  );

  return (
    <Card className="p-6 h-full font-sans">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-section-title font-bold text-gray-900">
          {t("todaysScheduleTitle")}
        </h1>
        <Badge variant="neutral" size="sm">
          {now.toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ", {
            weekday: "long",
            day: "numeric",
            month: "short",
            timeZone: "Africa/Algiers",
          })}
        </Badge>
      </div>
      <div className="space-y-3">
        {todaysLessons.length > 0 ? (
          todaysLessons.map((lesson) => {
            const startTime = new Date(lesson.startsAt).toLocaleTimeString(
              "en-GB",
              { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Algiers" }
            );
            const endTime = new Date(lesson.endsAt).toLocaleTimeString(
              "en-GB",
              { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Algiers" }
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
