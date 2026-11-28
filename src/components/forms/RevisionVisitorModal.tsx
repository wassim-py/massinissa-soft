"use client";

import { useState, useTransition, useEffect, useRef, useMemo } from "react";
import { toast } from "react-toastify";
import { useLocale } from "next-intl";
import {
  Search,
  Loader2,
  X,
  CheckCircle2,
  User,
  UserPlus,
  Banknote,
  Printer,
  Calendar,
  Clock,
  Check,
  Sparkles,
  BookOpen,
  SlidersHorizontal,
} from "lucide-react";
import {
  searchRevisionVisitorCandidatesAction,
  recordRevisionVisitorAction,
  getClassRevisionLessonOptionsAction,
  getRevisionClassOptionsAction,
} from "@/lib/actions";
import { type RevisionLessonOption, splitTotalAcrossSessions } from "@/lib/revisionSchedule";
import { formatDZD } from "@/lib/algiersDate";
import { notifyAttendanceChanged } from "@/lib/attendanceEvents";
import PrintTicketButton from "@/components/PrintTicketButton";

interface CandidateStudent {
  id: string;
  name: string;
  globalNumber: number;
  phone: string | null;
  branchName?: string | null;
  isAlreadyEnrolled: boolean;
}

export interface RevisionClassOption {
  id: number;
  name: string;
  branchId: number;
  branchName: string;
  teacherName: string | null;
  levelName?: string | null;
  pricePerCycle?: number;
  prepaidCount?: number;
}

