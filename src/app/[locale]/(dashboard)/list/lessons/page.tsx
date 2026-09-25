import FormContainer from "@/components/FormContainer";
import TableSearch from "@/components/TableSearch";
import Timetable from "@/components/Timetable";
import TimetableFilters from "@/components/TimetableFilters";
import prisma from "@/lib/prisma";
import { Class, Teacher, Classroom, Prisma } from "@prisma/client";
import { Day } from "@/components/Timetable";
import { getAuthRole, getAuthSession, getActiveBranchId } from "@/lib/auth";
import BackButton from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/Card";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

type TimetableLesson = {
  id: number;
  name: string;
  day: Day;
  startTime: Date | string;
  endTime: Date | string;
  startsAt: Date | string;
  endsAt: Date | string;
  classId?: number;
  teacherId?: string;
  classroomId?: number | null;
  branchId: number;
  branchName?: string;
  isExtra: boolean;
  isCatchUp: boolean;
  isFree: boolean;
  isFormation: boolean;
  isWorkshop: boolean;
  workshopId?: number;
  workshopSessionId?: number;
  extraFee: number | null;
  subject: { id: number; name: string };
  class: Class | { id: number; name: string };
  teacher: Teacher | { id: string; name: string; surname: string };
  classroom: Classroom | { id: number; name: string } | null;
  forChildren?: string[];
};

