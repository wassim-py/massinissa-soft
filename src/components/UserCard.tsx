import prisma from "@/lib/prisma";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getActiveBranchId } from "@/lib/auth";
import BranchTeacherModal, { BranchTeacherData } from "./dashboard/BranchTeacherModal";

interface UserCardProps {
  type: "admin" | "teacher" | "student" | "parent";
  branchId?: number;
}

const UserCard = async ({ type, branchId }: UserCardProps) => {
  const activeBranchId = branchId ?? (await getActiveBranchId());
  let count = 0;
  let teachersList: BranchTeacherData[] = [];
  let branchName = "";
  let teachersWithLessonsTodayCount = 0;
  let academicYearLabel = "";

  try {
    const [branchRecord, activeYearRecord] = await Promise.all([
      prisma.branch.findUnique({
        where: { id: activeBranchId },
        select: { name: true },
      }),
      prisma.academicYear.findFirst({
        orderBy: { startDate: "desc" },
        select: { label: true },
      }),
    ]);
    branchName = branchRecord?.name || `Siège #${activeBranchId}`;
    academicYearLabel = activeYearRecord?.label || "";

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    switch (type) {
      case "student": {
        // Students count: students registered at THIS branch
        count = await prisma.student.count({
          where: { registeredBranchId: activeBranchId },
        });
        break;
      }
      case "parent": {
        // Families count: families having at least one student registered at this branch
        count = await prisma.family.count({
          where: {
            students: {
              some: { registeredBranchId: activeBranchId },
            },
          },
        });
        break;
      }
      case "admin": {
        // Branches count: all branches in the school network
        count = await prisma.branch.count();
        break;
      }
      case "teacher": {
        // Teachers count: all registered teachers in all the school (not restricted by branch)
        const allTeachers = await prisma.teacher.findMany({
          include: {
            TeacherBranch: {
              include: { Branch: { select: { id: true, name: true } } },
            },
            classes: {
              select: {
                branchId: true,
                branch: { select: { id: true, name: true } },
              },
            },
            lessons: {
              select: {
                branchId: true,
                startsAt: true,
                isExtra: true,
                isCatchUp: true,
                isFree: true,
                class: { select: { isFormation: true } },
                branch: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { name: "asc" },
        });

        count = allTeachers.length;

        teachersList = allTeachers.map((t) => {
          // Identify all branches this teacher is associated with
          const branchesSet = new Set<string>();

          t.TeacherBranch.forEach((tb) => {
            if (tb.Branch?.name) {
              branchesSet.add(tb.Branch.name);
            }
          });

          t.classes.forEach((c) => {
            if (c.branch?.name) {
              branchesSet.add(c.branch.name);
            }
          });

          t.lessons.forEach((l) => {
            if (l.branch?.name) {
              branchesSet.add(l.branch.name);
            }
          });

          // Count lessons today across the school
          const todayDow = startOfToday.getDay();
          const todayLessons = t.lessons.filter((l) => {
            const isOneOff = Boolean(
              l.isExtra || l.isCatchUp || l.class?.isFormation
            );
            if (isOneOff) {
              const lessonDate = new Date(l.startsAt);
              return (
                lessonDate >= startOfToday &&
                lessonDate <= endOfToday
              );
            }
            return new Date(l.startsAt).getDay() === todayDow;
          });

          if (todayLessons.length > 0) {
            teachersWithLessonsTodayCount++;
          }

          const branchesArray = Array.from(branchesSet);

          return {
            id: t.id,
            name: t.name,
            branches: branchesArray,
            otherBranches: branchesArray,
            lessonsTodayCount: todayLessons.length,
          };
        });
        break;
      }
      default:
        count = 0;
    }
  } catch (error) {
    console.error(`Error loading count for ${type}:`, error);
    count = 0;
  }

  const t = await getTranslations("dashboard.cards");
  const tTeachers = await getTranslations("dashboard.teachersDetail");
  const title = t(type);
  const displayYear = academicYearLabel || t("academicYear");

  return (
    <Card className="p-4 sm:p-5 flex-1 min-w-[140px] border-border/80 shadow-xs hover:shadow-sm transition-shadow">
      <div className="flex justify-between items-center">
        <Badge variant="success" size="sm" withDot>
          {displayYear}
        </Badge>
        <Image
          src="/more.png"
          alt=""
          width={18}
          height={18}
          className="opacity-50"
        />
      </div>

      <div className="my-3">
        <h1 className="text-page-title font-bold text-gray-900 leading-none">
          {count}
        </h1>
        {type === "teacher" && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
              {tTeachers("lessonsToday", {
                count: teachersWithLessonsTodayCount,
              })}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-table-body font-medium text-muted">{title}</h2>
      </div>

      {type === "teacher" && (
        <BranchTeacherModal
          teachers={teachersList}
          branchName={branchName}
        />
      )}
    </Card>
  );
};

export default UserCard;
