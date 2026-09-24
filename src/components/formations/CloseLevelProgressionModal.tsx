"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  getFormationClosurePreview,
  closeFormationLevelsWithCascade,
} from "@/lib/formationActions";
import { toast } from "react-toastify";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Users,
  GraduationCap,
  X,
  Check,
} from "lucide-react";

interface CloseLevelProgressionModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: number;
  onSuccess?: () => void;
}

export default function CloseLevelProgressionModal({
  isOpen,
  onClose,
  classId,
  onSuccess,
}: CloseLevelProgressionModalProps) {
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [isLoadingPreview, setIsLoadingPreview] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);

  // Question step tracking
  // questionIndex: 0 means asking about subsequentLevels[0] (e.g. Level 2)
  const [questionIndex, setQuestionIndex] = useState<number>(0);
  const [closureDecisions, setClosureDecisions] = useState<
    Array<{ levelNumber: number; isClosed: boolean }>
  >([]);
  const [isReviewStep, setIsReviewStep] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setPreviewData(null);
      setQuestionIndex(0);
      setClosureDecisions([]);
      setIsReviewStep(false);
      return;
    }

    let isMounted = true;
    setIsLoadingPreview(true);

    getFormationClosurePreview(classId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          setPreviewData(res.data);
          // If no subsequent levels (final level), go straight to review
          if (!res.data.subsequentLevels || res.data.subsequentLevels.length === 0) {
            setIsReviewStep(true);
          }
        } else {
          toast.error(res.message);
          onClose();
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        toast.error(err?.message || "Erreur de chargement");
        onClose();
      })
      .finally(() => {
        if (isMounted) setIsLoadingPreview(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, classId, onClose]);

  if (!isOpen) return null;

  const currentLevel = previewData?.currentLevel;
  const currentClass = previewData?.currentClass;
  const succeededStudents = previewData?.succeededStudents || [];
  const otherStudents = previewData?.otherStudents || [];
  const subsequentLevels = previewData?.subsequentLevels || [];

  const handleDecision = (isClosed: boolean) => {
    const currentTargetLevel = subsequentLevels[questionIndex];
    if (!currentTargetLevel) return;

    const newDecisions = [
      ...closureDecisions,
      { levelNumber: currentTargetLevel.levelNumber, isClosed },
    ];
    setClosureDecisions(newDecisions);

    if (!isClosed) {
      // User said NO -> chain stops! Go straight to confirmation review
      setIsReviewStep(true);
    } else {
      // User said YES -> check if there is another subsequent level to ask about
      const nextIndex = questionIndex + 1;
      if (nextIndex < subsequentLevels.length) {
        setQuestionIndex(nextIndex);
      } else {
        // Reached end of levels
        setIsReviewStep(true);
      }
    }
  };

  const handleExecuteClosure = async () => {
    setIsSubmitting(true);
    try {
      const res = await closeFormationLevelsWithCascade({
        startingClassId: classId,
        closureDecisions,
      });

      if (res.success) {
        toast.success(res.message);
        onClose();
        if (onSuccess) onSuccess();
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentQuestionLevel = subsequentLevels[questionIndex];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-primary px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                {t("closeLevelTitle")}
              </h2>
              <p className="text-xs text-blue-100">
                {currentClass?.name || previewData?.language?.name} • {currentLevel?.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 font-sans text-sm">
          {isLoadingPreview ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-gray-500">Chargement des données du niveau...</p>
            </div>
          ) : (
            <>
              {/* Level 1 / Current Level Summary */}
              <div className="bg-surface-subtle border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {t("currentLevel")}
                    </span>
                    <h3 className="text-base font-bold text-gray-900">
                      {currentLevel?.name} ({currentClass?.name})
                    </h3>
                  </div>
                  <Badge variant="primary" size="md">
                    {currentClass?.totalEnrolled} {locale === "ar" ? "تلميذ" : "stagiaire(s)"}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border text-xs">
                  <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg p-2.5 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold text-emerald-900 text-sm">
                        {succeededStudents.length}
                      </span>{" "}
                      {locale === "ar" ? "ناجح مؤهل للترقية" : "admis qualifié(s)"}
                    </div>
                  </div>

                  <div className="bg-gray-50 text-gray-700 border border-gray-200 rounded-lg p-2.5 flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-500 shrink-0" />
                    <div>
                      <span className="font-bold text-gray-900 text-sm">
                        {otherStudents.length}
                      </span>{" "}
                      {locale === "ar" ? "غير مسجل نجاحهم" : "non admis / sans test"}
                    </div>
                  </div>
                </div>

                {succeededStudents.length > 0 && (
                  <div className="pt-2 text-xs text-gray-600">
                    <p className="font-semibold mb-1">
                      {locale === "ar" ? "قائمة التلاميذ المؤهلين للترقية التلقائية :" : "Élèves qui seront automatiquement inscrits :"}
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {succeededStudents.map((s: any) => (
                        <span
                          key={s.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-emerald-300 text-emerald-900 font-medium text-[11px]"
                        >
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>{s.name}</span>
                          {s.score !== null && ` (${s.score}/100)`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sequential Level-by-Level Question */}
              {!isReviewStep && currentQuestionLevel && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                          {locale === "ar"
                            ? `سؤال المستوى ${currentQuestionLevel.levelNumber} (خطوة ${questionIndex + 1}/${subsequentLevels.length})`
                            : `Question Niveau ${currentQuestionLevel.levelNumber} (Étape ${questionIndex + 1}/${subsequentLevels.length})`}
                        </span>
                        <h4 className="text-base font-bold text-gray-900 mt-1">
                          {t("closeLevelPrompt", { nextLevel: currentQuestionLevel.levelName })}
                        </h4>
                        <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                          {locale === "ar"
                            ? `المستوى المستهدف هو (${currentQuestionLevel.levelName}). هل انتهت دورته الحالية وتريد إغلاقه لتبدأ قائمة التلاميذ جديدة، أم هو مستمر ليدمج التلاميذ الناجحون مع المسجلين حالياً؟`
                            : `Le niveau cible est (${currentQuestionLevel.levelName}). Si vous le clôturez, ses anciens élèves valident leur cycle et une liste vierge est ouverte pour les admis du niveau précédent.`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Decision Options */}
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => handleDecision(false)}
                      className="w-full text-start p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all flex items-start gap-3 group"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-bold shrink-0 group-hover:bg-primary/10 group-hover:text-primary">
                        1
                      </div>
                      <div className="flex-1">
                        <h5 className="font-bold text-gray-900 group-hover:text-primary">
                          {t("closeLevelOptionNo")}
                        </h5>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {t("closeLevelOptionNoDesc", { nextLevel: currentQuestionLevel.levelName })}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary self-center" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDecision(true)}
                      className="w-full text-start p-4 rounded-xl border-2 border-border hover:border-amber-500 hover:bg-amber-50/50 transition-all flex items-start gap-3 group"
                    >
                      <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold shrink-0 group-hover:bg-amber-200">
                        2
                      </div>
                      <div className="flex-1">
                        <h5 className="font-bold text-gray-900 group-hover:text-amber-900">
                          {t("closeLevelOptionYes", { nextLevel: currentQuestionLevel.levelName })}
                        </h5>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {t("closeLevelOptionYesDesc", { nextLevel: currentQuestionLevel.levelName })}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-amber-600 self-center" />
                    </button>
                  </div>
                </div>
              )}

              {/* Final Review & Confirmation Step */}
              {isReviewStep && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <h4 className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      {t("summaryClosing")}
                    </h4>
                    <div className="mt-3 space-y-2 text-xs">
                      {/* Starting Level */}
                      <div className="bg-white p-3 rounded-lg border border-emerald-100 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-900">
                            • {currentLevel?.name}
                          </span>
                          <Badge variant="success" size="sm">
                            {locale === "ar" ? "سيتم إغلاقه" : "Sera clôturé"}
                          </Badge>
                        </div>
                        <p className="text-gray-600">
                          {succeededStudents.length > 0
                            ? locale === "ar"
                              ? `سيتم تسجيل ${succeededStudents.length} تلميذ ناجح في المستوى التالي (${subsequentLevels[0]?.levelName || "المستوى 2"}).`
                              : `${succeededStudents.length} élève(s) admis seront inscrits dans le niveau suivant.`
                            : locale === "ar"
                            ? "لا يوجد تلاميذ ناجحون لتسجيلهم تلقائياً."
                            : "Aucun élève admis à promouvoir."}
                        </p>
                      </div>

                      {/* Subsequent decisions */}
                      {closureDecisions.map((dec) => {
                        const targetLvl = subsequentLevels.find(
                          (l: any) => l.levelNumber === dec.levelNumber
                        );
                        if (!targetLvl) return null;
                        return (
                          <div
                            key={dec.levelNumber}
                            className="bg-white p-3 rounded-lg border border-emerald-100 space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-gray-900">
                                • {targetLvl.levelName}
                              </span>
                              <Badge
                                variant={dec.isClosed ? "warning" : "neutral"}
                                size="sm"
                              >
                                {dec.isClosed
                                  ? locale === "ar"
                                    ? "سيتم إغلاقه (قائمة جديدة)"
                                    : "Sera clôturé (Liste vierge)"
                                  : locale === "ar"
                                  ? "يبقى مفتوحاً (دمج مع القدامى)"
                                  : "Reste ouvert (Fusion)"}
                              </Badge>
                            </div>
                            <p className="text-gray-600">
                              {dec.isClosed
                                ? locale === "ar"
                                  ? "سيتم إنهاء دورة هذا المستوى وترقية ناجحيه، وفتح فوج جديد للتلاميذ القادمين."
                                  : "Cycle clôturé. Ses admis avanceront et un groupe vierge recevra les nouveaux inscrits."
                                : locale === "ar"
                                ? "يبقى الفوج مفتوحاً وسيتم إضافة التلاميذ الجدد مع التلاميذ المسجلين حالياً."
                                : "Le groupe reste ouvert avec les stagiaires actuels."}
                            </p>
                          </div>
                        );
                      })}

                      {subsequentLevels.length === 0 && (
                        <div className="bg-white p-3 rounded-lg border border-emerald-100 text-gray-600">
                          {t("finalLevelReachedNotice")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border bg-surface-subtle flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {tCommon("cancel")}
          </Button>

          {isReviewStep ? (
            <Button
              type="button"
              variant="primary"
              onClick={handleExecuteClosure}
              isLoading={isSubmitting}
              leftIcon={<CheckCircle2 className="w-4 h-4" />}
              className="font-bold shadow-md"
            >
              {t("confirmAndExecuteClosure")}
            </Button>
          ) : (
            <div className="text-xs text-gray-500 italic">
              {locale === "ar" ? "يرجى اختيار أحد الخيارين للمتابعة" : "Veuillez choisir une option ci-dessus"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
