"use client";

import { Student, Attendance, Voucher, Lesson, Class, Teacher } from "@prisma/client";
import { useState, useEffect, useRef, useMemo, startTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { saveAttendance, removeCatchUpAttendanceAction, markSingleAttendanceAction } from "@/lib/actions";
import { executeWithRetry } from "@/lib/retryUtils";
import { toast } from "react-toastify";
import { computeStudentConsumedSessions, computeStudentConsecutiveAbsences, computeStudentCreditAndSessions } from "@/lib/studentBilling";
import { useTranslations, useLocale } from "next-intl";
import PaymentForm from "./PaymentForm";
import PrintTicketButton from "../PrintTicketButton";
import CatchUpVisitorModal from "./CatchUpVisitorModal";
import { BookOpen, Check, X, Minus, ChevronDown, UserPlus, UserX } from "lucide-react";
import { toggleBookReceiptAction } from "@/lib/bookActions";
import { Badge } from "@/components/ui/Badge";
import BookStatusBadge, { computeBookStatus, BookDetailItem } from "@/components/books/BookStatusBadge";
import { FilterTabs } from "@/components/ui/FilterTabs";
import EnrollExistingStudentTab from "./EnrollExistingStudentTab";

const StudentForm = dynamic(() => import("./StudentForm"), { ssr: false });

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

export interface CaughtUpAbsentee {
  studentId: string;
  catchUpLessonId: number;
  catchUpClassName: string;
  catchUpTeacherName: string;
  catchUpStartsAt: string | Date;
}

type FullStudent = Student & {
  vouchers: Voucher[];
  attendances: Attendance[];
  payerStatus?: string;
  enrollmentStatus?: string;
  payerSessionsRemaining?: number;
  transfersFrom?: Array<{ id?: number; transferredSessions: number }>;
  transfersTo?: Array<{ id?: number; transferredSessions: number }>;
  family?: { payerStudentId: string | null } | null;
  isBookEligible?: boolean;
  hasPaidBook?: boolean;
  receivedBookIds?: number[];
  outstandingBooks?: Array<{ id: number; title: string }>;
  bookDetails?: Array<{ id: number; title: string; received: boolean; receivedAt?: string | Date | null }>;
  inscriptionStatus?: "PAID" | "WAIVED" | "UNPAID";
  creditResetOffset?: number;
};

type FullLesson = Lesson & {
  class: Class & {
    price?: number;
    pricePerCycle?: number;
    levelId?: number | null;
    branchId?: number | null;
    isFormation?: boolean;
    formationLevelId?: number | null;
  };
  teacher: Teacher & { surname?: string };
  subject?: { id: number; name: string };
  branchId?: number | null;
};

const AttendanceRoster = ({
  lesson,
  students,
  existingRecords,
  booksWithDrops = [],
  groupBooks = [],
  catchUpVisitors = [],
  caughtUpAbsentees = [],
  initialSearch = "",
  studentRelatedData = { grades: [], classes: [] },
  canCreateStudent = true,
}: {
  lesson: FullLesson;
  students: FullStudent[];
  existingRecords: (Attendance & { present?: boolean })[];
  booksWithDrops?: BookWithPendingDrops[];
  groupBooks?: Array<{ id: number; title: string }>;
  catchUpVisitors?: CatchUpVisitor[];
  caughtUpAbsentees?: CaughtUpAbsentee[];
  initialSearch?: string;
  studentRelatedData?: {
    grades: Array<{ id: number; level?: string; name?: string }>;
    classes: Array<{ id: number; name: string; levelId?: number | null }>;
  };
  canCreateStudent?: boolean;
}) => {
  const router = useRouter();
  const t = useTranslations("attendance");
  const tSearch = useTranslations("search");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [searchTerm, setSearchTerm] = useState(initialSearch || "");
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch || "");
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [activeRegisterTab, setActiveRegisterTab] = useState<"create" | "enroll_existing">("create");
  const [preselectedStudentForEnroll, setPreselectedStudentForEnroll] = useState<any>(null);

  const resolvedStudentRelatedData = useMemo(() => {
    const grades = studentRelatedData?.grades || [];
    let classesList = studentRelatedData?.classes ? [...studentRelatedData.classes] : [];
    if (!classesList.some((c) => c.id === lesson.class.id)) {
      classesList.push({ id: lesson.class.id, name: lesson.class.name, levelId: lesson.class.levelId });
    }
    return { grades, classes: classesList };
  }, [studentRelatedData, lesson.class.id, lesson.class.name, lesson.class.levelId]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setDebouncedSearch("");
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const cleanSearch = debouncedSearch.trim().toLowerCase();
  const cleanNumeric = cleanSearch.replace(/[^0-9]/g, "");

  const activeStudents = useMemo(() => {
    return (students || []).filter((s) => {
      const isSuspendedOrInactive =
        s.enrollmentStatus === "SUSPENDED" ||
        s.enrollmentStatus === "INACTIVE" ||
        s.enrollmentStatus === "UNENROLLED" ||
        s.enrollmentStatus === "TRANSFERRED" ||
        s.enrollmentStatus === "REFUNDED";
      return !isSuspendedOrInactive && !(s as any).isRefunded;
    });
  }, [students]);

  const filteredStudents = useMemo(() => {
    if (!cleanSearch) return activeStudents;
    return activeStudents.filter((student) => {
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
  }, [activeStudents, cleanSearch, cleanNumeric]);

  const filteredCatchUpVisitors = useMemo(() => {
    if (!cleanSearch) return catchUpVisitors;
    return catchUpVisitors.filter((visitor) => {
      const matchName = visitor.studentName.toLowerCase().includes(cleanSearch);
      const matchId =
        cleanNumeric && visitor.globalNumber !== undefined && visitor.globalNumber !== null
          ? String(visitor.globalNumber).includes(cleanNumeric)
          : false;
      return matchName || matchId;
    });
  }, [catchUpVisitors, cleanSearch, cleanNumeric]);

  const caughtUpMap = useMemo(
    () => new Map((caughtUpAbsentees || []).map((c) => [c.studentId, c])),
    [caughtUpAbsentees]
  );

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
    activeStudents.forEach((student) => {
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
    activeStudents.forEach((student) => {
      const record = existingRecords.find((r) => r.studentId === student.id);
      if (record?.justification) {
        initial[student.id] = record.justification;
      }
    });
    return initial;
  });

  // Synchronize attendance state when active students change (e.g. newly registered student)
  useEffect(() => {
    setAttendance((prev) => {
      let changed = false;
      const next = { ...prev };
      activeStudents.forEach((student) => {
        if (next[student.id] === undefined) {
          const record = existingRecords.find((r) => r.studentId === student.id);
          if (record?.status === "PRESENT") {
            next[student.id] = "PRESENT";
          } else if (record?.status === "NOT_DEFINED") {
            next[student.id] = "NOT_DEFINED";
          } else {
            next[student.id] = "ABSENT";
          }
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [activeStudents, existingRecords]);

  // Synchronize studentReceivedBooks state when active students change
  useEffect(() => {
    setStudentReceivedBooks((prev) => {
      let changed = false;
      const next = { ...prev };
      activeStudents.forEach((s) => {
        if (next[s.id] === undefined) {
          next[s.id] = s.receivedBookIds ? [...s.receivedBookIds] : [];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [activeStudents]);

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
    const missingJustification = activeStudents.find(
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
              {t("teacher")}: {lesson.teacher.surname ? `${lesson.teacher.surname} ${lesson.teacher.name}` : lesson.teacher.name}
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

      {/* Teacher Absent Info Banner */}
      {lesson.isTeacherAbsent && (
        <div className="p-3.5 mb-4 bg-rose-50 border-2 border-rose-300 rounded-xl flex items-center justify-between gap-3 text-rose-950 text-sm shadow-xs font-sans">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block shrink-0"></span>
            <div>
              <strong className="font-bold">
                {locale === "ar" ? "الأستاذ غائب في هذه الحصة :" : "Enseignant absent pour cette séance :"}
              </strong>{" "}
              {locale === "ar"
                ? "تسجيل الحضور في هذه الحصة لن يخصم من رصيد حصص التلاميذ (0 حصة مستهلكة)، وسيتم احتساب غياب الأستاذ في جدول الأجور."
                : "Faire l'appel pour cette séance ne débitera pas le crédit des élèves (0 séance décomptée). L'absence de l'enseignant est enregistrée dans sa paie."}
            </div>
          </div>
          <span className="bg-rose-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-xs flex items-center gap-1 shrink-0">
            <UserX className="w-3.5 h-3.5" />
            <span>{locale === "ar" ? "أستاذ غائب" : "Prof absent"}</span>
          </span>
        </div>
      )}

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

      {/* Top action bar: Summary, Student Registration, and Catch-Up Visitor entry points */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 bg-gray-50 border border-gray-200 rounded-xl font-sans">
        <div className="flex items-center gap-2 text-xs text-gray-600 flex-wrap">
          <span>{t("totalGroupStudents", { count: activeStudents.length })}</span>
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

          {/* Status Color Indicators Legend */}
          <div className="flex items-center gap-1.5 ms-auto sm:ms-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-950 border border-amber-300 text-[11px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              {locale === "ar" ? "معفى / إخوة (برتقالي)" : "Exonéré / Fratrie (Orange)"}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 text-sky-950 border border-sky-300 text-[11px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
              {locale === "ar" ? "حصة المدرسة فقط (أزرق)" : "Frais école seuls (Bleu)"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canCreateStudent && (
            <button
              type="button"
              onClick={() => setIsRegisterModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs cursor-pointer active:scale-95"
            >
              <UserPlus className="w-4 h-4" />
              <span>{t("registerStudentBtn")}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsCatchUpModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition-colors shadow-xs cursor-pointer active:scale-95"
          >
            <span>{t("addCatchUpStudentBtn")}</span>
          </button>
        </div>
      </div>

      <div className="space-y-3 font-sans">
        {filteredStudents.length === 0 ? (
          <div className="p-8 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-300 font-sans">
            <p className="text-sm font-medium text-gray-600">
              {searchTerm
                ? (locale === "ar"
                    ? `لم يتم العثور على أي تلميذ يطابق "${searchTerm}".`
                    : `Aucun élève ne correspond à "${searchTerm}".`)
                : t("noStudents")}
            </p>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
              >
                {locale === "ar" ? "مسح البحث" : "Effacer la recherche"}
              </button>
            )}
            {canCreateStudent && !searchTerm && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{t("registerStudentBtn")}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          filteredStudents.map((student) => {
            const currentStatus = attendance[student.id];

            const isSiblingDiscount = Boolean(
              student.family &&
              student.family.payerStudentId &&
              student.family.payerStudentId !== student.id
            );
            const siblingDiscountPct = isSiblingDiscount
              ? Number((student.family as any)?.discountPercentage ?? 50)
              : 0;
            const isSiblingWaived100 = siblingDiscountPct >= 100;

            const payerStatus = student.payerStatus || "NORMAL";
            const isNonPayer = payerStatus === "NON_PAYER" || payerStatus === "FREE_ALL" || payerStatus === "FREE_TUITION";
            const isSchoolFeesOnly = payerStatus === "SCHOOL_FEES_ONLY";

            // Rule 3: Waived sibling pass strictly follows paying sibling's remaining credit
            const isPayerSiblingPaid = isSiblingWaived100
              ? (student.payerSessionsRemaining !== undefined ? student.payerSessionsRemaining > 0 : true)
              : true;
            const isWaivedTuition = isNonPayer || (isSiblingWaived100 && isPayerSiblingPaid);

            const tuitionVouchers = (student.vouchers || []).filter(
              (v: any) => v.paymentType === "TUITION_4SESSION" && (v.classId === lesson.class.id || !v.classId)
            );
            const isFormation = Boolean(
              (lesson.class as any)?.isFormation ||
              (lesson.class as any)?.FormationLevel ||
              (lesson.class as any)?.formationLevelId
            );

            const formationVouchers = (student.vouchers || []).filter(
              (v: any) =>
                (v.paymentType === "FORMATION" || v.paymentType === "TUITION_4SESSION") &&
                !v.isVoided &&
                (v.classId === lesson.class.id || !v.classId)
            );
            const totalPaidFormation = formationVouchers.reduce((sum: number, v: any) => {
              const paid = Number(v.amount || 0);
              const refunded = (v.refunds || []).reduce((rSum: number, r: any) => rSum + Number(r.amount || 0), 0);
              return sum + (paid - refunded);
            }, 0);
            const formationPrice = Number((lesson.class as any)?.pricePerCycle || (lesson.class as any)?.price || 0);
            const isFormationPaidInFull = formationPrice > 0 && totalPaidFormation >= formationPrice;
            const isFormationPartiallyPaid = totalPaidFormation > 0 && totalPaidFormation < formationPrice;

            const creditMetrics = computeStudentCreditAndSessions({
              pricePerCycle: Number((lesson.class as any)?.pricePerCycle || (lesson.class as any)?.price || 0),
              isFormation,
              payerStatus,
              siblingDiscountPercentage: siblingDiscountPct,
              isSiblingWaived: isSiblingWaived100,
              isPayerSiblingPaid,
              tuitionVouchers,
              transfersIn: student.transfersTo || [],
              transfersOut: student.transfersFrom || [],
              creditResetOffset: student.creditResetOffset,
              attendances: student.attendances || [],
            });

            const sessionsRemaining = creditMetrics.netSessions;
            const sessionsConsumed = creditMetrics.attendedSessions;

            const studentLessons = (student.attendances || [])
              .map((a: any) => a.lesson)
              .filter(Boolean);
            const studentAtts = (student.attendances || []).map((a: any) => ({
              lessonId: a.lessonId,
              status: a.status,
            }));

            // Consecutive absences and suspension checks (Rules 5 & 9)
            const consecutiveAbsences = computeStudentConsecutiveAbsences({
              lessons: studentLessons,
              attendances: studentAtts,
            });
            const isSuspended = student.enrollmentStatus === "SUSPENDED";
            const hasConsecutiveAbsenceAlert = consecutiveAbsences >= 3;

            let statusBubble = { text: t("unpaidDue"), color: "bg-red-500" };
            if (isFormation) {
              if (isSiblingWaived100) {
                if (!isPayerSiblingPaid) {
                  statusBubble = { text: locale === "ar" ? "غير مدفوع (تابع للأخ)" : "Non payé (Fratrie)", color: "bg-red-500" };
                } else {
                  statusBubble = { text: t("waivedSibling"), color: "bg-amber-600" };
                }
              } else if (isNonPayer) {
                statusBubble = { text: locale === "ar" ? "معفى من الرسوم" : "Exonéré", color: "bg-amber-600" };
              } else if (isFormationPaidInFull) {
                statusBubble = { text: locale === "ar" ? "تم الدفع بالكامل" : "Payé en totalité", color: "bg-green-500" };
              } else if (isFormationPartiallyPaid) {
                statusBubble = {
                  text: locale === "ar"
                    ? `دفع جزئي (متبقي ${(formationPrice - totalPaidFormation).toLocaleString("ar-DZ")} دج)`
                    : `Paiement partiel (reste ${(formationPrice - totalPaidFormation).toLocaleString("fr-DZ")} DZD)`,
                  color: "bg-yellow-500",
                };
              } else {
                statusBubble = { text: t("unpaidDue"), color: "bg-red-500" };
              }
            } else {
              if (isSiblingWaived100) {
                if (!isPayerSiblingPaid) {
                  statusBubble = { text: locale === "ar" ? "غير مدفوع (تابع للأخ)" : "Non payé (Fratrie)", color: "bg-red-500" };
                } else {
                  statusBubble = { text: t("waivedSibling"), color: "bg-amber-600" };
                }
              } else if (isNonPayer) {
                statusBubble = { text: locale === "ar" ? "معفى من الرسوم" : "Exonéré", color: "bg-amber-600" };
              } else if (isSchoolFeesOnly) {
                statusBubble = { text: locale === "ar" ? "حصة المدرسة فقط" : "Frais d'école seuls", color: "bg-sky-500" };
              } else if (sessionsRemaining >= 2) {
                statusBubble = { text: isSiblingDiscount ? (locale === "ar" ? `مدفوع (-${siblingDiscountPct}%)` : `Payé (-${siblingDiscountPct}%)`) : t("paidGood"), color: "bg-green-500" };
              } else if (sessionsRemaining >= 1) {
                statusBubble = { text: t("expiringSoon"), color: "bg-yellow-500" };
              } else if (isSiblingDiscount) {
                statusBubble = { text: locale === "ar" ? `غير مدفوع (خصم ${siblingDiscountPct}%)` : `Dû (-${siblingDiscountPct}%)`, color: "bg-amber-600" };
              }
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
                    : currentStatus === "ABSENT"
                    ? "bg-rose-50/40 border-rose-300 shadow-2xs"
                    : currentStatus === "NOT_DEFINED"
                    ? "bg-blue-50/30 border-blue-200 shadow-2xs"
                    : isWaivedTuition
                    ? "bg-amber-50/30 border-amber-200/80 hover:border-amber-300"
                    : isSchoolFeesOnly
                    ? "bg-sky-50/30 border-sky-200/80 hover:border-sky-300"
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
                          : currentStatus === "ABSENT"
                          ? "bg-rose-600 text-white shadow-2xs ring-2 ring-rose-500/25"
                          : currentStatus === "NOT_DEFINED"
                          ? "bg-blue-600 text-white shadow-2xs ring-2 ring-blue-500/25"
                          : isWaivedTuition
                          ? "bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
                          : isSchoolFeesOnly
                          ? "bg-sky-100 text-sky-900 border border-sky-300 hover:bg-sky-200"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
                      }`}
                    >
                      <span className="font-mono text-xs font-bold leading-none tracking-tight">
                        #{student.globalNumber ?? student.id}
                      </span>
                    </button>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {isWaivedTuition ? (
                          <Link
                            href={`/list/students/${student.id}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-950 border border-amber-300/90 font-bold text-sm shadow-2xs ring-1 ring-amber-400/30 hover:border-amber-400 transition-colors"
                          >
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                            <span className="hover:underline">{student.name}</span>
                          </Link>
                        ) : isSchoolFeesOnly ? (
                          <Link
                            href={`/list/students/${student.id}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-sky-100 text-sky-950 border border-sky-300/90 font-bold text-sm shadow-2xs ring-1 ring-sky-400/30 hover:border-sky-400 transition-colors"
                          >
                            <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0"></span>
                            <span className="hover:underline">{student.name}</span>
                          </Link>
                        ) : (
                          <Link
                            href={`/list/students/${student.id}`}
                            className="font-bold text-gray-900 text-sm hover:text-primary hover:underline transition-colors"
                          >
                            {student.name}
                          </Link>
                        )}

                        {/* Status Badges for Not-Normal Students */}
                        {isSiblingWaived100 ? (
                          <Badge variant="warning" size="sm" withDot className="bg-amber-100/90 text-amber-900 border-amber-300 font-semibold shadow-2xs">
                            {locale === "ar" ? "معفى 100% (أخ دافع)" : "Exonéré 100% (Fratrie)"}
                          </Badge>
                        ) : isSiblingDiscount ? (
                          <Badge variant="warning" size="sm" withDot className="bg-amber-100/90 text-amber-900 border-amber-300 font-semibold shadow-2xs">
                            {locale === "ar" ? `خصم إخوة (${siblingDiscountPct}%)` : `Remise fratrie (${siblingDiscountPct}%)`}
                          </Badge>
                        ) : isNonPayer ? (
                          <Badge variant="warning" size="sm" withDot className="bg-amber-100/90 text-amber-900 border-amber-300 font-semibold shadow-2xs">
                            {locale === "ar" ? "معفى من الرسوم" : "Non-payeur (Exonéré)"}
                          </Badge>
                        ) : isSchoolFeesOnly ? (
                          <Badge variant="primary" size="sm" withDot className="bg-sky-100/90 text-sky-900 border-sky-300 font-semibold shadow-2xs">
                            {locale === "ar" ? "حصة المدرسة فقط" : "Frais d'école seuls"}
                          </Badge>
                        ) : null}

                        {caughtUpMap.has(student.id) && (
                          <Badge variant="neutral" size="sm" withDot className="bg-blue-100 text-blue-900 border-blue-300 font-semibold shadow-2xs">
                            {locale === "ar"
                              ? `استدراك مسبق (${caughtUpMap.get(student.id)?.catchUpClassName})`
                              : `Rattrapé (${caughtUpMap.get(student.id)?.catchUpClassName})`}
                          </Badge>
                        )}

                        {hasConsecutiveAbsenceAlert && !isSuspended && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-950 border border-amber-300 text-[11px] font-bold shadow-2xs">
                            <span>⚠️</span>
                            <span>{locale === "ar" ? `${consecutiveAbsences} غيابات متتالية` : `${consecutiveAbsences}x Absences`}</span>
                          </span>
                        )}
                        {isSuspended && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-950 border border-rose-300 text-[11px] font-bold shadow-2xs">
                            <span>⛔</span>
                            <span>{locale === "ar" ? "معلق" : "Suspendu"}</span>
                          </span>
                        )}

                        <span className={`w-2 h-2 rounded-full ${statusBubble.color}`}></span>
                        {/* Inscription Fee Status Badge */}
                        {student.inscriptionStatus === "PAID" ? (
                          <Badge variant="success" size="sm" withDot>
                            {locale === "ar" ? "تسجيل مسدد" : "Inscr. Payée"}
                          </Badge>
                        ) : student.inscriptionStatus === "WAIVED" ? (
                          <Badge variant="secondary" size="sm" withDot>
                            {locale === "ar" ? "تسجيل معفى" : "Inscr. Exonérée"}
                          </Badge>
                        ) : (
                          <Badge variant="danger" size="sm" withDot>
                            {locale === "ar" ? "تسجيل غير مسدد" : "Inscr. Non payée"}
                          </Badge>
                        )}
                        {student.phone && (
                          <span className="text-[11px] text-gray-400 font-mono">
                            {student.phone}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <span>{statusBubble.text}</span>
                        {!isFormation && (
                          <>
                            <span>•</span>
                            <span className={sessionsRemaining < 0 && !isNonPayer && !isSiblingWaived100 ? "font-semibold text-rose-600" : ""}>
                              {isSiblingWaived100
                                ? (!isPayerSiblingPaid
                                    ? (locale === "ar" ? "الأخ الدافع غير مسدد" : "Frère payeur non soldé")
                                    : t("tuitionWaivedSibling"))
                                : isNonPayer
                                ? (locale === "ar" ? "معفى من رسوم الحصص" : "Exonéré des frais de cours")
                                : isSchoolFeesOnly
                                ? (locale === "ar" ? "حصة المدرسة فقط" : "Frais d'école seuls")
                                : t("sessionsRemainingCount", { count: sessionsRemaining })}
                            </span>
                          </>
                        )}
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
                                      <X className="w-3.5 h-3.5" />
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
                        <Link
                          href={`/list/students/${visitor.studentId}`}
                          className="font-bold text-gray-900 text-sm hover:text-primary hover:underline transition-colors"
                        >
                          {visitor.studentName}
                        </Link>
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

      {/* Rapid Student Registration Modal with Two Tabs */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface p-6 rounded-xl border border-border shadow-xl relative w-[90%] md:w-[70%] lg:w-[60%] xl:w-[50%] 2xl:w-[40%] max-h-[90vh] overflow-y-auto space-y-4">
            <button
              type="button"
              className="absolute top-4 end-4 cursor-pointer p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors z-10"
              onClick={() => {
                setIsRegisterModalOpen(false);
                setPreselectedStudentForEnroll(null);
              }}
            >
              <Image src="/close.png" alt={tCommon("cancel")} width={14} height={14} />
            </button>

            {/* Two Tabs: Create New vs Enroll Existing */}
            <div className="pt-1">
              <FilterTabs
                tabs={[
                  {
                    id: "create",
                    label: locale === "ar" ? "إنشاء تلميذ جديد" : "Créer un nouvel élève",
                  },
                  {
                    id: "enroll_existing",
                    label: locale === "ar" ? "تسجيل تلميذ مسجل مسبقاً" : "Inscrire un élève existant",
                  },
                ]}
                activeTab={activeRegisterTab}
                onTabChange={(tabId) => setActiveRegisterTab(tabId as any)}
                size="md"
              />
            </div>

            <div className="p-1">
              {activeRegisterTab === "create" ? (
                <StudentForm
                  type="create"
                  setOpen={setIsRegisterModalOpen}
                  data={{
                    classes: [lesson.class.id],
                    gradeId: lesson.class.levelId || undefined,
                    registeredBranchId: lesson.branchId || undefined,
                    targetClassName: lesson.class.name,
                  }}
                  relatedData={resolvedStudentRelatedData}
                  onSwitchToExisting={(existingStudent) => {
                    setPreselectedStudentForEnroll(existingStudent);
                    setActiveRegisterTab("enroll_existing");
                  }}
                  onSuccess={(result) => {
                    setSearchTerm("");
                    setIsRegisterModalOpen(false);
                    setPreselectedStudentForEnroll(null);
                    if (result?.andPay && result?.student) {
                      setSelectedStudent(result.student);
                      setIsPaymentModalOpen(true);
                    }
                    startTransition(() => {
                      router.refresh();
                    });
                  }}
                />
              ) : (
                <EnrollExistingStudentTab
                  classId={lesson.class.id}
                  className={lesson.class.name}
                  initialSelectedStudent={preselectedStudentForEnroll}
                  onClose={() => {
                    setIsRegisterModalOpen(false);
                    setPreselectedStudentForEnroll(null);
                  }}
                  onSuccess={() => {
                    setIsRegisterModalOpen(false);
                    setPreselectedStudentForEnroll(null);
                    startTransition(() => {
                      router.refresh();
                    });
                  }}
                  onEnrollAndPay={(student) => {
                    setIsRegisterModalOpen(false);
                    setPreselectedStudentForEnroll(null);
                    setSelectedStudent(student);
                    setIsPaymentModalOpen(true);
                    startTransition(() => {
                      router.refresh();
                    });
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Voucher Modal */}
      {isPaymentModalOpen && selectedStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl relative w-full max-w-md max-h-[90vh] overflow-y-auto">
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
