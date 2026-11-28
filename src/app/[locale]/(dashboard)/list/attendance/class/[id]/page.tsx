import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getAuthRole, getAuthSession } from "@/lib/auth";
import { canUserAccessBranch } from "@/lib/settings";
import AttendanceGrid from "@/components/AttendanceGrid";
import AttendanceGridFilters from "@/components/AttendanceGridFilters";
import BackButton from "@/components/BackButton";
import ExportButton from "@/components/ExportButton";
import GroupTabs from "@/components/groups/GroupTabs";
import ClassStatusToggleButton from "@/components/groups/ClassStatusToggleButton";
import { isClassInactive } from "@/lib/classStatus";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { classifyStudentAttendanceHistory, computePostRevisionEnrollmentGapInfo, computeStudentConsecutiveAbsences, computeStudentCreditAndSessions, computeStudentSessionFee, formatDiscountBadgeLabel, resolvePayerCredit, isLessonApplicableToEnrollment } from "@/lib/studentBilling";
import { getAlgiersDateInfo } from "@/lib/utils";
import { StudentBalanceInfo } from "@/components/AttendanceGrid";
import { autoSaveLessonAttendanceAction } from "@/lib/actions";

// This type will represent a unique column in our grid
export type LessonInstance = {
    key: string; // A unique key like "lessonId-date"
    lessonId: number;
    lessonName: string;
    date: string;
    startsAt?: string;
    isFree?: boolean;
    isExtra?: boolean;
    isCatchUp?: boolean;
    isPrepaidOnlyFutureColumn?: boolean;
};

export type AttendanceCellDetail = {
    status: "PRESENT" | "ABSENT" | "NOT_DEFINED";
    justification?: string | null;
    isPreStart?: boolean;
    isRevisionGap?: boolean;
    isTeacherAbsent?: boolean;
    isRevisionVisitor?: boolean;
    isPrepaidRevision?: boolean;
    revisionAmountPaid?: number | null;
    revisionVoucherNumber?: number | null;
    catchUp?: {
        catchUpDate: string;
        catchUpGroupName: string;
    } | null;
    visitorCatchUp?: {
        missedLessonDate: string;
        homeGroupName: string;
    } | null;
};

