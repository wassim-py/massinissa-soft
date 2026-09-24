import BackButton from "@/components/BackButton";
import FormContainer from "@/components/FormContainer";
import Timetable from "@/components/Timetable";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import Image from "next/image";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, Column } from "@/components/ui/DataTable";
import TeacherPhotocopyRateWidget from "@/components/teachers/TeacherPhotocopyRateWidget";
import TeacherPayrollPercentageWidget from "@/components/teachers/TeacherPayrollPercentageWidget";
import TeacherPayrollSection from "@/components/teachers/TeacherPayrollSection";
import TeacherLessonRecordsSection from "@/components/teachers/TeacherLessonRecordsSection";
import TeacherPhotocopySection from "@/components/teachers/TeacherPhotocopySection";
import TeacherBooksSection from "@/components/teachers/TeacherBooksSection";
import { calculateTeacherPayroll } from "@/lib/payroll";
import { serializeForClient } from "@/lib/utils";
import { getTranslations, getLocale } from "next-intl/server";
import {
  GraduationCap,
  Calendar,
  Users,
  BookOpen,
  ArrowLeft,
  ShieldCheck,
  Building2,
  MapPin,
  Clock,
} from "lucide-react";

function formatDate(date: Date | string, locale: string) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const formatDZD = (num: number, locale: string) =>
  `${Number(num || 0).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD`;

