import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getTranslations, getLocale } from "next-intl/server";
import { isClassInactive } from "@/lib/classStatus";

const MyClasses = async () => {
  const { userId } = await auth();
  if (!userId) return null;
  const t = await getTranslations("dashboard");
  const locale = await getLocale();

  const rawClasses = await prisma.class.findMany({
    where: {
      lessons: {
        some: {
          teacherId: userId,
        },
      },
    },
    include: {
      _count: {
        select: {
          enrollments: {
            where: {
              status: "ACTIVE",
              transfersFrom: { none: {} },
            },
          },
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  const classes = [...rawClasses].sort((a, b) => {
    const aInactive = isClassInactive(a) ? 1 : 0;
    const bInactive = isClassInactive(b) ? 1 : 0;
    if (aInactive !== bInactive) return aInactive - bInactive;
    return a.name.localeCompare(b.name);
  });

  return (
    <Card className="p-6 font-sans">
      <h1 className="text-section-title font-bold text-gray-900 mb-4">{t("myClassesTitle")}</h1>
      {classes.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {classes.map((classItem) => {
            const inactive = isClassInactive(classItem);
            return (
              <div
                key={classItem.id}
                className={`p-3.5 rounded-xl border flex flex-col justify-between h-28 transition-colors ${
                  inactive
                    ? "bg-gray-50/70 border-dashed border-gray-300 opacity-75"
                    : "bg-surface-subtle border-border hover:border-primary/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 bg-primary/10 rounded-lg shrink-0">
                      <Image
                        src="/class.png"
                        alt="class icon"
                        width={16}
                        height={16}
                      />
                    </div>
                    <p className="font-bold text-gray-900 text-sm truncate">
                      {classItem.name}
                    </p>
                  </div>
                  {inactive && (
                    <Badge variant="warning" size="sm" withDot>
                      {locale === "ar" ? "مغلق / متوقف" : "Fermé / En pause"}
                    </Badge>
                  )}
                </div>
                <div className="flex justify-end">
                  <Badge variant="neutral" size="sm">
                    {t("studentsUnit", { count: classItem._count.enrollments })}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-500 text-center py-4">
          {t("noClassesAssigned")}
        </p>
      )}
    </Card>
  );
};

export default MyClasses;
