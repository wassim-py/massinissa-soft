import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getAuthRole, getAuthSession, getActiveBranchId } from "@/lib/auth";
import { serializeForClient } from "@/lib/utils";
import AttendanceRoster from "@/components/forms/AttendanceRoster";
import BackButton from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getTranslations, getLocale } from "next-intl/server";
import { getActiveTrimester } from "@/lib/configurationActions";

// This is the Server Component that fetches all the necessary data for taking attendance.
const TakeAttendancePage = async (
  props: { 
      params: Promise<{ id: string }>,
      searchParams: Promise<{ [key: string]: string | undefined }>
  }
) => {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const role = await getAuthRole();
  const session = await getAuthSession();
  const activeBranchId = await getActiveBranchId();
  const t = await getTranslations("attendance");
  const locale = await getLocale();

  const lessonId = parseInt(params.id, 10);
  if (isNaN(lessonId)) {
    notFound();
  }

  const searchQuery = searchParams.search;

  const rawLesson = await prisma.$queryRaw<any[]>`
    SELECT l.*, c.name as "className", c."pricePerCycle" as "classPrice", c."teacherId" as "classTeacherId", c."levelId" as "classLevelId", t.name as "teacherName"
    FROM "Lesson" l
    LEFT JOIN "Class" c ON c.id = l."classId"
    LEFT JOIN "Teacher" t ON t.id = l."teacherId"
    WHERE l.id = ${lessonId}
    LIMIT 1
  `;

  if (!rawLesson || rawLesson.length === 0) {
    notFound();
  }

  const l = rawLesson[0];

  // Enforce branch-scoped attendance taking: an admin cannot take attendance for another branch's lesson
  const hasBranchAccess =
    session.isOwner ||
    l.branchId === activeBranchId ||
    (session.branchIds && session.branchIds.includes(l.branchId));

  if (!hasBranchAccess) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-8 border-border shadow-xs">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {locale === "ar" ? "وصول غير مصرح" : "Accès non autorisé"}
          </Badge>
          <p className="text-table-body text-gray-800 font-medium">
            {locale === "ar"
              ? "لا يمكنك تسجيل الحضور لحصة مبرمجة في فرع آخر."
              : "Vous ne pouvez pas enregistrer les présences pour une séance dispensée dans un autre siège."}
          </p>
          <div className="mt-2">
            <BackButton />
          </div>
        </div>
      </Card>
    );
  }

  const lesson = {
    id: l.id,
    name: l.className || (locale === "ar" ? "درس" : "Séance"),
    class: { id: l.classId, name: l.className || (locale === "ar" ? "قسم" : "Groupe"), price: Number(l.classPrice || 0) },
    subject: { id: l.classId, name: l.className || (locale === "ar" ? "مادة" : "Matière") },
    teacher: { id: l.teacherId, name: l.teacherName || (locale === "ar" ? "أستاذ" : "Enseignant"), surname: "" },
    startTime: l.startsAt,
    endTime: l.endsAt,
    isExtra: Boolean(l.isExtra),
    isCatchUp: Boolean(l.isCatchUp),
    isFree: Boolean(l.isFree),
    extraFee: l.extraFee != null ? Number(l.extraFee) : null,
  };

  // Resolve active trimester (§7.20)
  const activeTrimester = await getActiveTrimester();

  // Resolve books for this group's teacher + level in the active trimester (§7.20)
  const teacherId = l.classTeacherId || l.teacherId;
  const levelId = l.classLevelId != null ? Number(l.classLevelId) : null;

  let groupBooks: Array<{ id: number; title: string }> = [];
  if (teacherId && levelId && activeTrimester) {
    groupBooks = await prisma.book.findMany({
      where: {
        teacherId,
        levelId,
        trimesterId: activeTrimester.id,
      },
      select: {
        id: true,
        title: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  // Fetch student book eligibility: paid BOOK voucher for THIS group in THIS active trimester (§7.20)
  let bookPaidStudentIds = new Set<string>();
  if (activeTrimester) {
    const bookVouchers = await prisma.voucher.findMany({
      where: {
        trimesterId: activeTrimester.id,
        paymentType: "BOOK",
        isVoided: false,
        OR: [
          { classId: l.classId },
          ...(teacherId && levelId
            ? [
                {
                  class: {
                    teacherId,
                    levelId,
                  },
                },
              ]
            : []),
        ],
      },
      select: {
        studentId: true,
      },
    });
    bookPaidStudentIds = new Set(bookVouchers.map((v) => v.studentId));
  }

  // Fetch CatchUpAttendance visitors for this lesson (§2.12)
  const catchUpVisitors = await prisma.catchUpAttendance.findMany({
    where: { catchUpLessonId: lessonId },
    include: {
      student: true,
      missedLesson: {
        include: {
          class: true,
          teacher: true,
        },
      },
    },
    orderBy: { recordedAt: "asc" },
  });

  const formattedCatchUpVisitors = catchUpVisitors.map((v) => ({
    id: v.id,
    studentId: v.studentId,
    studentName: v.student.name,
    globalNumber: v.student.globalNumber,
    missedLessonId: v.missedLessonId,
    missedClassName: v.missedLesson.class.name,
    missedTeacherName: v.missedLesson.teacher.name,
    missedStartsAt: v.missedLesson.startsAt,
    recordedAt: v.recordedAt,
  }));

  let rawStudents: any[] = [];
  try {
    rawStudents = await prisma.$queryRaw<any[]>`
      SELECT DISTINCT s.id, s.name, s."globalNumber", s.phone
      FROM "Student" s
      JOIN "Enrollment" e ON e."studentId" = s.id
      WHERE e."classId" = ${l.classId}
      ORDER BY s."globalNumber" ASC, s.name ASC
    `;
    // Deduplicate defensively
    const sMap = new Map<string, any>();
    for (const s of rawStudents) {
      if (!sMap.has(s.id)) sMap.set(s.id, s);
    }
    rawStudents = Array.from(sMap.values());
  } catch (err) {
    console.error("Error fetching students:", err);
    rawStudents = [];
  }

  let existingAttendance: any[] = [];
  try {
    existingAttendance = await prisma.$queryRaw<any[]>`
      SELECT id, "lessonId", "studentId", status, justification
      FROM "Attendance"
      WHERE "lessonId" = ${lessonId}
    `;
  } catch (err) {
    console.error("Error fetching existing attendance:", err);
    existingAttendance = [];
  }

  // Fetch full student credit info (vouchers and past non-free attendances in this class)
  const studentIds = rawStudents.map((s) => s.id);
  let studentsWithDetails: any[] = [];
  try {
    if (studentIds.length > 0) {
      studentsWithDetails = await prisma.student.findMany({
        where: { id: { in: studentIds } },
        include: {
          family: true,
          vouchers: {
            where: { classId: l.classId, isVoided: false },
            orderBy: { issuedAt: "desc" },
          },
          attendances: {
            where: {
              status: "PRESENT",
              lesson: {
                classId: l.classId,
                isFree: false,
              },
            },
          },
        },
      });
    }
  } catch (err) {
    console.error("Error fetching students credit details:", err);
  }

  const detailsMap = new Map(studentsWithDetails.map((s) => [s.id, s]));

  // Fetch existing BookReceipt records for the lesson's students and books (§7.20 / Phase 36 single source of truth)
  let bookReceipts: Array<{ studentId: string; bookId: number }> = [];
  try {
    if (groupBooks.length > 0 && studentIds.length > 0 && (prisma as any).bookReceipt?.findMany) {
      bookReceipts = await prisma.bookReceipt.findMany({
        where: {
          studentId: { in: studentIds },
          bookId: { in: groupBooks.map((b) => b.id) },
        },
      });
    }
  } catch (err) {
    console.warn("Could not query bookReceipts:", err);
    bookReceipts = [];
  }

  const studentReceivedMap = new Map<string, Set<number>>();
  for (const r of bookReceipts) {
    if (!studentReceivedMap.has(r.studentId)) {
      studentReceivedMap.set(r.studentId, new Set());
    }
    studentReceivedMap.get(r.studentId)!.add(r.bookId);
  }

  const studentsWithHistory = rawStudents.map((s) => {
    const details = detailsMap.get(s.id);
    const hasPaidBook = bookPaidStudentIds.has(s.id);
    const receivedSet = studentReceivedMap.get(s.id) || new Set<number>();
    const receivedBookIds = Array.from(receivedSet);
    const outstandingBooks = groupBooks.filter((b) => !receivedSet.has(b.id));

    const bookDetails = groupBooks.map((b) => ({
      id: b.id,
      title: b.title,
      received: receivedSet.has(b.id),
    }));

    return {
      id: s.id,
      globalNumber: s.globalNumber ?? details?.globalNumber,
      name: s.name,
      phone: s.phone ?? details?.phone ?? null,
      surname: "",
      vouchers: details?.vouchers || [],
      attendances: details?.attendances || [],
      family: details?.family || null,
      isBookEligible: hasPaidBook,
      hasPaidBook,
      receivedBookIds,
      outstandingBooks,
      bookDetails,
    };
  });

  const todaysAttendance = existingAttendance.map((a) => ({
    ...a,
    status: a.status,
    justification: a.justification || null,
    present: a.status === "PRESENT",
    date: new Date(),
  }));

  return (
    <Card className="flex-1 w-full border-border/80 shadow-xs">
      <CardContent className="p-4 sm:p-5 md:p-6">
        <BackButton />
        <AttendanceRoster
          lesson={serializeForClient(lesson) as any}
          students={serializeForClient(studentsWithHistory) as any}
          existingRecords={serializeForClient(todaysAttendance) as any}
          groupBooks={serializeForClient(groupBooks) as any}
          catchUpVisitors={serializeForClient(formattedCatchUpVisitors) as any}
          initialSearch={searchQuery}
        />
      </CardContent>
    </Card>
  );
};

export default TakeAttendancePage;