const SingleTeacherPage = async (
  props: {
    params: Promise<{ id: string }>;
  }
) => {
  const params = await props.params;
  const { id } = params;
  const session = await getAuthSession();
  const locale = await getLocale();
  const tProfile = await getTranslations("teacherProfile");

  // Phase 3 & Architecture: Teacher profile page is OWNER-ONLY (not visible to branch admins)
  if (!session.can("view_profile", "teachers")) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-12 border-border/80 shadow-xs">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {tProfile("unauthorized")}
          </Badge>
          <h2 className="text-section-title font-bold text-gray-900">
            {tProfile("ownerOnlyTitle")}
          </h2>
          <p className="text-table-body text-muted text-sm">
            {tProfile("ownerOnlyDesc")}
          </p>
        </div>
      </Card>
    );
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // "This month" date boundary
  const thisMonthStart = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0));
  const thisMonthEnd = new Date(Date.UTC(currentYear, currentMonth + 1, 0, 23, 59, 59, 999));

  // "Last month" date boundary
  const lastMonthStart = new Date(Date.UTC(currentYear, currentMonth - 1, 1, 0, 0, 0, 0));
  const lastMonthEnd = new Date(Date.UTC(currentYear, currentMonth, 0, 23, 59, 59, 999));

  const monthFormatter = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { month: "long", year: "numeric" });
  const thisMonthLabel = monthFormatter.format(thisMonthStart);
  const lastMonthLabel = monthFormatter.format(lastMonthStart);

  const [
    t,
    upcomingLessons,
    thisMonthLessons,
    lastMonthLessons,
    allClasses,
    bookDrops,
    photocopyCharges,
    allBranches,
    allLevels,
    rawClassrooms,
    allLessonsForTimetable,
    currentPayroll,
  ] = await Promise.all([
    prisma.teacher.findUnique({
      where: { id },
      include: {
        TeacherPayRate: { orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }] },
        TeacherBranch: { include: { Branch: true } },
        classes: {
          include: {
            branch: true,
            level: true,
            enrollments: { select: { id: true } },
          },
        },
      },
    }),
    // 2. Upcoming lessons in the schedule (startsAt >= now)
    prisma.lesson.findMany({
      where: { teacherId: id, startsAt: { gte: now } },
      include: { class: true, classroom: true, branch: true },
      orderBy: { startsAt: "asc" },
      take: 15,
    }),
    // 3. This month's lesson records
    prisma.lesson.findMany({
      where: { teacherId: id, startsAt: { gte: thisMonthStart, lte: thisMonthEnd } },
      include: { class: true, classroom: true, branch: true, attendances: true },
      orderBy: { startsAt: "desc" },
    }),
    // 3. Last month's lesson records
    prisma.lesson.findMany({
      where: { teacherId: id, startsAt: { gte: lastMonthStart, lte: lastMonthEnd } },
      include: { class: true, classroom: true, branch: true, attendances: true },
      orderBy: { startsAt: "desc" },
    }),
    // Groups taught
    prisma.class.findMany({
      where: { teacherId: id },
      include: { branch: true, level: true, enrollments: { select: { id: true } } },
      orderBy: { name: "asc" },
    }),
    // 5. Books brought to school (§2.11)
    prisma.bookDrop.findMany({
      where: { book: { teacherId: id } },
      include: {
        book: { include: { level: true } },
        branch: true,
      },
      orderBy: { dropDate: "desc" },
    }),
    // 4. Photocopy charges (§2.5)
    prisma.photocopyCharge.findMany({
      where: { teacherId: id },
      include: { Branch: true, class: true },
      orderBy: { date: "desc" },
    }),
    prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.level.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
    prisma.classroom.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.lesson.findMany({
      where: { teacherId: id },
      include: { class: true, classroom: true, teacher: true },
      orderBy: { startsAt: "asc" },
    }),
    // 6. Current payroll per §2.9
    calculateTeacherPayroll(id, thisMonthStart, thisMonthEnd),
  ]);

  if (!t) {
    return notFound();
  }

  // Deduplicate and assemble groups taught
  const groupMap = new Map<
    number,
    {
      id: number;
      name: string;
      branchName: string;
      levelName: string;
      studentsCount: number;
      pricePerCycle: number;
    }
  >();

  allClasses.forEach((c) => {
    groupMap.set(c.id, {
      id: c.id,
      name: c.name,
      branchName: c.branch?.name || "",
      levelName: c.level?.name || (locale === "ar" ? "عام" : "Général"),
      studentsCount: c.enrollments.length,
      pricePerCycle: c.pricePerCycle ? Number(c.pricePerCycle) : 0,
    });
  });

  allLessonsForTimetable.forEach((l) => {
    if (l.class && !groupMap.has(l.class.id)) {
      groupMap.set(l.class.id, {
        id: l.class.id,
        name: l.class.name,
        branchName: "",
        levelName: locale === "ar" ? "عام" : "Général",
        studentsCount: 0,
        pricePerCycle: l.class.pricePerCycle ? Number(l.class.pricePerCycle) : 0,
      });
    }
  });

  const assignedGroups = Array.from(groupMap.values());

  // Derive subjects taught
  const subjectSet = new Set<string>();
  assignedGroups.forEach((g) => {
    const subj = g.name.split(" - ")[0]?.trim();
    if (subj) subjectSet.add(subj);
  });
  const assignedSubjects = Array.from(subjectSet);

  const groupColumns: Column[] = [
    { header: tProfile("colGroup"), accessor: "name" },
    { header: tProfile("colLevel"), accessor: "levelName" },
    { header: tProfile("colBranch"), accessor: "branchName" },
    { header: tProfile("colStudentsCount"), accessor: "studentsCount", align: "center" },
    { header: tProfile("colSessionPrice"), accessor: "sessionPrice", align: "end" },
    { header: tProfile("colTeacherCut"), accessor: "teacherCut", align: "end" },
  ];

  const upcomingLessonColumns: Column[] = [
    { header: tProfile("colDateTime"), accessor: "startsAt" },
    { header: tProfile("colGroup"), accessor: "className" },
    { header: tProfile("colBranch"), accessor: "branchName" },
    { header: tProfile("colRoom"), accessor: "classroomName" },
    { header: tProfile("colType"), accessor: "type", align: "center" },
  ];

  // Active pay rates
  const activePayRate = t.TeacherPayRate.find(
    (r) => new Date(r.effectiveFrom) <= thisMonthEnd
  ) || t.TeacherPayRate[0];

  const initialPercentage = activePayRate?.percentageOfSessionFee
    ? Number(activePayRate.percentageOfSessionFee)
    : 40; // Default 40% per architecture spec if not explicitly set
  const photocopyRate = t.photocopyRatePerPage ? Number(t.photocopyRatePerPage) : 5;

  // Timetable data preparation
  const lessonsForTimetable = allLessonsForTimetable.map((r) => ({
    ...r,
    subject: { name: r.class?.name || (locale === "ar" ? "مادة" : "Matière") },
  }));

  const relatedDataForForms = {
    teachers: [{ id: t.id, name: t.name, surname: "" }],
    classes: allClasses.map((c) => ({ id: c.id, name: c.name })),
    subjects: allClasses.map((c) => ({ id: c.id, name: c.name })),
    classrooms: rawClassrooms,
  };

  const lessonActions = lessonsForTimetable.reduce((acc, lesson) => {
    acc[lesson.id] = (
      <div className="flex justify-end gap-2">
        <FormContainer table="lesson" type="delete" id={lesson.id} />
        <FormContainer
          table="lesson"
          type="update"
          data={serializeForClient(lesson)}
          relatedData={serializeForClient(relatedDataForForms)}
        />
      </div>
    );
    return acc;
  }, {} as { [key: number]: React.JSX.Element });

  return (
    <div className="flex-1 p-4 md:p-6 flex flex-col gap-6">
      {/* HEADER NAV */}
      <div className="flex items-center justify-between">
        <BackButton />
        <div className="flex items-center gap-2.5">
          <Badge variant="primary" size="md">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            <span>{tProfile("ownerBadge")}</span>
          </Badge>
          <Link href="/list/finance?section=payroll&tab=payslips">
            <Button
              variant="soft"
              size="sm"
              className="text-xs"
              rightIcon={<ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />}
            >
              {tProfile("payrollLogButton")}
            </Button>
          </Link>
        </div>
      </div>

      {/* SECTION 1: CORE INFO, SUBJECTS TAUGHT, GROUPS TAUGHT */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Profile Card & Rates */}
        <Card className="flex-1 border-border/80 shadow-xs flex flex-col justify-between">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center gap-5 pb-5 border-b border-border/70">
              <div className="shrink-0">
                <Image
                  src="/noAvatar.png"
                  alt={t.name}
                  width={88}
                  height={88}
                  className="rounded-full object-cover border-4 border-surface shadow-md"
                />
              </div>
              <div className="text-center sm:text-start grow">
                <div className="flex items-center justify-center sm:justify-start gap-3 mb-1">
                  <h1 className="text-page-title font-bold text-gray-900">
                    {t.name}
                  </h1>
                  {session.can("update", "teachers") && (
                    <FormContainer
                      table="teacher"
                      type="update"
                      data={{
                        id: t.id,
                        name: t.name,
                        phone: (t as any).phone,
                        gender: (t as any).gender,
                      }}
                    />
                  )}
                </div>
                <div className="flex items-center justify-center sm:justify-start gap-2 text-xs text-muted mb-2">
                  <span className="font-mono">#{t.id}</span>
                  <span>•</span>
                  <span>{tProfile("certifiedTeacher")}</span>
                </div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <Badge variant="secondary" size="sm">
                    <Users className="w-3 h-3 text-secondary" />
                    <span>{tProfile("groupsTaughtCount", { count: assignedGroups.length })}</span>
                  </Badge>
                  <Badge variant="neutral" size="sm">
                    <GraduationCap className="w-3 h-3 text-muted" />
                    <span>{tProfile("subjectsCount", { count: assignedSubjects.length })}</span>
                  </Badge>
                </div>
              </div>
            </div>

            {/* Editable Rate Widgets for Owner (Req 7 & §2.5) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-5">
              {/* 7. Editable field for OWNER to set TeacherPayRate.percentageOfSessionFee */}
              <TeacherPayrollPercentageWidget
                teacherId={t.id}
                initialPercentage={initialPercentage}
              />

              {/* Editable photocopy rate per page */}
              <TeacherPhotocopyRateWidget
                teacherId={t.id}
                initialRate={photocopyRate}
              />
            </div>
          </CardContent>
        </Card>

        {/* Subjects & Groups Summary Card */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Subjects Taught */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-primary" />
                <span>{tProfile("subjectsTaughtTitle")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex flex-wrap gap-2">
                {assignedSubjects.length > 0 ? (
                  assignedSubjects.map((subj, idx) => (
                    <Badge key={idx} variant="primary" size="md">
                      {subj}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted">{tProfile("noSubjectsTaught")}</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Groups Taught Overview */}
          <Card className="flex-1 border-border/80 shadow-xs">
            <CardHeader className="p-4 pb-3 border-b border-border/60">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <span>{tProfile("groupsTaughtTitle", { count: assignedGroups.length })}</span>
                </CardTitle>
                <span className="text-xs text-muted">
                  {tProfile("teacherRateOfSession", { rate: initialPercentage })}
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-4 pt-3">
              <DataTable
                columns={groupColumns}
                data={assignedGroups}
                renderRow={(g) => {
                  const sessionPrice = g.pricePerCycle > 0 ? g.pricePerCycle / 4 : 0;
                  const teacherCut = (sessionPrice * initialPercentage) / 100;
                  return (
                    <tr
                      key={g.id}
                      className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
                    >
                      <td className="p-3.5 font-semibold text-gray-900">
                        {g.name}
                      </td>
                      <td className="p-3.5">
                        <Badge variant="neutral" size="sm">{g.levelName}</Badge>
                      </td>
                      <td className="p-3.5 text-gray-600">
                        {g.branchName || "-"}
                      </td>
                      <td className="p-3.5 text-center font-bold text-primary">
                        {g.studentsCount} {tProfile("studentUnit")}
                      </td>
                      <td className="p-3.5 text-end text-gray-700">
                        {formatDZD(sessionPrice, locale)}
                      </td>
                      <td className="p-3.5 text-end font-bold text-success-text">
                        {formatDZD(Math.round(teacherCut), locale)}
                      </td>
                    </tr>
                  );
                }}
                emptyTitle={tProfile("emptyGroupsTitle")}
                emptyDescription={tProfile("emptyGroupsDesc")}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* SECTION 6: CURRENT PAYROLL (§2.9 & Req 6) */}
      <TeacherPayrollSection
        payroll={serializeForClient(currentPayroll)}
        periodLabel={thisMonthLabel}
      />

      {/* SECTION 2: UPCOMING LESSONS IN SCHEDULE */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                <span>{tProfile("upcomingLessons")}</span>
              </CardTitle>
              <CardDescription className="mt-1">
                {tProfile("upcomingLessonsDesc")}
              </CardDescription>
            </div>
            <Badge variant="primary" size="md">
              {tProfile("upcomingLessonsCount", { count: upcomingLessons.length })}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-2">
          <DataTable
            columns={upcomingLessonColumns}
            data={upcomingLessons}
            renderRow={(lesson) => (
              <tr
                key={lesson.id}
                className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
              >
                <td className="p-3.5 font-medium text-gray-800">
                  {formatDate(lesson.startsAt, locale)}
                </td>
                <td className="p-3.5 font-semibold text-gray-900">
                  {lesson.class.name}
                </td>
                <td className="p-3.5">
                  <Badge variant="secondary" size="sm">
                    <Building2 className="w-3 h-3 inline me-1" />
                    {lesson.branch.name}
                  </Badge>
                </td>
                <td className="p-3.5 text-gray-700">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-muted shrink-0" />
                    {lesson.classroom.name}
                  </span>
                </td>
                <td className="p-3.5 text-center">
                  {lesson.isFree ? (
                    <Badge variant="success" size="sm">{tProfile("lessonTypeFree")}</Badge>
                  ) : lesson.isExtra ? (
                    <Badge variant="warning" size="sm">
                      {tProfile("lessonTypeExtra")}
                    </Badge>
                  ) : lesson.isCatchUp ? (
                    <Badge variant="secondary" size="sm">{tProfile("lessonTypeCatchUp")}</Badge>
                  ) : (
                    <Badge variant="neutral" size="sm">{tProfile("lessonTypeNormal")}</Badge>
                  )}
                </td>
              </tr>
            )}
            emptyTitle={tProfile("emptyUpcomingTitle")}
            emptyDescription={tProfile("emptyUpcomingDesc")}
          />
        </CardContent>
      </Card>

      {/* SECTION 3: THIS/LAST MONTH'S LESSON RECORDS BROKEN DOWN BY TYPE */}
      <TeacherLessonRecordsSection
        thisMonth={{
          label: thisMonthLabel,
          lessons: thisMonthLessons.map((l) => ({
            id: l.id,
            startsAt: l.startsAt,
            endsAt: l.endsAt,
            className: l.class?.name || (locale === "ar" ? "فوج" : "Groupe"),
            branchName: l.branch.name,
            classroomName: l.classroom?.name || (locale === "ar" ? "قاعة" : "Salle"),
            isExtra: l.isExtra,
            extraFee: l.extraFee ? Number(l.extraFee) : null,
            isCatchUp: l.isCatchUp,
            isFree: l.isFree,
            presentCount: l.attendances.filter((a) => a.status === "PRESENT").length,
            absentCount: l.attendances.filter((a) => a.status === "ABSENT").length,
            totalAttendances: l.attendances.length,
          })),
        }}
        lastMonth={{
          label: lastMonthLabel,
          lessons: lastMonthLessons.map((l) => ({
            id: l.id,
            startsAt: l.startsAt,
            endsAt: l.endsAt,
            className: l.class?.name || (locale === "ar" ? "فوج" : "Groupe"),
            branchName: l.branch.name,
            classroomName: l.classroom?.name || (locale === "ar" ? "قاعة" : "Salle"),
            isExtra: l.isExtra,
            extraFee: l.extraFee ? Number(l.extraFee) : null,
            isCatchUp: l.isCatchUp,
            isFree: l.isFree,
            presentCount: l.attendances.filter((a) => a.status === "PRESENT").length,
            absentCount: l.attendances.filter((a) => a.status === "ABSENT").length,
            totalAttendances: l.attendances.length,
          })),
        }}
      />

      {/* SECTION 4: PHOTOCOPY FEES AND PAGE COUNTS (FILTERABLE BY BRANCH AND GROUP) */}
      <TeacherPhotocopySection
        teacherId={t.id}
        teacherName={t.name}
        ratePerPage={photocopyRate}
        branches={allBranches}
        groups={assignedGroups.map((g) => ({ id: g.id, name: g.name }))}
        initialCharges={photocopyCharges.map((c) => ({
          id: c.id,
          branchId: c.branchId,
          branchName: c.Branch.name,
          classId: c.classId,
          className: c.class?.name || null,
          pages: c.pages,
          costAmount: Number(c.costAmount),
          date: c.date,
          recordedBy: c.recordedBy,
        }))}
      />

      {/* SECTION 5: BOOKS BROUGHT TO SCHOOL (FILTERABLE BY DATE, BRANCH, AND LEVEL) */}
      <TeacherBooksSection
        teacherId={t.id}
        teacherName={t.name}
        branches={allBranches}
        levels={allLevels}
        initialDrops={bookDrops.map((d) => ({
          id: d.id,
          bookId: d.bookId,
          bookTitle: d.book.title,
          levelId: d.book.levelId,
          levelName: d.book.level?.name || (locale === "ar" ? "عام" : "Général"),
          branchId: d.branchId,
          branchName: d.branch.name,
          quantity: d.quantity,
          dropDate: d.dropDate,
          recordedBy: d.recordedBy,
        }))}
      />

      {/* WEEKLY TIMETABLE VIEW */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <span>{tProfile("weeklyTimetableTitle")}</span>
          </CardTitle>
          <CardDescription className="mt-1">
            {tProfile("weeklyTimetableDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <Timetable
            lessons={serializeForClient(lessonsForTimetable) as any}
            actions={lessonActions}
            relatedDataForForms={serializeForClient(relatedDataForForms)}
            userRole={session.role}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default SingleTeacherPage;
