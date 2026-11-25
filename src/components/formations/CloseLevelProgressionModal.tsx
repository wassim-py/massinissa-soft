"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  getFormationClosurePreview,
  closeFormationLevelsWithCascade,
  LevelClosureDecisionInput,
} from "@/lib/formationActions";
import { toast } from "react-toastify";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertTriangle,
  Users,
  GraduationCap,
  X,
  Check,
  Plus,
  Building2,
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

  const [questionIndex, setQuestionIndex] = useState<number>(0);
  const [closureDecisions, setClosureDecisions] = useState<
    Array<LevelClosureDecisionInput>
  >([]);
  const [isReviewStep, setIsReviewStep] = useState(false);

  // Per-question selection state
  const [selectedMode, setSelectedMode] = useState<
    "ENROLL_EXISTING" | "CREATE_NEW_KEEP_OPEN" | "CLOSE_GROUP_AND_CREATE_NEW"
  >("ENROLL_EXISTING");
  const [selectedExistingClassId, setSelectedExistingClassId] = useState<number | null>(null);
  const [selectedClosedClassId, setSelectedClosedClassId] = useState<number | null>(null);
  const [newGroupName, setNewGroupName] = useState<string>("");
  const [newGroupBranchId, setNewGroupBranchId] = useState<number>(1);
  const [newGroupTeacherId, setNewGroupTeacherId] = useState<string>("");

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
          const hasNext =
            res.data.subsequentLevels && res.data.subsequentLevels.length > 0;
          const hasPassed =
            res.data.succeededStudents && res.data.succeededStudents.length > 0;
          // If final level or 0 students passed in this group, go straight to confirmation
          if (!hasNext || !hasPassed) {
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

  const subsequentLevels = previewData?.subsequentLevels || [];
  const currentQuestionLevel = subsequentLevels[questionIndex];

  useEffect(() => {
    if (!currentQuestionLevel || !previewData) return;
    const activeGroups = currentQuestionLevel.activeGroups || [];
    if (activeGroups.length > 0) {
      setSelectedMode("ENROLL_EXISTING");
      setSelectedExistingClassId(activeGroups[0].id);
      setSelectedClosedClassId(activeGroups[0].id);
    } else {
      setSelectedMode("CREATE_NEW_KEEP_OPEN");
      setSelectedExistingClassId(null);
      setSelectedClosedClassId(null);
    }
    setNewGroupName(currentQuestionLevel.suggestedNewGroupName || "");
    setNewGroupBranchId(previewData.currentClass?.branchId || 1);
    setNewGroupTeacherId(previewData.currentClass?.teacherId || "");
  }, [questionIndex, currentQuestionLevel, previewData]);

  if (!isOpen) return null;

  const currentLevel = previewData?.currentLevel;
  const currentClass = previewData?.currentClass;
  const succeededStudents = previewData?.succeededStudents || [];
  const otherStudents = previewData?.otherStudents || [];
  const branches: Array<{ id: number; name: string }> = previewData?.branches || [];
  const teachers: Array<{ id: string; name: string }> = previewData?.teachers || [];

  const handleConfirmStepDecision = () => {
    if (!currentQuestionLevel) return;

    const decision: LevelClosureDecisionInput = {
      levelNumber: currentQuestionLevel.levelNumber,
      mode: selectedMode,
      isClosed: selectedMode === "CLOSE_GROUP_AND_CREATE_NEW",
      targetClassId:
        selectedMode === "ENROLL_EXISTING" && selectedExistingClassId
          ? selectedExistingClassId
          : undefined,
      closedClassId:
        selectedMode === "CLOSE_GROUP_AND_CREATE_NEW" && selectedClosedClassId
          ? selectedClosedClassId
          : undefined,
      newGroupName:
        selectedMode !== "ENROLL_EXISTING" ? newGroupName.trim() || undefined : undefined,
      newGroupBranchId:
        selectedMode !== "ENROLL_EXISTING" ? Number(newGroupBranchId) : undefined,
      newGroupTeacherId:
        selectedMode !== "ENROLL_EXISTING" ? newGroupTeacherId || null : undefined,
    };

    const nextDecisions = [...closureDecisions, decision];
    setClosureDecisions(nextDecisions);

    if (selectedMode !== "CLOSE_GROUP_AND_CREATE_NEW") {
      // No group closed in nextLevel -> chain stops
      setIsReviewStep(true);
    } else {
      // Check if the group being closed in nextLevel has passed students AND another level follows
      const closedGrp = (currentQuestionLevel.activeGroups || []).find(
        (g: any) => g.id === selectedClosedClassId
      );
      const nextIdx = questionIndex + 1;
      if (
        nextIdx < subsequentLevels.length &&
        (closedGrp?.passedStudentsCount || 0) > 0
      ) {
        setQuestionIndex(nextIdx);
      } else {
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

  const activeGroupsInQuestion: Array<any> =
    currentQuestionLevel?.activeGroups || [];

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
              <h2 className="text-base font-bold">{t("closeLevelTitle")}</h2>
              <p className="text-xs text-blue-100">
                {currentClass?.name || previewData?.language?.name} •{" "}
                {currentLevel?.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 font-sans text-sm">
          {isLoadingPreview ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-gray-500">
                {locale === "ar"
                  ? "جاري تحميل بيانات الفوج..."
                  : "Chargement des données du groupe..."}
              </p>
            </div>
          ) : (
            <>
              {/* Current Group Summary */}
              <div className="bg-surface-subtle border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {t("currentGroup")}
                    </span>
                    <h3 className="text-base font-bold text-gray-900">
                      {currentClass?.name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {currentLevel?.name}
                      {currentClass?.branchName
                        ? ` • ${currentClass.branchName}`
                        : ""}
                    </p>
                  </div>
                  <Badge variant="primary" size="md">
                    {currentClass?.totalEnrolled}{" "}
                    {locale === "ar" ? "تلميذ" : "stagiaire(s)"}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border text-xs">
                  <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg p-2.5 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold text-emerald-900 text-sm">
                        {succeededStudents.length}
                      </span>{" "}
                      {locale === "ar"
                        ? "ناجح مؤهل للترقية"
                        : "admis qualifié(s)"}
                    </div>
                  </div>

                  <div className="bg-gray-50 text-gray-700 border border-gray-200 rounded-lg p-2.5 flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-500 shrink-0" />
                    <div>
                      <span className="font-bold text-gray-900 text-sm">
                        {otherStudents.length}
                      </span>{" "}
                      {locale === "ar"
                        ? "غير مسجل نجاحهم"
                        : "non admis / sans test"}
                    </div>
                  </div>
                </div>

                {succeededStudents.length > 0 && (
                  <div className="pt-2 text-xs text-gray-600">
                    <p className="font-semibold mb-1">
                      {locale === "ar"
                        ? "قائمة التلاميذ المؤهلين للترقية :"
                        : "Élèves admis à promouvoir :"}
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

              {/* Next-Level Group Placement Question */}
              {!isReviewStep && currentQuestionLevel && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-blue-950">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">
                          {locale === "ar"
                            ? `المستوى التالي : ${currentQuestionLevel.levelName}`
                            : `Destination : ${currentQuestionLevel.levelName}`}
                        </span>
                        <h4 className="text-sm font-bold text-gray-900 mt-0.5">
                          {t("selectTargetGroupInNextLevel", {
                            nextLevel: currentQuestionLevel.levelName,
                          })}
                        </h4>
                      </div>
                    </div>
                  </div>

                  {/* Option 1: Enroll in an existing active group of nextLevel */}
                  {activeGroupsInQuestion.length > 0 && (
                    <div
                      onClick={() => setSelectedMode("ENROLL_EXISTING")}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all space-y-3 ${
                        selectedMode === "ENROLL_EXISTING"
                          ? "border-primary bg-primary/[0.03]"
                          : "border-border hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          checked={selectedMode === "ENROLL_EXISTING"}
                          onChange={() => setSelectedMode("ENROLL_EXISTING")}
                          className="mt-1 text-primary focus:ring-primary h-4 w-4"
                        />
                        <div className="flex-1">
                          <h5 className="font-bold text-gray-900">
                            {t("closeLevelOptionNo")}
                          </h5>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {t("closeLevelOptionNoDesc", {
                              nextLevel: currentQuestionLevel.levelName,
                            })}
                          </p>
                        </div>
                      </div>

                      {selectedMode === "ENROLL_EXISTING" && (
                        <div className="ps-7 space-y-2">
                          {activeGroupsInQuestion.map((grp: any) => {
                            const isPicked = selectedExistingClassId === grp.id;
                            return (
                              <div
                                key={grp.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedExistingClassId(grp.id);
                                }}
                                className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 transition-colors ${
                                  isPicked
                                    ? "border-primary bg-white font-semibold text-gray-900 shadow-2xs"
                                    : "border-gray-200 bg-gray-50/70 text-gray-700 hover:bg-white"
                                }`}
                              >
                                <div>
                                  <div className="font-bold">{grp.name}</div>
                                  <div className="text-[11px] text-gray-500 flex items-center gap-1.5 mt-0.5">
                                    {grp.branchName && (
                                      <span className="inline-flex items-center gap-1">
                                        <Building2 className="w-3 h-3" />
                                        {grp.branchName}
                                      </span>
                                    )}
                                    {grp.teacherName && (
                                      <span>• {grp.teacherName}</span>
                                    )}
                                  </div>
                                </div>
                                <Badge
                                  variant={isPicked ? "primary" : "neutral"}
                                  size="sm"
                                >
                                  {grp.enrolledCount} {t("enrolled")}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Option 2: Create a brand-new group in nextLevel while keeping existing groups open */}
                  <div
                    onClick={() => setSelectedMode("CREATE_NEW_KEEP_OPEN")}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all space-y-3 ${
                      selectedMode === "CREATE_NEW_KEEP_OPEN"
                        ? "border-emerald-500 bg-emerald-50/30"
                        : "border-border hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        checked={selectedMode === "CREATE_NEW_KEEP_OPEN"}
                        onChange={() => setSelectedMode("CREATE_NEW_KEEP_OPEN")}
                        className="mt-1 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                      />
                      <div className="flex-1">
                        <h5 className="font-bold text-gray-900 flex items-center gap-1.5">
                          <Plus className="w-4 h-4 text-emerald-600" />
                          <span>
                            {t("createNewGroupKeepOpen", {
                              nextLevel: currentQuestionLevel.levelName,
                            })}
                          </span>
                        </h5>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {locale === "ar"
                            ? "إنشاء فوج جديد مخصص لهؤلاء الناجحين مع إبقاء الأفواج الأخرى في هذا المستوى مفتوحة."
                            : "Ouvre un nouveau groupe dédié à ces admis tout en gardant les autres groupes de ce niveau actifs."}
                        </p>
                      </div>
                    </div>

                    {selectedMode === "CREATE_NEW_KEEP_OPEN" && (
                      <div
                        className="ps-7 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                            {t("groupNameLabel")}
                          </label>
                          <input
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                        {branches.length > 0 && (
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                              {t("branch")}
                            </label>
                            <select
                              value={newGroupBranchId}
                              onChange={(e) =>
                                setNewGroupBranchId(Number(e.target.value))
                              }
                              className="w-full px-2.5 py-2 rounded-lg border border-gray-300 bg-white outline-none"
                            >
                              {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                            {t("teacher")}
                          </label>
                          <select
                            value={newGroupTeacherId}
                            onChange={(e) =>
                              setNewGroupTeacherId(e.target.value)
                            }
                            className="w-full px-2.5 py-2 rounded-lg border border-gray-300 bg-white outline-none"
                          >
                            <option value="">{t("unassignedTeacher")}</option>
                            {teachers.map((tc) => (
                              <option key={tc.id} value={tc.id}>
                                {tc.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Option 3: Cascade-close an existing group in nextLevel and open a fresh group */}
                  {activeGroupsInQuestion.length > 0 && (
                    <div
                      onClick={() =>
                        setSelectedMode("CLOSE_GROUP_AND_CREATE_NEW")
                      }
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all space-y-3 ${
                        selectedMode === "CLOSE_GROUP_AND_CREATE_NEW"
                          ? "border-amber-500 bg-amber-50/40"
                          : "border-border hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          checked={
                            selectedMode === "CLOSE_GROUP_AND_CREATE_NEW"
                          }
                          onChange={() =>
                            setSelectedMode("CLOSE_GROUP_AND_CREATE_NEW")
                          }
                          className="mt-1 text-amber-600 focus:ring-amber-500 h-4 w-4"
                        />
                        <div className="flex-1">
                          <h5 className="font-bold text-gray-900">
                            {t("closeLevelOptionYes", {
                              nextLevel: currentQuestionLevel.levelName,
                            })}
                          </h5>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {t("closeLevelOptionYesDesc", {
                              nextLevel: currentQuestionLevel.levelName,
                            })}
                          </p>
                        </div>
                      </div>

                      {selectedMode === "CLOSE_GROUP_AND_CREATE_NEW" && (
                        <div
                          className="ps-7 space-y-2.5 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {activeGroupsInQuestion.length > 1 && (
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                                {locale === "ar"
                                  ? "اختر الفوج المنتهي في هذا المستوى :"
                                  : "Groupe à clôturer dans ce niveau :"}
                              </label>
                              <select
                                value={selectedClosedClassId || ""}
                                onChange={(e) =>
                                  setSelectedClosedClassId(
                                    Number(e.target.value)
                                  )
                                }
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white outline-none"
                              >
                                {activeGroupsInQuestion.map((grp: any) => (
                                  <option key={grp.id} value={grp.id}>
                                    {grp.name} ({grp.enrolledCount}{" "}
                                    {t("enrolled")})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                              {locale === "ar"
                                ? "اسم الفوج الجديد للقادمين :"
                                : "Nom du nouveau groupe vierge :"}
                            </label>
                            <input
                              type="text"
                              value={newGroupName}
                              onChange={(e) => setNewGroupName(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
                      <div className="bg-white p-3 rounded-lg border border-emerald-100 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-900">
                            • {currentClass?.name} ({currentLevel?.name})
                          </span>
                          <Badge variant="success" size="sm">
                            {locale === "ar"
                              ? "سيتم إنهاء دورته"
                              : "Cycle clôturé"}
                          </Badge>
                        </div>
                        <p className="text-gray-600">
                          {succeededStudents.length > 0 &&
                          subsequentLevels.length > 0
                            ? locale === "ar"
                              ? `سيتم ترقية ${succeededStudents.length} تلميذ ناجح إلى المستوى التالي (${subsequentLevels[0]?.levelName}).`
                              : `${succeededStudents.length} élève(s) admis seront promus vers ${subsequentLevels[0]?.levelName}.`
                            : locale === "ar"
                            ? "تبقى باقي أفواج هذا المستوى نشطة دون تغيير."
                            : "Les autres groupes de ce niveau restent actifs sans modification."}
                        </p>
                      </div>

                      {closureDecisions.map((dec) => {
                        const targetLvl = subsequentLevels.find(
                          (l: any) => l.levelNumber === dec.levelNumber
                        );
                        if (!targetLvl) return null;
                        const targetExistingGrp = (
                          targetLvl.activeGroups || []
                        ).find((g: any) => g.id === dec.targetClassId);

                        return (
                          <div
                            key={dec.levelNumber}
                            className="bg-white p-3 rounded-lg border border-emerald-100 space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-gray-900">
                                • {targetLvl.levelName}
                              </span>
                              <Badge
                                variant={
                                  dec.mode === "CLOSE_GROUP_AND_CREATE_NEW"
                                    ? "warning"
                                    : dec.mode === "CREATE_NEW_KEEP_OPEN"
                                    ? "primary"
                                    : "neutral"
                                }
                                size="sm"
                              >
                                {dec.mode === "CLOSE_GROUP_AND_CREATE_NEW"
                                  ? locale === "ar"
                                    ? "إغلاق فوج + فوج جديد"
                                    : "Clôture + Nouveau groupe"
                                  : dec.mode === "CREATE_NEW_KEEP_OPEN"
                                  ? locale === "ar"
                                    ? "فوج جديد إضافي"
                                    : "Nouveau groupe créé"
                                  : targetExistingGrp?.name ||
                                    (locale === "ar"
                                      ? "فوج حالي"
                                      : "Groupe existant")}
                              </Badge>
                            </div>
                            <p className="text-gray-600">
                              {dec.mode === "ENROLL_EXISTING"
                                ? locale === "ar"
                                  ? `يسجل الناجحون في الفوج الحالي: ${targetExistingGrp?.name || ""}.`
                                  : `Les admis seront inscrits dans le groupe : ${targetExistingGrp?.name || ""}.`
                                : locale === "ar"
                                ? `سيتم إنشاء الفوج الجديد: ${dec.newGroupName || targetLvl.suggestedNewGroupName}.`
                                : `Nouveau groupe créé : ${dec.newGroupName || targetLvl.suggestedNewGroupName}.`}
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
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirmStepDecision}
              disabled={
                selectedMode === "ENROLL_EXISTING" && !selectedExistingClassId
              }
            >
              {tCommon("confirm")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