const ClassAttendancePage = async (
    props: { params: Promise<{ id: string }>, searchParams: Promise<{ [key: string]: string | undefined }> }
) => {
    const searchParams = await props.searchParams;
    const params = await props.params;
    const session = await getAuthSession();
    const role = session.role;
    const t = await getTranslations("attendance");
    const locale = await getLocale();

    const classId = parseInt(params.id, 10);
    if (isNaN(classId)) {
        notFound();
    }

    const [classHeader, allClassLessons] = await Promise.all([
        prisma.class.findUnique({
            where: { id: classId },
            include: {
                branch: { select: { id: true, name: true } },
                FormationLevel: {
                    select: {
                        id: true,
                        name: true,
                        lumpSumPrice: true,
                    },
                },
            },
        }),
        prisma.$queryRaw<Array<{ id: number; classId: number; startsAt: Date; endsAt: Date; isExtra: boolean; isCatchUp: boolean; isFree: boolean; isTeacherAbsent: boolean; branchId: number; recurrenceStartAt: Date | null; recurrenceEndAt: Date | null; isSingleOccurrence: boolean }>>`
            SELECT l.id, l."classId", l."startsAt", l."endsAt", l."isExtra", l."isCatchUp", l."isFree", l."isTeacherAbsent", l."branchId", l."recurrenceStartAt", l."recurrenceEndAt", l."isSingleOccurrence"
            FROM "Lesson" l
            WHERE l."classId" = ${classId}
               OR EXISTS (
                   SELECT 1 FROM "LessonGroup" lg
                   WHERE lg."lessonId" = l.id AND lg."classId" = ${classId}
               )
            ORDER BY l."startsAt" DESC
        `,
    ]);
    const latestLesson = allClassLessons[0] || null;

    if (latestLesson && !latestLesson.isTeacherAbsent && new Date(latestLesson.endsAt) <= new Date()) {
        try {
            await autoSaveLessonAttendanceAction(latestLesson.id);
        } catch {
            // Non-blocking background auto-save
        }
    }

    const now = new Date();
    const todayInfo = getAlgiersDateInfo(now);
    const activeRecurringLessons = allClassLessons.filter(
        (l) =>
            !l.isExtra &&
            !l.isCatchUp &&
            !l.isFree &&
            !l.isSingleOccurrence &&
            (!l.recurrenceEndAt || new Date(l.recurrenceEndAt).getTime() > now.getTime())
    );
    const todayMatchingLesson =
        allClassLessons.find((l) => getAlgiersDateInfo(l.startsAt).dateStr === todayInfo.dateStr) ||
        activeRecurringLessons.find(
            (l) => getAlgiersDateInfo(l.startsAt).weekday === todayInfo.weekday
        ) ||
        activeRecurringLessons[0] ||
        latestLesson;
    const takeAttendanceDateStr = todayMatchingLesson
        ? (!todayMatchingLesson.isExtra && !todayMatchingLesson.isCatchUp && !todayMatchingLesson.isFree)
            ? todayInfo.dateStr
            : getAlgiersDateInfo(todayMatchingLesson.startsAt).dateStr
        : todayInfo.dateStr;

    if (!classHeader) {
        notFound();
    }

    // Branch access control: group attendance register is accessible only to owner, teacher of class, or admin of that branch
    const hasBranchAccess =
      session.isOwner ||
      (session.rawRole === "teacher" && classHeader.teacherId === session.userId) ||
      canUserAccessBranch(session.rawRole, session.branchIds, classHeader.branchId);
    if (!hasBranchAccess) {
        return (
            <Card className="p-8 text-center max-w-md mx-auto my-8 border-border shadow-xs font-sans">
                <div className="flex flex-col items-center gap-3">
                    <Badge variant="danger" size="md" withDot>
                        {locale === "ar" ? "وصول غير مصرح" : "Accès non autorisé"}
                    </Badge>
                    <p className="text-table-body text-gray-800 font-medium">
                        {locale === "ar"
                            ? "لا يمكنك الاطلاع على سجل حضور فوج تابع لفرع آخر."
                            : "Vous ne pouvez pas consulter le registre de présence d'un groupe appartenant à un autre siège."}
                    </p>
                    <div className="mt-2">
                        <BackButton />
                    </div>
                </div>
            </Card>
        );
    }

    let classData: any = null;

    try {

            const rawStudents = await prisma.$queryRaw<any[]>`
                SELECT 
                    s.id, 
                    s.name, 
                    s."globalNumber", 
                    s.phone,
                    e.id as "enrollmentId",
                    e.status as "enrollmentStatus",
                    e."enrolledAt",
                    (
                        SELECT et."transferredAt"
                        FROM "EnrollmentTransfer" et
                        WHERE et."fromEnrollmentId" = e.id
                        ORDER BY et."transferredAt" DESC
                        LIMIT 1
                    ) as "transferredAt",
                    (
                        SELECT et."transferredAt"
                        FROM "EnrollmentTransfer" et
                        WHERE et."toEnrollmentId" = e.id
                        ORDER BY et."transferredAt" DESC
                        LIMIT 1
                    ) as "transferredInAt",
                    (
                        SELECT fe."classId"
                        FROM "EnrollmentTransfer" et
                        JOIN "Enrollment" fe ON fe.id = et."fromEnrollmentId"
                        WHERE et."toEnrollmentId" = e.id
                        ORDER BY et."transferredAt" DESC
                        LIMIT 1
                    ) as "transferredFromClassId"
                FROM "Student" s
                JOIN "Enrollment" e ON e."studentId" = s.id
                WHERE e."classId" = ${classId}
                  AND e."status" NOT IN ('UNENROLLED', 'INACTIVE')
                ORDER BY s.name ASC
            `;

            const studentMap = new Map<string, any>();
            for (const s of rawStudents) {
                const isTransferred = s.enrollmentStatus === "TRANSFERRED" || (s.enrollmentStatus !== "ACTIVE" && Boolean(s.transferredAt));
                if (!studentMap.has(s.id)) {
                    studentMap.set(s.id, {
                        id: s.id,
                        name: s.name,
                        globalNumber: s.globalNumber,
                        phone: s.phone,
                        surname: "",
                        status: s.enrollmentStatus,
                        isTransferred,
                        transferredAt: s.transferredAt ? new Date(s.transferredAt).toISOString() : null,
                        enrolledAt: s.enrolledAt ? new Date(s.enrolledAt).toISOString() : null,
                        transferredInAt: s.transferredInAt ? new Date(s.transferredInAt).toISOString() : null,
                        transferredFromClassId: s.transferredFromClassId ? Number(s.transferredFromClassId) : null,
                        attendances: [],
                    });
                } else if (!isTransferred && studentMap.get(s.id)?.isTransferred) {
                    // Prefer active enrollment status if multiple enrollment records exist
                    const existing = studentMap.get(s.id);
                    existing.isTransferred = false;
                    existing.status = s.enrollmentStatus;
                    existing.transferredAt = null;
                    existing.enrolledAt = s.enrolledAt ? new Date(s.enrolledAt).toISOString() : existing.enrolledAt;
                    existing.transferredInAt = s.transferredInAt ? new Date(s.transferredInAt).toISOString() : existing.transferredInAt;
                    existing.transferredFromClassId = s.transferredFromClassId ? Number(s.transferredFromClassId) : existing.transferredFromClassId;
                }
            }

            try {
                const rawAttendances = await prisma.$queryRaw<any[]>`
                    SELECT 
                        a.id as "attendanceId",
                        a."studentId",
                        a.status,
                        a.justification,
                        l.id as "lessonId",
                        l."startsAt" as date,
                        l."classId" as "lessonClassId",
                        l."isTeacherAbsent",
                        l."isFree",
                        l."isExtra",
                        l."isCatchUp",
                        c.name as "className"
                    FROM "Attendance" a
                    JOIN "Lesson" l ON l.id = a."lessonId"
                    JOIN "Class" c ON c.id = ${classId}
                    WHERE (
                        l."classId" = ${classId}
                        OR EXISTS (
                            SELECT 1 FROM "LessonGroup" lg
                            WHERE lg."lessonId" = l.id AND lg."classId" = ${classId}
                        )
                    )
                    AND a."isRevisionVisitor" = false
                    AND a."studentId" IN (
                        SELECT e."studentId" FROM "Enrollment" e
                        WHERE e."classId" = ${classId}
                          AND e."status" NOT IN ('UNENROLLED', 'INACTIVE')
                    )
                    ORDER BY l."startsAt" ASC
                `;

                for (const att of rawAttendances) {
                    const s = studentMap.get(att.studentId);
                    if (s) {
                        s.attendances.push({
                            id: att.attendanceId,
                            lessonId: att.lessonId,
                            date: att.date,
                            status: att.status,
                            justification: att.justification || null,
                            present: att.status === "PRESENT",
                            isTeacherAbsent: Boolean(att.isTeacherAbsent),
                            isFree: Boolean(att.isFree),
                            isExtra: Boolean(att.isExtra),
                            isCatchUp: Boolean(att.isCatchUp),
                            lesson: {
                                isFree: Boolean(att.isFree),
                                isExtra: Boolean(att.isExtra),
                                isCatchUp: Boolean(att.isCatchUp),
                                subject: {
                                    name: att.className || "درس",
                                },
                            },
                        });
                    }
                }
            } catch (attErr) {
                console.error("Error fetching attendances:", attErr);
            }

            try {
                const rawRevisionAttendances = await prisma.$queryRaw<any[]>`
                    SELECT 
                        a.id as "attendanceId",
                        a."studentId",
                        a.status,
                        a.justification,
                        a."isRevisionVisitor",
                        l.id as "lessonId",
                        l."startsAt" as date,
                        l."classId" as "lessonClassId",
                        l."isTeacherAbsent",
                        l."isFree",
                        l."isExtra",
                        l."isCatchUp",
                        s.name as "studentName",
                        s."globalNumber" as "studentGlobalNumber",
                        s.phone as "studentPhone"
                    FROM "Attendance" a
                    JOIN "Lesson" l ON l.id = a."lessonId"
                    JOIN "Student" s ON s.id = a."studentId"
                    WHERE a."isRevisionVisitor" = true
                      AND (
                          l."classId" = ${classId}
                          OR EXISTS (
                              SELECT 1 FROM "LessonGroup" lg
                              WHERE lg."lessonId" = l.id AND lg."classId" = ${classId}
                          )
                      )
                    ORDER BY l."startsAt" ASC
                `;

                for (const revAtt of rawRevisionAttendances) {
                    if (!studentMap.has(revAtt.studentId)) {
                        studentMap.set(revAtt.studentId, {
                            id: revAtt.studentId,
                            name: revAtt.studentName,
                            globalNumber: revAtt.studentGlobalNumber,
                            phone: revAtt.studentPhone,
                            surname: "",
                            status: "ACTIVE",
                            isTransferred: false,
                            isRevisionVisitorOnly: true,
                            transferredAt: null,
                            enrolledAt: null,
                            transferredInAt: null,
                            transferredFromClassId: null,
                            attendances: [],
                        });
                    }
                    const s = studentMap.get(revAtt.studentId);
                    if (s) {
                        s.attendances.push({
                            id: revAtt.attendanceId,
                            lessonId: revAtt.lessonId,
                            date: revAtt.date,
                            status: revAtt.status,
                            justification: revAtt.justification || null,
                            present: revAtt.status === "PRESENT",
                            isTeacherAbsent: Boolean(revAtt.isTeacherAbsent),
                            isFree: Boolean(revAtt.isFree),
                            isExtra: Boolean(revAtt.isExtra),
                            isCatchUp: Boolean(revAtt.isCatchUp),
                            isRevisionVisitor: true,
                            lesson: {
                                isFree: Boolean(revAtt.isFree),
                                isExtra: Boolean(revAtt.isExtra),
                                isCatchUp: Boolean(revAtt.isCatchUp),
                                subject: {
                                    name: classHeader.name || "درس",
                                },
                            },
                        });
                    }
                }
            } catch (revErr) {
                console.error("Error fetching revision attendances in ClassAttendancePage:", revErr);
            }

            // Also load active PRE-PAID (unredeemed) REVISION_SESSION vouchers for this class
            // so future pre-paid revision bookings appear immediately in the Revision Visitors tab
            let prepaidRevisionBookings: Array<{
                voucherId: number;
                voucherNumber: number;
                studentId: string;
                lessonId: number;
                lessonStartsAt: Date;
                isExtra: boolean;
                isCatchUp: boolean;
                isFree: boolean;
                amount: number;
            }> = [];
            try {
                const classLessonIdList = allClassLessons.map((l) => l.id);
                const rawPrepaidRevVouchers = await prisma.voucher.findMany({
                    where: {
                        paymentType: "REVISION_SESSION",
                        isVoided: false,
                        isRefund: false,
                        lessonId: { not: null },
                        OR: [
                            { classId: classId },
                            ...(classLessonIdList.length > 0 ? [{ lessonId: { in: classLessonIdList } }] : []),
                        ],
                    },
                    include: {
                        student: { select: { id: true, name: true, globalNumber: true, phone: true } },
                        lesson: { select: { id: true, startsAt: true, isExtra: true, isCatchUp: true, isFree: true } },
                        refunds: { select: { amount: true } },
                    },
                });

                for (const v of rawPrepaidRevVouchers) {
                    if (!v.lesson || !v.student) continue;
                    const refunded = (v.refunds || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
                    const netPaid = Math.max(0, Number(v.amount || 0) - refunded);
                    if (netPaid <= 0) continue;

                    if (!studentMap.has(v.student.id)) {
                        studentMap.set(v.student.id, {
                            id: v.student.id,
                            name: v.student.name,
                            globalNumber: v.student.globalNumber,
                            phone: v.student.phone,
                            surname: "",
                            status: "ACTIVE",
                            isTransferred: false,
                            isRevisionVisitorOnly: true,
                            transferredAt: null,
                            enrolledAt: null,
                            transferredInAt: null,
                            transferredFromClassId: null,
                            attendances: [],
                        });
                    }

                    const s = studentMap.get(v.student.id);
                    const alreadyHasAttendance = (s?.attendances || []).some(
                        (a: any) => a.lessonId === v.lesson!.id && a.isRevisionVisitor
                    );
                    if (!alreadyHasAttendance) {
                        prepaidRevisionBookings.push({
                            voucherId: v.id,
                            voucherNumber: v.number,
                            studentId: v.student.id,
                            lessonId: v.lesson.id,
                            lessonStartsAt: v.lesson.startsAt,
                            isExtra: Boolean(v.lesson.isExtra),
                            isCatchUp: Boolean(v.lesson.isCatchUp),
                            isFree: Boolean(v.lesson.isFree),
                            amount: netPaid,
                        });
                    }
                }
            } catch (prepaidErr) {
                console.error("Error fetching prepaid revision vouchers in ClassAttendancePage:", prepaidErr);
            }

            let catchUpAttendances: any[] = [];
            try {
                const classLessonIds = allClassLessons.map((l) => l.id);
                catchUpAttendances = await prisma.catchUpAttendance.findMany({
                    where: {
                        missedLessonId: {
                            in: classLessonIds.length > 0 ? classLessonIds : [-1],
                        },
                    },
                    include: {
                        missedLesson: {
                            include: {
                                class: {
                                    select: { name: true },
                                },
                            },
                        },
                        catchUpLesson: {
                            include: {
                                class: {
                                    select: { name: true },
                                },
                            },
                        },
                    },
                });
            } catch (cuErr) {
                console.error("Error fetching catch up attendances:", cuErr);
            }

            // Compute remaining balance for each enrolled student
            const studentIds = Array.from(studentMap.keys());
            let studentsWithBilling: any[] = [];
            if (studentIds.length > 0) {
                try {
                    studentsWithBilling = await prisma.student.findMany({
                        where: { id: { in: studentIds } },
                        include: {
                            family: {
                                include: {
                                    payerStudent: {
                                        include: {
                                            enrollments: {
                                                include: {
                                                    transfersFrom: true,
                                                    transfersTo: true,
                                                    payerHistory: { orderBy: { effectiveFrom: "asc" } },
                                                    class: { select: { id: true, pricePerCycle: true, isFormation: true } },
                                                },
                                            },
                                            vouchers: {
                                                where: { isVoided: false, isRefund: false },
                                                include: { refunds: true },
                                            },
                                            attendances: {
                                                where: { lesson: { isFree: false } },
                                                include: {
                                                    lesson: { select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true, classId: true, lessonGroups: { select: { classId: true } } } },
                                                },
                                            },
                                            catchUpAttendances: {
                                                include: {
                                                    missedLesson: { select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true, classId: true, lessonGroups: { select: { classId: true } } } },
                                                    catchUpLesson: { select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true, classId: true, lessonGroups: { select: { classId: true } } } },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                            vouchers: {
                                where: {
                                    OR: [
                                        { classId: classId },
                                        { paymentType: { in: ["TUITION_4SESSION", "FORMATION"] } },
                                    ],
                                    isVoided: false,
                                    isRefund: false,
                                },
                                include: {
                                    refunds: true,
                                },
                                orderBy: { issuedAt: "desc" },
                            },
                            enrollments: {
                                where: { classId: classId },
                                include: {
                                    transfersFrom: true,
                                    transfersTo: {
                                        include: {
                                            fromEnrollment: {
                                                include: { class: true },
                                            },
                                        },
                                    },
                                    payerHistory: { orderBy: { effectiveFrom: "asc" } },
                                },
                            },
                            attendances: {
                                where: {
                                    lesson: {
                                        OR: [
                                            { classId: classId },
                                            { lessonGroups: { some: { classId: classId } } },
                                        ],
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
                                            lessonGroups: { select: { classId: true } },
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
                                    OR: [
                                        { missedLesson: { classId: classId } },
                                        { missedLesson: { lessonGroups: { some: { classId: classId } } } },
                                        { catchUpLesson: { classId: classId } },
                                        { catchUpLesson: { lessonGroups: { some: { classId: classId } } } },
                                    ],
                                },
                                include: {
                                    missedLesson: {
                                        select: {
                                            id: true,
                                            startsAt: true,
                                            isFree: true,
                                            isTeacherAbsent: true,
                                            classId: true,
                                            class: { select: { name: true } },
                                            lessonGroups: { select: { classId: true } },
                                        },
                                    },
                                    catchUpLesson: {
                                        select: {
                                            id: true,
                                            startsAt: true,
                                            isFree: true,
                                            isTeacherAbsent: true,
                                            classId: true,
                                            lessonGroups: { select: { classId: true } },
                                        },
                                    },
                                },
                            },
                        },
                    });
                } catch (billingErr) {
                    console.error("Error fetching students billing data in ClassAttendancePage:", billingErr);
                }
            }

            const billingMap = new Map(studentsWithBilling.map((s) => [s.id, s]));
            const isFormation = Boolean(classHeader.isFormation);
            const classPricePerCycle = Number(classHeader.pricePerCycle || 0);
            const formationPrice = Number(classHeader.FormationLevel?.lumpSumPrice || classHeader.pricePerCycle || 0);
            const classLessonsForBilling = allClassLessons.map((l) => ({
                id: l.id,
                classId: l.classId,
                startsAt: l.startsAt,
                isFree: Boolean(l.isFree),
                isTeacherAbsent: Boolean(l.isTeacherAbsent),
            }));

            for (const [studentId, s] of studentMap.entries()) {
                const details = billingMap.get(studentId);
                const revisionVouchers = (details?.vouchers || []).filter(
                    (v: any) =>
                        v.paymentType === "REVISION_SESSION" &&
                        !v.isVoided &&
                        !v.isRefund &&
                        (v.classId === classId || !v.classId)
                );
                let revisionPaidTotal = 0;
                const revisionPaymentsByLesson: Record<number, number> = {};
                revisionVouchers.forEach((v: any) => {
                    const vAmount = Number(v.amount || 0);
                    const vRefunded = (v.refunds || []).reduce(
                        (sum: number, r: any) => sum + Number(r.amount || 0),
                        0
                    );
                    const netPaid = Math.max(0, vAmount - vRefunded);
                    revisionPaidTotal += netPaid;
                    if (v.lessonId) {
                        revisionPaymentsByLesson[Number(v.lessonId)] =
                            (revisionPaymentsByLesson[Number(v.lessonId)] || 0) + netPaid;
                    }
                });
                s.revisionPaidTotal = revisionPaidTotal;
                s.revisionPaymentsByLesson = revisionPaymentsByLesson;

                if (s.isRevisionVisitorOnly) {
                    s.payerStatus = "NORMAL";
                    s.balance = undefined;
                    s.billingDetails = details;
                    continue;
                }

                const enrollment = details?.enrollments?.[0];
                const studentClassAttsForGap = (details?.attendances || s.attendances || []).filter(
                    (att: any) =>
                        !att.lesson ||
                        att.lesson.classId === classId ||
                        att.lesson.lessonGroups?.some((lg: any) => lg.classId === classId)
                );
                const gapInfo = computePostRevisionEnrollmentGapInfo({
                    lessons: classLessonsForBilling,
                    attendances: studentClassAttsForGap,
                    enrolledAt: enrollment?.enrolledAt || s.enrolledAt,
                });
                s.hasPriorRevisionInGroup = gapInfo.hasPriorRevisionInGroup;
                s.priorRevisionCount = gapInfo.priorRevisionCount;
                s.earliestRevisionAt = gapInfo.earliestRevisionAt;
                s.latestRevisionAt = gapInfo.latestRevisionAt;
                s.revisionGapLessonsCount = gapInfo.gapLessonsCount;
                s.revisionGapLessonIds = gapInfo.gapLessonIds;

                const effectivePayerStatus = enrollment?.payerStatus || details?.payerStatus || "NORMAL";
                const enrDiscountType = enrollment?.discountType || null;
                const enrDiscountValue = enrollment?.discountValue != null ? Number(enrollment.discountValue) : null;
                const isDiscounted = effectivePayerStatus === "DISCOUNTED";
                const discountLabel = isDiscounted
                    ? formatDiscountBadgeLabel(enrDiscountType, enrDiscountValue, locale === "ar" ? "ar" : "fr")
                    : null;
                let balance: StudentBalanceInfo;

                if (isFormation) {
                    const studentFormationPrice = computeStudentSessionFee({
                        pricePerCycle: formationPrice,
                        isFormation: true,
                        payerStatus: effectivePayerStatus,
                        discountType: enrDiscountType,
                        discountValue: enrDiscountValue,
                    }).studentCycleFee;
                    const formationVouchers = (details?.vouchers || []).filter(
                        (v: any) =>
                            (v.paymentType === "FORMATION" || v.paymentType === "TUITION_4SESSION") &&
                            !v.isVoided &&
                            !v.isRefund &&
                            (v.classId === classId || !v.classId)
                    );
                    let totalPaidFormation = 0;
                    formationVouchers.forEach((v: any) => {
                        const vAmount = Number(v.amount || 0);
                        const vRefunded = (v.refunds || []).reduce(
                            (sum: number, r: any) => sum + Number(r.amount || 0),
                            0
                        );
                        totalPaidFormation += Math.max(0, vAmount - vRefunded);
                    });
                    const isLevelPaid =
                        (studentFormationPrice === 0 && (effectivePayerStatus === "NON_PAYER" || isDiscounted)) ||
                        (studentFormationPrice > 0 && totalPaidFormation >= studentFormationPrice);
                    const isLevelPartiallyPaid = totalPaidFormation > 0 && totalPaidFormation < studentFormationPrice;
                    const levelRemainingBalance = Math.max(0, studentFormationPrice - totalPaidFormation);

                    balance = {
                        isFormation: true,
                        levelPrice: studentFormationPrice,
                        totalPaidFormation,
                        levelRemainingBalance,
                        isLevelPaid,
                        isLevelPartiallyPaid,
                        isDiscounted,
                        discountLabel,
                        payerStatus: effectivePayerStatus,
                    };
                } else {

                    const payerId = details?.family?.payerStudentId;
                    const hasPayerSibling = Boolean(payerId && payerId !== studentId);

                    let targetPayerStudent: any = details?.family?.payerStudent;
                    if (!targetPayerStudent && payerId) {
                        targetPayerStudent = billingMap.get(payerId);
                    }

                    // Sibling discount applies ONLY if designated payer sibling is actively enrolled in THIS class
                    const isPayerInClass = Boolean(
                        hasPayerSibling && (
                            studentMap.has(payerId!) ||
                            targetPayerStudent?.enrollments?.some(
                                (pe: any) => pe.classId === classId && (pe.status === "ACTIVE" || !pe.status)
                            )
                        )
                    );

                    let isPayerActiveAndPaid = false;
                    let payerRemainingCredit: number | undefined = undefined;
                    if (isPayerInClass && targetPayerStudent) {
                        const payerRes = resolvePayerCredit({
                            payerStudent: targetPayerStudent,
                            classId,
                            classPricePerCycle: Number(classHeader?.pricePerCycle || 0),
                            isFormation: false,
                        });
                        if (payerRes) {
                            isPayerActiveAndPaid = payerRes.isPayerActiveAndPaid;
                            payerRemainingCredit = payerRes.netSessions;
                        }
                    }

                    const siblingDiscountPct = isPayerInClass
                        ? Number((details?.family as any)?.discountPercentage ?? 50)
                        : 0;
                    const isSiblingWaived100 = isPayerInClass && siblingDiscountPct >= 100;
                    const isSiblingDiscount = Boolean(
                        isPayerInClass && (!isSiblingWaived100 || isPayerActiveAndPaid)
                    );

                    const isPayerSiblingPaid = isSiblingWaived100
                        ? isPayerActiveAndPaid
                        : true;

                    const tuitionVouchers = (details?.vouchers || []).filter(
                        (v: any) =>
                            v.paymentType === "TUITION_4SESSION" &&
                            !v.isVoided &&
                            !v.isRefund &&
                            (v.classId === classId || !v.classId)
                    );

                    const sAttendances = (details?.attendances || []).filter(
                        (att: any) => {
                            if (
                                !att.lesson ||
                                !(att.lesson.classId === classId ||
                                    att.lesson.lessonGroups?.some((lg: any) => lg.classId === classId)) ||
                                att.lesson.isFree
                            ) {
                                return false;
                            }
                            // Preserve revision visitor records so computeStudentCreditAndSessions
                            // extracts their timestamps for revision-to-enrollment gap exemption
                            // while excluding them from regular cycle consumption.
                            if (att.isRevisionVisitor) return true;
                            return isLessonApplicableToEnrollment(
                                { ...att.lesson, hasExplicitAttendance: att.status === "PRESENT", status: att.status },
                                classId,
                                enrollment as any
                            );
                        }
                    );

                    const sCatchUps = (details?.catchUpAttendances || []).filter(
                        (cu: any) =>
                            cu.recordedBy !== "transfer" &&
                            (cu.missedLesson?.classId === classId ||
                                cu.missedLesson?.lessonGroups?.some((lg: any) => lg.classId === classId)) &&
                            isLessonApplicableToEnrollment(cu.missedLesson, classId, enrollment as any)
                    );

                    const creditMetrics = computeStudentCreditAndSessions({
                        pricePerCycle: classPricePerCycle,
                        isFormation: false,
                        payerStatus: effectivePayerStatus,
                        discountType: enrDiscountType,
                        discountValue: enrDiscountValue,
                        payerHistory: enrollment?.payerHistory || [],
                        siblingDiscountPercentage: siblingDiscountPct,
                        isSiblingWaived: isSiblingWaived100,
                        isPayerSiblingPaid,
                        isPayerActiveAndPaid,
                        payerRemainingCredit: isSiblingWaived100 ? payerRemainingCredit : undefined,
                        tuitionVouchers,
                        transfersIn: enrollment?.transfersTo || [],
                        transfersOut: enrollment?.transfersFrom || [],
                        creditResetOffset: enrollment?.creditResetOffset || 0,
                        attendances: sAttendances,
                        lessons: classLessonsForBilling,
                        catchUps: sCatchUps,
                        enrolledAt: enrollment?.enrolledAt,
                        enrollmentStatus: enrollment?.status,
                    });

                    let net = creditMetrics.netSessions;
                    let computedStatus = creditMetrics.status;

                    if (!isDiscounted && isSiblingWaived100) {
                        net = 0;
                        computedStatus = isPayerSiblingPaid ? "SIBLING_WAIVED" : "UNPAID";
                    }

                    balance = {
                        isFormation: false,
                        netSessions: net,
                        status: computedStatus,
                        hasPayerSibling: Boolean(!isDiscounted && isPayerInClass && isSiblingDiscount),
                        isSchoolFeesOnly: creditMetrics.isSchoolFeesOnly,
                        isDiscounted,
                        discountLabel,
                        payerStatus: effectivePayerStatus,
                    };
                }

                s.payerStatus = details?.enrollments?.[0]?.payerStatus || details?.payerStatus || "NORMAL";
                s.balance = balance;
                s.billingDetails = details;
            }

            const sortedStudents = Array.from(studentMap.values()).sort((a, b) => {
                if (a.isTransferred && !b.isTransferred) return 1;
                if (!a.isTransferred && b.isTransferred) return -1;
                if (a.isRevisionVisitorOnly && !b.isRevisionVisitorOnly) return 1;
                if (!a.isRevisionVisitorOnly && b.isRevisionVisitorOnly) return -1;
                return a.name.localeCompare(b.name);
            });

            classData = {
                id: classHeader.id,
                name: classHeader.name,
                isFormation: classHeader.isFormation,
                branchId: classHeader.branchId,
                branchName: classHeader.branch?.name || `الفرع ${classHeader.branchId}`,
                students: sortedStudents,
                catchUpAttendances,
                prepaidRevisionBookings,
            };
    } catch (err) {
        console.error("Error fetching class data:", err);
    }

    if (!classData) {
        notFound();
    }

    // --- REFINED DATA PROCESSING LOGIC ---

    const allRecords = classData.students.flatMap((s: any) => s.attendances);
    const allClassLessonsMap = new Map(allClassLessons.map((l) => [l.id, l]));

    // 1. Get a list of all unique lesson instances first to avoid counting per-student records
    const uniqueLessonInstancesTemp: {
        key: string;
        lessonId: number;
        subjectName: string;
        date: string;
        startsAt?: string;
        isFree?: boolean;
        isExtra?: boolean;
        isCatchUp?: boolean;
        isPrepaidOnlyFutureColumn?: boolean;
    }[] = [];
    const seenInstancesTemp = new Set<string>();

    allRecords.forEach((record: any) => {
        const dateKey = getAlgiersDateInfo(record.date).dateStr;
        const instanceKey = `${record.lessonId}-${dateKey}`;
        if (!seenInstancesTemp.has(instanceKey)) {
            seenInstancesTemp.add(instanceKey);
            const lessonMeta = allClassLessonsMap.get(record.lessonId);
            uniqueLessonInstancesTemp.push({
                key: instanceKey,
                lessonId: record.lessonId,
                subjectName: record.lesson.subject.name,
                date: dateKey,
                startsAt: lessonMeta?.startsAt ? new Date(lessonMeta.startsAt).toISOString() : record.date ? new Date(record.date).toISOString() : undefined,
                isFree: Boolean(lessonMeta?.isFree ?? record.isFree),
                isExtra: Boolean(lessonMeta?.isExtra ?? record.isExtra),
                isCatchUp: Boolean(lessonMeta?.isCatchUp ?? record.isCatchUp),
            });
        }
    });

    // Also ensure any lesson referenced by a catch-up in this class appears as a column
    (classData.catchUpAttendances || []).forEach((cu: any) => {
        if (cu.missedLesson) {
            const dateKey = getAlgiersDateInfo(cu.missedLesson.startsAt).dateStr;
            const instanceKey = `${cu.missedLesson.id}-${dateKey}`;
            if (!seenInstancesTemp.has(instanceKey)) {
                seenInstancesTemp.add(instanceKey);
                const lessonMeta = allClassLessonsMap.get(cu.missedLesson.id);
                uniqueLessonInstancesTemp.push({
                    key: instanceKey,
                    lessonId: cu.missedLesson.id,
                    subjectName: cu.missedLesson.class?.name || classHeader.name || "درس",
                    date: dateKey,
                    startsAt: lessonMeta?.startsAt ? new Date(lessonMeta.startsAt).toISOString() : cu.missedLesson.startsAt ? new Date(cu.missedLesson.startsAt).toISOString() : undefined,
                    isFree: Boolean(lessonMeta?.isFree ?? cu.missedLesson.isFree),
                    isExtra: Boolean(lessonMeta?.isExtra ?? cu.missedLesson.isExtra),
                    isCatchUp: Boolean(lessonMeta?.isCatchUp ?? cu.missedLesson.isCatchUp),
                });
            }
        }
    });

    // Ensure any future pre-paid revision booking appears as a column in the Revision Visitors tab
    // without polluting the regular enrolled Group Attendance tab with empty future columns.
    (classData.prepaidRevisionBookings || []).forEach((pb: any) => {
        const dateKey = getAlgiersDateInfo(pb.lessonStartsAt).dateStr;
        const instanceKey = `${pb.lessonId}-${dateKey}`;
        if (!seenInstancesTemp.has(instanceKey)) {
            seenInstancesTemp.add(instanceKey);
            const lessonMeta = allClassLessonsMap.get(pb.lessonId);
            uniqueLessonInstancesTemp.push({
                key: instanceKey,
                lessonId: pb.lessonId,
                subjectName: classHeader.name || "درس",
                date: dateKey,
                startsAt: lessonMeta?.startsAt
                    ? new Date(lessonMeta.startsAt).toISOString()
                    : new Date(pb.lessonStartsAt).toISOString(),
                isFree: Boolean(lessonMeta?.isFree ?? pb.isFree),
                isExtra: Boolean(lessonMeta?.isExtra ?? pb.isExtra),
                isCatchUp: Boolean(lessonMeta?.isCatchUp ?? pb.isCatchUp),
                isPrepaidOnlyFutureColumn: true,
            });
        }
    });

    // 2. Count how many times each subject appears on each day from the unique list
    const dailySubjectCounts = new Map<string, number>();
    uniqueLessonInstancesTemp.forEach(instance => {
        const subjectDateKey = `${instance.date}-${instance.subjectName}`;
        dailySubjectCounts.set(subjectDateKey, (dailySubjectCounts.get(subjectDateKey) || 0) + 1);
    });

    // 3. Create the final lessonInstances list with conditional numbering
    const lessonInstances: LessonInstance[] = [];
    const namingCounter = new Map<string, number>();

    // Sort the temporary list to ensure numbering is sequential and predictable
    uniqueLessonInstancesTemp.sort((a, b) => {
        const dateComparison = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateComparison !== 0) return dateComparison;
        return a.subjectName.localeCompare(b.subjectName);
    });

    uniqueLessonInstancesTemp.forEach(instance => {
        const subjectDateKey = `${instance.date}-${instance.subjectName}`;
        let lessonName = instance.subjectName;

        // Only add a number if the subject appears more than once on this day
        if ((dailySubjectCounts.get(subjectDateKey) || 0) > 1) {
            const currentCount = (namingCounter.get(subjectDateKey) || 0) + 1;
            namingCounter.set(subjectDateKey, currentCount);
            lessonName = `${lessonName} (${currentCount})`;
        }

        lessonInstances.push({
            key: instance.key,
            lessonId: instance.lessonId,
            lessonName: lessonName,
            date: instance.date,
            startsAt: instance.startsAt,
            isFree: instance.isFree,
            isExtra: instance.isExtra,
            isCatchUp: instance.isCatchUp,
            isPrepaidOnlyFutureColumn: instance.isPrepaidOnlyFutureColumn,
        });
    });

    // 4. Group catch-ups by student and create the attendance map for the grid
    const catchUpsByStudent = new Map<string, Array<{
        missedLessonId: number;
        missedLessonDate?: string | null;
        catchUpDate: string;
        catchUpGroupName: string;
        recordedBy?: string;
        isTransferCatchUp?: boolean;
    }>>();

    (classData.catchUpAttendances || []).forEach((cu: any) => {
        const list = catchUpsByStudent.get(cu.studentId) || [];
        list.push({
            missedLessonId: cu.missedLessonId,
            missedLessonDate: cu.missedLesson?.startsAt ? new Date(cu.missedLesson.startsAt).toISOString() : null,
            catchUpDate: new Date(cu.catchUpLesson.startsAt).toISOString(),
            catchUpGroupName: cu.catchUpLesson?.class?.name || (locale === "ar" ? "فوج آخر" : "Autre groupe"),
            recordedBy: cu.recordedBy,
            isTransferCatchUp: cu.recordedBy === "transfer",
        });
        catchUpsByStudent.set(cu.studentId, list);
    });

    const studentAttendanceMap = new Map<string, Map<string, AttendanceCellDetail>>();
    classData.students.forEach((student: any) => {
        const studentRecords = new Map<string, AttendanceCellDetail>();
        const studentCatchUps = catchUpsByStudent.get(student.id) || [];
        const details = student.billingDetails;
        const enrollment = details?.enrollments?.[0];

        // Identify catch-up visits hosted in this class where the student was catching up a lesson from ANOTHER group (e.g. pre-transfer catch-up visitor)
        const visitorCatchUpsByLessonId = new Map<number, any>();
        (details?.catchUpAttendances || []).forEach((cu: any) => {
            if (
                cu.recordedBy !== "transfer" &&
                cu.catchUpLessonId &&
                (cu.catchUpLesson?.classId === classId ||
                    cu.catchUpLesson?.lessonGroups?.some((lg: any) => lg.classId === classId)) &&
                cu.missedLesson?.classId !== classId
            ) {
                visitorCatchUpsByLessonId.set(cu.catchUpLessonId, cu);
            }
        });

        const validTransfersIn = (enrollment?.transfersTo || []).filter((t: any) => Boolean(t?.transferredAt));
        const latestTransferInTime =
            validTransfersIn.length > 0
                ? Math.max(...validTransfersIn.map((t: any) => new Date(t.transferredAt).getTime()))
                : null;

        const applicableAttendances = (student.attendances || []).filter((a: any) => {
            if (a.isRevisionVisitor) return false;
            if (visitorCatchUpsByLessonId.has(a.lessonId)) return false;
            return isLessonApplicableToEnrollment(
                { id: a.lessonId, classId, startsAt: a.date, hasExplicitAttendance: a.status === "PRESENT", status: a.status },
                classId,
                enrollment as any
            );
        });

        const studentLessons = applicableAttendances.map((a: any) => ({
            id: a.lessonId,
            startsAt: a.date,
            isFree: Boolean(a.isFree),
            isTeacherAbsent: Boolean(a.isTeacherAbsent),
        }));

        const studentRevisionStarts = (student.attendances || [])
            .filter((a: any) => Boolean(a.isRevisionVisitor) && a.date)
            .map((a: any) => a.date);
        const revisionGapIdSet = new Set<number>(student.revisionGapLessonIds || []);

        const classified = classifyStudentAttendanceHistory({
            lessons: studentLessons,
            attendances: applicableAttendances.map((a: any) => ({
                lessonId: a.lessonId,
                status: a.status || (a.present ? "PRESENT" : "ABSENT"),
            })),
            catchUps: studentCatchUps.map((c: any) => ({
                missedLessonId: c.missedLessonId,
                recordedBy: c.recordedBy,
                isTransferCatchUp: c.isTransferCatchUp,
            })),
            postTransferStartAfter: latestTransferInTime ? new Date(latestTransferInTime) : null,
            enrolledAt: enrollment?.enrolledAt || student.enrolledAt,
            revisionLessonStartsAt: studentRevisionStarts,
        });

        const classificationMap = new Map<number, string>();
        classified.forEach((item) => classificationMap.set(item.lessonId, item.classification));

        student.attendances.forEach((record: any) => {
            const dateKey = getAlgiersDateInfo(record.date).dateStr;
            const instanceKey = `${record.lessonId}-${dateKey}`;
            const catchUpInfo = studentCatchUps.find((cu) => cu.missedLessonId === record.lessonId);
            const visitorCu = visitorCatchUpsByLessonId.get(record.lessonId);
            const isApplicable = isLessonApplicableToEnrollment(
                { id: record.lessonId, classId, startsAt: record.date, hasExplicitAttendance: record.status === "PRESENT" && !record.isRevisionVisitor, status: record.status, isRevisionVisitor: record.isRevisionVisitor } as any,
                classId,
                enrollment as any
            );
            const isRevisionGap =
                !visitorCu &&
                !record.isRevisionVisitor &&
                record.status !== "PRESENT" &&
                revisionGapIdSet.has(record.lessonId);
            const isPreStart =
                !visitorCu &&
                !record.isRevisionVisitor &&
                record.status !== "PRESENT" &&
                (isRevisionGap || !isApplicable || classificationMap.get(record.lessonId) === "PRE_START_ABSENCE");
            const isTeacherAbsent = Boolean(record.isTeacherAbsent) || classificationMap.get(record.lessonId) === "TEACHER_ABSENT";

            studentRecords.set(instanceKey, {
                status: record.status || (record.present ? "PRESENT" : "ABSENT"),
                justification: record.justification || null,
                isPreStart: record.status === "PRESENT" ? false : Boolean(isPreStart),
                isRevisionGap: Boolean(isRevisionGap),
                isTeacherAbsent,
                isRevisionVisitor: Boolean(record.isRevisionVisitor),
                revisionAmountPaid: record.isRevisionVisitor
                    ? (student.revisionPaymentsByLesson?.[record.lessonId] ?? null)
                    : null,
                catchUp: catchUpInfo ? {
                    catchUpDate: catchUpInfo.catchUpDate,
                    catchUpGroupName: catchUpInfo.catchUpGroupName,
                } : null,
                visitorCatchUp: visitorCu ? {
                    missedLessonDate: visitorCu.missedLesson?.startsAt
                        ? new Date(visitorCu.missedLesson.startsAt).toISOString()
                        : "",
                    homeGroupName: visitorCu.missedLesson?.class?.name || (locale === "ar" ? "فوج سابق" : "Groupe précédent"),
                } : null,
            });
        });

        // Ensure any visitor catch-up hosted in this class is represented in studentRecords even if no Attendance row was created on the host lesson
        visitorCatchUpsByLessonId.forEach((visitorCu, hostLessonId) => {
            if (visitorCu.catchUpLesson?.startsAt) {
                const dateKey = getAlgiersDateInfo(visitorCu.catchUpLesson.startsAt).dateStr;
                const instanceKey = `${hostLessonId}-${dateKey}`;
                if (!studentRecords.has(instanceKey)) {
                    studentRecords.set(instanceKey, {
                        status: "PRESENT",
                        justification: null,
                        isPreStart: false,
                        isTeacherAbsent: false,
                        catchUp: null,
                        visitorCatchUp: {
                            missedLessonDate: visitorCu.missedLesson?.startsAt
                                ? new Date(visitorCu.missedLesson.startsAt).toISOString()
                                : "",
                            homeGroupName: visitorCu.missedLesson?.class?.name || (locale === "ar" ? "فوج سابق" : "Groupe précédent"),
                        },
                    });
                }
            }
        });

        // Ensure every catch-up entry for this student is represented in studentRecords
        studentCatchUps.forEach((cuInfo: any) => {
            if (cuInfo.missedLessonDate) {
                const dateKey = getAlgiersDateInfo(cuInfo.missedLessonDate).dateStr;
                const instanceKey = `${cuInfo.missedLessonId}-${dateKey}`;
                if (!studentRecords.has(instanceKey)) {
                    studentRecords.set(instanceKey, {
                        status: "ABSENT",
                        justification: null,
                        isPreStart: false,
                        isTeacherAbsent: false,
                        catchUp: {
                            catchUpDate: cuInfo.catchUpDate,
                            catchUpGroupName: cuInfo.catchUpGroupName,
                        },
                    });
                }
            }
        });

        // Represent unredeemed PRE-PAID revision bookings in studentRecords so they render as amber-teal pending indicators
        (classData.prepaidRevisionBookings || [])
            .filter((pb: any) => pb.studentId === student.id)
            .forEach((pb: any) => {
                const dateKey = getAlgiersDateInfo(pb.lessonStartsAt).dateStr;
                const instanceKey = `${pb.lessonId}-${dateKey}`;
                if (!studentRecords.has(instanceKey)) {
                    studentRecords.set(instanceKey, {
                        status: "NOT_DEFINED",
                        justification: null,
                        isPreStart: false,
                        isTeacherAbsent: false,
                        isRevisionVisitor: true,
                        isPrepaidRevision: true,
                        revisionAmountPaid: pb.amount,
                        revisionVoucherNumber: pb.voucherNumber,
                        catchUp: null,
                        visitorCatchUp: null,
                    });
                }
            });

        studentAttendanceMap.set(student.id, studentRecords);
    });

    return (
        <Card className="flex-1 w-full border-border/80 shadow-xs font-sans">
            <CardContent className="p-4 sm:p-5 md:p-6">
                <BackButton/>
                <div className="border-b border-border pb-4 mb-4 mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-page-title text-gray-900">{t("attendanceGridTitle")}: {classData.name}</h1>
                            {classData.isFormation ? (
                                <Badge variant="primary" size="sm">
                                    {locale === "ar" ? "تكوين" : "Formation"}
                                </Badge>
                            ) : (
                                <Badge variant="secondary" size="sm">
                                    {locale === "ar" ? "فوج دعم" : "Cours régulier"}
                                </Badge>
                            )}
                            {classData.branchName && (
                                <Badge variant="neutral" size="sm">
                                    {classData.branchName}
                                </Badge>
                            )}
                        </div>
                        <p className="text-form-helper text-muted mt-1">
                            {locale === "ar" ? "عرض حضور وغيابات هذا الفوج." : "Affichage des présences et absences de ce groupe."}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <ClassStatusToggleButton
                            classId={classData.id}
                            groupName={classData.name}
                            isPaused={Boolean(classHeader.isPaused)}
                            isCompleted={Boolean(classHeader.isCompleted)}
                            pausedAt={classHeader.pausedAt}
                            completedAt={classHeader.completedAt}
                            isOwner={session.isOwner}
                            showBadge
                        />
                        {todayMatchingLesson && !isClassInactive(classHeader) && (
                            <Link
                                href={`/list/attendance/take/${todayMatchingLesson.id}?date=${encodeURIComponent(takeAttendanceDateStr)}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors shrink-0 shadow-xs"
                            >
                                <span>{locale === "ar" ? "تسجيل الحضور للفوج ←" : "Prendre la présence →"}</span>
                            </Link>
                        )}
                        {classData.isFormation && (
                            <Link
                                href={`/list/formations/${classData.id}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
                            >
                                <span>{locale === "ar" ? "تفاصيل التكوين ←" : "Détails de la formation →"}</span>
                            </Link>
                        )}
                    </div>
                </div>

                {isClassInactive(classHeader) && (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs font-medium text-amber-900">
                        {locale === "ar"
                            ? "هذا الفوج مغلق / متوقف حالياً. يتم الاحتفاظ بكامل سجل الحضور والغيابات السابقة للاطلاع والتصدير."
                            : "Ce groupe est actuellement fermé / en pause. L'historique complet des présences et absences reste consultable et exportable."}
                    </div>
                )}

                {/* Group Navigation Tabs (§7.20) */}
                <GroupTabs
                    classId={classData.id}
                    activeTab="attendance"
                    isFormation={classData.isFormation}
                />
                {(session.isOwner || session.isBranchAdmin || role === 'admin') && (
                    <ExportButton
                        type="attendance"
                        options={{ 
                            classId: classData.id, 
                            dateFrom: searchParams.startDate, 
                            dateTo: searchParams.endDate 
                        }}
                        className="mb-5"
                    />
                )}

                <AttendanceGridFilters />

                <div className="mt-4">
                    <AttendanceGrid
                        students={classData.students}
                        lessonInstances={lessonInstances}
                        attendanceMap={studentAttendanceMap}
                        classId={classData.id}
                        className={classData.name}
                        canEnroll={
                            !isClassInactive(classHeader) &&
                            (session.can("create", "student") ||
                                session.isOwner ||
                                session.isBranchAdmin ||
                                session.isOwnerOrAdmin)
                        }
                    />
                </div>
            </CardContent>
        </Card>
    );
};

export default ClassAttendancePage;
