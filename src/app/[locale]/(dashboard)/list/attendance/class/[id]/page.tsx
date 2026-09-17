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

// This type will represent a unique column in our grid
export type LessonInstance = {
    key: string; // A unique key like "lessonId-date"
    lessonId: number;
    lessonName: string;
    date: string;
};

export type AttendanceCellDetail = {
    status: "PRESENT" | "ABSENT" | "NOT_DEFINED";
    justification?: string | null;
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

    const classHeader = await prisma.class.findUnique({
        where: { id: classId },
        include: {
            branch: { select: { id: true, name: true } },
        },
    });

    if (!classHeader) {
        notFound();
    }

    // Branch access control: branch admins see only their own branch's groups
    if (!session.isOwner && !canUserAccessBranch(session.rawRole, session.branchIds, classHeader.branchId)) {
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
                SELECT DISTINCT s.id, s.name
                FROM "Student" s
                JOIN "Enrollment" e ON e."studentId" = s.id
                WHERE e."classId" = ${classId}
                ORDER BY s.name ASC
            `;

            const studentMap = new Map<string, any>();
            for (const s of rawStudents) {
                if (!studentMap.has(s.id)) {
                    studentMap.set(s.id, {
                        id: s.id,
                        name: s.name,
                        surname: "",
                        attendances: [],
                    });
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
                        c.name as "className"
                    FROM "Attendance" a
                    JOIN "Lesson" l ON l.id = a."lessonId"
                    JOIN "Class" c ON c.id = l."classId"
                    WHERE l."classId" = ${classId}
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
                            lesson: {
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
                catchUpAttendances = await prisma.catchUpAttendance.findMany({
                    where: {
                        missedLesson: {
                            classId: classId,
                        },
                    },
                    include: {
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

            classData = {
                id: classHeader.id,
                name: classHeader.name,
                isFormation: classHeader.isFormation,
                branchId: classHeader.branchId,
                branchName: classHeader.branch?.name || `الفرع ${classHeader.branchId}`,
                students: Array.from(studentMap.values()),
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

    // 1. Get a list of all unique lesson instances first to avoid counting per-student records
    const uniqueLessonInstancesTemp: { key: string; lessonId: number; subjectName: string; date: string }[] = [];
    const seenInstancesTemp = new Set<string>();

    allRecords.forEach((record: any) => {
        const dateKey = new Date(record.date).toISOString().split('T')[0];
        const instanceKey = `${record.lessonId}-${dateKey}`;
        if (!seenInstancesTemp.has(instanceKey)) {
            seenInstancesTemp.add(instanceKey);
            uniqueLessonInstancesTemp.push({
                key: instanceKey,
                lessonId: record.lessonId,
                subjectName: record.lesson.subject.name,
                date: dateKey,
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
        // A secondary sort can be added here if needed, e.g., by lesson start time if available
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
        });
    });

    // 4. Group catch-ups by student and create the attendance map for the grid
    const catchUpsByStudent = new Map<string, Array<{
        missedLessonId: number;
        catchUpDate: string;
        catchUpGroupName: string;
    }>>();

    (classData.catchUpAttendances || []).forEach((cu: any) => {
        const list = catchUpsByStudent.get(cu.studentId) || [];
        list.push({
            missedLessonId: cu.missedLessonId,
            catchUpDate: new Date(cu.catchUpLesson.startsAt).toISOString(),
            catchUpGroupName: cu.catchUpLesson?.class?.name || (locale === "ar" ? "فوج آخر" : "Autre groupe"),
        });
        catchUpsByStudent.set(cu.studentId, list);
    });

    const studentAttendanceMap = new Map<string, Map<string, AttendanceCellDetail>>();
    classData.students.forEach((student: any) => {
        const studentRecords = new Map<string, AttendanceCellDetail>();
        const studentCatchUps = catchUpsByStudent.get(student.id) || [];

        student.attendances.forEach((record: any) => {
            const dateKey = new Date(record.date).toISOString().split('T')[0];
            const instanceKey = `${record.lessonId}-${dateKey}`;
            const catchUpInfo = studentCatchUps.find((cu) => cu.missedLessonId === record.lessonId);

            studentRecords.set(instanceKey, {
                status: record.status || (record.present ? "PRESENT" : "ABSENT"),
                justification: record.justification || null,
                catchUp: catchUpInfo ? {
                    catchUpDate: catchUpInfo.catchUpDate,
                    catchUpGroupName: catchUpInfo.catchUpGroupName,
                } : null,
            });
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

                    {classData.isFormation && (
                        <Link
                            href={`/list/formations/${classData.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
                        >
                            <span>{locale === "ar" ? "تفاصيل التكوين ←" : "Détails de la formation →"}</span>
                        </Link>
                    )}
                </div>

                {/* Group Navigation Tabs (§7.20) */}
                <GroupTabs
                    classId={classData.id}
                    activeTab="attendance"
                    isFormation={classData.isFormation}
                />
                {role === 'admin' && (
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
