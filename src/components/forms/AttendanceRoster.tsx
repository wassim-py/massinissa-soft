"use client";

import { Student, Attendance, Voucher, Lesson, Class, Teacher } from "@prisma/client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { saveAttendance, removeCatchUpAttendanceAction, markSingleAttendanceAction } from "@/lib/actions";
import { executeWithRetry } from "@/lib/retryUtils";
import { toast } from "react-toastify";
import { useTranslations, useLocale } from "next-intl";
import PaymentForm from "./PaymentForm";
import PrintTicketButton from "../PrintTicketButton";
import CatchUpVisitorModal from "./CatchUpVisitorModal";
import { BookOpen, Check, X, Minus, ChevronDown } from "lucide-react";
import { toggleBookReceiptAction } from "@/lib/bookActions";
import { Badge } from "@/components/ui/Badge";
import BookStatusBadge, { computeBookStatus, BookDetailItem } from "@/components/books/BookStatusBadge";

const SubmitButton = () => {
  const { pending } = useFormStatus();
  const t = useTranslations("attendance");
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full sm:w-auto text-base font-bold bg-blue-600 hover:bg-blue-700 text-white py-3 sm:py-2.5 px-8 rounded-lg transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed shadow-sm"
    >
      {pending ? t("saving") : t("saveAttendanceAndBooks")}
    </button>
  );
};

export type AttendanceStatus = "PRESENT" | "ABSENT" | "NOT_DEFINED";

export interface BookWithPendingDrops {
  id: number;
  title: string;
  totalUndistributed: number;
  hasPendingDrop: boolean;
  distributedStudentIds: string[];
}

export interface CatchUpVisitor {
  id: number;
  studentId: string;
  studentName: string;
  globalNumber: number;
  missedLessonId: number;
  missedClassName: string;
  missedTeacherName: string;
  missedStartsAt: string | Date;
  recordedAt: string | Date;
}

type FullStudent = Student & {
  vouchers: Voucher[];
  attendances: Attendance[];
  family?: { payerStudentId: string | null } | null;
  isBookEligible?: boolean;
  hasPaidBook?: boolean;
  receivedBookIds?: number[];
  outstandingBooks?: Array<{ id: number; title: string }>;
  bookDetails?: Array<{ id: number; title: string; received: boolean; receivedAt?: string | Date | null }>;
};

type FullLesson = Lesson & {
  class: Class & { price?: number };
  teacher: Teacher & { surname?: string };
  subject?: { id: number; name: string };
};

