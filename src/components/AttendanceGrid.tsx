"use client";

import { Student } from "@prisma/client";
import Image from "next/image";
import { LessonInstance } from "@/app/(dashboard)/list/attendance/class/[id]/page";

type AttendanceGridProps = {
    students: Student[];
    lessonInstances: LessonInstance[];
    attendanceMap: Map<string, Map<string, boolean>>;
};

const AttendanceGrid = ({ students, lessonInstances, attendanceMap }: AttendanceGridProps) => {
    const formatDateHeader = (dateString: string) => {
        const date = new Date(`${dateString}T00:00:00`);
        return date.toLocaleDateString("ar-DZ", {
            month: "short",
            day: "numeric",
        });
    };

    return (
        <div className="w-full overflow-x-auto bg-white rounded-lg border">
            <table className="min-w-full border-collapse text-right">
                {/* رأس الجدول */}
                <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                        <th className="p-3 text-sm font-semibold text-right text-gray-600 border-b border-l w-64 sticky right-0 bg-gray-50 z-20">
                            التلميذ
                        </th>
                        {[...lessonInstances].reverse().map((instance) => (
                            <th
                                key={instance.key}
                                className="p-3 text-sm font-semibold text-center text-gray-600 border-b min-w-[120px]"
                            >
                                <div className="flex flex-col items-center">
                                    <span className="font-bold">{instance.lessonName}</span>
                                    <span className="font-normal text-xs">
                                        {formatDateHeader(instance.date)}
                                    </span>
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                {/* جسم الجدول */}
                <tbody>
                    {students.map((student, studentIndex) => (
                        <tr
                            key={student.id}
                            className={studentIndex % 2 === 0 ? "bg-white" : "bg-gray-50"}
                        >
                            <td className="p-3 text-sm font-medium text-gray-800 border-b border-l sticky right-0 bg-inherit w-64 z-10">
                                <div className="flex items-center gap-3 justify-end">
                                    <span>
                                        {student.name} {student.surname}
                                    </span>
                                    <Image
                                        src={student.img || "/noAvatar.png"}
                                        alt={`${student.name} ${student.surname}`}
                                        width={32}
                                        height={32}
                                        className="rounded-full object-cover"
                                    />
                                </div>
                            </td>
                            {[...lessonInstances].reverse().map((instance) => {
                                const studentRecords = attendanceMap.get(student.id);
                                const isPresent = studentRecords
                                    ? studentRecords.get(instance.key)
                                    : undefined;

                                let bgColor = "bg-gray-200"; // بدون سجل
                                if (isPresent === true) {
                                    bgColor = "bg-green-500"; // حاضر
                                } else if (isPresent === false) {
                                    bgColor = "bg-red-500"; // غائب
                                }

                                return (
                                    <td
                                        key={`${student.id}-${instance.key}`}
                                        className="p-3 border-b text-center"
                                    >
                                        <div
                                            className={`w-6 h-6 mx-auto rounded-full ${bgColor}`}
                                        ></div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default AttendanceGrid;
