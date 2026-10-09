"use client";

import { useState, useMemo } from "react";
import { Student } from "@prisma/client";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { LessonInstance, AttendanceCellDetail } from "@/app/[locale]/(dashboard)/list/attendance/class/[id]/page";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

type AttendanceGridProps = {
    students: (Student & { globalNumber?: number; phone?: string | null })[];
    lessonInstances: LessonInstance[];
    attendanceMap: Map<string, Map<string, AttendanceCellDetail | boolean>>;
};

const AttendanceGrid = ({ students, lessonInstances, attendanceMap }: AttendanceGridProps) => {
    const t = useTranslations("attendance");
    const tSearch = useTranslations("search");
    const locale = useLocale();

    const searchParams = useSearchParams();
    const initialSearch = searchParams?.get("search") || "";
    const [searchQuery, setSearchQuery] = useState(initialSearch);

    const [selectedJustification, setSelectedJustification] = useState<{
        studentId: string;
        studentName: string;
        lessonName: string;
        date: string;
        justification: string;
    } | null>(null);

    const filteredStudents = useMemo(() => {
        if (!searchQuery.trim()) return students;
        const q = searchQuery.toLowerCase().trim();
        return students.filter((student) => {
            const nameMatch = student.name?.toLowerCase().includes(q);
            const numMatch = student.globalNumber !== undefined && student.globalNumber !== null
                ? String(student.globalNumber).includes(q)
                : false;
            const phoneMatch = student.phone ? student.phone.includes(q) : false;
            const idMatch = student.id ? student.id.toLowerCase().includes(q) : false;
            return Boolean(nameMatch || numMatch || phoneMatch || idMatch);
        });
    }, [students, searchQuery]);

    const formatDateHeader = (dateString: string) => {
        const date = new Date(`${dateString}T00:00:00`);
        return date.toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ", {
            month: "short",
            day: "numeric",
        });
    };

    const formatCatchUpDate = (dateVal: string | Date) => {
        const d = new Date(dateVal);
        return d.toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    return (
        <div className="w-full bg-surface rounded-xl border border-border shadow-xs font-sans">
            {/* Top Toolbar: Search Bar, Counter, and Legend */}
            <div className="p-3 sm:p-4 bg-surface-muted/90 border-b border-border">
                {/* Search Bar & Counter */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                    <div className="relative w-full sm:w-80 max-w-md">
                        <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={tSearch("searchStudentPlaceholder")}
                            className="w-full ps-9 pe-8 py-2 text-xs sm:text-sm bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900 placeholder:text-muted transition-all shadow-2xs"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery("")}
                                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-gray-700 p-0.5 rounded-md hover:bg-surface-subtle transition-colors cursor-pointer"
                                title={locale === "ar" ? "مسح" : "Effacer"}
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 text-xs font-medium text-muted shrink-0">
                        <span className="px-2.5 py-1 bg-surface rounded-md border border-border text-gray-700 font-semibold shadow-2xs">
                            {searchQuery.trim()
                                ? t("studentsFoundCount", { count: filteredStudents.length })
                                : t("totalGroupStudents", { count: students.length })}
                        </span>
                    </div>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-3.5 flex-wrap text-form-helper text-gray-700 font-medium pt-3 mt-3 border-t border-border/60 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-gray-800">
                        <span>{t("legendTitle")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-success inline-block shadow-2xs"></span>
                        <span>{t("legendPresent")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-danger inline-block shadow-2xs"></span>
                        <span>{t("legendAbsent")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-amber-500 inline-block shadow-2xs"></span>
                        <span>{t("legendJustified")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-slate-200 border border-slate-400 inline-block shadow-2xs"></span>
                        <span>{locale === "ar" ? "غياب قبل البدء (محايد)" : "Absence pré-début (neutre)"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-blue-600 inline-block shadow-2xs"></span>
                        <span>{t("legendCaughtUp")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-rose-500 inline-block shadow-2xs"></span>
                        <span>{locale === "ar" ? "أستاذ غائب (محفوظ)" : "Prof absent (préservé)"}</span>
                    </div>
                </div>
            </div>

            {/* Mobile swipe hint */}
            <div className="flex items-center justify-between px-3 py-2 bg-surface-muted border-b border-border text-form-helper text-muted sm:hidden">
                <span className="font-semibold text-gray-700">{t("attendanceGridTitle")}</span>
                <span className="text-primary font-medium">{t("swipeHint")}</span>
            </div>

            {/* Sticky Table Scroll Container */}
            <div className="w-full overflow-auto max-h-[calc(100vh-220px)] min-h-[350px] relative">
                <table className="min-w-full border-separate border-spacing-0">
                    {/* Table Header: Sticky Lessons Line */}
                    <thead className="sticky top-0 z-20 bg-surface-muted">
                        <tr>
                            {/* Student Column Header: Sticky top and start */}
                            <th className="p-2.5 sm:p-3 text-table-header font-semibold text-start text-muted border-b-2 border-e border-border w-44 sm:w-64 min-w-[150px] sm:min-w-[220px] sticky top-0 start-0 ltr:left-0 rtl:right-0 bg-surface-muted z-30 shadow-[2px_2px_4px_-2px_rgba(0,0,0,0.06)] rtl:shadow-[-2px_2px_4px_-2px_rgba(0,0,0,0.06)]">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-mono text-muted w-5 text-center">#</span>
                                    <span>{t("studentCol")}</span>
                                </div>
                            </th>

                            {/* Lesson Instances Headers: Sticky top */}
                            {[...lessonInstances].reverse().map((instance) => (
                                <th
                                    key={instance.key}
                                    className="p-2.5 sm:p-3 text-table-header font-semibold text-center text-muted border-b-2 border-border min-w-[85px] sm:min-w-[120px] sticky top-0 z-20 bg-surface-muted shadow-[0_2px_4px_-2px_rgba(0,0,0,0.06)]"
                                >
                                    <div className="flex flex-col items-center">
                                        <span className="font-bold text-gray-800">{instance.lessonName}</span>
                                        <span className="font-normal text-form-helper text-muted">
                                            {formatDateHeader(instance.date)}
                                        </span>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>

                    {/* Table Body */}
                    <tbody>
                        {filteredStudents.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={lessonInstances.length + 1}
                                    className="p-10 text-center text-muted text-sm border-b border-border bg-surface"
                                >
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <Search className="w-8 h-8 text-muted/40" />
                                        <p className="font-medium text-gray-700">
                                            {searchQuery.trim()
                                                ? (locale === "ar"
                                                    ? "لم يتم العثور على أي تلميذ يطابق هذا البحث"
                                                    : "Aucun élève ne correspond à votre recherche")
                                                : t("noStudents")}
                                        </p>
                                        {searchQuery.trim() && (
                                            <button
                                                type="button"
                                                onClick={() => setSearchQuery("")}
                                                className="text-xs text-primary hover:underline font-semibold cursor-pointer"
                                            >
                                                {locale === "ar" ? "مسح البحث" : "Effacer la recherche"}
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredStudents.map((student, studentIndex) => {
                                const rowBg = studentIndex % 2 === 0 ? "bg-surface" : "bg-surface-muted";
                                return (
                                    <tr
                                        key={`${student.id}-${studentIndex}`}
                                        className={`group ${rowBg} hover:bg-surface-subtle transition-colors`}
                                    >
                                        {/* Sticky Student Column Cell */}
                                        <td className={`p-2 sm:p-3 text-table-body font-medium text-gray-900 border-b border-e border-border sticky start-0 ltr:left-0 rtl:right-0 z-10 w-44 sm:w-64 min-w-[150px] sm:min-w-[220px] ${rowBg} group-hover:bg-surface-subtle transition-colors shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] rtl:shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]`}>
                                            <Link
                                                href={`/list/students/${student.id}`}
                                                className="flex items-center gap-2 sm:gap-2.5 min-w-0"
                                            >
                                                <span className="text-[11px] font-mono font-semibold text-muted w-5 shrink-0 text-center">
                                                    {studentIndex + 1}
                                                </span>
                                                <Image
                                                    src="/noAvatar.png"
                                                    alt={student.name}
                                                    width={28}
                                                    height={28}
                                                    className="rounded-full object-cover shrink-0 border border-border group-hover:border-primary transition-colors"
                                                />
                                                <div className="flex flex-col min-w-0">
                                                    <span className="truncate max-w-[110px] sm:max-w-[160px] group-hover:underline group-hover:text-primary transition-colors">
                                                        {student.name}
                                                    </span>
                                                    {student.globalNumber ? (
                                                        <span className="text-[10px] text-muted font-mono leading-none mt-0.5">
                                                            #{student.globalNumber}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </Link>
                                        </td>

                                        {/* Lesson Attendance Cells */}
                                        {[...lessonInstances].reverse().map((instance) => {
                                            const studentRecords = attendanceMap.get(student.id);
                                            const rawRecord = studentRecords
                                                ? studentRecords.get(instance.key)
                                                : undefined;

                                            if (!rawRecord) {
                                                // No attendance record recorded for this lesson
                                                return (
                                                    <td
                                                        key={`${student.id}-${instance.key}-${studentIndex}`}
                                                        className="p-3 text-center border-b border-border"
                                                    >
                                                        <div className="w-5 h-5 mx-auto rounded-full bg-surface-subtle border border-border" />
                                                    </td>
                                                );
                                            }

                                            const record: AttendanceCellDetail =
                                                typeof rawRecord === "boolean"
                                                    ? { status: rawRecord ? "PRESENT" : "ABSENT" }
                                                    : rawRecord;

                                            if (record.isTeacherAbsent) {
                                                // Rose circle: teacher absent session, credit preserved
                                                return (
                                                    <td
                                                        key={`${student.id}-${instance.key}-${studentIndex}`}
                                                        className="p-3 text-center border-b border-border"
                                                    >
                                                        <div
                                                            className="w-5 h-5 mx-auto rounded-full bg-rose-500 ring-2 ring-rose-200 shadow-2xs"
                                                            title={locale === "ar" ? "أستاذ غائب (الرصيد غير مخصوم)" : "Professeur absent (crédit préservé)"}
                                                        />
                                                    </td>
                                                );
                                            }

                                            if (record.catchUp) {
                                                // Blue circle: missed lesson but caught up in another group
                                                const tooltipText = t("caughtUpTooltip", {
                                                    group: record.catchUp.catchUpGroupName,
                                                    date: formatCatchUpDate(record.catchUp.catchUpDate),
                                                });

                                                return (
                                                    <td
                                                        key={`${student.id}-${instance.key}-${studentIndex}`}
                                                        className="p-3 text-center border-b border-border"
                                                    >
                                                        <div className="relative group/catchup inline-flex items-center justify-center">
                                                            <div
                                                                className="w-5 h-5 rounded-full bg-blue-600 hover:bg-blue-700 ring-2 ring-blue-300 ring-offset-1 transition-transform hover:scale-125 cursor-help shadow-xs"
                                                                title={tooltipText}
                                                            />
                                                            {/* Interactive Hover Tooltip */}
                                                            <div className="pointer-events-none absolute bottom-full start-1/2 -translate-x-1/2 mb-2 hidden group-hover/catchup:flex flex-col items-center z-40 min-w-[180px] max-w-xs transition-all">
                                                                <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 shadow-xl text-center font-normal">
                                                                    <div className="font-bold text-blue-300 mb-0.5 flex items-center justify-center gap-1.5">
                                                                        <svg className="w-3.5 h-3.5 text-blue-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                        </svg>
                                                                        <span>{t("legendCaughtUp")}</span>
                                                                    </div>
                                                                    <div className="text-[11px] text-gray-200 leading-snug">
                                                                        {tooltipText}
                                                                    </div>
                                                                </div>
                                                                <div className="w-2 h-2 bg-gray-900 rotate-45 -mt-1" />
                                                            </div>
                                                        </div>
                                                    </td>
                                                );
                                            }

                                            if (record.status === "PRESENT") {
                                                // Green circle: Present
                                                return (
                                                    <td
                                                        key={`${student.id}-${instance.key}-${studentIndex}`}
                                                        className="p-3 text-center border-b border-border"
                                                    >
                                                        <div
                                                            className="w-5 h-5 mx-auto rounded-full bg-success shadow-2xs"
                                                            title={t("legendPresent")}
                                                        />
                                                    </td>
                                                );
                                            }

                                            if (record.status === "NOT_DEFINED") {
                                                // Orange circle: NOT_DEFINED — clicking/tapping shows justification text
                                                return (
                                                    <td
                                                        key={`${student.id}-${instance.key}-${studentIndex}`}
                                                        className="p-3 text-center border-b border-border"
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setSelectedJustification({
                                                                    studentId: student.id,
                                                                    studentName: student.name,
                                                                    lessonName: instance.lessonName,
                                                                    date: formatDateHeader(instance.date),
                                                                    justification:
                                                                        record.justification ||
                                                                        t("noJustificationRecorded"),
                                                                })
                                                            }
                                                            className="w-5 h-5 mx-auto rounded-full bg-amber-500 hover:bg-amber-600 focus:outline-none ring-2 ring-amber-300 ring-offset-1 transition-transform hover:scale-125 cursor-pointer shadow-xs"
                                                            title={t("legendJustified")}
                                                        />
                                                    </td>
                                                );
                                            }

                                            // Status is ABSENT
                                            if (record.isPreStart) {
                                                // Neutral grayed circle: pre-start absence (Rule 10)
                                                return (
                                                    <td
                                                        key={`${student.id}-${instance.key}-${studentIndex}`}
                                                        className="p-3 text-center border-b border-border"
                                                    >
                                                        <div
                                                            className="w-5 h-5 mx-auto rounded-full bg-slate-200 border-2 border-slate-400/80 shadow-2xs"
                                                            title={locale === "ar" ? "غياب قبل أول حضور (محايد)" : "Absence avant premier cours (neutre)"}
                                                        />
                                                    </td>
                                                );
                                            }

                                            // Red circle: absent, no catch-up recorded
                                            return (
                                                <td
                                                    key={`${student.id}-${instance.key}-${studentIndex}`}
                                                    className="p-3 text-center border-b border-border"
                                                >
                                                    <div
                                                        className="w-5 h-5 mx-auto rounded-full bg-danger shadow-2xs"
                                                        title={t("legendAbsent")}
                                                    />
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Justification Modal Dialog */}
            {selectedJustification && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-sans backdrop-blur-xs animate-in fade-in duration-150"
                    onClick={() => setSelectedJustification(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-100 animate-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-100">
                            <div className="flex items-center gap-2.5">
                                <span className="w-9 h-9 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-amber-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </span>
                                <div>
                                    <h3 className="font-bold text-base text-gray-900">
                                        {t("justifiedAbsenceTitle")}
                                    </h3>
                                    <p className="text-xs text-gray-500">
                                        <Link
                                            href={`/list/students/${selectedJustification.studentId}`}
                                            className="hover:text-primary hover:underline transition-colors font-semibold text-gray-700"
                                        >
                                            {selectedJustification.studentName}
                                        </Link>{" "}
                                        • {selectedJustification.date}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedJustification(null)}
                                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <Image src="/close.png" alt="close" width={14} height={14} />
                            </button>
                        </div>

                        <div className="space-y-3 mb-6">
                            <div className="text-xs text-gray-600">
                                <span>{t("lesson")} : </span>
                                <span className="text-gray-900 font-bold">{selectedJustification.lessonName}</span>
                            </div>
                            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-amber-950 text-sm leading-relaxed">
                                <span className="font-bold text-amber-900 block text-xs mb-1">
                                    {t("justificationLabel")}
                                </span>
                                <p className="font-medium whitespace-pre-wrap">
                                    {selectedJustification.justification}
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setSelectedJustification(null)}
                                className="px-5 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                            >
                                {t("closeDialog")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AttendanceGrid;
