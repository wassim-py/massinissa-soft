"use client";

import { useState, useMemo, useEffect } from "react";
import { Student } from "@prisma/client";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useRouter } from "next/navigation";
import { LessonInstance, AttendanceCellDetail } from "@/app/[locale]/(dashboard)/list/attendance/class/[id]/page";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Search, X, Check, FileText, RotateCcw, Loader2 } from "lucide-react";
import { markSingleAttendanceAction, deleteSingleAttendanceAction } from "@/lib/actions";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/Badge";

export type StudentBalanceInfo = {
    isFormation: boolean;
    netSessions?: number;
    status?: "PAID" | "EXPIRING" | "UNPAID" | "SIBLING_WAIVED" | "NON_PAYER";
    hasPayerSibling?: boolean;
    levelPrice?: number;
    totalPaidFormation?: number;
    levelRemainingBalance?: number;
    isLevelPaid?: boolean;
    isLevelPartiallyPaid?: boolean;
};

function BalanceBadge({ balance, locale }: { balance: StudentBalanceInfo; locale: string }) {
    if (balance.isFormation) {
        if (balance.isLevelPaid) {
            return (
                <Badge
                    variant="success"
                    size="sm"
                    withDot
                    className="text-[10px] py-0 px-1.5 h-4.5 font-semibold leading-none shadow-2xs"
                    title={locale === "ar" ? "المستوى خالص بالكامل" : "Niveau payé en totalité"}
                >
                    {locale === "ar" ? "خالص بالكامل" : "Payé"}
                </Badge>
            );
        }
        if (balance.isLevelPartiallyPaid) {
            const rem = balance.levelRemainingBalance ?? 0;
            return (
                <Badge
                    variant="warning"
                    size="sm"
                    withDot
                    className="text-[10px] py-0 px-1.5 h-4.5 font-semibold leading-none shadow-2xs"
                    title={locale === "ar" ? `الرصيد المتبقي: ${rem.toLocaleString("ar-DZ")} دج` : `Solde restant : ${rem.toLocaleString("fr-DZ")} DZD`}
                >
                    {locale === "ar"
                        ? `متبقي ${rem.toLocaleString("ar-DZ")} دج`
                        : `Reste ${rem.toLocaleString("fr-DZ")} DZD`}
                </Badge>
            );
        }
        const price = balance.levelPrice ?? 0;
        return (
            <Badge
                variant="danger"
                size="sm"
                withDot
                className="text-[10px] py-0 px-1.5 h-4.5 font-semibold leading-none shadow-2xs"
                title={locale === "ar" ? `المستوى غير مدفوع: ${price.toLocaleString("ar-DZ")} دج` : `Niveau non payé : ${price.toLocaleString("fr-DZ")} DZD`}
            >
                {price > 0
                    ? (locale === "ar"
                        ? `غير مدفوع (${price.toLocaleString("ar-DZ")} دج)`
                        : `Non payé (${price.toLocaleString("fr-DZ")} DZD)`)
                    : (locale === "ar" ? "غير مدفوع" : "Non payé")}
            </Badge>
        );
    }

    // Regular support class
    if (balance.status === "NON_PAYER") {
        return (
            <Badge
                variant="success"
                size="sm"
                withDot
                className="text-[10px] py-0 px-1.5 h-4.5 font-semibold leading-none shadow-2xs"
                title={locale === "ar" ? "معفى من رسوم الحصص" : "Exonéré des frais de cours"}
            >
                {locale === "ar" ? "معفى" : "Exonéré"}
            </Badge>
        );
    }

    if (balance.status === "SIBLING_WAIVED") {
        return (
            <Badge
                variant="secondary"
                size="sm"
                withDot
                className="text-[10px] py-0 px-1.5 h-4.5 font-semibold leading-none shadow-2xs"
                title={locale === "ar" ? "إعفاء إخوة (أخ دافع)" : "Exonéré fratrie (Fratrie)"}
            >
                {locale === "ar" ? "إعفاء إخوة" : "Remise fratrie"}
            </Badge>
        );
    }

    const net = balance.netSessions ?? 0;
    if (net >= 2) {
        return (
            <Badge
                variant="success"
                size="sm"
                withDot
                className="text-[10px] py-0 px-1.5 h-4.5 font-semibold leading-none shadow-2xs"
                title={locale === "ar" ? `الرصيد المتبقي: ${net} حصص${balance.hasPayerSibling ? " (أخ دافع)" : ""}` : `Solde restant : ${net} séances${balance.hasPayerSibling ? " (Fratrie)" : ""}`}
            >
                {locale === "ar" ? `${net} حصص` : `${net} séances`}
            </Badge>
        );
    }

    if (net === 1) {
        return (
            <Badge
                variant="warning"
                size="sm"
                withDot
                className="text-[10px] py-0 px-1.5 h-4.5 font-semibold leading-none shadow-2xs"
                title={locale === "ar" ? "حصة واحدة متبقية (يتطلب التجديد)" : "1 séance restante (renouvellement requis)"}
            >
                {locale === "ar" ? "1 حصة متبقية" : "1 séance restante"}
            </Badge>
        );
    }

    return (
        <Badge
            variant="danger"
            size="sm"
            withDot
            className="text-[10px] py-0 px-1.5 h-4.5 font-semibold leading-none shadow-2xs"
            title={locale === "ar" ? `الرصيد المتبقي: ${net} حصة` : `Solde restant : ${net} séance`}
        >
            {net < 0
                ? (locale === "ar" ? `${net} حصة (دين)` : `${net} séances (dette)`)
                : (locale === "ar" ? "0 حصة" : "0 séance")}
        </Badge>
    );
}

