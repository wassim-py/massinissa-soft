import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getAuthRole, getAuthSession } from "@/lib/auth";
import { canUserAccessBranch } from "@/lib/settings";
import AttendanceGrid from "@/components/AttendanceGrid";
import AttendanceGridFilters from "@/components/AttendanceGridFilters";
import BackButton from "@/components/BackButton";
import ExportButton from "@/components/ExportButton";
import GroupTabs from "@/components/groups/GroupTabs";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { classifyStudentAttendanceHistory, computeStudentConsecutiveAbsences, computeStudentCreditAndSessions, resolvePayerCredit } from "@/lib/studentBilling";
import { getAlgiersDateInfo } from "@/lib/utils";
import { StudentBalanceInfo } from "@/components/AttendanceGrid";

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
};

export type AttendanceCellDetail = {
    status: "PRESENT" | "ABSENT" | "NOT_DEFINED";
    justification?: string | null;
    isPreStart?: boolean;
    isTeacherAbsent?: boolean;
    catchUp?: {
        catchUpDate: string;
        catchUpGroupName: string;
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
        prisma.$queryRaw<Array<{ id: number; startsAt: Date; isExtra: boolean; isCatchUp: boolean; isFree: boolean; isTeacherAbsent: boolean; branchId: number }>>`
            SELECT l.id, l."startsAt", l."isExtra", l."isCatchUp", l."isFree", l."isTeacherAbsent", l."branchId"
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
    const todayInfo = getAlgiersDateInfo(new Date());
    const todayMatchingLesson =
        allClassLessons.find((l) => getAlgiersDateInfo(l.startsAt).dateStr === todayInfo.dateStr) ||
        allClassLessons.find(
            (l) =>
                !l.isExtra &&
                !l.isCatchUp &&
                !l.isFree &&
                getAlgiersDateInfo(l.startsAt).weekday === todayInfo.weekday
        ) ||
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
                    ) as "transferredAt"
                FROM "Student" s
                JOIN "Enrollment" e ON e."studentId" = s.id
                WHERE e."classId" = ${classId}
                  AND e."status" NOT IN ('UNENROLLED', 'INACTIVE')
                ORDER BY s.name ASC
            `;

            const studentMap = new Map<string, any>();
            for (const s of rawStudents) {
                const isTransferred = s.enrollmentStatus === "TRANSFERRED" || Boolean(s.transferredAt);
                if (!studentMap.has(s.id)) {
                    studentMap.set(s.id, {
                        id: s.id,
                        name: s.name,
                        globalNumber: s.globalNumber,
                        phone: s.phone,
                        surname: "",
                        isTransferred,
                        transferredAt: s.transferredAt ? new Date(s.transferredAt).toISOString() : null,
                        attendances: [],
                    });
                } else if (!isTransferred && studentMap.get(s.id)?.isTransferred) {
                    // Prefer active enrollment status if multiple enrollment records exist
                    const existing = studentMap.get(s.id);
                    existing.isTransferred = false;
                    existing.transferredAt = null;
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
                startsAt: l.startsAt,
                isFree: Boolean(l.isFree),
                isTeacherAbsent: Boolean(l.isTeacherAbsent),
            }));

            for (const [studentId, s] of studentMap.entries()) {
                const details = billingMap.get(studentId);
                let balance: StudentBalanceInfo;

                if (isFormation) {
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
                    const isLevelPaid = formationPrice > 0 && totalPaidFormation >= formationPrice;
                    const isLevelPartiallyPaid = totalPaidFormation > 0 && totalPaidFormation < formationPrice;
                    const levelRemainingBalance = Math.max(0, formationPrice - totalPaidFormation);

                    balance = {
                        isFormation: true,
                        levelPrice: formationPrice,
                        totalPaidFormation,
                        levelRemainingBalance,
                        isLevelPaid,
                        isLevelPartiallyPaid,
                    };
                } else {
                    const enrollment = details?.enrollments?.[0];
                    const effectivePayerStatus = enrollment?.payerStatus || details?.payerStatus || "NORMAL";

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

                    const isSiblingDiscount = Boolean(isPayerInClass && isPayerActiveAndPaid);
                    const siblingDiscountPct = isPayerInClass
                        ? Number((details?.family as any)?.discountPercentage ?? 50)
                        : 0;
                    const isSiblingWaived100 = isPayerInClass && siblingDiscountPct >= 100;

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
                        (att: any) =>
                            att.lesson &&
                            (att.lesson.classId === classId ||
                                att.lesson.lessonGroups?.some((lg: any) => lg.classId === classId)) &&
                            !att.lesson.isFree
                    );

                    const classCatchUpsForStudent = (catchUpAttendances || []).filter(
                        (cu: any) => cu.studentId === studentId
                    );
                    const sCatchUps = [
                        ...(details?.catchUpAttendances || []),
                        ...classCatchUpsForStudent,
                    ];

                    const creditMetrics = computeStudentCreditAndSessions({
                        pricePerCycle: classPricePerCycle,
                        isFormation: false,
                        payerStatus: effectivePayerStatus,
                        siblingDiscountPercentage: siblingDiscountPct,
                        isSiblingWaived: isSiblingWaived100,
                        isPayerSiblingPaid,
                        payerRemainingCredit: isSiblingWaived100 ? undefined : payerRemainingCredit,
                        tuitionVouchers,
                        transfersIn: enrollment?.transfersTo || [],
                        transfersOut: enrollment?.transfersFrom || [],
                        creditResetOffset: enrollment?.creditResetOffset || 0,
                        attendances: sAttendances,
                        lessons: classLessonsForBilling,
                        catchUps: sCatchUps,
                    });

                    let net = creditMetrics.netSessions;
                    let computedStatus = creditMetrics.status;

                    if (isSiblingWaived100) {
                        net = 0;
                        computedStatus = isPayerSiblingPaid ? "SIBLING_WAIVED" : "UNPAID";
                    }

                    balance = {
                        isFormation: false,
                        netSessions: net,
                        status: computedStatus,
                        hasPayerSibling: Boolean(isPayerInClass && isSiblingDiscount),
                    };
                }

                s.balance = balance;
            }

            const sortedStudents = Array.from(studentMap.values()).sort((a, b) => {
                if (a.isTransferred && !b.isTransferred) return 1;
                if (!a.isTransferred && b.isTransferred) return -1;
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

        const studentLessons = (student.attendances || []).map((a: any) => ({
            id: a.lessonId,
            startsAt: a.date,
            isFree: Boolean(a.isFree),
            isTeacherAbsent: Boolean(a.isTeacherAbsent),
        }));

        const classified = classifyStudentAttendanceHistory({
            lessons: studentLessons,
            attendances: (student.attendances || []).map((a: any) => ({
                lessonId: a.lessonId,
                status: a.status || (a.present ? "PRESENT" : "ABSENT"),
            })),
            catchUps: studentCatchUps.map((c: any) => ({
                missedLessonId: c.missedLessonId,
                recordedBy: c.recordedBy,
                isTransferCatchUp: c.isTransferCatchUp,
            })),
        });

        const classificationMap = new Map<number, string>();
        classified.forEach((item) => classificationMap.set(item.lessonId, item.classification));

        student.attendances.forEach((record: any) => {
            const dateKey = getAlgiersDateInfo(record.date).dateStr;
            const instanceKey = `${record.lessonId}-${dateKey}`;
            const catchUpInfo = studentCatchUps.find((cu) => cu.missedLessonId === record.lessonId);
            const isPreStart = classificationMap.get(record.lessonId) === "PRE_START_ABSENCE";
            const isTeacherAbsent = Boolean(record.isTeacherAbsent) || classificationMap.get(record.lessonId) === "TEACHER_ABSENT";

            studentRecords.set(instanceKey, {
                status: record.status || (record.present ? "PRESENT" : "ABSENT"),
                justification: record.justification || null,
                isPreStart,
                isTeacherAbsent,
                catchUp: catchUpInfo ? {
                    catchUpDate: catchUpInfo.catchUpDate,
                    catchUpGroupName: catchUpInfo.catchUpGroupName,
                } : null,
            });
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
                        {todayMatchingLesson && (
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
                    />
                </div>
            </CardContent>
        </Card>
    );
};

export default ClassAttendancePage;
