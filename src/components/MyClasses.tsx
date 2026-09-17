import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getTranslations } from "next-intl/server";

const MyClasses = async () => {
  const { userId } = await auth();
  if (!userId) return null;
  const t = await getTranslations("dashboard");

  const classes = await prisma.class.findMany({
    where: {
      lessons: {
        some: {
          teacherId: userId,
        },
      },
    },
    include: {
      _count: {
        select: { enrollments: true },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  return (
    <Card className="p-6 font-sans">
      <h1 className="text-section-title font-bold text-gray-900 mb-4">{t("myClassesTitle")}</h1>
      {classes.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {classes.map((classItem) => (
            <div
              key={classItem.id}
              className="p-3.5 rounded-xl bg-surface-subtle border border-border flex flex-col justify-between h-28 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-primary/10 rounded-lg">
                  <Image
                    src="/class.png"
                    alt="class icon"
                    width={16}
                    height={16}
                  />
                </div>
                <p className="font-bold text-gray-900 text-sm">
                  {classItem.name}
                </p>
              </div>
              <div className="flex justify-end">
                <Badge variant="neutral" size="sm">
                  {t("studentsUnit", { count: classItem._count.enrollments })}
                </Badge>
              </div>
            </div>
          ))}
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