const dayNames: Day[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

const LessonListPage = async (props: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) => {
  const searchParams = await props.searchParams;
  const role = await getAuthRole();
  const session = await getAuthSession();
  const activeBranchId = await getActiveBranchId();
  const canManage = session.isOwnerOrAdmin;
  const t = await getTranslations("lessons");

  const { search, teacherId, classId, branchId, weekOffset } = searchParams;

  // Calculate Saturday-to-Friday week boundaries based on weekOffset
  const offset = weekOffset ? parseInt(weekOffset, 10) : 0;
  const validOffset = isNaN(offset) ? 0 : offset;

  const now = new Date();
  const targetDate = new Date(now);
  if (validOffset !== 0) {
    targetDate.setDate(targetDate.getDate() + validOffset * 7);
  }

  // Algerian school week starts on Saturday (getDay() === 6) and ends on Friday (getDay() === 5)
  const dayOfWeek = targetDate.getDay(); // 0 is Sun, ..., 6 is Sat
  const diffToSaturday = (dayOfWeek + 1) % 7;

  const startOfWeek = new Date(targetDate);
  startOfWeek.setDate(targetDate.getDate() - diffToSaturday);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  let selectedBranchId: number | null = null;
  if (!session.isOwner) {
    selectedBranchId = activeBranchId || null;
  } else if (branchId && branchId !== "all") {
    const parsed = parseInt(branchId, 10);
    selectedBranchId = isNaN(parsed) ? null : parsed;
  }
  const selectedClassId = classId && classId !== "all" ? parseInt(classId, 10) : null;
  const selectedTeacherId = teacherId && teacherId !== "all" ? teacherId : null;

  let teachers: any[] = [];
  let classes: any[] = [];
  let classrooms: any[] = [];
  let branches: any[] = [];

  try {
    const rawTeachers = await prisma.teacher.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const rawClasses = await prisma.class.findMany({
      select: { id: true, name: true, teacherId: true, branchId: true },
      orderBy: { name: "asc" },
    });
    const rawClassrooms = await prisma.classroom.findMany({
      select: { id: true, name: true, branchId: true },
      orderBy: { name: "asc" },
    });
    const rawBranches = await prisma.branch.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });

    teachers = Array.isArray(rawTeachers) ? rawTeachers.map((item) => ({ id: item.id, name: item.name, surname: "" })) : [];
    classes = Array.isArray(rawClasses) ? rawClasses : [];
    classrooms = Array.isArray(rawClassrooms) ? rawClassrooms : [];
    branches = Array.isArray(rawBranches) ? rawBranches : [];
  } catch (e) {
    console.error("Error fetching related timetable data:", e);
  }

  let lessons: TimetableLesson[] = [];

  try {
    const whereConditions: Prisma.Sql[] = [
      // Only fetch normal recurring lessons, or one-off lessons occurring in the requested week
      Prisma.sql`((l."isExtra" = false AND l."isCatchUp" = false AND (c."isFormation" = false OR c."isFormation" IS NULL)) OR (l."startsAt" >= ${startOfWeek} AND l."startsAt" <= ${endOfWeek}))`,
    ];

    if (search) {
      whereConditions.push(
        Prisma.sql`(c.name ILIKE ${'%' + search + '%'} OR t.name ILIKE ${'%' + search + '%'} OR cr.name ILIKE ${'%' + search + '%'})`
      );
    }
    if (selectedTeacherId) {
      whereConditions.push(Prisma.sql`l."teacherId" = ${selectedTeacherId}`);
    }
    if (selectedClassId) {
      whereConditions.push(Prisma.sql`l."classId" = ${selectedClassId}`);
    }
    if (selectedBranchId) {
      whereConditions.push(Prisma.sql`l."branchId" = ${selectedBranchId}`);
    }

    const whereClause =
      whereConditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(whereConditions, " AND ")}`
        : Prisma.empty;

    const rawLessons = await prisma.$queryRaw<any[]>`
      SELECT l.id, l."startsAt", l."endsAt", l."classId", l."teacherId", l."classroomId", l."branchId",
             l."isExtra", l."isCatchUp", l."isFree", l."extraFee",
             c.name as "className", c."isFormation", t.name as "teacherName", cr.name as "classroomName", b.name as "branchName"
      FROM "Lesson" l
      LEFT JOIN "Class" c ON c.id = l."classId"
      LEFT JOIN "Teacher" t ON t.id = l."teacherId"
      LEFT JOIN "Classroom" cr ON cr.id = l."classroomId"
      LEFT JOIN "Branch" b ON b.id = l."branchId"
      ${whereClause}
      ORDER BY l."startsAt" ASC
    `;

    // DISPLAY RULE (§7.13):
    // Normal recurring lessons display every week.
    // Extra, catch-up, and formation lessons display ONLY for the week (Saturday-Friday) they actually occur in.
    const displayedRawLessons = rawLessons.filter((r) => {
      const isOneOff = Boolean(r.isExtra || r.isCatchUp || r.isFormation);
      if (!isOneOff) {
        return true;
      }
      const lessonDate = new Date(r.startsAt);
      return lessonDate >= startOfWeek && lessonDate <= endOfWeek;
    });

    lessons = displayedRawLessons.map((r) => {
      const d = new Date(r.startsAt);
      const day = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        timeZone: "Africa/Algiers",
      }).format(d).toUpperCase() as Day;
      return {
        id: r.id,
        name: r.className || t("group"),
        day,
        startTime: r.startsAt,
        endTime: r.endsAt,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        classId: r.classId,
        teacherId: r.teacherId,
        classroomId: r.classroomId,
        branchId: r.branchId,
        branchName: r.branchName || "",
        isExtra: Boolean(r.isExtra),
        isCatchUp: Boolean(r.isCatchUp),
        isFree: Boolean(r.isFree),
        isFormation: Boolean(r.isFormation),
        isWorkshop: false,
        extraFee: r.extraFee != null ? Number(r.extraFee) : null,
        subject: { id: r.classId || 1, name: r.className || t("subject") } as any,
        class: { id: r.classId, name: r.className || t("group") } as any,
        teacher: { id: r.teacherId, name: r.teacherName || t("teacher"), surname: "" } as any,
        classroom: r.classroomId
          ? ({ id: r.classroomId, name: r.classroomName || t("room") } as any)
          : null,
      };
    });

    // Centralize Dawarat / Workshop sessions (§7.13)
    if (!selectedClassId) {
      try {
        const wsWhereConditions: Prisma.Sql[] = [
          Prisma.sql`ws."startsAt" >= ${startOfWeek} AND ws."startsAt" <= ${endOfWeek}`,
        ];

        if (selectedBranchId) {
          wsWhereConditions.push(Prisma.sql`w."branchId" = ${selectedBranchId}`);
        }

        if (selectedTeacherId) {
          const selectedTeacherObj = teachers.find((th) => th.id === selectedTeacherId);
          if (selectedTeacherObj) {
            wsWhereConditions.push(
              Prisma.sql`w."guestTeacher" ILIKE ${'%' + selectedTeacherObj.name + '%'}`
            );
          } else {
            wsWhereConditions.push(Prisma.sql`1=0`);
          }
        }

        if (search) {
          wsWhereConditions.push(
            Prisma.sql`(w.title ILIKE ${'%' + search + '%'} OR w."guestTeacher" ILIKE ${'%' + search + '%'})`
          );
        }

        const wsWhereClause =
          wsWhereConditions.length > 0
            ? Prisma.sql`WHERE ${Prisma.join(wsWhereConditions, " AND ")}`
            : Prisma.empty;

        const rawWorkshopSessions = await prisma.$queryRaw<any[]>`
          SELECT ws.id, ws."workshopId", ws."startsAt", ws."endsAt",
                 w.title as "workshopTitle", w."guestTeacher", w."branchId",
                 b.name as "branchName"
          FROM "WorkshopSession" ws
          JOIN "Workshop" w ON w.id = ws."workshopId"
          LEFT JOIN "Branch" b ON b.id = w."branchId"
          ${wsWhereClause}
          ORDER BY ws."startsAt" ASC
        `;

        const safeWorkshopSessions = Array.isArray(rawWorkshopSessions) ? rawWorkshopSessions : [];
        const displayedWorkshopSessions = safeWorkshopSessions;

        const workshopLessons: TimetableLesson[] = displayedWorkshopSessions.map((ws) => {
          const d = new Date(ws.startsAt);
          const day = new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            timeZone: "Africa/Algiers",
          }).format(d).toUpperCase() as Day;
          return {
            id: -ws.id, // Negative integer ID to avoid collision with Lesson table IDs
            name: ws.workshopTitle || t("workshopBadge"),
            day,
            startTime: ws.startsAt,
            endTime: ws.endsAt,
            startsAt: ws.startsAt,
            endsAt: ws.endsAt,
            classId: undefined,
            teacherId: undefined,
            classroomId: null,
            branchId: ws.branchId,
            branchName: ws.branchName || "",
            isExtra: false,
            isCatchUp: false,
            isFree: false,
            isFormation: false,
            isWorkshop: true,
            workshopId: ws.workshopId,
            workshopSessionId: ws.id,
            extraFee: null,
            subject: { id: 0, name: ws.workshopTitle || t("workshopBadge") },
            class: { id: 0, name: ws.workshopTitle || t("workshopBadge") } as any,
            teacher: { id: "", name: ws.guestTeacher || t("unspecified"), surname: "" } as any,
            classroom: null,
          };
        });

        lessons = [...lessons, ...workshopLessons].sort(
          (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
        );
      } catch (wsErr) {
        console.error("Error fetching workshop sessions for timetable:", wsErr);
      }
    }
  } catch (err) {
    console.error("Error fetching lessons:", err);
    lessons = [];
  }

  const fallbackBranchId = activeBranchId || session.branchIds[0] || branches[0]?.id || 1;
  const effectiveBranchId = selectedBranchId || fallbackBranchId;

  const relatedDataForForms = {
    teachers,
    classes,
    classrooms,
    branches,
    isOwner: session.isOwner,
    userBranchId: effectiveBranchId,
    subjects: classes.map((c) => ({ id: c.id, name: c.name })),
  };

  const lessonActions = lessons.reduce((acc, lesson) => {
    if (canManage) {
      if (lesson.isWorkshop && lesson.workshopId) {
        acc[lesson.id] = (
          <div className="flex justify-end gap-2">
            <Link
              href={`/list/workshops/${lesson.workshopId}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-900 text-white hover:bg-black transition-colors"
            >
              {t("viewWorkshop")}
            </Link>
          </div>
        );
      } else if (lesson.isFormation && lesson.classId) {
        acc[lesson.id] = (
          <div className="flex justify-end gap-2">
            <Link
              href={`/list/formations/${lesson.classId}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-900 text-white hover:bg-black transition-colors"
            >
              {t("viewFormation")}
            </Link>
            <FormContainer table="lesson" type="delete" id={lesson.id} />
            <FormContainer
              table="lesson"
              type="update"
              data={lesson}
              relatedData={relatedDataForForms}
            />
          </div>
        );
      } else {
        acc[lesson.id] = (
          <div className="flex justify-end gap-3">
            <FormContainer table="lesson" type="delete" id={lesson.id} />
            <FormContainer
              table="lesson"
              type="update"
              data={lesson}
              relatedData={relatedDataForForms}
            />
          </div>
        );
      }
    }
    return acc;
  }, {} as { [key: number]: React.JSX.Element });

  return (
    <Card className="flex-1 w-full border-border/80 shadow-xs">
      <CardContent className="p-4 sm:p-5 md:p-6">
        <BackButton />
        {/* TOP */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 border-b border-border pb-4 mt-2">
          <h1 className="text-page-title text-gray-900">{t("title")}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <TableSearch placeholder={t("searchPlaceholder")} />
            <TimetableFilters
              teachers={teachers}
              branches={branches}
              defaultBranchId={session.isOwner ? (selectedBranchId ?? undefined) : (activeBranchId || undefined)}
              currentWeekRange={{
                start: startOfWeek,
                end: endOfWeek,
                offset: validOffset,
              }}
            />
            {canManage && (
              <FormContainer
                table="lesson"
                type="create"
                relatedData={relatedDataForForms}
              />
            )}
          </div>
        </div>

        {/* RENDER THE TIMETABLE */}
        <div className="mt-4">
          <Timetable
            lessons={lessons as any}
            actions={lessonActions}
            relatedDataForForms={relatedDataForForms}
            userRole={canManage ? "admin" : (role || "guest")}
            isCurrentWeek={validOffset === 0}
            currentWeekRange={{
              start: startOfWeek,
              end: endOfWeek,
              offset: validOffset,
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default LessonListPage;

