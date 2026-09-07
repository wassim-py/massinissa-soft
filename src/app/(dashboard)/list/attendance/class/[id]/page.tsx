import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import AttendanceGrid from "@/components/AttendanceGrid";
import AttendanceGridFilters from "@/components/AttendanceGridFilters";
import BackButton from "@/components/BackButton";
import ExportButton from "@/components/ExportButton";

// This type will represent a unique column in our grid
export type LessonInstance = {
    key: string; // A unique key like "lessonId-date"
    lessonId: number;
    lessonName: string;
    date: string;
};

const ClassAttendancePage = async ({ params, searchParams }: { params: { id: string }, searchParams: { [key: string]: string | undefined } }) => {
    const { sessionClaims } = auth();
    const role = (sessionClaims?.metadata as { role?: string })?.role;

    if (role !== 'admin' && role !== 'teacher') {
        return <div className="p-4 text-red-600 font-medium">ليست لديك الصلاحية للوصول إلى هذه الصفحة.</div>;
    }

    const classId = parseInt(params.id);

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (searchParams.startDate) {
        dateFilter.gte = new Date(searchParams.startDate);
    }
    if (searchParams.endDate) {
        const endDate = new Date(searchParams.endDate);
        endDate.setHours(23, 59, 59, 999);
        dateFilter.lte = endDate;
    }

    const classData = await prisma.class.findUnique({
        where: { id: classId },
        include: {
            students: {
                orderBy: { name: 'asc' },
                include: {
                    attendances: {
                        where: {
                            lesson: { classId: classId },
                            ...(Object.keys(dateFilter).length > 0 && { date: dateFilter })
                        },
                        include: {
                            lesson: { 
                                include: {
                                    subject: true
                                }
                            }
                        },
                        orderBy: { date: 'asc' }
                    }
                }
            }
        }
    });

    if (!classData) {
        notFound();
    }

    // --- REFINED DATA PROCESSING LOGIC ---

    const allRecords = classData.students.flatMap(s => s.attendances);
    
    // 1. Get a list of all unique lesson instances first to avoid counting per-student records
    const uniqueLessonInstancesTemp: { key: string; lessonId: number; subjectName: string; date: string }[] = [];
    const seenInstancesTemp = new Set<string>();

    allRecords.forEach(record => {
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

    // 4. Create the attendance map for the grid
    const studentAttendanceMap = new Map<string, Map<string, boolean>>();
    classData.students.forEach(student => {
        const studentRecords = new Map<string, boolean>();
        student.attendances.forEach(record => {
            const dateKey = new Date(record.date).toISOString().split('T')[0];
            const instanceKey = `${record.lessonId}-${dateKey}`;
            studentRecords.set(instanceKey, record.present);
        });
        studentAttendanceMap.set(student.id, studentRecords);
    });

    return (
        <div className="bg-white p-6 rounded-lg m-4 mt-0">
            <BackButton/>
            <div className="border-b pb-4 mb-6">
                <h1 className="text-3xl font-bold text-gray-800">سجل حضور: {classData.name}</h1>
                <p className="text-gray-500 mt-1">عرض حضور وغيابات هذا القسم.</p>
            </div>
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

            <AttendanceGrid
                students={classData.students}
                lessonInstances={lessonInstances}
                attendanceMap={studentAttendanceMap}
            />
        </div>
    );
};

export default ClassAttendancePage;
