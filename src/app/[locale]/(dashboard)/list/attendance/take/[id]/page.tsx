import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getAuthRole, getAuthSession, getActiveBranchId } from "@/lib/auth";
import { serializeForClient } from "@/lib/utils";
import AttendanceRoster from "@/components/forms/AttendanceRoster";
import BackButton from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getTranslations, getLocale } from "next-intl/server";
import { getActiveTrimester, getFixedInscriptionFeeAction } from "@/lib/configurationActions";
import { computeStudentConsumedSessions, computeStudentCreditAndSessions } from "@/lib/studentBilling";
import { resolveOrCreateLessonForDate } from "@/lib/lessonInstances";

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
  const fixedInscriptionFee = await getFixedInscriptionFeeAction();
  const t = await getTranslations("attendance");
  const locale = await getLocale();

  const rawLessonId = parseInt(params.id, 10);
  if (isNaN(rawLessonId)) {
    notFound();
  }

  const lessonId = await resolveOrCreateLessonForDate(rawLessonId, searchParams.date);

  const searchQuery = searchParams.search;

  const rawLesson = await prisma.$queryRaw<any[]>`
    SELECT l.*,
           c.name as "className",
           c."pricePerCycle" as "classPrice",
           c."pricePerCycle",
           c."inscriptionFee",
           c."bookFee",
           c."hasBooks",
           c."isFormation",
           c."formationLevelId",
           c."teacherId" as "classTeacherId",
           c."levelId" as "classLevelId",
           t.name as "teacherName"
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
    class: {
      id: l.classId,
      name: l.className || (locale === "ar" ? "قسم" : "Groupe"),
      price: Number(l.classPrice || 0),
      pricePerCycle: Number(l.pricePerCycle || l.classPrice || 0),
      inscriptionFee:
        fixedInscriptionFee > 0
          ? fixedInscriptionFee
          : l.inscriptionFee != null
          ? Number(l.inscriptionFee)
          : 1000,
      bookFee: l.bookFee != null ? Number(l.bookFee) : 0,
      hasBooks: Boolean(l.hasBooks),
      isFormation: Boolean(l.isFormation),
      formationLevelId: l.formationLevelId != null ? Number(l.formationLevelId) : null,
      levelId: l.classLevelId != null ? Number(l.classLevelId) : null,
      branchId: l.branchId != null ? Number(l.branchId) : null,
    },
    subject: { id: l.classId, name: l.className || (locale === "ar" ? "مادة" : "Matière") },
    teacher: { id: l.teacherId, name: l.teacherName || (locale === "ar" ? "أستاذ" : "Enseignant"), surname: "" },
    startTime: l.startsAt,
    endTime: l.endsAt,
    isExtra: Boolean(l.isExtra),
    isCatchUp: Boolean(l.isCatchUp),
    isFree: Boolean(l.isFree),
    isTeacherAbsent: Boolean(l.isTeacherAbsent),
    extraFee: l.extraFee != null ? Number(l.extraFee) : null,
    branchId: l.branchId != null ? Number(l.branchId) : null,
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
      student: {
        include: {
          family: true,
          vouchers: {
            where: { isVoided: false, paymentType: "TUITION_4SESSION" },
            include: { refunds: true },
          },
          attendances: {
            where: { lesson: { isFree: false } },
            include: { lesson: { select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true, classId: true } } },
          },
          enrollments: {
            include: { transfersFrom: true, transfersTo: true },
          },
          catchUpAttendances: {
            include: { missedLesson: { select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true, classId: true } } },
          },
        },
      },
      missedLesson: {
        include: {
          class: true,
          teacher: true,
        },
      },
    },
    orderBy: { recordedAt: "asc" },
  });

  const formattedCatchUpVisitors = catchUpVisitors.map((v) => {
    const s = v.student;
    const missedClassId = v.missedLesson.classId;
    const vEnr = s.enrollments?.find((e: any) => e.classId === missedClassId);
    const isSiblingDiscount = Boolean(s.family?.payerStudentId && s.family.payerStudentId !== s.id);
    const siblingDiscountPct = isSiblingDiscount ? Number((s.family as any)?.discountPercentage ?? 50) : 0;
    const isSiblingWaived100 = siblingDiscountPct >= 100;
    const vPayerStatus = vEnr?.payerStatus || s.payerStatus || "NORMAL";

    const vTuitionVouchers = (s.vouchers || []).filter(
      (voucher: any) => voucher.paymentType === "TUITION_4SESSION" && !voucher.isVoided && !voucher.isRefund && (voucher.classId === missedClassId || !voucher.classId)
    );

    const vAttendances = (s.attendances || []).filter(
      (a: any) => a.lesson && a.lesson.classId === missedClassId
    );

    const vCatchUps = (s.catchUpAttendances || []).filter(
      (cu: any) => cu.missedLesson && cu.missedLesson.classId === missedClassId
    );

    const vCredit = computeStudentCreditAndSessions({
      pricePerCycle: Number(v.missedLesson.class.pricePerCycle || 0),
      isFormation: Boolean(v.missedLesson.class.isFormation),
      payerStatus: vPayerStatus,
      siblingDiscountPercentage: siblingDiscountPct,
      isSiblingWaived: isSiblingWaived100,
      tuitionVouchers: vTuitionVouchers,
      transfersIn: (vEnr?.transfersTo || []),
      transfersOut: (vEnr?.transfersFrom || []),
      creditResetOffset: Number(vEnr?.creditResetOffset || 0),
      attendances: vAttendances,
      catchUps: vCatchUps,
    });

    return {
      id: v.id,
      studentId: v.studentId,
      studentName: v.student.name,
      globalNumber: v.student.globalNumber,
      missedLessonId: v.missedLessonId,
      missedClassName: v.missedLesson.class.name,
      missedTeacherName: v.missedLesson.teacher.name,
      missedStartsAt: v.missedLesson.startsAt,
      recordedAt: v.recordedAt,
      remainingCredits: vCredit.netSessions,
      payerStatus: vCredit.status,
    };
  });

  // Fetch enrolled students of THIS lesson who already caught up in another group (§2.12)
  const caughtUpStudents = await prisma.catchUpAttendance.findMany({
    where: { missedLessonId: lessonId },
    include: {
      catchUpLesson: {
        include: {
          class: { select: { name: true } },
          teacher: { select: { name: true } },
        },
      },
    },
  });

  const formattedCaughtUpAbsentees = caughtUpStudents.map((c) => ({
    studentId: c.studentId,
    catchUpLessonId: c.catchUpLessonId,
    catchUpClassName: c.catchUpLesson?.class?.name || "",
    catchUpTeacherName: c.catchUpLesson?.teacher?.name || "",
    catchUpStartsAt: c.catchUpLesson.startsAt,
  }));

  let rawStudents: any[] = [];
  try {
    rawStudents = await prisma.$queryRaw<any[]>`
      SELECT DISTINCT s.id, s.name, s."globalNumber", s.phone
      FROM "Student" s
      JOIN "Enrollment" e ON e."studentId" = s.id
      WHERE e."classId" = ${l.classId}
        AND (e.status IS NULL OR e.status = 'ACTIVE')
        AND s.id NOT IN (
          SELECT "studentId" FROM "Enrollment"
          WHERE "classId" = ${l.classId}
            AND status IN ('SUSPENDED', 'REFUNDED', 'UNENROLLED', 'TRANSFERRED', 'INACTIVE')
        )
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
            where: {
              OR: [
                { classId: l.classId },
                { paymentType: "INSCRIPTION" },
              ],
            },
            include: {
              refunds: true,
            },
            orderBy: { issuedAt: "desc" },
          },
          enrollments: {
            where: { classId: l.classId },
            include: {
              transfersFrom: true,
              transfersTo: true,
            },
          },
          attendances: {
            where: {
              lesson: {
                classId: l.classId,
                isFree: false,
              },
            },
            include: {
              lesson: {
                select: {
                  id: true,
                  startsAt: true,
                  isFree: true,
                  isTeacherAbsent: true,
                },
              },
            },
            orderBy: {
              lesson: {
                startsAt: "asc",
              },
            },
          },
          catchUpAttendances: {
            where: {
              missedLesson: {
                classId: l.classId,
              },
            },
            include: {
              missedLesson: {
                select: {
                  id: true,
                  startsAt: true,
                  isFree: true,
                  isTeacherAbsent: true,
                },
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

  // Collect paying sibling IDs for any sibling-discounted students (Rule 3)
  const payerSiblingIds = Array.from(
    new Set(
      studentsWithDetails
        .map((s) => s.family?.payerStudentId)
        .filter((pid): pid is string => Boolean(pid && !studentIds.includes(pid)))
    )
  );

  let payerSiblingsWithDetails: any[] = [];
  if (payerSiblingIds.length > 0) {
    try {
      payerSiblingsWithDetails = await prisma.student.findMany({
        where: { id: { in: payerSiblingIds } },
        include: {
          family: true,
          vouchers: {
            where: {
              isVoided: false,
              classId: l.classId,
              paymentType: "TUITION_4SESSION",
            },
            include: { refunds: true },
          },
          attendances: {
            where: {
              lesson: { classId: l.classId, isFree: false },
            },
            include: {
              lesson: { select: { id: true, startsAt: true, isFree: true } },
            },
          },
          enrollments: {
            where: { classId: l.classId },
            include: { transfersFrom: true, transfersTo: true },
          },
          catchUpAttendances: {
            where: {
              missedLesson: { classId: l.classId },
            },
            include: {
              missedLesson: {
                select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true },
              },
            },
          },
        },
      });
    } catch (e) {
      console.warn("Could not fetch payer siblings details:", e);
    }
  }

  const allRelevantStudents = [...studentsWithDetails, ...payerSiblingsWithDetails];
  const payerRemainingMap = new Map<string, number>();

  for (const s of allRelevantStudents) {
    const sEnrollment = s.enrollments?.[0];
    const isSiblingDiscount = Boolean(s.family?.payerStudentId && s.family.payerStudentId !== s.id);
    const siblingDiscountPct = isSiblingDiscount ? Number((s.family as any)?.discountPercentage ?? 50) : 0;
    const isSiblingWaived100 = siblingDiscountPct >= 100;
    const enrPayerStatus = sEnrollment?.payerStatus || s.payerStatus || "NORMAL";

    const tuitionVouchers = (s.vouchers || []).filter(
      (v: any) => v.paymentType === "TUITION_4SESSION" && !v.isVoided && !v.isRefund && (v.classId === l.classId || !v.classId)
    );

    const creditMetrics = computeStudentCreditAndSessions({
      pricePerCycle: Number(rawLesson[0]?.pricePerCycle || rawLesson[0]?.classPrice || 0),
      isFormation: Boolean(l.isFormation),
      payerStatus: enrPayerStatus,
      siblingDiscountPercentage: siblingDiscountPct,
      isSiblingWaived: isSiblingWaived100,
      tuitionVouchers,
      transfersIn: (s.enrollments || []).flatMap((e: any) => e.transfersTo || []),
      transfersOut: (s.enrollments || []).flatMap((e: any) => e.transfersFrom || []),
      creditResetOffset: (s.enrollments || []).reduce((sum: number, e: any) => sum + Number(e.creditResetOffset || 0), 0),
      attendances: s.attendances || [],
      catchUps: s.catchUpAttendances || [],
    });

    payerRemainingMap.set(s.id, creditMetrics.netSessions);
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

    const enrollment = details?.enrollments?.[0];
    const effectivePayerStatus = enrollment?.payerStatus || details?.payerStatus || "NORMAL";

    const paidInscByClass = new Map<number, number>();
    for (const v of details?.vouchers || []) {
      if (v.paymentType === "INSCRIPTION" && !v.isVoided && !v.isRefund && v.classId) {
        const vAmount = Number(v.amount || 0);
        const vRefunded = (v.refunds || []).reduce(
          (rSum: number, r: any) => rSum + Number(r.amount || 0),
          0
        );
        const netPaid = Math.max(0, vAmount - vRefunded);
        if (netPaid > 0) {
          paidInscByClass.set(v.classId, (paidInscByClass.get(v.classId) || 0) + netPaid);
        }
      }
    }

    const totalInscPaidThisClass = paidInscByClass.get(l.classId) || 0;
    const isInscriptionPaid = totalInscPaidThisClass > 0;
    const hasPaidThreeInscriptions = paidInscByClass.size >= 3;
    const isOwnerWaived = Boolean(enrollment?.feeOverriddenByOwner && !enrollment?.inscriptionFeeCharged);
    const isAutoWaived = Boolean(
      (enrollment && !enrollment.inscriptionFeeCharged) ||
        hasPaidThreeInscriptions ||
        effectivePayerStatus === "NON_PAYER"
    );
    const inscriptionStatus: "PAID" | "WAIVED" | "UNPAID" = isInscriptionPaid
      ? "PAID"
      : isOwnerWaived || isAutoWaived
      ? "WAIVED"
      : "UNPAID";
    const enrollmentStatus = enrollment?.status || "ACTIVE";
    const payerStudentId = details?.family?.payerStudentId;
    const payerSessionsRemaining = payerStudentId ? payerRemainingMap.get(payerStudentId) : undefined;

    const isSuspendedOrInactive =
      enrollmentStatus === "SUSPENDED" ||
      enrollmentStatus === "INACTIVE" ||
      enrollmentStatus === "UNENROLLED" ||
      enrollmentStatus === "TRANSFERRED";

    const classVouchers = (details?.vouchers || []).filter(
      (v: any) => v.classId === l.classId || (!v.classId && (v.paymentType === "TUITION_4SESSION" || v.paymentType === "FORMATION"))
    );
    const hasRefundRecord = classVouchers.some(
      (v: any) => v.status === "REFUNDED" || v.isRefund || (v.refunds && v.refunds.length > 0)
    );
    const hasActiveTuitionVoucher = (details?.vouchers || []).some(
      (v: any) =>
        (v.paymentType === "TUITION_4SESSION" || v.paymentType === "FORMATION") &&
        (v.classId === l.classId || !v.classId) &&
        !v.isVoided &&
        !v.isRefund &&
        v.status !== "REFUNDED" &&
        Number(v.amount || 0) > 0
    );
    const isRefunded = enrollmentStatus === "REFUNDED" || (hasRefundRecord && !hasActiveTuitionVoucher);

    return {
      id: s.id,
      globalNumber: s.globalNumber ?? details?.globalNumber,
      name: s.name,
      phone: s.phone ?? details?.phone ?? null,
      surname: "",
      payerStatus: effectivePayerStatus,
      enrollmentStatus,
      isSuspended: isSuspendedOrInactive,
      isRefunded,
      payerSessionsRemaining,
      vouchers: details?.vouchers || [],
      attendances: details?.attendances || [],
      catchUps: details?.catchUpAttendances || [],
      transfersFrom: details?.enrollments?.[0]?.transfersFrom || [],
      transfersTo: details?.enrollments?.[0]?.transfersTo || [],
      creditResetOffset: details?.enrollments?.[0]?.creditResetOffset || 0,
      family: details?.family || null,
      isBookEligible: hasPaidBook,
      hasPaidBook,
      receivedBookIds,
      outstandingBooks,
      bookDetails,
      inscriptionStatus,
    };
  });

  // Exclude inactive (suspended) and refunded students from the attendance taking list
  const activeStudentsWithHistory = studentsWithHistory.filter(
    (s: any) => !s.isSuspended && !s.isRefunded
  );

  const todaysAttendance = existingAttendance.map((a) => ({
    ...a,
    status: a.status,
    justification: a.justification || null,
    present: a.status === "PRESENT",
    date: l.startsAt,
  }));

  // Fetch grades and classes for rapid student registration to this group
  let studentRelatedData = { grades: [] as any[], classes: [] as any[] };
  const canCreateStudent = session.can("create", "student");

  if (canCreateStudent) {
    try {
      const [levels, classes] = await Promise.all([
        prisma.level.findMany({
          select: { id: true, name: true },
          orderBy: { id: "asc" },
        }),
        prisma.class.findMany({
          where: session.isOwner ? {} : { OR: [{ branchId: l.branchId }, { id: l.classId }] },
          select: { id: true, name: true, levelId: true },
          orderBy: { name: "asc" },
        }),
      ]);

      studentRelatedData = {
        grades: levels.map((lvl) => ({ id: lvl.id, level: lvl.name, name: lvl.name })),
        classes: classes.map((c) => ({ id: c.id, name: c.name, levelId: c.levelId })),
      };
    } catch (e) {
      console.error("Error fetching student registration relatedData:", e);
    }
  }

  return (
    <Card className="flex-1 w-full border-border/80 shadow-xs">
      <CardContent className="p-4 sm:p-5 md:p-6">
        <BackButton />
        <AttendanceRoster
          lesson={serializeForClient(lesson) as any}
          students={serializeForClient(activeStudentsWithHistory) as any}
          existingRecords={serializeForClient(todaysAttendance) as any}
          groupBooks={serializeForClient(groupBooks) as any}
          catchUpVisitors={serializeForClient(formattedCatchUpVisitors) as any}
          caughtUpAbsentees={serializeForClient(formattedCaughtUpAbsentees) as any}
          initialSearch={searchQuery}
          studentRelatedData={serializeForClient(studentRelatedData) as any}
          canCreateStudent={canCreateStudent}
        />
      </CardContent>
    </Card>
  );
};

export default TakeAttendancePage;
