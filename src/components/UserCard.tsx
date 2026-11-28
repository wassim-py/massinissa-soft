import prisma from "@/lib/prisma";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getActiveBranchId } from "@/lib/auth";
import { getCachedActiveAcademicYear, getCachedBranches } from "@/lib/cachedReferenceData";
import { getAlgiersDateInfo, resolveRecurringLessonsForDate } from "@/lib/utils";
import { ACTIVE_CLASS_WHERE } from "@/lib/classStatus";
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
    const [allBranches, activeYearRecord] = await Promise.all([
      getCachedBranches(),
      getCachedActiveAcademicYear(),
    ]);
    const branchNameById = new Map(allBranches.map((b) => [b.id, b.name]));
    branchName = branchNameById.get(activeBranchId) || `Siège #${activeBranchId}`;
    academicYearLabel = activeYearRecord?.label || "";

    const now = new Date();
    const todayInfo = getAlgiersDateInfo(now);
    const startOfToday = new Date(
      Date.UTC(todayInfo.year, todayInfo.month - 1, todayInfo.day, -1, 0, 0, 0)
    );
    const endOfToday = new Date(
      Date.UTC(todayInfo.year, todayInfo.month - 1, todayInfo.day, 22, 59, 59, 999)
    );

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
        count = allBranches.length;
        break;
      }
      case "teacher": {
        // Lean parallel queries instead of loading every historical lesson row for every teacher
        const [allTeachers, teacherLessonBranchPairs, candidateTodayLessons] = await Promise.all([
          prisma.teacher.findMany({
            select: {
              id: true,
              name: true,
              TeacherBranch: { select: { branchId: true } },
              classes: { select: { branchId: true } },
            },
            orderBy: { name: "asc" },
          }),
          prisma.lesson.groupBy({
            by: ["teacherId", "branchId"],
          }),
          prisma.lesson.findMany({
            where: {
              class: ACTIVE_CLASS_WHERE,
              OR: [
                { startsAt: { gte: startOfToday, lte: endOfToday } },
                {
                  isExtra: false,
                  isCatchUp: false,
                  isFree: false,
                  isSingleOccurrence: false,
                },
                {
                  isSingleOccurrence: true,
                  overridesDate: todayInfo.dateStr,
                },
              ],
            },
            select: {
              id: true,
              teacherId: true,
              classId: true,
              branchId: true,
              startsAt: true,
              endsAt: true,
              isExtra: true,
              isCatchUp: true,
              isFree: true,
              isSingleOccurrence: true,
              recurrenceStartAt: true,
              recurrenceEndAt: true,
              overridesDate: true,
              overridesSlotKey: true,
            },
          }),
        ]);

        const lessonBranchesByTeacher = new Map<string, Set<number>>();
        for (const pair of teacherLessonBranchPairs) {
          if (!pair.teacherId) continue;
          let s = lessonBranchesByTeacher.get(pair.teacherId);
          if (!s) {
            s = new Set<number>();
            lessonBranchesByTeacher.set(pair.teacherId, s);
          }
          s.add(pair.branchId);
        }

        const candidateLessonsByTeacher = new Map<string, typeof candidateTodayLessons>();
        for (const l of candidateTodayLessons) {
          if (!l.teacherId) continue;
          const arr = candidateLessonsByTeacher.get(l.teacherId);
          if (arr) arr.push(l);
          else candidateLessonsByTeacher.set(l.teacherId, [l]);
        }

        count = allTeachers.length;

        teachersList = allTeachers.map((t) => {
          const branchesSet = new Set<string>();

          t.TeacherBranch.forEach((tb) => {
            const name = branchNameById.get(tb.branchId);
            if (name) branchesSet.add(name);
          });

          t.classes.forEach((c) => {
            const name = branchNameById.get(c.branchId);
            if (name) branchesSet.add(name);
          });

          const tLessonBranches = lessonBranchesByTeacher.get(t.id);
          if (tLessonBranches) {
            tLessonBranches.forEach((bId) => {
              const name = branchNameById.get(bId);
              if (name) branchesSet.add(name);
            });
          }

          const teacherCandidates = candidateLessonsByTeacher.get(t.id) || [];
          const todayLessons = resolveRecurringLessonsForDate(teacherCandidates, now);

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
