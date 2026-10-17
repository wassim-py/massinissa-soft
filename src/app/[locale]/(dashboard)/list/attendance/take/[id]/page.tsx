import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import { getAuthRole, getAuthSession, getActiveBranchId } from "@/lib/auth";
import { serializeForClient } from "@/lib/utils";
import AttendanceRoster from "@/components/forms/AttendanceRoster";
import BackButton from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getTranslations, getLocale } from "next-intl/server";
import { getActiveTrimester, getFixedInscriptionFeeAction, getFormationInscriptionFeeAction } from "@/lib/configurationActions";
import { computeStudentConsumedSessions, computeStudentCreditAndSessions, resolvePayerCredit } from "@/lib/studentBilling";
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
  const [fixedInscriptionFee, formationInscriptionFee] = await Promise.all([
    getFixedInscriptionFeeAction(),
    getFormationInscriptionFeeAction(),
  ]);
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
           c."branchId" as "classBranchId",
           cr."branchId" as "classroomBranchId",
           t.name as "teacherName"
    FROM "Lesson" l
    LEFT JOIN "Class" c ON c.id = l."classId"
    LEFT JOIN "Classroom" cr ON cr.id = l."classroomId"
    LEFT JOIN "Teacher" t ON t.id = l."teacherId"
    WHERE l.id = ${lessonId}
    LIMIT 1
  `;

  if (!rawLesson || rawLesson.length === 0) {
    notFound();
  }

  const l = rawLesson[0];

  // Enforce branch-scoped attendance taking: allowed if owner, or if admin of lesson's branch, classroom's branch, or group's branch!
  const hasBranchAccess =
    session.isOwner ||
    l.branchId === activeBranchId ||
    (session.branchIds && session.branchIds.includes(l.branchId)) ||
    l.classBranchId === activeBranchId ||
    (session.branchIds && session.branchIds.includes(l.classBranchId)) ||
    l.classroomBranchId === activeBranchId ||
    (session.branchIds && session.branchIds.includes(l.classroomBranchId));

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

  // Fetch all associated groups (primary + additional from LessonGroup)
  const lessonGroups = await prisma.lessonGroup.findMany({
    where: { lessonId: lessonId },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          pricePerCycle: true,
          inscriptionFee: true,
          bookFee: true,
          hasBooks: true,
          isFormation: true,
          formationLevelId: true,
          levelId: true,
          branchId: true,
        },
      },
    },
  });

  const allClassIds = Array.from(
    new Set([l.classId, ...lessonGroups.map((g) => g.classId)].filter(Boolean))
  );

  const classesMap = new Map<number, any>();
  const isLessonClassFormation = Boolean(l.isFormation);
  classesMap.set(l.classId, {
    id: l.classId,
    name: l.className || (locale === "ar" ? "قسم" : "Groupe"),
    price: Number(l.classPrice || 0),
    pricePerCycle: Number(l.pricePerCycle || l.classPrice || 0),
    inscriptionFee: isLessonClassFormation
      ? (l.inscriptionFee != null && Number(l.inscriptionFee) > 0 ? Number(l.inscriptionFee) : formationInscriptionFee)
      : (fixedInscriptionFee > 0 ? fixedInscriptionFee : l.inscriptionFee != null ? Number(l.inscriptionFee) : 1000),
    bookFee: l.bookFee != null ? Number(l.bookFee) : 0,
    hasBooks: Boolean(l.hasBooks),
    isFormation: isLessonClassFormation,
    formationLevelId: l.formationLevelId != null ? Number(l.formationLevelId) : null,
    levelId: l.classLevelId != null ? Number(l.classLevelId) : null,
    branchId: l.classBranchId != null ? Number(l.classBranchId) : (l.branchId != null ? Number(l.branchId) : null),
  });

  for (const lg of lessonGroups) {
    if (lg.class && !classesMap.has(lg.class.id)) {
      const isLgFormation = Boolean(lg.class.isFormation);
      classesMap.set(lg.class.id, {
        id: lg.class.id,
        name: lg.class.name,
        price: Number(lg.class.pricePerCycle || 0),
        pricePerCycle: Number(lg.class.pricePerCycle || 0),
        inscriptionFee: isLgFormation
          ? (lg.class.inscriptionFee != null && Number(lg.class.inscriptionFee) > 0 ? Number(lg.class.inscriptionFee) : formationInscriptionFee)
          : (fixedInscriptionFee > 0 ? fixedInscriptionFee : lg.class.inscriptionFee != null ? Number(lg.class.inscriptionFee) : 1000),
        bookFee: lg.class.bookFee != null ? Number(lg.class.bookFee) : 0,
        hasBooks: Boolean(lg.class.hasBooks),
        isFormation: isLgFormation,
        formationLevelId: lg.class.formationLevelId != null ? Number(lg.class.formationLevelId) : null,
        levelId: lg.class.levelId != null ? Number(lg.class.levelId) : null,
        branchId: lg.class.branchId != null ? Number(lg.class.branchId) : null,
      });
    }
  }

  const combinedGroupNames = Array.from(classesMap.values())
    .map((c) => c.name)
    .join(" + ");

  const lesson = {
    id: l.id,
    name: combinedGroupNames || l.className || (locale === "ar" ? "درس" : "Séance"),
    class: {
      id: l.classId,
      name: combinedGroupNames || l.className || (locale === "ar" ? "قسم" : "Groupe"),
      price: Number(l.classPrice || 0),
      pricePerCycle: Number(l.pricePerCycle || l.classPrice || 0),
      inscriptionFee: isLessonClassFormation
        ? (l.inscriptionFee != null && Number(l.inscriptionFee) > 0 ? Number(l.inscriptionFee) : formationInscriptionFee)
        : (fixedInscriptionFee > 0 ? fixedInscriptionFee : l.inscriptionFee != null ? Number(l.inscriptionFee) : 1000),
      bookFee: l.bookFee != null ? Number(l.bookFee) : 0,
      hasBooks: Boolean(l.hasBooks),
      isFormation: isLessonClassFormation,
      formationLevelId: l.formationLevelId != null ? Number(l.formationLevelId) : null,
      levelId: l.classLevelId != null ? Number(l.classLevelId) : null,
      branchId: l.classBranchId != null ? Number(l.classBranchId) : (l.branchId != null ? Number(l.branchId) : null),
    },
    subject: { id: l.classId, name: combinedGroupNames || l.className || (locale === "ar" ? "مادة" : "Matière") },
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
  const allLevelIds = Array.from(
    new Set(
      [
        levelId,
        ...lessonGroups.map((g) => (g.class?.levelId != null ? Number(g.class.levelId) : null)),
      ].filter((id): id is number => id !== null)
    )
  );

  let groupBooks: Array<{ id: number; title: string }> = [];
  if (teacherId && (levelId || allLevelIds.length > 0)) {
    groupBooks = await prisma.book.findMany({
      where: {
        teacherId,
        levelId: allLevelIds.length > 0 ? { in: allLevelIds } : levelId!,
        ...(activeTrimester
          ? {
              OR: [
                { trimesterId: activeTrimester.id },
                { trimesterId: null },
              ],
            }
          : {}),
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
          { classId: { in: allClassIds } },
          ...(teacherId && (levelId || allLevelIds.length > 0)
            ? [
                {
                  class: {
                    teacherId,
                    levelId: allLevelIds.length > 0 ? { in: allLevelIds } : levelId!,
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

  const externalCatchUpVisitors = catchUpVisitors.filter(
    (v) => !allClassIds.includes(v.missedLesson.classId)
  );

  const inGroupCatchUpAttendees = catchUpVisitors.filter(
    (v) => allClassIds.includes(v.missedLesson.classId)
  );

  const formattedInGroupCatchUps = inGroupCatchUpAttendees.map((v) => {
    const missedDate = new Date(v.missedLesson.startsAt).toLocaleDateString(
      locale === "ar" ? "ar-DZ" : "fr-DZ",
      { weekday: "short", day: "numeric", month: "numeric" }
    );
    return {
      studentId: v.studentId,
      missedLessonId: v.missedLessonId,
      missedStartsAt: v.missedLesson.startsAt,
      missedClassName: v.missedLesson.class?.name || "",
      missedDateFormatted: missedDate,
    };
  });

  const formattedCatchUpVisitors = externalCatchUpVisitors.map((v) => {
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

    const isScenarioA = new Date(v.missedLesson.startsAt).getTime() < new Date(l.startsAt).getTime();
    const isScenarioB = new Date(v.missedLesson.startsAt).getTime() > new Date(l.startsAt).getTime();

    return {
      id: v.id,
      studentId: v.studentId,
      studentName: v.student.name,
      globalNumber: v.student.globalNumber,
      phone: s.phone || null,
      missedLessonId: v.missedLessonId,
      missedClassId,
      missedClassName: v.missedLesson.class.name,
      missedTeacherName: v.missedLesson.teacher.name,
      missedStartsAt: v.missedLesson.startsAt,
      recordedAt: v.recordedAt,
      remainingCredits: vCredit.netSessions,
      payerStatus: vCredit.status,
      isScenarioA,
      isScenarioB,
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
      SELECT DISTINCT s.id, s.name, s."globalNumber", s.phone, e."classId" as "enrolledClassId"
      FROM "Student" s
      JOIN "Enrollment" e ON e."studentId" = s.id
      WHERE e."classId" IN (${Prisma.join(allClassIds)})
        AND (e.status IS NULL OR e.status IN ('ACTIVE', 'SUSPENDED'))
        AND s.id NOT IN (
          SELECT "studentId" FROM "Enrollment"
          WHERE "classId" IN (${Prisma.join(allClassIds)})
            AND status IN ('REFUNDED', 'UNENROLLED', 'TRANSFERRED', 'INACTIVE')
        )
      ORDER BY s."globalNumber" ASC, s.name ASC
    `;
    // Deduplicate defensively
    const sMap = new Map<string, any>();
    for (const s of rawStudents) {
      if (!sMap.has(s.id)) {
        sMap.set(s.id, {
          ...s,
          className: classesMap.get(s.enrolledClassId)?.name || "",
        });
      }
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

  // Fetch full student credit info (vouchers and past non-free attendances in these classes)
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
                { classId: { in: allClassIds } },
                { paymentType: "INSCRIPTION" },
              ],
            },
            include: {
              refunds: true,
            },
            orderBy: { issuedAt: "desc" },
          },
          enrollments: {
            where: { classId: { in: allClassIds } },
            include: {
              transfersFrom: true,
              transfersTo: true,
              class: { select: { id: true, pricePerCycle: true, isFormation: true } },
            },
          },
          attendances: {
            where: {
              lesson: {
                classId: { in: allClassIds },
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
                  classId: true,
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
                classId: { in: allClassIds },
              },
            },
            include: {
              missedLesson: {
                select: {
                  id: true,
                  startsAt: true,
                  isFree: true,
                  isTeacherAbsent: true,
                  classId: true,
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
              paymentType: { in: ["TUITION_4SESSION", "FORMATION"] },
            },
            include: { refunds: true },
          },
          attendances: {
            where: {
              lesson: { isFree: false },
            },
            include: {
              lesson: { select: { id: true, startsAt: true, isFree: true, classId: true } },
            },
          },
          enrollments: {
            include: {
              transfersFrom: true,
              transfersTo: true,
              class: { select: { id: true, pricePerCycle: true, isFormation: true } },
            },
          },
          catchUpAttendances: {
            include: {
              missedLesson: {
                select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true, classId: true },
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
  const allRelevantStudentsMap = new Map(allRelevantStudents.map((s) => [s.id, s]));
  const payerRemainingMap = new Map<string, number>();

  for (const s of allRelevantStudents) {
    const sEnrollment = s.enrollments?.[0];
    const studentClassId = sEnrollment?.classId || l.classId;
    const studentClass = classesMap.get(studentClassId) || classesMap.get(l.classId);

    const payerRes = resolvePayerCredit({
      payerStudent: s,
      classId: studentClassId,
      classPricePerCycle: Number(studentClass?.pricePerCycle || 0),
      isFormation: Boolean(studentClass?.isFormation),
    });

    if (payerRes) {
      payerRemainingMap.set(s.id, payerRes.netSessions);
    }
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

    const studentClassId = s.enrolledClassId || details?.enrollments?.[0]?.classId || l.classId;
    const studentClass = classesMap.get(studentClassId) || classesMap.get(l.classId);
    const enrollment = details?.enrollments?.find((e: any) => e.classId === studentClassId) || details?.enrollments?.[0];
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

    const isTargetFormation = Boolean(classesMap.get(studentClassId)?.isFormation);
    const totalInscPaidThisClass = paidInscByClass.get(studentClassId) || 0;
    const isInscriptionPaid = totalInscPaidThisClass > 0;
    const hasPaidThreeInscriptions = isTargetFormation ? false : paidInscByClass.size >= 3;
    const isOwnerWaived = Boolean(enrollment?.feeOverriddenByOwner && !enrollment?.inscriptionFeeCharged);
    const isAutoWaived = Boolean(
      !isTargetFormation && (
        (enrollment && !enrollment.inscriptionFeeCharged) ||
        hasPaidThreeInscriptions ||
        effectivePayerStatus === "NON_PAYER"
      )
    );
    const inscriptionStatus: "PAID" | "WAIVED" | "UNPAID" = isInscriptionPaid
      ? "PAID"
      : isOwnerWaived || isAutoWaived
      ? "WAIVED"
      : "UNPAID";
    const enrollmentStatus = enrollment?.status || "ACTIVE";
    const payerStudentId = details?.family?.payerStudentId;
    const hasPayerSibling = Boolean(payerStudentId && payerStudentId !== s.id);
    let payerSessionsRemaining: number | undefined = undefined;
    if (hasPayerSibling && payerStudentId) {
      const payerObj = allRelevantStudentsMap.get(payerStudentId);
      if (payerObj) {
        const resolved = resolvePayerCredit({
          payerStudent: payerObj,
          classId: studentClassId,
          classPricePerCycle: Number(studentClass?.pricePerCycle || 0),
          isFormation: Boolean(studentClass?.isFormation),
        });
        if (resolved) {
          payerSessionsRemaining = resolved.netSessions;
        }
      }
      if (payerSessionsRemaining === undefined) {
        payerSessionsRemaining = payerRemainingMap.get(payerStudentId);
      }
    }

    const isSuspendedOrInactive =
      enrollmentStatus === "SUSPENDED" ||
      enrollmentStatus === "INACTIVE" ||
      enrollmentStatus === "UNENROLLED" ||
      enrollmentStatus === "TRANSFERRED";

    const classVouchers = (details?.vouchers || []).filter(
      (v: any) => v.classId === studentClassId || (!v.classId && (v.paymentType === "TUITION_4SESSION" || v.paymentType === "FORMATION"))
    );
    const hasRefundRecord = classVouchers.some(
      (v: any) => v.status === "REFUNDED" || v.isRefund || (v.refunds && v.refunds.length > 0)
    );
    const hasActiveTuitionVoucher = (details?.vouchers || []).some(
      (v: any) =>
        (v.paymentType === "TUITION_4SESSION" || v.paymentType === "FORMATION") &&
        (v.classId === studentClassId || !v.classId) &&
        !v.isVoided &&
        !v.isRefund &&
        v.status !== "REFUNDED" &&
        Number(v.amount || 0) > 0
    );
    const isRefunded = enrollmentStatus === "REFUNDED" || (hasRefundRecord && !hasActiveTuitionVoucher);

    const sAttendances = (details?.attendances || []).filter(
      (a: any) => !a.lesson || a.lesson.classId === studentClassId
    );
    const sCatchUps = (details?.catchUpAttendances || []).filter(
      (cu: any) => !cu.missedLesson || cu.missedLesson.classId === studentClassId
    );

    return {
      id: s.id,
      globalNumber: s.globalNumber ?? details?.globalNumber,
      name: s.name,
      phone: s.phone ?? details?.phone ?? null,
      surname: "",
      className: studentClass?.name || s.className || "",
      enrolledClassId: studentClassId,
      payerStatus: effectivePayerStatus,
      enrollmentStatus,
      isSuspended: isSuspendedOrInactive,
      isRefunded,
      payerSessionsRemaining,
      vouchers: details?.vouchers || [],
      attendances: sAttendances,
      catchUps: sCatchUps,
      transfersFrom: enrollment?.transfersFrom || [],
      transfersTo: enrollment?.transfersTo || [],
      creditResetOffset: enrollment?.creditResetOffset || 0,
      family: details?.family || null,
      isBookEligible: hasPaidBook,
      hasPaidBook,
      receivedBookIds,
      outstandingBooks,
      bookDetails,
      inscriptionStatus,
    };
  });

  // Exclude refunded students from the attendance taking list (keep suspended so they can be searched and unsuspended)
  const rosterStudents = studentsWithHistory.filter(
    (s: any) => !s.isRefunded
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
          where: session.isOwner ? {} : { OR: [{ branchId: l.branchId }, { id: { in: allClassIds } }] },
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
          students={serializeForClient(rosterStudents) as any}
          existingRecords={serializeForClient(todaysAttendance) as any}
          groupBooks={serializeForClient(groupBooks) as any}
          catchUpVisitors={serializeForClient(formattedCatchUpVisitors) as any}
          caughtUpAbsentees={serializeForClient(formattedCaughtUpAbsentees) as any}
          inGroupCatchUps={serializeForClient(formattedInGroupCatchUps) as any}
          initialSearch={searchQuery}
          studentRelatedData={serializeForClient(studentRelatedData) as any}
          canCreateStudent={canCreateStudent}
        />
      </CardContent>
    </Card>
  );
};

export default TakeAttendancePage;
