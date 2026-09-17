"use client";

import { useState } from "react";
import { levelUpStudent } from "@/lib/formationActions";
import { toast } from "react-toastify";
import { useTranslations, useLocale } from "next-intl";

export default function AssistedLevelUpModal({
  isOpen,
  onClose,
  student,
  levelTest,
  nextLevel,
  availableGroups,
  onLevelUpSuccess,
  onRequestCreateGroup,
}: {
  isOpen: boolean;
  onClose: () => void;
  student: { id: string; name: string };
  levelTest: { id: number; score?: any; testDate: Date | string };
  nextLevel: { id: number; name: string; levelNumber: number } | null;
  availableGroups: Array<{
    id: number;
    name: string;
    branch?: { name: string };
    ageGroup?: string | null;
    pricePerCycle?: any;
    lessons?: Array<{
      startsAt: Date | string;
      endsAt: Date | string;
      teacher?: { name: string };
      classroom?: { name: string };
    }>;
    _count?: { enrollments: number };
  }>;
  onLevelUpSuccess?: () => void;
  onRequestCreateGroup?: () => void;
}) {
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [selectedClassId, setSelectedClassId] = useState<number | null>(
    availableGroups[0]?.id || null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  if (!nextLevel) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 text-center animate-in fade-in zoom-in-95 duration-200">
          <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl font-bold">
            🎓
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">{t("maxLevelReachedTitle")}</h2>
          <p className="text-sm text-gray-600 mb-6">
            {t("maxLevelReachedDesc", { student: student.name })}
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-gray-800 hover:bg-gray-900 text-white rounded-xl text-sm font-medium transition"
          >
            {tCommon("close")}
          </button>
        </div>
      </div>
    );
  }

  const handleLevelUp = async () => {
    if (!selectedClassId) {
      toast.error("يرجى اختيار الفوج التكويني المناسب للتلميذ");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await levelUpStudent({
        studentId: student.id,
        levelTestId: levelTest.id,
        targetClassId: selectedClassId,
      });

      if (res.success) {
        toast.success(res.message);
        onClose();
        if (onLevelUpSuccess) onLevelUpSuccess();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ ما");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🚀</span>
            <div>
              <h2 className="text-lg font-bold">{t("assistedLevelUpHeader")}</h2>
              <p className="text-xs text-emerald-100">
                {t("assistedLevelUpSub", { level: nextLevel.name })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-xl font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-sm font-sans">
          {/* Student Status Summary */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-emerald-700 font-medium">{t("promotedStudent")}</p>
              <p className="text-base font-bold text-gray-900">{student.name}</p>
            </div>
            <div className="text-end">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                {t("passedWithScore", { score: levelTest.score !== null ? `${levelTest.score}/100` : t("passed") })}
              </span>
              <p className="text-[11px] text-gray-500 mt-1">
                {t("nextLevelLabel")} <strong>Niveau {nextLevel.levelNumber} ({nextLevel.name})</strong>
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                {t("availableGroupsInLevel", { level: nextLevel.name, count: availableGroups.length })}
              </h3>
              {onRequestCreateGroup && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRequestCreateGroup();
                  }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  {t("createNewGroupForLevel")}
                </button>
              )}
            </div>

            {availableGroups.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center space-y-3">
                <p className="text-sm text-amber-800 font-medium">
                  {t("noGroupsInNextLevel", { level: nextLevel.name })}
                </p>
                <p className="text-xs text-gray-600">
                  {t("createGroupAndPromoteHint")}
                </p>
                {onRequestCreateGroup && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onRequestCreateGroup();
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow"
                  >
                    {t("createGroupNow", { level: nextLevel.name })}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {availableGroups.map((grp) => {
                  const isSelected = selectedClassId === grp.id;
                  const lessons = grp.lessons || [];

                  return (
                    <div
                      key={grp.id}
                      onClick={() => setSelectedClassId(grp.id)}
                      className={`cursor-pointer rounded-xl border p-4 transition-all ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-400/50 shadow-sm"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/70"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            checked={isSelected}
                            onChange={() => setSelectedClassId(grp.id)}
                            className="text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                          />
                          <div>
                            <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                              {grp.name}
                              {grp.ageGroup && (
                                <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-gray-100 text-gray-700 border">
                                  {grp.ageGroup}
                                </span>
                              )}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                              <span className="font-medium text-sky-800">
                                🏢 {grp.branch?.name || (locale === "ar" ? "فرع" : "Branche")}
                              </span>
                              <span>•</span>
                              <span>
                                {grp._count?.enrollments || 0} {t("enrolled")}
                              </span>
                              {grp.pricePerCycle && (
                                <>
                                  <span>•</span>
                                  <span className="font-semibold text-gray-700 font-mono">
                                    {Number(grp.pricePerCycle).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            isSelected
                              ? "bg-emerald-600 text-white"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {isSelected ? t("selectedForPromotion") : t("select")}
                        </span>
                      </div>

                      {/* Lesson schedule display */}
                      {lessons.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600 flex flex-wrap gap-2">
                          <span className="font-semibold text-gray-700">{t("weeklyScheduleLabel")}</span>
                          {lessons.map((les, idx) => {
                            const start = new Date(les.startsAt);
                            const end = new Date(les.endsAt);
                            const timeStr = `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
                            return (
                              <span
                                key={idx}
                                className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded text-[11px] font-medium font-mono"
                              >
                                {timeStr} {les.teacher ? `(${les.teacher.name})` : ""}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700">
            {t("levelUpNote")}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between font-sans">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            disabled={isSubmitting || !selectedClassId || availableGroups.length === 0}
            onClick={handleLevelUp}
            className="px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-xl shadow-md disabled:opacity-50 transition flex items-center gap-2"
          >
            {isSubmitting ? t("submittingLevelUp") : t("confirmLevelUp")}
          </button>
        </div>
      </div>
    </div>
  );
}