const AttendanceRoster = ({
  lesson,
  students,
  existingRecords,
  booksWithDrops = [],
  groupBooks = [],
  catchUpVisitors = [],
  initialSearch = "",
}: {
  lesson: FullLesson;
  students: FullStudent[];
  existingRecords: (Attendance & { present?: boolean })[];
  booksWithDrops?: BookWithPendingDrops[];
  groupBooks?: Array<{ id: number; title: string }>;
  catchUpVisitors?: CatchUpVisitor[];
  initialSearch?: string;
}) => {
  const t = useTranslations("attendance");
  const tSearch = useTranslations("search");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [searchTerm, setSearchTerm] = useState(initialSearch || "");
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch || "");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const cleanSearch = debouncedSearch.trim().toLowerCase();
  const cleanNumeric = cleanSearch.replace(/[^0-9]/g, "");

  const filteredStudents = students.filter((student) => {
    if (!cleanSearch) return true;
    const matchName = student.name.toLowerCase().includes(cleanSearch);
    const matchId =
      cleanNumeric && student.globalNumber !== undefined && student.globalNumber !== null
        ? String(student.globalNumber).includes(cleanNumeric)
        : false;
    const matchPhone =
      cleanSearch && student.phone
        ? student.phone.toLowerCase().includes(cleanSearch)
        : false;
    return matchName || matchId || matchPhone;
  });

  const filteredCatchUpVisitors = catchUpVisitors.filter((visitor) => {
    if (!cleanSearch) return true;
    const matchName = visitor.studentName.toLowerCase().includes(cleanSearch);
    const matchId =
      cleanNumeric && visitor.globalNumber !== undefined && visitor.globalNumber !== null
        ? String(visitor.globalNumber).includes(cleanNumeric)
        : false;
    return matchName || matchId;
  });

  // Quick book handout state: Map of studentId -> array of received book IDs
  const [studentReceivedBooks, setStudentReceivedBooks] = useState<Record<string, number[]>>(() => {
    const initial: Record<string, number[]> = {};
    students.forEach((s) => {
      initial[s.id] = s.receivedBookIds ? [...s.receivedBookIds] : [];
    });
    return initial;
  });

  const [activeChecklistStudentId, setActiveChecklistStudentId] = useState<string | null>(null);
  const checklistRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (checklistRef.current && !checklistRef.current.contains(e.target as Node)) {
        setActiveChecklistStudentId(null);
      }
    };
    if (activeChecklistStudentId) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activeChecklistStudentId]);

  const handleToggleBookHandout = async (studentId: string, bookId: number, isCurrentlyReceived: boolean) => {
    const currentReceived = studentReceivedBooks[studentId] || [];
    const nextVal = !isCurrentlyReceived;
    const nextReceived = nextVal
      ? [...currentReceived, bookId]
      : currentReceived.filter((id) => id !== bookId);

    // Optimistic update
    setStudentReceivedBooks((prev) => ({
      ...prev,
      [studentId]: nextReceived,
    }));

    try {
      const res = await executeWithRetry(() =>
        toggleBookReceiptAction({
          studentId,
          bookId,
          received: nextVal,
          classId: lesson.class.id,
        })
      );

      if (res.success) {
        toast.success(res.message);
      } else {
        setStudentReceivedBooks((prev) => ({
          ...prev,
          [studentId]: currentReceived,
        }));
        toast.error(res.message);
      }
    } catch (err: any) {
      setStudentReceivedBooks((prev) => ({
        ...prev,
        [studentId]: currentReceived,
      }));
      toast.error(err?.message || "Erreur de remise du livre");
    }
  };

  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(() => {
    const initialState: Record<string, AttendanceStatus> = {};
    students.forEach((student) => {
      const record = existingRecords.find((r) => r.studentId === student.id);
      if (record?.status === "PRESENT") {
        initialState[student.id] = "PRESENT";
      } else if (record?.status === "NOT_DEFINED") {
        initialState[student.id] = "NOT_DEFINED";
      } else {
        initialState[student.id] = "ABSENT";
      }
    });
    return initialState;
  });


  const [justifications, setJustifications] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    students.forEach((student) => {
      const record = existingRecords.find((r) => r.studentId === student.id);
      if (record?.justification) {
        initial[student.id] = record.justification;
      }
    });
    return initial;
  });

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<FullStudent | null>(null);
  const [isCatchUpModalOpen, setIsCatchUpModalOpen] = useState(false);
  const [deletingVisitorId, setDeletingVisitorId] = useState<number | null>(null);

  const handleRemoveVisitor = async (visitorId: number) => {
    if (!confirm(t("confirmCancelVisitor"))) return;
    setDeletingVisitorId(visitorId);
    try {
      const res = await executeWithRetry(() => removeCatchUpAttendanceAction(visitorId, lesson.id));
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err.message || t("failedToRemoveVisitor"));
    } finally {
      setDeletingVisitorId(null);
    }
  };

  // Free session confirmation popup state
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const isConfirmedRef = useRef(false);

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    const previousStatus = attendance[studentId];
    setAttendance((prev) => ({ ...prev, [studentId]: status }));

    // Optimistically persist to DB with retry if status is PRESENT or ABSENT
    // (If NOT_DEFINED, justification must be provided before it can be persisted)
    if (status === "PRESENT" || status === "ABSENT") {
      executeWithRetry(() =>
        markSingleAttendanceAction({
          lessonId: lesson.id,
          studentId,
          status,
        })
      )
        .then((res) => {
          if (!res.success) {
            setAttendance((prev) => ({ ...prev, [studentId]: previousStatus }));
            toast.error(res.message);
          }
        })
        .catch((err) => {
          setAttendance((prev) => ({ ...prev, [studentId]: previousStatus }));
          toast.error(err?.message || "Erreur de mise à jour de présence");
        });
    }
  };

  const handleRecordPaymentClick = (student: FullStudent) => {
    setSelectedStudent(student);
    setIsPaymentModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    // Validate mandatory justification for any student marked NOT_DEFINED
    const missingJustification = students.find(
      (s) => attendance[s.id] === "NOT_DEFINED" && !justifications[s.id]?.trim()
    );

    if (missingJustification) {
      e.preventDefault();
      toast.error(t("justificationRequired"));
      const inputEl = document.getElementById(`justification-${missingJustification.id}`);
      inputEl?.focus();
      return;
    }

    if (lesson.isFree && !isConfirmedRef.current) {
      e.preventDefault();
      setIsConfirmModalOpen(true);
      return;
    }
    isConfirmedRef.current = false;
  };

  const handleConfirmSave = () => {
    setIsConfirmModalOpen(false);
    isConfirmedRef.current = true;
    formRef.current?.requestSubmit();
  };

  const saveAttendanceWithId = saveAttendance.bind(null, lesson.id);
  const [state, formAction] = useActionState(saveAttendanceWithId, {
    success: false,
    error: false,
    message: "",
  });

  useEffect(() => {
    if (state?.success) {
      toast.success(state.message);
    }
    if (state?.error) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <>
      {/* Page Header: Title, Group Badges, and Smart Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border pb-4 mb-6 gap-4 mt-2 font-sans">
        <div>
          <h1 className="text-page-title text-gray-900">
            {t("attendanceFor", { group: lesson.class.name })}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-3 text-table-body">
            <Badge variant="primary" size="md">
              {t("group")}: {lesson.class.name}
            </Badge>
            <Badge variant="accent" size="md">
              {locale === "ar"
                ? `السعر: ${Number(lesson.class.pricePerCycle || lesson.class.inscriptionFee || 0)} DZD`
                : `Prix : ${Number(lesson.class.pricePerCycle || lesson.class.inscriptionFee || 0)} DZD`}
            </Badge>
            {lesson.subject?.name && (
              <Badge variant="secondary" size="md">
                {t("subject")}: {lesson.subject.name}
              </Badge>
            )}
            <Badge variant="neutral" size="md">
              {t("teacher")}: {lesson.teacher.name}
            </Badge>
            <span className="text-form-helper text-muted ms-1">
              {new Date().toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        </div>

        {/* Smart Search Bar */}
        <div className="w-full md:w-auto flex items-center gap-2 text-table-body rounded-lg border border-border bg-surface px-3 py-1.5 shadow-xs focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <Image src="/search.png" alt="" width={14} height={14} className="opacity-60 shrink-0" />
          <input
            type="text"
            placeholder={tSearch("studentsPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-[260px] md:w-[280px] p-0 bg-transparent outline-none text-gray-800 placeholder:text-muted text-table-body"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="text-muted hover:text-gray-700 transition-colors p-0.5 rounded-full hover:bg-surface-subtle cursor-pointer"
              title={tSearch("clearSearch")}
              aria-label={tSearch("clearSearch")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Free Session Info Banner */}
      {lesson.isFree && (
        <div className="p-3.5 mb-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl flex items-center justify-between gap-3 text-emerald-950 text-sm shadow-xs font-sans">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block shrink-0"></span>
            <div>
              <strong className="font-bold">{t("freeSessionNoticeTitle")}</strong> {t("freeSessionNoticeBody")}
            </div>
          </div>
          <span className="bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-xs">
            {t("freeBadge")}
          </span>
        </div>
      )}

      {lesson.isExtra && (
        <div className="p-3 mb-4 bg-purple-50 border border-purple-200 rounded-lg text-purple-900 text-xs flex items-center gap-2 font-sans">
          <span className="bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">{t("extraBadge")}</span>
          <span>{t("extraSessionNotice")}</span>
        </div>
      )}

      {lesson.isCatchUp && (
        <div className="p-3 mb-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-center gap-2 font-sans">
          <span className="bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">{t("catchUpBadge")}</span>
          <span>{t("catchUpSessionNotice")}</span>
        </div>
      )}

      {/* Top action bar: Summary and Catch-Up Visitor entry point (§2.12) */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 bg-gray-50 border border-gray-200 rounded-xl font-sans">
        <div className="flex items-center gap-2 text-xs text-gray-600 flex-wrap">
          <span>{t("totalGroupStudents", { count: students.length })}</span>
          {cleanSearch && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-semibold rounded-full text-[11px]">
              {locale === "ar"
                ? `${filteredStudents.length} تم العثور عليهم`
                : `${filteredStudents.length} trouvé(s)`}
            </span>
          )}
          {catchUpVisitors.length > 0 && (
            <span className="text-amber-700 font-medium">
              {t("catchUpVisitorsCount", { count: catchUpVisitors.length })}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsCatchUpModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition-colors shadow-xs cursor-pointer"
        >
          <span>{t("addCatchUpStudentBtn")}</span>
        </button>
      </div>

      <div className="space-y-3 font-sans">
        {filteredStudents.length === 0 ? (
          <div className="p-8 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-300 font-sans">
            <p className="text-sm font-medium text-gray-600">
              {locale === "ar"
                ? `لم يتم العثور على أي تلميذ يطابق "${searchTerm}".`
                : `Aucun élève ne correspond à "${searchTerm}".`}
            </p>
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
            >
              {locale === "ar" ? "مسح البحث" : "Effacer la recherche"}
            </button>
          </div>
        ) : (
          filteredStudents.map((student) => {
            const currentStatus = attendance[student.id];

            const isSiblingWaived = Boolean(
              student.family &&
              student.family.payerStudentId &&
              student.family.payerStudentId !== student.id
            );

            const activeTuitionVouchers = (student.vouchers || []).filter(
              (v) => !v.isVoided && v.paymentType === "TUITION_4SESSION"
            );
            const cyclePrice = Number((lesson.class as any)?.pricePerCycle || (lesson.class as any)?.price || 0);
            const lessonPrice = cyclePrice > 0 ? cyclePrice / 4 : 0;
            let sessionsPurchased = 0;
            if (isSiblingWaived) {
              sessionsPurchased = 16;
            } else if (lessonPrice > 0) {
              const totalPaidTuition = activeTuitionVouchers.reduce(
                (sum, v) => sum + Math.max(0, Number(v.amount || 0)),
                0
              );
              sessionsPurchased = Math.floor(totalPaidTuition / lessonPrice);
            } else {
              sessionsPurchased = activeTuitionVouchers.length * 4;
            }
            const sessionsConsumed = (student.attendances || []).filter((a) => a.status === "PRESENT").length;
            const sessionsRemaining = sessionsPurchased - sessionsConsumed;

            let statusBubble = { text: t("unpaidDue"), color: "bg-red-500" };
            if (isSiblingWaived) {
              statusBubble = { text: t("waivedSibling"), color: "bg-purple-600" };
            } else if (sessionsRemaining >= 2) {
              statusBubble = { text: t("paidGood"), color: "bg-green-500" };
            } else if (sessionsRemaining >= 1) {
              statusBubble = { text: t("expiringSoon"), color: "bg-yellow-500" };
            }

            const mostRecentVoucher =
              student.vouchers.length > 0
                ? student.vouchers.reduce((latest, current) =>
                    new Date(current.issuedAt) > new Date(latest.issuedAt) ? current : latest
                  )
                : null;

            const currentReceivedSet = new Set(studentReceivedBooks[student.id] || []);
            const allGroupBooks =
              groupBooks && groupBooks.length > 0
                ? groupBooks
                : booksWithDrops.map((b) => ({ id: b.id, title: b.title }));
            const studentReceivedCount = allGroupBooks.filter((b) => currentReceivedSet.has(b.id)).length;
            const studentBookDetails: BookDetailItem[] = allGroupBooks.map((b) => ({
              id: b.id,
              title: b.title,
              received: currentReceivedSet.has(b.id),
              receivedAt: student.bookDetails?.find((d) => d.id === b.id)?.receivedAt,
            }));
            const computedBookStatus = computeBookStatus(
              !!student.hasPaidBook,
              studentReceivedCount,
              allGroupBooks.length
            );

            return (
              <div
                key={student.id}
                className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                  currentStatus === "PRESENT"
                    ? "bg-emerald-50/40 border-emerald-300 shadow-2xs"
                    : currentStatus === "NOT_DEFINED"
                    ? "bg-blue-50/30 border-blue-200 shadow-2xs"
                    : "bg-white border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        handleStatusChange(
                          student.id,
                          currentStatus === "PRESENT" ? "ABSENT" : "PRESENT"
                        )
                      }
                      title={
                        locale === "ar"
                          ? `رقم المعرف: #${student.globalNumber ?? student.id} (انقر للتبديل بين حاضر وغائب)`
                          : `N° ID : #${student.globalNumber ?? student.id} (Cliquer pour basculer présent/absent)`
                      }
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs shrink-0 cursor-pointer select-none transition-all duration-150 active:scale-95 hover:opacity-90 ${
                        currentStatus === "PRESENT"
                          ? "bg-emerald-600 text-white shadow-2xs ring-2 ring-emerald-500/25"
                          : currentStatus === "NOT_DEFINED"
                          ? "bg-blue-600 text-white shadow-2xs ring-2 ring-blue-500/25"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
                      }`}
                    >
                      <span className="font-mono text-xs font-bold leading-none tracking-tight">
                        #{student.globalNumber ?? student.id}
                      </span>
                    </button>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900 text-sm">{student.name}</span>
                        <span className={`w-2 h-2 rounded-full ${statusBubble.color}`}></span>
                        {student.phone && (
                          <span className="text-[11px] text-gray-400 font-mono">
                            {student.phone}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <span>{statusBubble.text}</span>
                        <span>•</span>
                        <span>
                          {isSiblingWaived
                            ? t("tuitionWaivedSibling")
                            : t("sessionsCount", { remaining: Math.max(0, sessionsRemaining), total: sessionsPurchased })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Restyled Attendance Buttons: Green (Present) / Red (Absent) / Blue (Not defined) */}
                    <div className="inline-flex items-center p-1 bg-gray-100/90 rounded-xl border border-gray-200/80 gap-1 w-full sm:w-auto shadow-2xs">
                      {/* Present Button (Green) */}
                      <button
                        type="button"
                        onClick={() => handleStatusChange(student.id, "PRESENT")}
                        className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-150 select-none cursor-pointer active:scale-[0.98] ${
                          currentStatus === "PRESENT"
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs ring-2 ring-emerald-500/25 border border-emerald-600"
                            : "bg-emerald-50/70 text-emerald-800 border border-emerald-200/70 hover:bg-emerald-100 hover:border-emerald-300"
                        }`}
                      >
                        <Check className={`w-3.5 h-3.5 stroke-[2.5] ${currentStatus === "PRESENT" ? "text-white" : "text-emerald-700"}`} />
                        <span>{t("present")}</span>
                      </button>

                      {/* Absent Button (Red) */}
                      <button
                        type="button"
                        onClick={() => handleStatusChange(student.id, "ABSENT")}
                        className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-150 select-none cursor-pointer active:scale-[0.98] ${
                          currentStatus === "ABSENT"
                            ? "bg-rose-600 hover:bg-rose-700 text-white shadow-xs ring-2 ring-rose-500/25 border border-rose-600"
                            : "bg-rose-50/70 text-rose-800 border border-rose-200/70 hover:bg-rose-100 hover:border-rose-300"
                        }`}
                      >
                        <X className={`w-3.5 h-3.5 stroke-[2.5] ${currentStatus === "ABSENT" ? "text-white" : "text-rose-700"}`} />
                        <span>{t("absent")}</span>
                      </button>

                      {/* Not-Defined Button (Blue) */}
                      <button
                        type="button"
                        onClick={() => handleStatusChange(student.id, "NOT_DEFINED")}
                        className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-150 select-none cursor-pointer active:scale-[0.98] ${
                          currentStatus === "NOT_DEFINED"
                            ? "bg-blue-600 hover:bg-blue-700 text-white shadow-xs ring-2 ring-blue-500/25 border border-blue-600"
                            : "bg-blue-50/70 text-blue-800 border border-blue-200/70 hover:bg-blue-100 hover:border-blue-300"
                        }`}
                        title={t("notDefinedTooltip")}
                      >
                        <Minus className={`w-3.5 h-3.5 stroke-[2.5] ${currentStatus === "NOT_DEFINED" ? "text-white" : "text-blue-700"}`} />
                        <span>{t("notDefined")}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Book Status Badge and Toggle Controls */}
                      {allGroupBooks.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <BookStatusBadge
                            status={computedBookStatus}
                            receivedCount={studentReceivedCount}
                            totalBooks={allGroupBooks.length}
                            details={studentBookDetails}
                            size="sm"
                          />

                          {/* When exactly 1 book version in group: quick toggle button */}
                          {allGroupBooks.length === 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleBookHandout(
                                  student.id,
                                  allGroupBooks[0].id,
                                  currentReceivedSet.has(allGroupBooks[0].id)
                                )
                              }
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer active:scale-[0.98] ${
                                currentReceivedSet.has(allGroupBooks[0].id)
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-rose-50 hover:text-rose-800 hover:border-rose-300 group"
                                  : "bg-indigo-50/80 text-indigo-900 border-indigo-200/80 hover:bg-indigo-100 hover:border-indigo-300 shadow-2xs"
                              }`}
                              title={
                                currentReceivedSet.has(allGroupBooks[0].id)
                                  ? (locale === "ar" ? `مُسلَّم: ${allGroupBooks[0].title} (انقر للإلغاء)` : `Remis : ${allGroupBooks[0].title} (Cliquer pour annuler)`)
                                  : (locale === "ar" ? `تسليم كتاب: ${allGroupBooks[0].title}` : `Remettre : ${allGroupBooks[0].title}`)
                              }
                            >
                              <BookOpen className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <span className="truncate max-w-[120px] sm:max-w-[170px] font-medium">
                                {allGroupBooks[0].title}
                              </span>
                              {currentReceivedSet.has(allGroupBooks[0].id) ? (
                                <span className="text-[10px] font-bold bg-emerald-600 group-hover:bg-rose-600 text-white px-1.5 py-0.5 rounded shrink-0 transition-colors">
                                  <span className="group-hover:hidden">{locale === "ar" ? "تم التسليم" : "Reçu"}</span>
                                  <span className="hidden group-hover:inline">{locale === "ar" ? "إلغاء" : "Annuler"}</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded shrink-0">
                                  {locale === "ar" ? "تسليم" : "Remettre"}
                                </span>
                              )}
                            </button>
                          )}

                          {/* When > 1 book versions: dropdown checklist allowing toggling each book */}
                          {allGroupBooks.length > 1 && (
                            <div className="relative" ref={activeChecklistStudentId === student.id ? checklistRef : null}>
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveChecklistStudentId((prev) =>
                                    prev === student.id ? null : student.id
                                  )
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50/80 text-indigo-900 border border-indigo-200/80 hover:bg-indigo-100 hover:border-indigo-300 transition-colors shadow-2xs cursor-pointer active:scale-[0.98]"
                                title={
                                  locale === "ar"
                                    ? "عرض قائمة الكتب للتسليم"
                                    : "Ouvrir la liste des livres"
                                }
                              >
                                <BookOpen className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                <span>
                                  {locale === "ar"
                                    ? `الكتب (${studentReceivedCount}/${allGroupBooks.length})`
                                    : `Livres (${studentReceivedCount}/${allGroupBooks.length})`}
                                </span>
                                <ChevronDown
                                  className={`w-3 h-3 text-indigo-500 transition-transform ${
                                    activeChecklistStudentId === student.id ? "rotate-180" : ""
                                  }`}
                                />
                              </button>

                              {activeChecklistStudentId === student.id && (
                                <div className="absolute z-30 end-0 mt-1.5 w-72 bg-white border border-border rounded-xl shadow-xl p-2.5 space-y-2 animate-in fade-in zoom-in-95">
                                  <div className="flex items-center justify-between text-xs font-bold text-gray-800 px-1 pb-1.5 border-b border-border/70">
                                    <span className="flex items-center gap-1.5">
                                      <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                                      <span>{locale === "ar" ? "قائمة الكتب :" : "Liste des livres :"}</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setActiveChecklistStudentId(null)}
                                      className="text-gray-400 hover:text-gray-700 p-0.5 rounded-md hover:bg-gray-100 cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  <div className="space-y-1 max-h-48 overflow-y-auto">
                                    {allGroupBooks.map((b) => {
                                      const isReceived = currentReceivedSet.has(b.id);
                                      return (
                                        <button
                                          key={b.id}
                                          type="button"
                                          onClick={() => handleToggleBookHandout(student.id, b.id, isReceived)}
                                          className={`w-full text-start p-2 rounded-lg text-xs flex items-center justify-between gap-2 transition-all cursor-pointer border ${
                                            isReceived
                                              ? "bg-emerald-50/70 text-emerald-950 border-emerald-200 hover:bg-rose-50 hover:text-rose-950 hover:border-rose-200 group"
                                              : "bg-gray-50/70 hover:bg-indigo-50 hover:text-indigo-950 border-transparent hover:border-indigo-200"
                                          }`}
                                        >
                                          <span className="font-medium truncate text-gray-800">
                                            {b.title}
                                          </span>
                                          {isReceived ? (
                                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 group-hover:bg-rose-600 group-hover:text-white px-2 py-0.5 rounded-md shrink-0 transition-colors">
                                              <span className="group-hover:hidden">{locale === "ar" ? "تم التسليم" : "Reçu"}</span>
                                              <span className="hidden group-hover:inline">{locale === "ar" ? "إلغاء" : "Annuler"}</span>
                                            </span>
                                          ) : (
                                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 hover:bg-indigo-600 hover:text-white px-2 py-0.5 rounded-md shrink-0 transition-colors">
                                              {locale === "ar" ? "تسليم" : "Remettre"}
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRecordPaymentClick(student)}
                        className="px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        {t("issueVoucher")}
                      </button>
                      {mostRecentVoucher && (
                        <PrintTicketButton
                          voucher={{ ...mostRecentVoucher, student, class: lesson.class }}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* NOT_DEFINED Mandatory Justification Input */}
                {currentStatus === "NOT_DEFINED" && (
                  <div className="w-full mt-2 pt-2.5 border-t border-blue-200/80 flex flex-col sm:flex-row sm:items-center gap-2 bg-blue-50/60 p-2.5 rounded-lg border border-blue-200 shadow-xs">
                    <label
                      htmlFor={`justification-${student.id}`}
                      className="text-xs font-bold text-blue-900 shrink-0 flex items-center gap-1.5"
                    >
                      <span>{t("justificationLabel")}</span>
                    </label>
                    <input
                      id={`justification-${student.id}`}
                      type="text"
                      required
                      value={justifications[student.id] || ""}
                      onChange={(e) =>
                        setJustifications((prev) => ({
                          ...prev,
                          [student.id]: e.target.value,
                        }))
                      }
                      placeholder={t("justificationPlaceholder")}
                      className={`flex-1 px-3 py-1.5 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                        !justifications[student.id]?.trim()
                          ? "border-blue-400 ring-1 ring-blue-300"
                          : "border-gray-300 text-gray-900"
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Catch-Up Visitors Section (§2.12) */}
      {(filteredCatchUpVisitors.length > 0 || (!cleanSearch && catchUpVisitors.length > 0)) && (
        <div className="mt-8 pt-6 border-t-2 border-dashed border-amber-300/80 space-y-3 font-sans">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </span>
              <div>
                <h3 className="font-bold text-base text-gray-900">
                  {t("catchUpVisitorsTitle")}
                </h3>
                <p className="text-xs text-gray-500">
                  {t("catchUpVisitorsSubtitle")}
                </p>
              </div>
            </div>
            <span className="text-xs text-amber-800 bg-amber-100/70 px-3 py-1 rounded-full border border-amber-300 font-bold">
              {t("catchUpVisitorsCount", { count: filteredCatchUpVisitors.length })}
            </span>
          </div>

          <div className="space-y-3">
            {filteredCatchUpVisitors.map((visitor) => {
              const missedDate = new Date(visitor.missedStartsAt).toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ", {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              });

              return (
                <div
                  key={visitor.id}
                  className="flex flex-col md:flex-row items-start md:items-center justify-between p-3.5 border-2 border-amber-200 rounded-xl gap-4 bg-amber-50/40 shadow-xs"
                >
                  <div className="flex items-center gap-3.5 flex-grow">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center justify-center font-bold text-xs shrink-0">
                      <span className="font-mono text-xs font-bold leading-none tracking-tight">
                        #{visitor.globalNumber}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-gray-900 text-sm">{visitor.studentName}</p>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-600 text-white">
                          {t("visitorBadge")}
                        </span>
                      </div>
                      <div className="text-xs text-amber-900 flex flex-wrap items-center gap-2">
                        <span>
                          {t("compensatesAbsenceIn", { class: visitor.missedClassName })}
                        </span>
                        <span>•</span>
                        <span>{t("teacherNameFormatted", { name: visitor.missedTeacherName })}</span>
                        <span>•</span>
                        <span className="text-gray-600">{t("originalDateFormatted", { date: missedDate })}</span>
                      </div>
                      <div className="text-[11px] text-emerald-700 font-medium">
                        {t("noDeductionNotice")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                    <button
                      type="button"
                      disabled={deletingVisitorId === visitor.id}
                      onClick={() => handleRemoveVisitor(visitor.id)}
                      className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deletingVisitorId === visitor.id ? t("canceling") : t("cancelCatchUpVisit")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Save Button */}
      <form ref={formRef} action={formAction} onSubmit={handleFormSubmit} className="mt-6 flex justify-stretch sm:justify-end">
        {Object.entries(attendance).map(([studentId, status]) => (
          <div key={studentId}>
            <input
              type="hidden"
              name={`attendance[${studentId}]`}
              value={status}
            />
            {status === "NOT_DEFINED" && (
              <input
                type="hidden"
                name={`justification[${studentId}]`}
                value={justifications[studentId]?.trim() || ""}
              />
            )}
          </div>
        ))}

        <SubmitButton />
      </form>

      {/* Catch-Up Visitor Modal (§2.12) */}
      <CatchUpVisitorModal
        lessonId={lesson.id}
        isOpen={isCatchUpModalOpen}
        onClose={() => setIsCatchUpModalOpen(false)}
      />

      {/* Free Session Confirmation Popup Modal */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full border border-gray-100">
            <div className="flex items-center gap-3 text-emerald-600 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">{t("freeSessionModalTitle")}</h3>
            </div>
            
            <div className="space-y-2 mb-6">
              <p className="text-sm font-semibold text-gray-800 leading-relaxed">
                {t("freeSessionModalMessage")}
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
              >
                {t("continueBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voucher Modal */}
      {isPaymentModalOpen && selectedStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl relative w-full max-w-md">
            <button
              onClick={() => setIsPaymentModalOpen(false)}
              className="absolute top-4 left-4 text-gray-400 hover:text-gray-600"
            >
              <Image src="/close.png" alt="close" width={16} height={16} />
            </button>
            <PaymentForm
              student={selectedStudent}
              classData={lesson.class}
              setOpen={setIsPaymentModalOpen}
              type="create"
            />
          </div>
        </div>
      )}
    </>
  );
};

export default AttendanceRoster;