interface RevisionVisitorModalProps {
  lessonId?: number;
  classId?: number;
  className?: string;
  availableClasses?: RevisionClassOption[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultFee?: number;
}

const WEEKDAY_LABELS: Record<string, { ar: string; fr: string }> = {
  SATURDAY: { ar: "السبت", fr: "Sam" },
  SUNDAY: { ar: "الأحد", fr: "Dim" },
  MONDAY: { ar: "الإثنين", fr: "Lun" },
  TUESDAY: { ar: "الثلاثاء", fr: "Mar" },
  WEDNESDAY: { ar: "الأربعاء", fr: "Mer" },
  THURSDAY: { ar: "الخميس", fr: "Jeu" },
  FRIDAY: { ar: "الجمعة", fr: "Ven" },
};

export default function RevisionVisitorModal({
  lessonId,
  classId: initialClassId,
  className: initialClassName,
  availableClasses,
  isOpen,
  onClose,
  onSuccess,
  defaultFee = 500,
}: RevisionVisitorModalProps) {
  const locale = useLocale();
  const isAr = locale === "ar";

  // Standalone group selection (when opened from /list/attendance without a pre-set lesson/class)
  const needsGroupPicker = !lessonId && !initialClassId;
  const [classOptions, setClassOptions] = useState<RevisionClassOption[]>(availableClasses || []);
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [classSearch, setClassSearch] = useState("");
  const [selectedClassId, setSelectedClassId] = useState<number | null>(initialClassId ?? null);

  // Student selection tabs
  const [activeTab, setActiveTab] = useState<"search" | "new_guest">("search");
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [candidates, setCandidates] = useState<CandidateStudent[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<CandidateStudent | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // New walk-in guest fields
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  // Multi-date session picker state
  const [lessonOptions, setLessonOptions] = useState<RevisionLessonOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [resolvedClassInfo, setResolvedClassInfo] = useState<{
    id: number;
    name: string;
    branchName: string;
    teacherName: string | null;
  } | null>(null);
  const [selectionPreset, setSelectionPreset] = useState<"1" | "2" | "custom">("1");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  // Pricing state
  const [unitFee, setUnitFee] = useState<number | string>(defaultFee);
  const [customizePerSession, setCustomizePerSession] = useState(false);
  const [customAmounts, setCustomAmounts] = useState<Record<string, number | string>>({});
  const [bundleOverrideInput, setBundleOverrideInput] = useState<string>("");

  // Submission & success screen
  const [isPending, startTransition] = useTransition();
  const [issuedResult, setIssuedResult] = useState<{
    voucher: any;
    sessionsSummary: Array<{
      lessonId: number;
      voucherId: number;
      dateStr: string;
      displayDate: string;
      amount: number;
      checkedIn: boolean;
    }>;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoSelectedInitialRef = useRef(false);

  const effectiveClassId = initialClassId ?? selectedClassId;

  // Reset modal on open/close
  useEffect(() => {
    if (isOpen) {
      setIssuedResult(null);
      setUnitFee(defaultFee);
      setCustomizePerSession(false);
      setCustomAmounts({});
      setBundleOverrideInput("");
      setActiveTab("search");
      setSelectionPreset("1");
      hasAutoSelectedInitialRef.current = false;
      if (initialClassId) {
        setSelectedClassId(initialClassId);
      } else if (!lessonId) {
        setSelectedClassId(null);
      }

      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    } else {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setQuery("");
      setClassSearch("");
      setIsSearching(false);
      setCandidates([]);
      setSelectedStudent(null);
      setGuestName("");
      setGuestPhone("");
      setHasSearched(false);
      setIssuedResult(null);
      setLessonOptions([]);
      setSelectedKeys([]);
      setCustomizePerSession(false);
      setCustomAmounts({});
      setBundleOverrideInput("");
    }
  }, [isOpen, defaultFee, initialClassId, lessonId]);

  // Load accessible classes when opened standalone from /list/attendance
  useEffect(() => {
    if (!isOpen || !needsGroupPicker) return;
    if (availableClasses && availableClasses.length > 0) {
      setClassOptions(availableClasses);
      return;
    }
    let cancelled = false;
    setIsLoadingClasses(true);
    getRevisionClassOptionsAction()
      .then((res) => {
        if (!cancelled && res.success) {
          setClassOptions(res.classes || []);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingClasses(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, needsGroupPicker, availableClasses]);

  // Fetch selectable revision lesson dates whenever lessonId / effectiveClassId / selectedStudent changes
  useEffect(() => {
    if (!isOpen) return;
    if (!lessonId && !effectiveClassId) {
      setLessonOptions([]);
      setSelectedKeys([]);
      return;
    }

    let cancelled = false;
    setIsLoadingOptions(true);
    getClassRevisionLessonOptionsAction({
      lessonId: lessonId ?? null,
      classId: effectiveClassId ?? null,
      studentId: selectedStudent?.id ?? null,
      weeksAhead: 6,
    })
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          const opts = res.options || [];
          setLessonOptions(opts);
          if (res.classInfo) {
            setResolvedClassInfo({
              id: res.classInfo.id,
              name: res.classInfo.name,
              branchName: res.classInfo.branchName,
              teacherName: res.classInfo.teacherName,
            });
          }
          if (!hasAutoSelectedInitialRef.current) {
            hasAutoSelectedInitialRef.current = true;
            if (res.suggestedFee && res.suggestedFee > 0) {
              setUnitFee(res.suggestedFee);
            }
            const available = opts.filter((o) => !o.isAlreadyBookedByStudent);
            const currentOpt = available.find((o) => o.isCurrentLesson);
            if (currentOpt) {
              setSelectedKeys([currentOpt.key]);
            } else if (available[0]) {
              setSelectedKeys([available[0].key]);
            } else {
              setSelectedKeys([]);
            }
          } else {
            // Deselect any dates that turned out to be already booked by newly selected student
            const bookedKeys = new Set(
              opts.filter((o) => o.isAlreadyBookedByStudent).map((o) => o.key)
            );
            setSelectedKeys((prev) => {
              const filtered = prev.filter(
                (k) => !bookedKeys.has(k) && opts.some((o) => o.key === k)
              );
              if (filtered.length > 0) return filtered;
              const available = opts.filter((o) => !o.isAlreadyBookedByStudent);
              const currentOpt = available.find((o) => o.isCurrentLesson);
              if (currentOpt) return [currentOpt.key];
              return available[0] ? [available[0].key] : [];
            });
          }
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingOptions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, lessonId, effectiveClassId, selectedStudent?.id]);

  // Escape key closes modal
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleGlobalKeyDown);
    }
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isOpen, isPending, onClose]);

  // Debounced student search
  useEffect(() => {
    if (activeTab !== "search") return;
    if (!lessonId && !effectiveClassId) {
      setCandidates([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setCandidates([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setIsSearching(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await searchRevisionVisitorCandidatesAction(
          lessonId ?? null,
          trimmed,
          effectiveClassId ?? null
        );
        if (res.success) {
          setCandidates(res.candidates || []);
        } else {
          setCandidates([]);
        }
      } catch (err) {
        console.error("Revision candidate search error:", err);
        setCandidates([]);
      } finally {
        setIsSearching(false);
        setHasSearched(true);
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, lessonId, effectiveClassId, activeTab]);

  const availableLessonOptions = useMemo(
    () => lessonOptions.filter((o) => !o.isAlreadyBookedByStudent),
    [lessonOptions]
  );

  const selectedOptions = useMemo(() => {
    const keySet = new Set(selectedKeys);
    return lessonOptions.filter((o) => keySet.has(o.key));
  }, [lessonOptions, selectedKeys]);

  const filteredClasses = useMemo(() => {
    const q = classSearch.trim().toLowerCase();
    if (!q) return classOptions;
    return classOptions.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.teacherName && c.teacherName.toLowerCase().includes(q)) ||
        c.branchName.toLowerCase().includes(q)
    );
  }, [classOptions, classSearch]);

  const applyPreset = (preset: "1" | "2" | "custom") => {
    setSelectionPreset(preset);
    if (preset === "custom") return;

    const targetCount = preset === "2" ? 2 : 1;
    // Anchor at current lesson if available, otherwise first available date
    const currentIdx = availableLessonOptions.findIndex((o) => o.isCurrentLesson);
    const startIdx = currentIdx >= 0 ? currentIdx : 0;
    const picked = availableLessonOptions.slice(startIdx, startIdx + targetCount);
    setSelectedKeys(picked.map((o) => o.key));

    if (customizePerSession) {
      const unitNum = Number(unitFee) || 0;
      const nextMap: Record<string, number | string> = {};
      picked.forEach((o) => {
        nextMap[o.key] = customAmounts[o.key] ?? unitNum;
      });
      setCustomAmounts(nextMap);
    }
  };

  const toggleDateKey = (opt: RevisionLessonOption) => {
    if (opt.isAlreadyBookedByStudent) return;
    setSelectionPreset("custom");
    setSelectedKeys((prev) => {
      const exists = prev.includes(opt.key);
      if (exists) {
        return prev.filter((k) => k !== opt.key);
      }
      if (prev.length >= 12) {
        toast.warning(
          isAr ? "الحد الأقصى 12 حصة في وصل واحد." : "Maximum 12 séances par reçu."
        );
        return prev;
      }
      return [...prev, opt.key];
    });
  };

  const getSessionAmount = (key: string): number => {
    if (customizePerSession && customAmounts[key] !== undefined && customAmounts[key] !== "") {
      return Number(customAmounts[key]) || 0;
    }
    return Number(unitFee) || 0;
  };

  const computedTotal = useMemo(() => {
    return selectedOptions.reduce((sum, opt) => sum + getSessionAmount(opt.key), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOptions, unitFee, customizePerSession, customAmounts]);

  const handleApplyBundleTotalSplit = () => {
    const targetTotal = Number(bundleOverrideInput);
    if (isNaN(targetTotal) || targetTotal <= 0 || selectedOptions.length === 0) return;
    const parts = splitTotalAcrossSessions(targetTotal, selectedOptions.length);
    const nextMap: Record<string, number | string> = {};
    selectedOptions.forEach((opt, idx) => {
      nextMap[opt.key] = parts[idx];
    });
    setCustomAmounts(nextMap);
    setCustomizePerSession(true);
  };

  const handleResetForAnother = () => {
    setIssuedResult(null);
    setSelectedStudent(null);
    setQuery("");
    setCandidates([]);
    setHasSearched(false);
    setGuestName("");
    setGuestPhone("");
    setCustomizePerSession(false);
    setCustomAmounts({});
    setBundleOverrideInput("");
    setSelectionPreset("1");
    hasAutoSelectedInitialRef.current = false;
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const handleSubmit = () => {
    if (!lessonId && !effectiveClassId) {
      toast.error(isAr ? "يرجى اختيار الفوج أولاً." : "Veuillez sélectionner un groupe.");
      return;
    }

    if (selectedOptions.length === 0) {
      toast.error(
        isAr
          ? "يرجى اختيار حصة مراجعة واحدة على الأقل."
          : "Veuillez sélectionner au moins une séance de révision."
      );
      return;
    }

    const sessionsPayload = selectedOptions.map((opt) => ({
      lessonId: opt.lessonId,
      templateLessonId: opt.templateLessonId,
      targetDateStr: opt.targetDateStr,
      amount: getSessionAmount(opt.key),
      markPresentNow: opt.isTodayOrPast,
    }));

    if (sessionsPayload.some((s) => isNaN(s.amount) || s.amount <= 0)) {
      toast.error(
        isAr
          ? "يرجى تحديد مبلغ صالح لكل حصة مراجعة."
          : "Veuillez saisir un tarif valide pour chaque séance."
      );
      return;
    }

    if (activeTab === "search") {
      if (!selectedStudent) {
        toast.error(isAr ? "يرجى اختيار التلميذ أولاً." : "Veuillez sélectionner un élève.");
        return;
      }
      if (selectedStudent.isAlreadyEnrolled) {
        toast.error(
          isAr
            ? "هذا التلميذ مسجل بالفعل في هذا الفوج ولا يمكن إضافته كزائر."
            : "Cet élève est déjà inscrit dans ce groupe."
        );
        return;
      }

      startTransition(async () => {
        const res = await recordRevisionVisitorAction({
          lessonId: lessonId ?? undefined,
          classId: effectiveClassId ?? undefined,
          studentId: selectedStudent.id,
          sessions: sessionsPayload,
        });

        if (res.success) {
          toast.success(res.message);
          setIssuedResult({
            voucher: res.voucher,
            sessionsSummary: res.sessionsSummary || [],
          });
          if (lessonId) {
            notifyAttendanceChanged({ lessonId, source: "revision-visitor" });
          }
          onSuccess?.();
        } else {
          toast.error(res.message);
        }
      });
    } else {
      if (!guestName.trim()) {
        toast.error(
          isAr ? "يرجى إدخال اسم الزائر." : "Veuillez saisir le nom de l'invité."
        );
        return;
      }

      startTransition(async () => {
        const res = await recordRevisionVisitorAction({
          lessonId: lessonId ?? undefined,
          classId: effectiveClassId ?? undefined,
          newStudentData: {
            name: guestName.trim(),
            phone: guestPhone.trim() || undefined,
          },
          sessions: sessionsPayload,
        });

        if (res.success) {
          toast.success(res.message);
          setIssuedResult({
            voucher: res.voucher,
            sessionsSummary: res.sessionsSummary || [],
          });
          if (lessonId) {
            notifyAttendanceChanged({ lessonId, source: "revision-visitor" });
          }
          onSuccess?.();
        } else {
          toast.error(res.message);
        }
      });
    }
  };

  if (!isOpen) return null;

  const canSubmit =
    !isPending &&
    Boolean(lessonId || effectiveClassId) &&
    selectedOptions.length > 0 &&
    computedTotal > 0 &&
    ((activeTab === "search" && Boolean(selectedStudent) && !selectedStudent?.isAlreadyEnrolled) ||
      (activeTab === "new_guest" && Boolean(guestName.trim())));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs font-sans animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-teal-100 bg-gradient-to-r from-teal-50 via-teal-50/50 to-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Banknote className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900 text-base truncate">
                {isAr ? "تسجيل زائر حصة مراجعة" : "Paiement & Visiteur de révision"}
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                {resolvedClassInfo?.name || initialClassName
                  ? `${resolvedClassInfo?.name || initialClassName}${resolvedClassInfo?.branchName ? ` · ${resolvedClassInfo.branchName}` : ""}`
                  : isAr
                  ? "إمكانية دفع حصة واحدة أو عدة حصص في وصل موحّد"
                  : "Paiement d'une ou plusieurs séances sur un seul reçu"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {issuedResult ? (
            /* Success Screen with Multi-Session Breakdown & Unified Receipt Print */
            <div className="py-5 px-4 text-center rounded-xl border border-emerald-200 bg-emerald-50/60 flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h4 className="font-bold text-base text-emerald-950">
                  {issuedResult.sessionsSummary.length > 1
                    ? isAr
                      ? `تم تسجيل ${issuedResult.sessionsSummary.length} حصص مراجعة في وصل موحّد!`
                      : `${issuedResult.sessionsSummary.length} séances de révision enregistrées !`
                    : isAr
                    ? "تم تسجيل الحضور واستخراج الوصل بنجاح!"
                    : "Visiteur enregistré avec succès !"}
                </h4>
                <p className="text-xs text-emerald-800 mt-1">
                  {isAr
                    ? `التلميذ: ${issuedResult.voucher?.student?.name || ""} — وصل موحّد #${issuedResult.voucher?.number} بمبلغ ${formatDZD(
                        issuedResult.voucher?.totalAmount ?? issuedResult.voucher?.amount ?? 0,
                        locale
                      )}`
                    : `Élève : ${issuedResult.voucher?.student?.name || ""} — Reçu #${issuedResult.voucher?.number} (${formatDZD(
                        issuedResult.voucher?.totalAmount ?? issuedResult.voucher?.amount ?? 0,
                        locale
                      )})`}
                </p>
              </div>

              {/* Per-session status summary */}
              {issuedResult.sessionsSummary.length > 0 && (
                <div className="w-full max-w-md bg-white border border-emerald-200 rounded-xl divide-y divide-emerald-100 text-start overflow-hidden shadow-2xs">
                  {issuedResult.sessionsSummary.map((s) => (
                    <div
                      key={s.voucherId}
                      className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        <span className="font-mono font-bold text-gray-900" dir="ltr">
                          {s.displayDate}
                        </span>
                        <span className="font-mono font-semibold text-gray-600">
                          ({formatDZD(s.amount, locale)})
                        </span>
                      </div>
                      {s.checkedIn ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-900 border border-teal-200">
                          <Check className="w-3 h-3" />
                          {isAr ? "حاضر الآن" : "Présent"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                          <Clock className="w-3 h-3" />
                          {isAr ? "مدفوع مسبقاً (للتأكيد لاحقاً)" : "Prépayé (à pointer)"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white font-bold text-xs shadow-xs">
                  <PrintTicketButton
                    voucher={issuedResult.voucher}
                    sessionsForThisPayment={
                      issuedResult.sessionsSummary.length > 1
                        ? issuedResult.sessionsSummary.length
                        : undefined
                    }
                  />
                  <span>{isAr ? "طباعة الوصل الموحّد" : "Imprimer le reçu"}</span>
                </div>
                <button
                  type="button"
                  onClick={handleResetForAnother}
                  className="px-3.5 py-2 text-xs font-bold rounded-lg bg-teal-50 border border-teal-300 text-teal-900 hover:bg-teal-100 transition-colors cursor-pointer"
                >
                  {isAr ? "+ إضافة زائر آخر" : "+ Autre visiteur"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors shadow-xs cursor-pointer"
                >
                  {isAr ? "إغلاق" : "Fermer"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Step 0 (Standalone mode only): Pick a Group */}
              {needsGroupPicker && (
                <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-teal-600" />
                    <span>{isAr ? "1. اختر الفوج *" : "1. Choisir le groupe *"}</span>
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={classSearch}
                      onChange={(e) => setClassSearch(e.target.value)}
                      placeholder={
                        isAr
                          ? "ابحث باسم الفوج أو الأستاذ أو الفرع..."
                          : "Rechercher un groupe, prof ou siège..."
                      }
                      className="w-full ps-8 pe-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  {isLoadingClasses ? (
                    <div className="py-4 flex items-center justify-center gap-2 text-gray-400">
                      <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                      <span>{isAr ? "جارٍ تحميل الأفواج..." : "Chargement des groupes..."}</span>
                    </div>
                  ) : (
                    <div className="max-h-36 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-1.5 bg-white">
                      {filteredClasses.length === 0 ? (
                        <p className="text-center py-3 text-[11px] text-gray-400">
                          {isAr ? "لا توجد أفواج مطابقة." : "Aucun groupe trouvé."}
                        </p>
                      ) : (
                        filteredClasses.map((cls) => {
                          const isSelected = selectedClassId === cls.id;
                          return (
                            <button
                              key={cls.id}
                              type="button"
                              onClick={() => {
                                setSelectedClassId(cls.id);
                                setSelectedStudent(null);
                                setCandidates([]);
                                hasAutoSelectedInitialRef.current = false;
                                setSelectionPreset("1");
                              }}
                              className={`w-full text-start px-2.5 py-2 rounded-lg border text-xs transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                isSelected
                                  ? "border-teal-500 bg-teal-50 ring-1 ring-teal-400 font-bold text-teal-950"
                                  : "border-transparent hover:bg-gray-50 text-gray-800"
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="truncate font-semibold">{cls.name}</div>
                                {cls.teacherName && (
                                  <div className="text-[10px] text-gray-500 truncate">
                                    {cls.teacherName}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {(cls.prepaidCount || 0) > 0 && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">
                                    {cls.prepaidCount} {isAr ? "مدفوع" : "prép."}
                                  </span>
                                )}
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                                  {cls.branchName}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step 1: Existing Student vs New Walk-in Guest */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("search");
                      setSelectedStudent(null);
                    }}
                    className={`py-2 px-3 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      activeTab === "search"
                        ? "bg-white text-teal-900 shadow-xs"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{isAr ? "تلميذ مسجل بالمدرسة" : "Élève déjà inscrit"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("new_guest");
                      setSelectedStudent(null);
                    }}
                    className={`py-2 px-3 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      activeTab === "new_guest"
                        ? "bg-white text-teal-900 shadow-xs"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{isAr ? "زائر خارجي جديد" : "Nouvel invité externe"}</span>
                  </button>
                </div>

                {/* Mode 1: Search Existing Student */}
                {activeTab === "search" && (
                  <div className="space-y-2.5">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        disabled={!lessonId && !effectiveClassId}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={
                          !lessonId && !effectiveClassId
                            ? isAr
                              ? "اختر الفوج أولاً للبحث عن تلميذ..."
                              : "Choisissez d'abord un groupe..."
                            : isAr
                            ? "ابحث باسم التلميذ أو رقم التسجيل #..."
                            : "Rechercher par nom ou matricule #..."
                        }
                        className="w-full ps-9 pe-8 py-2.5 text-xs bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white text-gray-900 placeholder:text-gray-400 transition-all shadow-2xs disabled:opacity-60"
                      />
                      {query && (
                        <button
                          type="button"
                          onClick={() => setQuery("")}
                          className="absolute end-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {isSearching && candidates.length === 0 && (
                      <div className="py-4 flex flex-col items-center justify-center gap-1.5 text-gray-400">
                        <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                        <p className="text-[11px]">{isAr ? "جارٍ البحث..." : "Recherche en cours..."}</p>
                      </div>
                    )}

                    {hasSearched && !isSearching && candidates.length === 0 && query.trim() && (
                      <div className="py-4 px-3 text-center rounded-xl border border-dashed border-gray-300 bg-gray-50/50 text-gray-500">
                        <p className="text-xs font-semibold">
                          {isAr ? "لم يتم العثور على أي تلميذ." : "Aucun élève trouvé."}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          {isAr
                            ? "يمكنك الانتقال لتبويب 'زائر خارجي جديد' لتسجيله مباشرة."
                            : "Vous pouvez basculer vers 'Nouvel invité' pour l'enregistrer directement."}
                        </p>
                      </div>
                    )}

                    {candidates.length > 0 && (
                      <div className="max-h-40 overflow-y-auto space-y-1.5 border border-gray-200 rounded-xl p-2 bg-gray-50/40">
                        {candidates.map((cand) => {
                          const isSelected = selectedStudent?.id === cand.id;
                          const isEnrolled = cand.isAlreadyEnrolled;

                          return (
                            <div
                              key={cand.id}
                              onClick={() => {
                                if (!isEnrolled) setSelectedStudent(cand);
                              }}
                              className={`p-2 rounded-lg border text-xs transition-all flex items-center justify-between ${
                                isEnrolled
                                  ? "border-rose-200 bg-rose-50/50 opacity-70 cursor-not-allowed"
                                  : isSelected
                                  ? "border-teal-500 bg-teal-50 shadow-xs ring-1 ring-teal-400 cursor-pointer"
                                  : "border-gray-200 bg-white hover:border-teal-300 hover:bg-teal-50/30 cursor-pointer"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? "bg-teal-600 text-white"
                                      : isEnrolled
                                      ? "bg-rose-100 text-rose-600"
                                      : "bg-gray-100 text-gray-600"
                                  }`}
                                >
                                  {isSelected ? (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  ) : (
                                    <User className="w-3.5 h-3.5" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-gray-900 truncate">{cand.name}</span>
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 font-mono">
                                      #{cand.globalNumber}
                                    </span>
                                    {cand.branchName && (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-50 text-blue-700">
                                        {cand.branchName}
                                      </span>
                                    )}
                                  </div>
                                  {isEnrolled ? (
                                    <p className="text-[10px] font-semibold text-rose-600 mt-0.5">
                                      {isAr
                                        ? "⚠️ مسجل بالفعل في هذا الفوج (لا يمكن إضافته كزائر)"
                                        : "⚠️ Déjà inscrit dans ce groupe (ne peut pas être visiteur)"}
                                    </p>
                                  ) : cand.phone ? (
                                    <p className="text-[10px] text-gray-400 font-mono" dir="ltr">
                                      {cand.phone}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Mode 2: New Walk-in Guest */}
                {activeTab === "new_guest" && (
                  <div className="space-y-2.5 bg-gray-50/70 p-3 rounded-xl border border-gray-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-gray-700">
                          {isAr ? "اسم ولقب التلميذ الزائر *" : "Nom et prénom de l'invité *"}
                        </label>
                        <input
                          type="text"
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          placeholder={isAr ? "مثال: يونس بن علي" : "Ex: Younes Benali"}
                          className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-gray-700">
                          {isAr ? "رقم هاتف الولي (اختياري)" : "Téléphone parent (facultatif)"}
                        </label>
                        <input
                          type="text"
                          value={guestPhone}
                          onChange={(e) => setGuestPhone(e.target.value)}
                          placeholder="05 / 06 / 07..."
                          className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-teal-800 bg-teal-50 p-2 rounded-md border border-teal-200 leading-relaxed">
                      {isAr
                        ? "سيتم تسجيل التلميذ كضيف لحصة/حصص المراجعة المختارة فقط دون إدراجه في القائمة الدائمة للفوج."
                        : "L'élève sera enregistré pour la/les séance(s) choisie(s) sans intégrer l'effectif permanent du groupe."}
                    </p>
                  </div>
                )}
              </div>

              {/* Step 2: Revision Sessions Multi-Date Selector */}
              {(lessonId || effectiveClassId) && (
                <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-teal-600" />
                      <span>
                        {isAr ? "حصص المراجعة المشمولة بالدفع *" : "Séances de révision couvertes *"}
                      </span>
                      {selectedOptions.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-teal-600 text-white text-[10px] font-bold">
                          {selectedOptions.length}
                        </span>
                      )}
                    </label>

                    {/* 1-Click Quick Presets */}
                    <div className="inline-flex items-center gap-1 bg-white p-0.5 rounded-lg border border-gray-200">
                      <button
                        type="button"
                        disabled={availableLessonOptions.length < 1}
                        onClick={() => applyPreset("1")}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer disabled:opacity-40 ${
                          selectionPreset === "1"
                            ? "bg-teal-600 text-white shadow-2xs"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        {isAr ? "حصة واحدة" : "1 séance"}
                      </button>
                      <button
                        type="button"
                        disabled={availableLessonOptions.length < 2}
                        onClick={() => applyPreset("2")}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 ${
                          selectionPreset === "2"
                            ? "bg-teal-600 text-white shadow-2xs"
                            : "text-teal-800 bg-teal-50/60 hover:bg-teal-100"
                        }`}
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>{isAr ? "حصتان (+ القادمة)" : "2 séances (+ proc.)"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectionPreset("custom")}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                          selectionPreset === "custom"
                            ? "bg-slate-800 text-white shadow-2xs"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        {isAr ? "مخصص" : "Perso"}
                      </button>
                    </div>
                  </div>

                  {isLoadingOptions ? (
                    <div className="py-5 flex items-center justify-center gap-2 text-gray-400">
                      <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                      <span className="text-[11px]">
                        {isAr ? "جارٍ تحميل تواريخ الحصص..." : "Chargement des séances..."}
                      </span>
                    </div>
                  ) : lessonOptions.length === 0 ? (
                    <div className="py-4 px-3 text-center rounded-lg border border-dashed border-amber-300 bg-amber-50/70 text-amber-900 text-[11px]">
                      {isAr
                        ? "لا توجد حصص مجدولة قادمة لهذا الفوج في الجدول الزمني."
                        : "Aucune séance programmée à venir pour ce groupe."}
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pe-0.5">
                      {lessonOptions.map((opt) => {
                        const isChecked = selectedKeys.includes(opt.key);
                        const isBooked = opt.isAlreadyBookedByStudent;
                        const dayLabel =
                          WEEKDAY_LABELS[opt.weekday]?.[isAr ? "ar" : "fr"] || opt.weekday;

                        return (
                          <div
                            key={opt.key}
                            onClick={() => toggleDateKey(opt)}
                            className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                              isBooked
                                ? "border-emerald-200 bg-emerald-50/40 opacity-75 cursor-not-allowed"
                                : isChecked
                                ? "border-teal-500 bg-teal-50/90 ring-1 ring-teal-400 cursor-pointer shadow-2xs"
                                : "border-gray-200 bg-white hover:border-teal-300 hover:bg-teal-50/30 cursor-pointer"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                  isBooked
                                    ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                                    : isChecked
                                    ? "bg-teal-600 border-teal-600 text-white"
                                    : "bg-white border-gray-300 text-transparent"
                                }`}
                              >
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-gray-900">{dayLabel}</span>
                                  <span
                                    className="font-mono font-bold text-gray-900"
                                    dir="ltr"
                                  >
                                    {opt.displayDate}
                                  </span>
                                  <span
                                    className="text-[10px] font-mono text-gray-500"
                                    dir="ltr"
                                  >
                                    ({opt.startTime}–{opt.endTime})
                                  </span>
                                  {opt.isExtra && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                                      {isAr ? "إضافية" : "Extra"}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {isBooked ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <Check className="w-3 h-3" />
                                  {isAr ? "مدفوع مسبقاً" : "Déjà payé"}
                                </span>
                              ) : opt.isTodayOrPast ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-900 border border-teal-200">
                                  <Check className="w-3 h-3" />
                                  {isAr ? "حضور فوري" : "Présent"}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                  <Clock className="w-3 h-3" />
                                  {isAr ? "مدفوع مسبقاً" : "Prépayé"}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Smart Pricing Panel */}
              <div className="p-3.5 bg-teal-50/60 rounded-xl border border-teal-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-teal-700" />
                    <span>
                      {selectedOptions.length > 1
                        ? isAr
                          ? "سعر كل حصة مراجعة (دج) *"
                          : "Tarif par séance de révision (DZD) *"
                        : isAr
                        ? "سعر حصة المراجعة للزائر (دج) *"
                        : "Tarif de la séance de révision (DZD) *"}
                    </span>
                  </label>

                  {selectedOptions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = !customizePerSession;
                        setCustomizePerSession(next);
                        if (next) {
                          const base = Number(unitFee) || 0;
                          const map: Record<string, number | string> = {};
                          selectedOptions.forEach((o) => {
                            map[o.key] = customAmounts[o.key] ?? base;
                          });
                          setCustomAmounts(map);
                        }
                      }}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 hover:text-teal-950 underline cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      <span>
                        {customizePerSession
                          ? isAr
                            ? "سعر موحّد لكل الحصص"
                            : "Tarif uniforme"
                          : isAr
                          ? "تخصيص السعر / باقة"
                          : "Personnaliser / forfait"}
                      </span>
                    </button>
                  )}
                </div>

                {!customizePerSession ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={unitFee}
                      onChange={(e) => setUnitFee(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm font-mono font-bold bg-white border border-teal-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-teal-950"
                    />
                    <span className="text-xs font-bold text-teal-900 shrink-0">DZD / دج</span>
                    {selectedOptions.length > 1 && (
                      <span className="px-2.5 py-2 rounded-lg bg-teal-700 text-white font-mono font-bold text-xs shrink-0 shadow-2xs">
                        {selectedOptions.length} × {Number(unitFee) || 0} ={" "}
                        {formatDZD(computedTotal, locale)}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Quick Bundle Total Splitter */}
                    <div className="flex items-center gap-1.5 bg-white p-2 rounded-lg border border-teal-200">
                      <span className="text-[10px] font-bold text-teal-900 shrink-0">
                        {isAr ? "مجموع الباقة:" : "Forfait total :"}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={bundleOverrideInput}
                        onChange={(e) => setBundleOverrideInput(e.target.value)}
                        placeholder={String(computedTotal)}
                        className="w-24 px-2 py-1 text-xs font-mono font-bold border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                      <button
                        type="button"
                        onClick={handleApplyBundleTotalSplit}
                        className="px-2.5 py-1 text-[10px] font-bold rounded bg-teal-600 text-white hover:bg-teal-700 cursor-pointer"
                      >
                        {isAr ? "توزيع بالتساوي" : "Répartir"}
                      </button>
                    </div>

                    {/* Individual session amounts */}
                    <div className="space-y-1.5">
                      {selectedOptions.map((opt) => (
                        <div
                          key={opt.key}
                          className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-teal-200"
                        >
                          <span className="font-mono font-bold text-gray-800 text-[11px]" dir="ltr">
                            {opt.displayDate} ({opt.startTime})
                          </span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              step="50"
                              value={customAmounts[opt.key] ?? unitFee}
                              onChange={(e) =>
                                setCustomAmounts((prev) => ({
                                  ...prev,
                                  [opt.key]: e.target.value,
                                }))
                              }
                              className="w-24 px-2 py-1 text-xs font-mono font-bold bg-teal-50/40 border border-teal-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-500 text-end"
                            />
                            <span className="text-[10px] font-bold text-teal-900">DZD</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-teal-800 leading-relaxed">
                  {selectedOptions.length > 1
                    ? isAr
                      ? "يُصدر وصل موحّد بالمبلغ الإجمالي في صندوق اليوم. يُحسب أجر الأستاذ لكل حصة في تاريخها الفعلي عند تأكيد حضور التلميذ."
                      : "Un seul reçu est émis sur la caisse du jour. La paie de l'enseignant est comptabilisée à la date de chaque séance dès confirmation de présence."
                    : isAr
                    ? "كامل هذا المبلغ يُعتبر رسوم مراجعة ويُحسب للأستاذ بنسبته المتفق عليها عند الحضور."
                    : "Ce montant correspond aux frais de révision et est calculé pour l'enseignant selon son pourcentage lors de la présence."}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                >
                  {isAr ? "إلغاء" : "Annuler"}
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{isAr ? "جارٍ الحفظ واستخراج الوصل..." : "Enregistrement..."}</span>
                    </>
                  ) : (
                    <>
                      <Printer className="w-3.5 h-3.5" />
                      <span>
                        {selectedOptions.length > 1
                          ? isAr
                            ? `تأكيد دفع ${selectedOptions.length} حصص (${formatDZD(computedTotal, locale)})`
                            : `Valider ${selectedOptions.length} séances (${formatDZD(computedTotal, locale)})`
                          : isAr
                          ? `تأكيد الدفع (${formatDZD(computedTotal, locale)})`
                          : `Valider paiement (${formatDZD(computedTotal, locale)})`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
