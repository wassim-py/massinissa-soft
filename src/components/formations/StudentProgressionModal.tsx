"use client";

import { useEffect, useState } from "react";
import { getStudentLanguageProgression } from "@/lib/formationActions";
import { useTranslations, useLocale } from "next-intl";
import { X, History, GraduationCap, Building2, CheckCircle2, XCircle } from "lucide-react";

export default function StudentProgressionModal({
  isOpen,
  onClose,
  studentId,
  languageId,
}: {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  languageId: number;
}) {
  const t = useTranslations("formations");
  const locale = useLocale();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && studentId && languageId) {
      setLoading(true);
      getStudentLanguageProgression(studentId, languageId)
        .then((res) => {
          if (res.success) {
            setData(res.data);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, studentId, languageId]);

  if (!isOpen) return null;

  const dateLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 px-6 py-4 text-white flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">{t("progressionHeading")}</h2>
            <p className="text-xs text-blue-100">
              {data ? `${data.student.name} • ${t("language")}: ${data.language.name}` : t("loadingProgression")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 font-sans">
          {loading ? (
            <div className="py-12 text-center text-gray-500">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
              {t("loadingProgression")}
            </div>
          ) : !data ? (
            <div className="py-12 text-center text-gray-500">{t("noProgression")}</div>
          ) : (
            <>
              {/* Profile Bar */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 text-base">{data.student.name}</h3>
                  <p className="text-xs text-gray-500">{t("studentId", { id: data.student.id })}</p>
                </div>
                <div className="text-end">
                  <span className="text-xs px-3 py-1 bg-blue-100 text-blue-800 font-bold rounded-full">
                    {t("language")}: {data.language.name}
                  </span>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {t("languageLevelsTotal", { count: data.language.FormationLevel?.length || 0 })}
                  </p>
                </div>
              </div>

              {/* Combined Timeline: Enrollments & Tests */}
              <div>
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <History className="w-4 h-4 text-primary" />
                  <span>{t("progressionTimeline")}</span>
                </h4>

                <div className="relative border-s-2 border-blue-200 ms-4 ps-6 space-y-6">
                  {/* Enrollments events */}
                  {data.enrollments.map((enr: any) => {
                    const enrDate = new Date(enr.enrolledAt).toLocaleDateString(dateLocale);
                    const lvlName = enr.class.FormationLevel?.name || `${t("level")} ${enr.class.formationLevelId}`;
                    const lvlNum = enr.class.FormationLevel?.levelNumber || 1;

                    // Check if there are tests for this level/class
                    const matchingTests = data.levelTests.filter(
                      (tst: any) => tst.classId === enr.classId || tst.formationLevelId === enr.class.formationLevelId
                    );

                    return (
                      <div key={`enr-${enr.id}`} className="relative group">
                        {/* Dot */}
                        <div className="absolute -start-[31px] top-1 w-4 h-4 rounded-full bg-blue-600 border-2 border-white ring-2 ring-blue-100 shadow" />

                        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-blue-300 transition">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                              <GraduationCap className="w-3.5 h-3.5" />
                              <span>{t("levelRegistration", { level: lvlNum, name: lvlName })}</span>
                            </span>
                            <span className="text-xs text-gray-400 font-medium">{enrDate}</span>
                          </div>

                          <div className="mt-2 text-sm text-gray-800 font-semibold">
                            {t("groupLabel")} {enr.class.name}
                          </div>

                          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-muted shrink-0" />
                              <span>{enr.class.branch?.name || t("branch")}</span>
                            </span>
                            <span>•</span>
                            <span>{enr.academicYear?.label || t("currentYear")}</span>
                            <span>•</span>
                            <span>
                              {enr.inscriptionFeeCharged
                                ? `${enr.inscriptionFeeAmount || 0} DZD`
                                : t("feeExempt")}
                            </span>
                          </div>

                          {/* Level Test result if any */}
                          {matchingTests.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                              {matchingTests.map((tst: any) => {
                                const tDate = new Date(tst.testDate).toLocaleDateString(dateLocale);
                                return (
                                  <div
                                    key={`test-${tst.id}`}
                                    className={`rounded-lg p-3 text-xs flex items-center justify-between border ${
                                      tst.passed
                                        ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
                                        : "bg-rose-50/80 border-rose-200 text-rose-900"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      {tst.passed ? (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                      ) : (
                                        <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                                      )}
                                      <div>
                                        <p className="font-bold">
                                          {t("levelTest")}: {tst.passed ? t("passed") : t("failed")}
                                        </p>
                                        <p className="text-[11px] opacity-80 mt-0.5">
                                          {t("scoreAdministeredBy", {
                                            score: tst.score !== null ? `${tst.score}` : "-",
                                            admin: tst.administeredBy,
                                          })}
                                        </p>
                                      </div>
                                    </div>
                                    <span className="text-[11px] opacity-70 font-medium">{tDate}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-xl transition"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
