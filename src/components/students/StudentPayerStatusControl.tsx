"use client";

import { useState, useTransition } from "react";
import {
  updateEnrollmentPayerStatusAction,
  updateStudentPayerStatusAction,
  toggleEnrollmentSuspensionAction,
} from "@/lib/actions";
import { executeWithRetry } from "@/lib/retryUtils";
import { toast } from "react-toastify";
import { useTranslations, useLocale } from "next-intl";
import {
  Check,
  Loader2,
  Sparkles,
  ShieldAlert,
  AlertOctagon,
  AlertTriangle,
  X,
} from "lucide-react";
import { SearchableGroupSelect } from "@/components/ui/SearchableGroupSelect";
import { Button } from "@/components/ui/Button";

export interface EnrolledGroupPayerInfo {
  enrollmentId: number;
  classId: number;
  className: string;
  branchName: string;
  payerStatus: string;
  status?: string;
}

interface StudentPayerStatusControlProps {
  studentId: string;
  enrolledGroups?: EnrolledGroupPayerInfo[];
  currentStatus?: string;
  canEdit?: boolean;
}

export default function StudentPayerStatusControl({
  studentId,
  enrolledGroups = [],
  currentStatus = "NORMAL",
  canEdit = true,
}: StudentPayerStatusControlProps) {
  const t = useTranslations("studentProfile");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  // Selected group state (default to first enrolled group)
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(
    enrolledGroups.length > 0 ? enrolledGroups[0].enrollmentId : null
  );

  // Status mappings per enrollment ID
  const [payerStatusMap, setPayerStatusMap] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    enrolledGroups.forEach((g) => {
      map[g.enrollmentId] = g.payerStatus || "NORMAL";
    });
    return map;
  });

  const [enrollmentStatusMap, setEnrollmentStatusMap] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    enrolledGroups.forEach((g) => {
      map[g.enrollmentId] = g.status || "ACTIVE";
    });
    return map;
  });

  // Notice & Confirmation modal state
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    target: "SUSPENDED" | "NORMAL";
    enrollmentId: number;
    className: string;
  } | null>(null);

  // Current selected group
  const currentGroup =
    enrolledGroups.find((g) => g.enrollmentId === selectedEnrollmentId) ||
    enrolledGroups[0] ||
    null;

  const activePayerStatus = currentGroup
    ? payerStatusMap[currentGroup.enrollmentId] || currentGroup.payerStatus || "NORMAL"
    : currentStatus;

  const activeEnrollmentStatus = currentGroup
    ? enrollmentStatusMap[currentGroup.enrollmentId] || currentGroup.status || "ACTIVE"
    : "ACTIVE";

  const isSuspended = activeEnrollmentStatus === "SUSPENDED";
  const isNormal = !isSuspended && activePayerStatus === "NORMAL";
  const isNonPayer = !isSuspended && activePayerStatus === "NON_PAYER";
  const isSchoolFeesOnly = !isSuspended && activePayerStatus === "SCHOOL_FEES_ONLY";

  const handlePayerToggle = (target: "NORMAL" | "NON_PAYER" | "SCHOOL_FEES_ONLY") => {
    if (!canEdit || isPending) return;

    if (!currentGroup) {
      // Fallback for student with no enrollments
      startTransition(async () => {
        try {
          const res = await executeWithRetry(() =>
            updateStudentPayerStatusAction(studentId, target)
          );
          if (res.success) toast.success(res.message);
          else toast.error(res.message);
        } catch (err: any) {
          toast.error(err?.message || "Erreur de mise à jour");
        }
      });
      return;
    }

    // If currently suspended, clicking Normal should prompt the re-enrollment notice modal
    if (isSuspended) {
      if (target === "NORMAL") {
        setModalState({
          isOpen: true,
          target: "NORMAL",
          enrollmentId: currentGroup.enrollmentId,
          className: currentGroup.className,
        });
      } else {
        toast.info(
          locale === "ar"
            ? "يجب إعادة التلميذ للحالة العادية أولاً لضبط نظام الدفع."
            : "Veuillez d'abord réinscrire l'élève en statut Normal avant de modifier son régime tarifaire."
        );
      }
      return;
    }

    let newStatus: string = target;
    if (target !== "NORMAL" && activePayerStatus === target) {
      newStatus = "NORMAL";
    }

    if (newStatus === activePayerStatus && target === "NORMAL") {
      return;
    }

    const prev = activePayerStatus;
    const enrollId = currentGroup.enrollmentId;

    setPayerStatusMap((prevMap) => ({ ...prevMap, [enrollId]: newStatus }));

    startTransition(async () => {
      try {
        const res = await executeWithRetry(() =>
          updateEnrollmentPayerStatusAction(studentId, enrollId, newStatus)
        );
        if (res.success) {
          toast.success(res.message);
          if (res.payerStatus) {
            setPayerStatusMap((prevMap) => ({ ...prevMap, [enrollId]: res.payerStatus! }));
          }
        } else {
          toast.error(res.message);
          setPayerStatusMap((prevMap) => ({ ...prevMap, [enrollId]: prev }));
        }
      } catch (err: any) {
        toast.error(err?.message || "Erreur de mise à jour");
        setPayerStatusMap((prevMap) => ({ ...prevMap, [enrollId]: prev }));
      }
    });
  };

  const handleSuspensionClick = () => {
    if (!canEdit || isPending || !currentGroup) return;

    if (isSuspended) {
      // Prompt to restore to Normal with notice
      setModalState({
        isOpen: true,
        target: "NORMAL",
        enrollmentId: currentGroup.enrollmentId,
        className: currentGroup.className,
      });
    } else {
      // Prompt to Suspend with notice
      setModalState({
        isOpen: true,
        target: "SUSPENDED",
        enrollmentId: currentGroup.enrollmentId,
        className: currentGroup.className,
      });
    }
  };

  const handleConfirmModalAction = () => {
    if (!modalState || isPending) return;

    const { target, enrollmentId } = modalState;
    setModalState(null);

    startTransition(async () => {
      try {
        const res = await executeWithRetry(() =>
          toggleEnrollmentSuspensionAction(studentId, enrollmentId, target)
        );
        if (res.success) {
          toast.success(res.message);
          if (target === "SUSPENDED") {
            setEnrollmentStatusMap((prev) => ({ ...prev, [enrollmentId]: "SUSPENDED" }));
          } else {
            setEnrollmentStatusMap((prev) => ({ ...prev, [enrollmentId]: "ACTIVE" }));
            setPayerStatusMap((prev) => ({ ...prev, [enrollmentId]: "NORMAL" }));
          }
        } else {
          toast.error(res.message);
        }
      } catch (err: any) {
        toast.error(err?.message || "Erreur lors de la mise à jour");
      }
    });
  };

  return (
    <>
      <div className="flex flex-col gap-2.5 pt-3.5 mt-3 border-t border-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-gray-700">
              {t("payerStatusTitle")}:
            </span>
            {isPending && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
            )}
          </div>

          {/* Group Selector when student has multiple groups */}
          {enrolledGroups.length > 1 && (
            <div className="flex items-center gap-1.5 self-start sm:self-auto">
              <label htmlFor="group-select" className="text-[11px] font-semibold text-muted">
                {t("selectGroup")}:
              </label>
              <SearchableGroupSelect
                options={enrolledGroups.map((g) => {
                  const grpStatus = enrollmentStatusMap[g.enrollmentId] || g.status;
                  const grpPayer = payerStatusMap[g.enrollmentId] || g.payerStatus;
                  const statusTag =
                    grpStatus === "SUSPENDED"
                      ? locale === "ar" ? " (معلّق)" : " (Suspendu)"
                      : grpPayer === "NON_PAYER"
                      ? locale === "ar" ? " (معفى)" : " (Non-payeur)"
                      : grpPayer === "SCHOOL_FEES_ONLY"
                      ? locale === "ar" ? " (فوج مدرسة)" : " (Frais école)"
                      : "";
                  return {
                    id: g.enrollmentId,
                    name: g.className,
                    secondaryLabel: `${g.branchName}${statusTag}`,
                  };
                })}
                value={selectedEnrollmentId ?? ""}
                onChange={(val) => setSelectedEnrollmentId(Number(val))}
                disabled={isPending}
                searchPlaceholder={locale === "ar" ? "بحث عن فوج..." : "Rechercher un groupe..."}
                buttonClassName="text-xs font-semibold px-2.5 py-1 min-h-[34px] max-w-[240px] rounded-lg"
              />
            </div>
          )}

          {/* Single group indicator */}
          {enrolledGroups.length === 1 && (
            <span className="text-xs text-muted font-medium self-start sm:self-auto">
              <span className="font-semibold text-gray-800">
                {enrolledGroups[0].className}
              </span>{" "}
              ({enrolledGroups[0].branchName})
            </span>
          )}
        </div>

        {enrolledGroups.length === 0 ? (
          <p className="text-xs text-muted italic bg-surface-subtle p-2 rounded-lg border border-border/60">
            {t("noGroupsForStatus")}
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            {/* Segmented selector with 4 buttons: Normal, Non-payer, School fees only, and Suspended */}
            <div
              className="inline-flex items-center bg-surface-muted p-1 rounded-xl border border-border text-xs font-bold gap-1 flex-wrap"
              role="group"
              aria-label={t("payerStatusTitle")}
            >
              {/* Button 1: Normal */}
              <button
                type="button"
                disabled={!canEdit || isPending}
                onClick={() => handlePayerToggle("NORMAL")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed ${
                  isNormal
                    ? "bg-primary text-white shadow-xs"
                    : "text-muted hover:text-gray-900 hover:bg-surface/60"
                }`}
                title={t("statusNormalDesc")}
              >
                {isNormal && <Check className="w-3 h-3 shrink-0" />}
                <span>{t("statusNormal")}</span>
              </button>

              {/* Button 2: Non-payer */}
              <button
                type="button"
                disabled={!canEdit || isPending}
                onClick={() => handlePayerToggle("NON_PAYER")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed ${
                  isNonPayer
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-muted hover:text-emerald-700 hover:bg-surface/60"
                }`}
                title={t("statusNonPayerDesc")}
              >
                {isNonPayer ? (
                  <Check className="w-3 h-3 shrink-0" />
                ) : (
                  <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />
                )}
                <span>{t("statusNonPayer")}</span>
              </button>

              {/* Button 3: School fees only */}
              <button
                type="button"
                disabled={!canEdit || isPending}
                onClick={() => handlePayerToggle("SCHOOL_FEES_ONLY")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed ${
                  isSchoolFeesOnly
                    ? "bg-amber-600 text-white shadow-xs"
                    : "text-muted hover:text-amber-700 hover:bg-surface/60"
                }`}
                title={t("statusSchoolFeesOnlyDesc")}
              >
                {isSchoolFeesOnly ? (
                  <Check className="w-3 h-3 shrink-0" />
                ) : (
                  <ShieldAlert className="w-3 h-3 text-amber-600 shrink-0" />
                )}
                <span>{t("statusSchoolFeesOnly")}</span>
              </button>

              {/* Button 4: Suspended (New) */}
              <button
                type="button"
                disabled={!canEdit || isPending}
                onClick={handleSuspensionClick}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed ${
                  isSuspended
                    ? "bg-rose-600 text-white shadow-xs"
                    : "text-muted hover:text-rose-700 hover:bg-surface/60"
                }`}
                title={t("statusSuspendedDesc")}
              >
                {isSuspended ? (
                  <Check className="w-3 h-3 shrink-0" />
                ) : (
                  <AlertOctagon className="w-3 h-3 text-rose-600 shrink-0" />
                )}
                <span>{t("statusSuspended")}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation & Notice Modal */}
      {modalState?.isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 font-sans backdrop-blur-xs"
          onClick={() => setModalState(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl relative w-full max-w-md p-5 border border-border animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setModalState(null)}
              className="absolute top-4 end-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  modalState.target === "SUSPENDED"
                    ? "bg-rose-100 text-rose-600"
                    : "bg-emerald-100 text-emerald-600"
                }`}
              >
                {modalState.target === "SUSPENDED" ? (
                  <AlertOctagon className="w-5 h-5" />
                ) : (
                  <Sparkles className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">
                  {modalState.target === "SUSPENDED"
                    ? t("suspendNoticeTitle")
                    : t("reinstateNoticeTitle")}
                </h3>
                <p className="text-xs text-muted font-medium">
                  {modalState.className}
                </p>
              </div>
            </div>

            {/* Notice Alert Box */}
            <div
              className={`p-3.5 rounded-xl border text-xs leading-relaxed my-4 ${
                modalState.target === "SUSPENDED"
                  ? "bg-rose-50/70 border-rose-200 text-rose-950"
                  : "bg-amber-50/70 border-amber-200 text-amber-950"
              }`}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    modalState.target === "SUSPENDED"
                      ? "text-rose-600"
                      : "text-amber-600"
                  }`}
                />
                <p>
                  {modalState.target === "SUSPENDED"
                    ? t("suspendNoticeText")
                    : t("reinstateNoticeText")}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 mt-5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalState(null)}
                disabled={isPending}
              >
                {locale === "ar" ? "إلغاء" : "Annuler"}
              </Button>
              <Button
                variant={modalState.target === "SUSPENDED" ? "danger" : "primary"}
                size="sm"
                onClick={handleConfirmModalAction}
                disabled={isPending}
                leftIcon={
                  isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : modalState.target === "SUSPENDED" ? (
                    <AlertOctagon className="w-3.5 h-3.5" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )
                }
              >
                {modalState.target === "SUSPENDED"
                  ? locale === "ar" ? "تأكيد التعليق" : "Confirmer la suspension"
                  : locale === "ar" ? "تأكيد الإعادة (تصفير الديون)" : "Confirmer la réinscription"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
