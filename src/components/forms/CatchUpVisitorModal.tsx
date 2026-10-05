"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { toast } from "react-toastify";
import { useTranslations, useLocale } from "next-intl";
import { Search, Loader2, X, AlertCircle, CheckCircle2, User, Calendar } from "lucide-react";
import { searchCatchUpCandidatesAction, recordCatchUpAttendanceAction } from "@/lib/actions";

interface MissedLesson {
  attendanceId: number;
  lessonId: number;
  className: string;
  teacherName: string;
  startsAt: string | Date;
}

interface CandidateStudent {
  id: string;
  name: string;
  globalNumber: number;
  phone: string | null;
  branchName?: string | null;
  missedLessons: MissedLesson[];
}

interface CatchUpVisitorModalProps {
  lessonId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CatchUpVisitorModal({
  lessonId,
  isOpen,
  onClose,
  onSuccess,
}: CatchUpVisitorModalProps) {
  const t = useTranslations("attendance");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [candidates, setCandidates] = useState<CandidateStudent[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<CandidateStudent | null>(null);
  const [selectedMissedLessonId, setSelectedMissedLessonId] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isPending, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const searchCacheRef = useRef<Map<string, CandidateStudent[]>>(new Map());
  const latestReqIdRef = useRef<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Focus search input when modal opens, and clean up state when closed
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      latestReqIdRef.current++;
      setQuery("");
      setIsSearching(false);
      setCandidates([]);
      setSelectedStudent(null);
      setSelectedMissedLessonId(null);
      setHasSearched(false);
      searchCacheRef.current.clear();
    }
  }, [isOpen]);

  // Close modal on Escape key
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleGlobalKeyDown);
    }
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isOpen, onClose]);

  // Smart selection helper: auto-select single viable candidate with missed lessons
  const autoSelectCandidate = useCallback((list: CandidateStudent[]) => {
    const viableCandidates = list.filter((c) => c.missedLessons.length > 0);
    if (viableCandidates.length === 1) {
      const single = viableCandidates[0];
      setSelectedStudent(single);
      if (single.missedLessons.length > 0) {
        setSelectedMissedLessonId(single.missedLessons[0].lessonId);
      }
    } else {
      setSelectedStudent((prev) => {
        if (!prev) return null;
        const exists = viableCandidates.find((c) => c.id === prev.id);
        return exists || null;
      });
    }
  }, []);

  // Core search execution function
  const executeSearch = useCallback(
    async (searchTerm: string) => {
      const trimmed = searchTerm.trim();
      if (!trimmed) {
        setCandidates([]);
        setSelectedStudent(null);
        setSelectedMissedLessonId(null);
        setIsSearching(false);
        setHasSearched(false);
        return;
      }

      const cacheKey = trimmed.toLowerCase();
      if (searchCacheRef.current.has(cacheKey)) {
        const cached = searchCacheRef.current.get(cacheKey)!;
        setCandidates(cached);
        setHasSearched(true);
        setIsSearching(false);
        autoSelectCandidate(cached);
        return;
      }

      const reqId = ++latestReqIdRef.current;
      setIsSearching(true);

      try {
        const res = await searchCatchUpCandidatesAction(lessonId, trimmed);
        if (reqId !== latestReqIdRef.current) return;

        if (res.success && res.candidates) {
          searchCacheRef.current.set(cacheKey, res.candidates);
          setCandidates(res.candidates);
          setHasSearched(true);
          autoSelectCandidate(res.candidates);
        } else {
          toast.error(res.message || t("searchError"));
        }
      } catch (err: any) {
        if (reqId !== latestReqIdRef.current) return;
        toast.error(err.message || t("networkError"));
      } finally {
        if (reqId === latestReqIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    [lessonId, t, autoSelectCandidate]
  );

  // Live query change handler with fast 220ms debounce
  const handleQueryChange = (val: string) => {
    setQuery(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (!val.trim()) {
      latestReqIdRef.current++;
      setCandidates([]);
      setSelectedStudent(null);
      setSelectedMissedLessonId(null);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);

    debounceTimerRef.current = setTimeout(() => {
      executeSearch(val);
    }, 220);
  };

  // Instant clear handler
  const handleClear = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    latestReqIdRef.current++;
    setQuery("");
    setCandidates([]);
    setSelectedStudent(null);
    setSelectedMissedLessonId(null);
    setIsSearching(false);
    setHasSearched(false);
    inputRef.current?.focus();
  };

  // Keyboard navigation on search input
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // If a student and lesson are already selected, confirm directly on Enter!
      if (selectedStudent && selectedMissedLessonId && !isSearching && !isPending) {
        handleConfirmCatchUp();
        return;
      }

      executeSearch(query);
    }
  };

  const handleSelectStudent = (student: CandidateStudent) => {
    setSelectedStudent(student);
    if (student.missedLessons.length > 0) {
      setSelectedMissedLessonId(student.missedLessons[0].lessonId);
    } else {
      setSelectedMissedLessonId(null);
    }
  };

  const handleConfirmCatchUp = () => {
    if (!selectedStudent || !selectedMissedLessonId) {
      toast.error(t("pleaseSelectStudentAndLesson"));
      return;
    }

    startTransition(async () => {
      try {
        const res = await recordCatchUpAttendanceAction({
          catchUpLessonId: lessonId,
          studentId: selectedStudent.id,
          missedLessonId: selectedMissedLessonId,
        });

        if (res.success) {
          toast.success(res.message);
          onClose();
          if (onSuccess) onSuccess();
        } else {
          toast.error(res.message);
        }
      } catch (err: any) {
        toast.error(err.message || t("failedToRecordCatchUp"));
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2.5 text-gray-900">
            <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </span>
            <div>
              <h3 className="font-bold text-base text-gray-900">{t("catchUpModalTitle")}</h3>
              <p className="text-xs text-gray-500">{t("catchUpModalSubtitle")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <Image src="/close.png" alt="close" width={14} height={14} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Live Search Bar */}
          <div className="space-y-1.5">
            <div className="relative flex items-center">
              <div className="absolute start-3 pointer-events-none text-gray-400 flex items-center justify-center">
                {isSearching ? (
                  <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 text-gray-400" />
                )}
              </div>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={t("catchUpSearchPlaceholder")}
                className="w-full ps-9 pe-9 py-2.5 text-xs sm:text-sm bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 shadow-xs transition-all placeholder:text-gray-400 font-sans"
              />
              {query && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute end-2.5 p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                  title={tCommon("clear") || "Effacer"}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Live status line */}
            <div className="flex items-center justify-between px-1 text-[11px] text-gray-400">
              <span>{t("catchUpLiveSearchHint")}</span>
              {candidates.length > 0 && (
                <span className="font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  {t("studentsFoundCount", { count: candidates.length })}
                </span>
              )}
            </div>
          </div>

          {/* Initial state when input is empty */}
          {!query.trim() && (
            <div className="py-6 px-4 text-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 flex flex-col items-center justify-center gap-2">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                <Search className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-gray-700">{t("typeToSearchCandidate")}</p>
              <p className="text-[11px] text-gray-400 max-w-xs">
                {locale === "ar"
                  ? "ابحث بالاسم، أو رقم التسجيل (مثال: 15#)، أو الهاتف لعرض الغيابات السابقة مباشرة."
                  : "Recherchez par nom, matricule (ex. #15) ou téléphone pour afficher immédiatement les absences."}
              </p>
            </div>
          )}

          {/* Searching loading state if initial query in-flight */}
          {isSearching && candidates.length === 0 && (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
              <p className="text-xs">{t("searching")}</p>
            </div>
          )}

          {/* Empty search results state */}
          {hasSearched && !isSearching && candidates.length === 0 && query.trim() && (
            <div className="py-6 px-4 text-center rounded-xl border border-dashed border-amber-200 bg-amber-50/30 flex flex-col items-center justify-center gap-2">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                <AlertCircle className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-gray-800">{t("catchUpNoResults")}</p>
              <p className="text-[11px] text-gray-500">
                {locale === "ar"
                  ? "تأكد من كتابة الاسم أو رقم التسجيل، أو قد يكون التلميذ لا يملك أي غياب غير معوض."
                  : "Vérifiez l'orthographe du nom ou du matricule, ou l'élève n'a pas d'absences à compenser."}
              </p>
            </div>
          )}

          {/* Candidates List */}
          {candidates.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 block">
                {t("selectCandidateStudent")}
              </label>
              <div className="max-h-48 overflow-y-auto space-y-1.5 border border-gray-200 rounded-xl p-2 bg-gray-50/50">
                {candidates.map((cand) => {
                  const isSelected = selectedStudent?.id === cand.id;
                  const hasAbsences = cand.missedLessons.length > 0;

                  return (
                    <div
                      key={cand.id}
                      onClick={() => hasAbsences && handleSelectStudent(cand)}
                      className={`p-2.5 rounded-lg border text-xs transition-all flex items-center justify-between ${
                        isSelected
                          ? "border-amber-500 bg-amber-50/90 shadow-xs ring-1 ring-amber-400 cursor-pointer"
                          : hasAbsences
                          ? "border-gray-200 bg-white hover:border-amber-300 hover:bg-amber-50/30 cursor-pointer"
                          : "border-gray-100 bg-gray-100/70 opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                            isSelected
                              ? "bg-amber-600 text-white"
                              : hasAbsences
                              ? "bg-gray-100 text-gray-600"
                              : "bg-gray-200 text-gray-400"
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
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">
                              #{cand.globalNumber}
                            </span>
                            {cand.branchName && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                                {cand.branchName}
                              </span>
                            )}
                          </div>
                          {cand.phone && (
                            <div className="text-[10px] text-gray-400 font-mono" dir="ltr">
                              {cand.phone}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 ms-2">
                        {hasAbsences ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              isSelected
                                ? "bg-amber-200 text-amber-900"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {t("missedLessonsCount", { count: cand.missedLessons.length })}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">
                            {t("noAbsencesRecorded")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Missed Lessons Picker for Selected Student */}
          {selectedStudent && (
            <div className="space-y-2.5 pt-2 border-t border-gray-100 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-600" />
                  <span>{t("selectMissedLesson", { name: selectedStudent.name })}</span>
                </label>
              </div>

              {selectedStudent.missedLessons.length === 0 ? (
                <div className="p-3 text-xs text-amber-800 bg-amber-50 rounded-lg border border-amber-200">
                  {t("noUncompensatedLessons")}
                </div>
              ) : (
                <div className="space-y-2 max-h-44 overflow-y-auto pr-0.5">
                  {selectedStudent.missedLessons.map((ml) => {
                    const isChosen = selectedMissedLessonId === ml.lessonId;
                    const lessonDate = new Date(ml.startsAt).toLocaleDateString(
                      locale === "ar" ? "ar-DZ" : "fr-DZ",
                      {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      }
                    );

                    return (
                      <label
                        key={ml.lessonId}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          isChosen
                            ? "border-amber-500 bg-amber-50/80 shadow-xs ring-1 ring-amber-400/50"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        }`}
                      >
                        <input
                          type="radio"
                          name="missedLesson"
                          checked={isChosen}
                          onChange={() => setSelectedMissedLessonId(ml.lessonId)}
                          className="mt-0.5 text-amber-600 focus:ring-amber-500 cursor-pointer accent-amber-600"
                        />
                        <div className="flex-1 text-xs space-y-1">
                          <div className="font-bold text-gray-900 flex items-center justify-between">
                            <span>{t("groupClassLabel", { name: ml.className })}</span>
                            <span className="text-gray-500 font-normal">{lessonDate}</span>
                          </div>
                          <div className="text-gray-600 text-[11px]">
                            {t("teacherNameFormatted", { name: ml.teacherName })}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Informational reassurance badge */}
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-[11px] leading-relaxed">
                {t("catchUpNoticeReassurance")}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors cursor-pointer"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            disabled={isPending || !selectedStudent || !selectedMissedLessonId}
            onClick={handleConfirmCatchUp}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1.5"
          >
            {isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t("saving")}</span>
              </>
            ) : (
              <span>{t("recordCatchUpBtn")}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