type AttendanceGridProps = {
    students: (Student & {
        globalNumber?: number;
        phone?: string | null;
        balance?: StudentBalanceInfo;
        isTransferred?: boolean;
        transferredAt?: string | null;
    })[];
    lessonInstances: LessonInstance[];
    attendanceMap: Map<string, Map<string, AttendanceCellDetail | boolean>>;
};

const AttendanceGrid = ({ students, lessonInstances, attendanceMap }: AttendanceGridProps) => {
    const t = useTranslations("attendance");
    const locale = useLocale();
    const router = useRouter();

    const searchParams = useSearchParams();
    const initialSearch = searchParams?.get("search") || "";
    const [searchQuery, setSearchQuery] = useState(initialSearch);

    // Optimistic attendance map
    const [localAttendanceMap, setLocalAttendanceMap] = useState<Map<string, Map<string, AttendanceCellDetail | boolean>>>(attendanceMap);

    useEffect(() => {
        setLocalAttendanceMap(attendanceMap);
    }, [attendanceMap]);

    // Quick attendance popup state
    const [activePopup, setActivePopup] = useState<{
        studentId: string;
        studentName: string;
        lessonId: number;
        lessonKey: string;
        lessonName: string;
        date: string;
        currentStatus?: "PRESENT" | "ABSENT" | "NOT_DEFINED";
        currentJustification?: string;
        position: { top: number; left: number; isAbove: boolean };
    } | null>(null);

    const [justificationInput, setJustificationInput] = useState<string>("");
    const [showJustificationField, setShowJustificationField] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    // Close popup on Escape
    useEffect(() => {
        if (!activePopup) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setActivePopup(null);
                setShowJustificationField(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [activePopup]);

    const handleCircleClick = (
        e: React.MouseEvent<HTMLElement>,
        student: Student,
        instance: LessonInstance,
        currentDetail?: AttendanceCellDetail
    ) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();

        const popupWidth = 180;
        let left = rect.left + rect.width / 2 - popupWidth / 2;
        if (left < 10) left = 10;
        if (left + popupWidth > window.innerWidth - 10) {
            left = window.innerWidth - popupWidth - 10;
        }

        const isAbove = rect.top > 120;
        const top = isAbove ? rect.top - 8 : rect.bottom + 8;

        const currentStatus = currentDetail?.status;
        const currentJustification = currentDetail?.justification || "";

        setActivePopup({
            studentId: student.id,
            studentName: student.name,
            lessonId: instance.lessonId,
            lessonKey: instance.key,
            lessonName: instance.lessonName,
            date: instance.date,
            currentStatus,
            currentJustification,
            position: { top, left, isAbove },
        });

        const defaultNote = locale === "ar" ? "غياب مبرر" : "Absence justifiée";
        setJustificationInput(currentJustification || defaultNote);
        setShowJustificationField(currentStatus === "NOT_DEFINED");
    };

    const handleSelectStatus = async (status: "PRESENT" | "ABSENT" | "RESET") => {
        if (!activePopup) return;
        const { studentId, lessonKey, lessonId } = activePopup;
        const prevMap = localAttendanceMap;

        if (status === "RESET") {
            setLocalAttendanceMap((prev) => {
                const newMap = new Map(prev);
                const studentRecs = new Map(newMap.get(studentId) || []);
                studentRecs.delete(lessonKey);
                newMap.set(studentId, studentRecs);
                return newMap;
            });
            setActivePopup(null);
            setShowJustificationField(false);

            try {
                const res = await deleteSingleAttendanceAction({
                    lessonId,
                    studentId,
                });
                if (!res.success) {
                    setLocalAttendanceMap(prevMap);
                    toast.error(res.message);
                } else {
                    toast.success(res.message);
                    router.refresh();
                }
            } catch (err: any) {
                setLocalAttendanceMap(prevMap);
                toast.error(err?.message || "Erreur");
            }
        } else {
            setLocalAttendanceMap((prev) => {
                const newMap = new Map(prev);
                const studentRecs = new Map(newMap.get(studentId) || []);
                studentRecs.set(lessonKey, { status });
                newMap.set(studentId, studentRecs);
                return newMap;
            });
            setActivePopup(null);
            setShowJustificationField(false);

            try {
                const res = await markSingleAttendanceAction({
                    lessonId,
                    studentId,
                    status,
                });
                if (!res.success) {
                    setLocalAttendanceMap(prevMap);
                    toast.error(res.message);
                } else {
                    toast.success(res.message);
                    router.refresh();
                }
            } catch (err: any) {
                setLocalAttendanceMap(prevMap);
                toast.error(err?.message || "Erreur");
            }
        }
    };

    const handleSelectJustified = async () => {
        if (!activePopup) return;

        const defaultNote = locale === "ar" ? "غياب مبرر" : "Absence justifiée";
        const justificationToUse = justificationInput.trim() || defaultNote;
        setJustificationInput(justificationToUse);
        setShowJustificationField(true);

        if (activePopup.currentStatus !== "NOT_DEFINED") {
            const prevMap = localAttendanceMap;
            setLocalAttendanceMap((prev) => {
                const newMap = new Map(prev);
                const studentRecs = new Map(newMap.get(activePopup.studentId) || []);
                studentRecs.set(activePopup.lessonKey, {
                    status: "NOT_DEFINED",
                    justification: justificationToUse,
                });
                newMap.set(activePopup.studentId, studentRecs);
                return newMap;
            });

            setActivePopup((prev) =>
                prev
                    ? {
                          ...prev,
                          currentStatus: "NOT_DEFINED",
                          currentJustification: justificationToUse,
                      }
                    : null
            );

            setIsSaving(true);
            try {
                const res = await markSingleAttendanceAction({
                    lessonId: activePopup.lessonId,
                    studentId: activePopup.studentId,
                    status: "NOT_DEFINED",
                    justification: justificationToUse,
                });
                if (!res.success) {
                    setLocalAttendanceMap(prevMap);
                    toast.error(res.message);
                } else {
                    toast.success(res.message);
                    router.refresh();
                }
            } catch (err: any) {
                setLocalAttendanceMap(prevMap);
                toast.error(err?.message || "Erreur");
            } finally {
                setIsSaving(false);
            }
        }
    };

    const handleSaveCustomJustification = async () => {
        if (!activePopup || !justificationInput.trim()) return;

        const prevMap = localAttendanceMap;
        const newJustification = justificationInput.trim();

        setLocalAttendanceMap((prev) => {
            const newMap = new Map(prev);
            const studentRecs = new Map(newMap.get(activePopup.studentId) || []);
            studentRecs.set(activePopup.lessonKey, {
                status: "NOT_DEFINED",
                justification: newJustification,
            });
            newMap.set(activePopup.studentId, studentRecs);
            return newMap;
        });

        setIsSaving(true);
        try {
            const res = await markSingleAttendanceAction({
                lessonId: activePopup.lessonId,
                studentId: activePopup.studentId,
                status: "NOT_DEFINED",
                justification: newJustification,
            });
            if (!res.success) {
                setLocalAttendanceMap(prevMap);
                toast.error(res.message);
            } else {
                toast.success(res.message);
                router.refresh();
                setActivePopup(null);
                setShowJustificationField(false);
            }
        } catch (err: any) {
            setLocalAttendanceMap(prevMap);
            toast.error(err?.message || "Erreur");
        } finally {
            setIsSaving(false);
        }
    };

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
                            placeholder={t.has("searchStudentPlaceholder") ? t("searchStudentPlaceholder") : (locale === "ar" ? "البحث باسم التلميذ أو رقمه..." : "Rechercher par nom ou identifiant...")}
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
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block shadow-2xs"></span>
                        <span>{locale === "ar" ? "حصة مجانية (عمود مميز)" : "Séance gratuite"}</span>
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
                            {[...lessonInstances].reverse().map((instance) => {
                                const isFree = Boolean(instance.isFree);
                                const isExtra = Boolean(instance.isExtra);
                                const isCatchUp = Boolean(instance.isCatchUp);

                                return (
                                    <th
                                        key={instance.key}
                                        className={`p-2.5 sm:p-3 text-table-header font-semibold text-center min-w-[85px] sm:min-w-[120px] sticky top-0 z-20 shadow-[0_2px_4px_-2px_rgba(0,0,0,0.06)] border-b-2 ${
                                            isFree
                                                ? "bg-amber-100/90 text-amber-950 border-amber-400"
                                                : "bg-surface-muted text-muted border-border"
                                        }`}
                                    >
                                        <Link
                                            href={`/list/attendance/take/${instance.lessonId}?date=${encodeURIComponent(instance.date)}`}
                                            className="flex flex-col items-center group/col hover:text-primary transition-colors gap-1"
                                            title={
                                                locale === "ar"
                                                    ? `تعديل حضور حصة ${formatDateHeader(instance.date)}`
                                                    : `Modifier la présence du ${formatDateHeader(instance.date)}`
                                            }
                                        >
                                            <span className={`font-bold group-hover/col:text-primary group-hover/col:underline ${isFree ? "text-amber-950" : "text-gray-800"}`}>
                                                {instance.lessonName}
                                            </span>
                                            <span className={`font-normal text-form-helper group-hover/col:text-primary/80 ${isFree ? "text-amber-900/80" : "text-muted"}`}>
                                                {formatDateHeader(instance.date)}
                                            </span>

                                            {/* Lesson Type Badge under date */}
                                            {isFree ? (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white shadow-2xs">
                                                    {locale === "ar" ? "مجانية" : "Gratuit"}
                                                </span>
                                            ) : isExtra ? (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-600 text-white shadow-2xs">
                                                    {locale === "ar" ? "إضافية" : "Extra"}
                                                </span>
                                            ) : isCatchUp ? (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white shadow-2xs">
                                                    {locale === "ar" ? "استدراكية" : "Rattrapage"}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-700 shadow-2xs">
                                                    {locale === "ar" ? "عادية" : "Normale"}
                                                </span>
                                            )}
                                        </Link>
                                    </th>
                                );
                            })}
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
                                const isTransferred = Boolean(student.isTransferred);
                                const rowBg = isTransferred
                                    ? "bg-pink-50/80 dark:bg-pink-950/20"
                                    : studentIndex % 2 === 0
                                    ? "bg-surface"
                                    : "bg-surface-muted";
                                const rowHover = isTransferred
                                    ? "hover:bg-pink-100/70 dark:hover:bg-pink-950/40"
                                    : "hover:bg-surface-subtle";
                                return (
                                    <tr
                                        key={`${student.id}-${studentIndex}`}
                                        className={`group ${rowBg} ${rowHover} transition-colors`}
                                    >
                                        {/* Sticky Student Column Cell */}
                                        <td className={`p-2 sm:p-3 text-table-body font-medium text-gray-900 border-b border-e border-border sticky start-0 ltr:left-0 rtl:right-0 z-10 w-44 sm:w-64 min-w-[150px] sm:min-w-[220px] ${rowBg} group-hover:${rowHover} transition-colors shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] rtl:shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]`}>
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
                                                <div className="flex flex-col min-w-0 items-start gap-0.5">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="truncate max-w-[110px] sm:max-w-[160px] group-hover:underline group-hover:text-primary transition-colors">
                                                            {student.name}
                                                        </span>
                                                        {isTransferred && (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-pink-100 text-pink-700 border border-pink-300 dark:bg-pink-950/60 dark:text-pink-300 dark:border-pink-800 shadow-2xs">
                                                                {locale === "ar" ? "محول" : "Transféré"}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {student.globalNumber ? (
                                                            <span className="text-[10px] text-muted font-mono leading-none">
                                                                #{student.globalNumber}
                                                            </span>
                                                        ) : null}
                                                        {student.balance && (
                                                            <BalanceBadge balance={student.balance} locale={locale} />
                                                        )}
                                                    </div>
                                                </div>
                                            </Link>
                                        </td>

                                        {/* Lesson Attendance Cells */}
                                        {[...lessonInstances].reverse().map((instance) => {
                                            const isFree = Boolean(instance.isFree);
                                            const cellBg = isFree ? "bg-amber-50/70" : isTransferred ? "bg-pink-50/30" : "";
                                            const studentRecords = localAttendanceMap.get(student.id);
                                            const rawRecord = studentRecords
                                                ? studentRecords.get(instance.key)
                                                : undefined;

                                            const isActiveCell =
                                                activePopup?.studentId === student.id &&
                                                activePopup?.lessonKey === instance.key;

                                            // Lessons strictly after the transfer date for a transferred student without records
                                            const isAfterTransfer = Boolean(
                                                isTransferred &&
                                                student.transferredAt &&
                                                new Date(instance.startsAt || `${instance.date}T23:59:59.999Z`).getTime() > new Date(student.transferredAt).getTime() &&
                                                !rawRecord
                                            );

                                            if (isAfterTransfer) {
                                                return (
                                                    <td
                                                        key={`${student.id}-${instance.key}-${studentIndex}`}
                                                        className={`p-3 text-center border-b border-border ${cellBg}`}
                                                    >
                                                        <div
                                                            className="w-5 h-5 mx-auto flex items-center justify-center text-muted/40 font-mono text-xs select-none cursor-not-allowed"
                                                            title={locale === "ar" ? "تم تحويل التلميذ قبل هذا الدرس" : "Élève transféré avant cette séance"}
                                                        >
                                                            —
                                                        </div>
                                                    </td>
                                                );
                                            }

                                            if (!rawRecord) {
                                                // No attendance record recorded for this lesson
                                                return (
                                                    <td
                                                        key={`${student.id}-${instance.key}-${studentIndex}`}
                                                        className={`p-3 text-center border-b border-border ${cellBg}`}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleCircleClick(e, student, instance)}
                                                            className={`w-5 h-5 mx-auto rounded-full bg-surface-subtle border ${
                                                                isFree ? "border-amber-300" : "border-border"
                                                            } hover:scale-125 hover:border-primary focus:outline-none transition-all cursor-pointer block shadow-2xs ${
                                                                isActiveCell ? "ring-2 ring-primary ring-offset-2 scale-125" : ""
                                                            }`}
                                                            title={locale === "ar" ? "تسجيل الحضور" : "Enregistrer la présence"}
                                                        />
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
                                                        className={`p-3 text-center border-b border-border ${cellBg}`}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleCircleClick(e, student, instance, record)}
                                                            className={`w-5 h-5 mx-auto rounded-full bg-rose-500 ring-2 ring-rose-200 shadow-2xs hover:scale-125 focus:outline-none transition-all cursor-pointer block ${
                                                                isActiveCell ? "ring-2 ring-primary ring-offset-2 scale-125" : ""
                                                            }`}
                                                            title={locale === "ar" ? "أستاذ غائب (الرصيد غير مخصوم) - انقر للتعديل" : "Professeur absent (crédit préservé) - Cliquer pour modifier"}
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
                                                        className={`p-3 text-center border-b border-border ${cellBg}`}
                                                    >
                                                        <div className="relative group/catchup inline-flex items-center justify-center">
                                                            <button
                                                                type="button"
                                                                onClick={(e) => handleCircleClick(e, student, instance, record)}
                                                                className={`w-5 h-5 rounded-full bg-blue-600 hover:bg-blue-700 ring-2 ring-blue-300 ring-offset-1 transition-all hover:scale-125 cursor-pointer shadow-xs focus:outline-none block ${
                                                                    isActiveCell ? "ring-2 ring-primary ring-offset-2 scale-125" : ""
                                                                }`}
                                                                title={`${tooltipText} - ${locale === "ar" ? "انقر للتعديل" : "Cliquer pour modifier"}`}
                                                            />
                                                            {/* Interactive Hover Tooltip */}
                                                            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/catchup:flex flex-col items-center z-40 min-w-[180px] max-w-xs transition-all">
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
                                                        className={`p-3 text-center border-b border-border ${cellBg}`}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleCircleClick(e, student, instance, record)}
                                                            className={`w-5 h-5 mx-auto rounded-full bg-success shadow-2xs hover:scale-125 hover:ring-2 hover:ring-emerald-300 focus:outline-none transition-all cursor-pointer block ${
                                                                isActiveCell ? "ring-2 ring-primary ring-offset-2 scale-125" : ""
                                                            }`}
                                                            title={`${t("legendPresent")} - ${locale === "ar" ? "انقر للتعديل" : "Cliquer pour modifier"}`}
                                                        />
                                                    </td>
                                                );
                                            }

                                            if (record.status === "NOT_DEFINED") {
                                                // Orange circle: NOT_DEFINED
                                                return (
                                                    <td
                                                        key={`${student.id}-${instance.key}-${studentIndex}`}
                                                        className={`p-3 text-center border-b border-border ${cellBg}`}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleCircleClick(e, student, instance, record)}
                                                            className={`w-5 h-5 mx-auto rounded-full bg-amber-500 hover:bg-amber-600 focus:outline-none ring-2 ring-amber-300 ring-offset-1 transition-all hover:scale-125 cursor-pointer shadow-xs block ${
                                                                isActiveCell ? "ring-2 ring-primary ring-offset-2 scale-125" : ""
                                                            }`}
                                                            title={`${t("legendJustified")}: ${record.justification || t("noJustificationRecorded")} - ${locale === "ar" ? "انقر للتعديل" : "Cliquer pour modifier"}`}
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
                                                        className={`p-3 text-center border-b border-border ${cellBg}`}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleCircleClick(e, student, instance, record)}
                                                            className={`w-5 h-5 mx-auto rounded-full bg-slate-200 border-2 border-slate-400/80 shadow-2xs hover:scale-125 focus:outline-none transition-all cursor-pointer block ${
                                                                isActiveCell ? "ring-2 ring-primary ring-offset-2 scale-125" : ""
                                                            }`}
                                                            title={`${locale === "ar" ? "غياب قبل أول حضور (محايد)" : "Absence avant premier cours (neutre)"} - ${locale === "ar" ? "انقر للتعديل" : "Cliquer pour modifier"}`}
                                                        />
                                                    </td>
                                                );
                                            }

                                            // Red circle: absent, no catch-up recorded
                                            return (
                                                <td
                                                    key={`${student.id}-${instance.key}-${studentIndex}`}
                                                    className={`p-3 text-center border-b border-border ${cellBg}`}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleCircleClick(e, student, instance, record)}
                                                        className={`w-5 h-5 mx-auto rounded-full bg-danger shadow-2xs hover:scale-125 hover:ring-2 hover:ring-rose-300 focus:outline-none transition-all cursor-pointer block ${
                                                            isActiveCell ? "ring-2 ring-primary ring-offset-2 scale-125" : ""
                                                        }`}
                                                        title={`${t("legendAbsent")} - ${locale === "ar" ? "انقر للتعديل" : "Cliquer pour modifier"}`}
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

            {/* Quick Attendance Popup Container */}
            {activePopup && (
                <>
                    {/* Backdrop to dismiss when clicking outside */}
                    <div
                        className="fixed inset-0 z-40 bg-black/5"
                        onClick={() => {
                            setActivePopup(null);
                            setShowJustificationField(false);
                        }}
                    />

                    {/* Compact Container showing only attendance circles */}
                    <div
                        id="quick-attendance-popup"
                        style={{
                            top: `${activePopup.position.top}px`,
                            left: `${activePopup.position.left}px`,
                        }}
                        className={`fixed z-50 bg-white border border-border/90 shadow-2xl rounded-2xl p-2 flex flex-col gap-1.5 min-w-[170px] animate-in fade-in zoom-in-95 duration-100 ${
                            activePopup.position.isAbove ? "-translate-y-full" : ""
                        }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Attendance Circles Row */}
                        <div className="flex items-center justify-center gap-2.5 px-1 py-0.5">
                            {/* Present Circle (Green) */}
                            <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleSelectStatus("PRESENT")}
                                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-success hover:bg-success/90 flex items-center justify-center text-white shadow-xs transition-transform hover:scale-115 active:scale-95 cursor-pointer disabled:opacity-50 ${
                                    activePopup.currentStatus === "PRESENT"
                                        ? "ring-2 ring-success ring-offset-2 ring-offset-white"
                                        : ""
                                }`}
                                title={locale === "ar" ? "حاضر" : "Présent"}
                            >
                                <Check className="w-4 h-4 stroke-[2.5]" />
                            </button>

                            {/* Absent Circle (Red) */}
                            <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleSelectStatus("ABSENT")}
                                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-danger hover:bg-danger/90 flex items-center justify-center text-white shadow-xs transition-transform hover:scale-115 active:scale-95 cursor-pointer disabled:opacity-50 ${
                                    activePopup.currentStatus === "ABSENT"
                                        ? "ring-2 ring-danger ring-offset-2 ring-offset-white"
                                        : ""
                                }`}
                                title={locale === "ar" ? "غائب" : "Absent"}
                            >
                                <X className="w-4 h-4 stroke-[2.5]" />
                            </button>

                            {/* Justified Circle (Amber) */}
                            <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleSelectJustified()}
                                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-amber-500 hover:bg-amber-600 flex items-center justify-center text-white shadow-xs transition-transform hover:scale-115 active:scale-95 cursor-pointer disabled:opacity-50 ${
                                    activePopup.currentStatus === "NOT_DEFINED"
                                        ? "ring-2 ring-amber-500 ring-offset-2 ring-offset-white"
                                        : ""
                                }`}
                                title={locale === "ar" ? "مبرر" : "Justifié"}
                            >
                                <FileText className="w-3.5 h-3.5" />
                            </button>

                            {/* Clear / Reset Circle (Dashed Empty) */}
                            <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleSelectStatus("RESET")}
                                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-surface-subtle hover:bg-gray-200 border-2 border-dashed border-gray-400 hover:border-gray-600 flex items-center justify-center text-gray-600 shadow-xs transition-transform hover:scale-115 active:scale-95 cursor-pointer disabled:opacity-50 ${
                                    !activePopup.currentStatus
                                        ? "ring-2 ring-gray-400 ring-offset-2 ring-offset-white"
                                        : ""
                                }`}
                                title={locale === "ar" ? "إلغاء التحديد" : "Réinitialiser"}
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Optional Justification Note Field when Amber is active */}
                        {showJustificationField && (
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    handleSaveCustomJustification();
                                }}
                                className="flex items-center gap-1.5 pt-1.5 border-t border-border animate-in fade-in duration-150"
                            >
                                <input
                                    type="text"
                                    value={justificationInput}
                                    onChange={(e) => setJustificationInput(e.target.value)}
                                    placeholder={locale === "ar" ? "سبب التبرير..." : "Motif..."}
                                    className="text-xs px-2 py-1 bg-surface border border-border rounded-md text-gray-800 placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-amber-500 flex-1 min-w-0"
                                    autoFocus
                                />
                                <button
                                    type="submit"
                                    disabled={isSaving || !justificationInput.trim()}
                                    className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-xs font-bold transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                                    title={locale === "ar" ? "حفظ التبرير" : "Enregistrer"}
                                >
                                    {isSaving ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                    )}
                                </button>
                            </form>
                        )}
                    </div>
                </>
            )}

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
