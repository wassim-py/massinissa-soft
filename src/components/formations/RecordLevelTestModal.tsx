"use client";

import { useState } from "react";
import { recordLevelTest } from "@/lib/formationActions";
import { toast } from "react-toastify";
import { useTranslations } from "next-intl";

export default function RecordLevelTestModal({
  isOpen,
  onClose,
  student,
  formationClass,
  formationLevel,
  onTestRecorded,
}: {
  isOpen: boolean;
  onClose: () => void;
  student: { id: string; name: string };
  formationClass: { id: number; name: string };
  formationLevel: { id: number; name: string; levelNumber: number; languageId: number };
  onTestRecorded?: (result: {
    levelTest: any;
    nextLevel: any;
    availableNextGroups: any[];
  }) => void;
}) {
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");

  const [testDate, setTestDate] = useState(new Date().toISOString().split("T")[0]);
  const [score, setScore] = useState<string>("80");
  const [passed, setPassed] = useState<boolean>(true);
  const [administeredBy, setAdministeredBy] = useState<string>("Admin / Enseignant");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await recordLevelTest({
        studentId: student.id,
        classId: formationClass.id,
        formationLevelId: formationLevel.id,
        testDate: new Date(testDate),
        score: score ? Number(score) : null,
        passed,
        administeredBy,
      });

      if (res.success) {
        toast.success(res.message);
        onClose();
        if (onTestRecorded && res.data) {
          onTestRecorded(res.data);
        }
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 text-white flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">{t("recordTestHeading")}</h2>
            <p className="text-xs text-blue-100 mt-0.5">
              {student.name} • {formationLevel.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-xl font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm font-sans">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">{t("student")}</span>
              <span className="font-semibold text-gray-800">{student.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("currentGroup")}</span>
              <span className="font-semibold text-gray-800">{formationClass.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("testedLevel")}</span>
              <span className="font-semibold text-blue-700">{formationLevel.name}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {t("testDate")}
              </label>
              <input
                type="date"
                value={testDate}
                onChange={(e) => setTestDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 text-sm outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {t("scoreAchieved")}
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="Ex: 85"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 text-sm outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {t("finalResult")}
            </label>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <button
                type="button"
                onClick={() => setPassed(true)}
                className={`py-2.5 px-4 rounded-xl border text-center font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                  passed
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-100"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
              >
                <span>✓</span> {t("passed")}
              </button>
              <button
                type="button"
                onClick={() => setPassed(false)}
                className={`py-2.5 px-4 rounded-xl border text-center font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                  !passed
                    ? "bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-100"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
              >
                <span>✗</span> {t("failed")}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {t("administeredBy")}
            </label>
            <input
              type="text"
              value={administeredBy}
              onChange={(e) => setAdministeredBy(e.target.value)}
              placeholder={t("administeredByPlaceholder")}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 text-sm outline-none"
              required
            />
          </div>

          <div
            className={`rounded-lg p-3 text-xs ${
              passed
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-amber-50 border border-amber-200 text-amber-800"
            }`}
          >
            {passed ? (
              <p>
                🚀 <strong>{t("passed")}:</strong> {t("testPassedAlert")}
              </p>
            ) : (
              <p>
                ⚠️ <strong>{t("failed")}:</strong> {t("testFailedAlert")}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              {tCommon("cancel")}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 text-sm font-medium text-white rounded-lg shadow disabled:opacity-50 transition ${
                passed ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isSubmitting ? t("savingTest") : t("saveTestResult")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
