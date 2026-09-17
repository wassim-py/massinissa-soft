"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "react-toastify";
import { useTranslations, useLocale } from "next-intl";
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
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setSelectedStudent(null);
    setSelectedMissedLessonId(null);

    try {
      const res = await searchCatchUpCandidatesAction(lessonId, query);
      if (res.success && res.candidates) {
        setCandidates(res.candidates);
        if (res.candidates.length === 0) {
          toast.info(t("noCandidatesFound"));
        }
      } else {
        toast.error(res.message || t("searchError"));
      }
    } catch (err: any) {
      toast.error(err.message || t("networkError"));
    } finally {
      setIsSearching(false);
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
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Image src="/close.png" alt="close" width={14} height={14} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("catchUpSearchPlaceholder")}
              className="flex-1 px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="submit"
              disabled={isSearching || !query.trim()}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors shrink-0"
            >
              {isSearching ? t("searching") : t("searchBtn")}
            </button>
          </form>

          {/* Search Results */}
          {candidates.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 block">
                {t("selectCandidateStudent")}
              </label>
              <div className="max-h-40 overflow-y-auto space-y-1.5 border border-gray-200 rounded-lg p-2 bg-gray-50/50">
                {candidates.map((cand) => {
                  const isSelected = selectedStudent?.id === cand.id;
                  const hasAbsences = cand.missedLessons.length > 0;

                  return (
                    <div
                      key={cand.id}
                      onClick={() => hasAbsences && handleSelectStudent(cand)}
                      className={`p-2.5 rounded-lg border text-xs transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? "border-amber-500 bg-amber-50 shadow-xs"
                          : hasAbsences
                          ? "border-gray-200 bg-white hover:border-amber-300"
                          : "border-gray-100 bg-gray-100 opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{cand.name}</span>
                        <span className="text-[11px] text-gray-500">#{cand.globalNumber}</span>
                      </div>
                      <div>
                        {hasAbsences ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-800">
                            {t("missedLessonsCount", { count: cand.missedLessons.length })}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">{t("noAbsencesRecorded")}</span>
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
                <label className="text-xs font-bold text-gray-800">
                  {t("selectMissedLesson", { name: selectedStudent.name })}
                </label>
              </div>

              {selectedStudent.missedLessons.length === 0 ? (
                <div className="p-3 text-xs text-amber-800 bg-amber-50 rounded-lg border border-amber-200">
                  {t("noUncompensatedLessons")}
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedStudent.missedLessons.map((ml) => {
                    const isChosen = selectedMissedLessonId === ml.lessonId;
                    const lessonDate = new Date(ml.startsAt).toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ", {
                      weekday: "short",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    });

                    return (
                      <label
                        key={ml.lessonId}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          isChosen
                            ? "border-amber-500 bg-amber-50/70 shadow-xs"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        }`}
                      >
                        <input
                          type="radio"
                          name="missedLesson"
                          checked={isChosen}
                          onChange={() => setSelectedMissedLessonId(ml.lessonId)}
                          className="mt-0.5 text-amber-600 focus:ring-amber-500"
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
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            disabled={isPending || !selectedStudent || !selectedMissedLessonId}
            onClick={handleConfirmCatchUp}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? t("saving") : t("recordCatchUpBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
