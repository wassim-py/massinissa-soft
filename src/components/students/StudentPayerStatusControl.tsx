"use client";

import { useState, useTransition } from "react";
import {
  updateEnrollmentPayerStatusAction,
  updateStudentPayerStatusAction,
  toggleEnrollmentSuspensionAction,
  setEnrollmentDiscountAction,
  removeEnrollmentDiscountAction,
} from "@/lib/actions";
import {
  computeStudentSessionFee,
  formatDiscountBadgeLabel,
  DiscountType,
} from "@/lib/studentBilling";
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
  Percent,
  Tag,
  Lock,
  Pencil,
  Trash2,
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
  discountType?: string | null;
  discountValue?: number | null;
  discountReason?: string | null;
  pricePerCycle?: number;
  isFormation?: boolean;
  teacherPercentage?: number | null;
  hasSiblingDiscount?: boolean;
  siblingDiscountPercentage?: number | null;
}

interface StudentPayerStatusControlProps {
  studentId: string;
  enrolledGroups?: EnrolledGroupPayerInfo[];
  currentStatus?: string;
  canEdit?: boolean;
  isOwner?: boolean;
}

export default function StudentPayerStatusControl({
  studentId,
  enrolledGroups = [],
  currentStatus = "NORMAL",
  canEdit = true,
  isOwner = false,
}: StudentPayerStatusControlProps) {
  const t = useTranslations("studentProfile");
  const locale = (useLocale() === "ar" ? "ar" : "fr") as "fr" | "ar";
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

  const [discountMap, setDiscountMap] = useState<
    Record<
      number,
      {
        discountType: string | null;
        discountValue: number | null;
        discountReason: string | null;
      }
    >
  >(() => {
    const map: Record<
      number,
      {
        discountType: string | null;
        discountValue: number | null;
        discountReason: string | null;
      }
    > = {};
    enrolledGroups.forEach((g) => {
      map[g.enrollmentId] = {
        discountType: g.discountType ?? null,
        discountValue:
          g.discountValue !== undefined && g.discountValue !== null
            ? Number(g.discountValue)
            : null,
        discountReason: g.discountReason ?? null,
      };
    });
    return map;
  });

  // Notice & Confirmation modal state (for Suspension / Reinstatement)
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    target: "SUSPENDED" | "NORMAL";
    enrollmentId: number;
    className: string;
  } | null>(null);

  // Owner Discount Add/Edit/Delete modal state
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountMode, setDiscountMode] = useState<DiscountType>("PERCENT");
  const [discountInputValue, setDiscountInputValue] = useState<string>("25");
  const [discountReasonInput, setDiscountReasonInput] = useState<string>("");

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

  const activeDiscount = currentGroup
    ? discountMap[currentGroup.enrollmentId] || {
        discountType: currentGroup.discountType ?? null,
        discountValue:
          currentGroup.discountValue !== undefined && currentGroup.discountValue !== null
            ? Number(currentGroup.discountValue)
            : null,
        discountReason: currentGroup.discountReason ?? null,
      }
    : { discountType: null, discountValue: null, discountReason: null };

  const isSuspended = activeEnrollmentStatus === "SUSPENDED";
  const isNormal = !isSuspended && activePayerStatus === "NORMAL";
  const isNonPayer = !isSuspended && activePayerStatus === "NON_PAYER";
  const isSchoolFeesOnly = !isSuspended && activePayerStatus === "SCHOOL_FEES_ONLY";
  const isDiscounted = !isSuspended && activePayerStatus === "DISCOUNTED";

  // Lock non-Owner users from overriding an Owner-configured discount
  const isLockedByOwnerDiscount = isDiscounted && !isOwner;

  const openDiscountModal = () => {
    if (!isOwner || isPending || !currentGroup) {
      if (!isOwner) {
        toast.info(
          locale === "ar"
            ? "إضافة أو تعديل التخفيض متاح لمالك المؤسسة فقط."
            : "L'ajout ou la modification d'une remise est réservé au propriétaire."
        );
      }
      return;
    }

    if (isSuspended) {
      toast.info(
        locale === "ar"
          ? "يرجى إعادة تفعيل التلميذ أولاً قبل ضبط التخفيض."
          : "Veuillez d'abord réactiver l'élève avant de configurer une remise."
      );
      return;
    }

    const existingType = (activeDiscount.discountType as DiscountType) || "PERCENT";
    const existingVal = activeDiscount.discountValue;
    setDiscountMode(
      existingType === "PERCENT" || existingType === "FIXED_AMOUNT" || existingType === "CUSTOM_PRICE"
        ? existingType
        : "PERCENT"
    );
    setDiscountInputValue(
      existingVal !== null && existingVal !== undefined ? String(existingVal) : "25"
    );
    setDiscountReasonInput(activeDiscount.discountReason || "");
    setDiscountModalOpen(true);
  };

  const handleSaveDiscount = () => {
    if (!isOwner || !currentGroup || isPending) return;
    const numericVal = Number(discountInputValue);
    if (!Number.isFinite(numericVal) || numericVal < 0) {
      toast.error(
        locale === "ar"
          ? "يرجى إدخال قيمة تخفيض صحيحة."
          : "Veuillez saisir une valeur de remise valide."
      );
      return;
    }

    const enrollId = currentGroup.enrollmentId;
    startTransition(async () => {
      try {
        const res = await executeWithRetry(() =>
          setEnrollmentDiscountAction({
            studentId,
            enrollmentId: enrollId,
            discountType: discountMode,
            discountValue: numericVal,
            reason: discountReasonInput.trim() || null,
          })
        );
        if (res.success) {
          toast.success(res.message);
          setPayerStatusMap((prev) => ({ ...prev, [enrollId]: "DISCOUNTED" }));
          setDiscountMap((prev) => ({
            ...prev,
            [enrollId]: {
              discountType: discountMode,
              discountValue: numericVal,
              discountReason: discountReasonInput.trim() || null,
            },
          }));
          setDiscountModalOpen(false);
        } else {
          toast.error(res.message);
        }
      } catch (err: any) {
        toast.error(err?.message || "Erreur lors de l'enregistrement de la remise");
      }
    });
  };

  const handleDeleteDiscount = (targetStatus: "NORMAL" | "NON_PAYER" | "SCHOOL_FEES_ONLY" = "NORMAL") => {
    if (!isOwner || !currentGroup || isPending) return;
    const enrollId = currentGroup.enrollmentId;
    startTransition(async () => {
      try {
        const res = await executeWithRetry(() =>
          removeEnrollmentDiscountAction({
            studentId,
            enrollmentId: enrollId,
            targetStatus,
            reason: discountReasonInput.trim() || null,
          })
        );
        if (res.success) {
          toast.success(res.message);
          setPayerStatusMap((prev) => ({ ...prev, [enrollId]: res.payerStatus || targetStatus }));
          setDiscountMap((prev) => ({
            ...prev,
            [enrollId]: { discountType: null, discountValue: null, discountReason: null },
          }));
          setDiscountModalOpen(false);
        } else {
          toast.error(res.message);
        }
      } catch (err: any) {
        toast.error(err?.message || "Erreur lors de la suppression de la remise");
      }
    });
  };

  const handlePayerToggle = (target: "NORMAL" | "NON_PAYER" | "SCHOOL_FEES_ONLY") => {
    if (!canEdit || isPending) return;

    if (isLockedByOwnerDiscount) {
      toast.info(
        locale === "ar"
          ? "هذا الفوج يستفيد من تخفيض خاص بالمالك، لا يمكن تغييره إلا من طرف المالك."
          : "Ce groupe bénéficie d'une remise propriétaire. Seul le propriétaire peut modifier ou supprimer ce statut."
      );
      return;
    }

    if (!currentGroup) {
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
          if (prev === "DISCOUNTED") {
            setDiscountMap((prevMap) => ({
              ...prevMap,
              [enrollId]: { discountType: null, discountValue: null, discountReason: null },
            }));
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
      setModalState({
        isOpen: true,
        target: "NORMAL",
        enrollmentId: currentGroup.enrollmentId,
        className: currentGroup.className,
      });
    } else {
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
            if (res.payerStatus) {
              setPayerStatusMap((prev) => ({ ...prev, [enrollmentId]: res.payerStatus! }));
            }
          }
        } else {
          toast.error(res.message);
        }
      } catch (err: any) {
        toast.error(err?.message || "Erreur lors de la mise à jour");
      }
    });
  };

  // Live preview calculation for the Owner Discount modal
  const baseGroupPrice = Number(currentGroup?.pricePerCycle || 0);
  const isGroupFormation = Boolean(currentGroup?.isFormation);
  const previewFeeCalc = computeStudentSessionFee({
    payerStatus: "DISCOUNTED",
    discountType: discountMode,
    discountValue: Number(discountInputValue || 0),
    pricePerCycle: baseGroupPrice,
    teacherPercentage: currentGroup?.teacherPercentage,
    isFormation: isGroupFormation,
  });

  const activeAppliedCalc =
    isDiscounted && currentGroup
      ? computeStudentSessionFee({
          payerStatus: "DISCOUNTED",
          discountType: activeDiscount.discountType,
          discountValue: activeDiscount.discountValue,
          pricePerCycle: baseGroupPrice,
          teacherPercentage: currentGroup.teacherPercentage,
          isFormation: isGroupFormation,
        })
      : null;

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
                  const grpDisc = discountMap[g.enrollmentId];
                  const statusTag =
                    grpStatus === "SUSPENDED"
                      ? locale === "ar" ? " (معلّق)" : " (Suspendu)"
                      : grpPayer === "DISCOUNTED"
                      ? ` (${formatDiscountBadgeLabel(grpDisc?.discountType ?? g.discountType, grpDisc?.discountValue ?? g.discountValue, locale)})`
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
          <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              {/* Segmented selector with 5 buttons: Normal, Discounted (Owner), Non-payer, School fees only, and Suspended */}
              <div
                className="inline-flex items-center bg-surface-muted p-1 rounded-xl border border-border text-xs font-bold gap-1 flex-wrap"
                role="group"
                aria-label={t("payerStatusTitle")}
              >
                {/* Button 1: Normal */}
                <button
                  type="button"
                  disabled={!canEdit || isPending || isLockedByOwnerDiscount}
                  onClick={() => handlePayerToggle("NORMAL")}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed ${
                    isNormal
                      ? "bg-primary text-white shadow-xs"
                      : "text-muted hover:text-gray-900 hover:bg-surface/60"
                  }`}
                  title={
                    isLockedByOwnerDiscount
                      ? locale === "ar"
                        ? "مقفل: الفوج تحت تخفيض المالك"
                        : "Verrouillé : remise propriétaire active"
                      : t("statusNormalDesc")
                  }
                >
                  {isNormal && <Check className="w-3 h-3 shrink-0" />}
                  <span>{t("statusNormal")}</span>
                </button>

                {/* Button 2: Discounted (Owner-Only Add/Edit/Delete) */}
                <button
                  type="button"
                  disabled={!isOwner || isPending || !currentGroup}
                  onClick={openDiscountModal}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold disabled:opacity-60 disabled:cursor-not-allowed ${
                    isDiscounted
                      ? "bg-violet-600 text-white shadow-xs"
                      : "text-muted hover:text-violet-700 hover:bg-surface/60"
                  }`}
                  title={
                    isOwner
                      ? locale === "ar"
                        ? "إضافة أو تعديل أو حذف تخفيض خاص بهذا الفوج (خاص بالمالك)"
                        : "Ajouter, modifier ou supprimer une remise sur ce groupe (Propriétaire uniquement)"
                      : locale === "ar"
                      ? "خاص بمالك المؤسسة فقط"
                      : "Réservé au propriétaire uniquement"
                  }
                >
                  {isDiscounted ? (
                    <Check className="w-3 h-3 shrink-0" />
                  ) : isOwner ? (
                    <Tag className="w-3 h-3 text-violet-600 shrink-0" />
                  ) : (
                    <Lock className="w-3 h-3 text-gray-400 shrink-0" />
                  )}
                  <span>
                    {locale === "ar" ? "مخفّض" : "Remise"}
                    {isDiscounted && activeDiscount.discountType
                      ? ` (${formatDiscountBadgeLabel(activeDiscount.discountType, activeDiscount.discountValue, locale)})`
                      : ""}
                  </span>
                </button>

                {/* Button 3: Non-payer */}
                <button
                  type="button"
                  disabled={!canEdit || isPending || isLockedByOwnerDiscount}
                  onClick={() => handlePayerToggle("NON_PAYER")}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed ${
                    isNonPayer
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-muted hover:text-emerald-700 hover:bg-surface/60"
                  }`}
                  title={
                    isLockedByOwnerDiscount
                      ? locale === "ar"
                        ? "مقفل: الفوج تحت تخفيض المالك"
                        : "Verrouillé : remise propriétaire active"
                      : t("statusNonPayerDesc")
                  }
                >
                  {isNonPayer ? (
                    <Check className="w-3 h-3 shrink-0" />
                  ) : (
                    <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />
                  )}
                  <span>{t("statusNonPayer")}</span>
                </button>

                {/* Button 4: School fees only */}
                <button
                  type="button"
                  disabled={!canEdit || isPending || isLockedByOwnerDiscount}
                  onClick={() => handlePayerToggle("SCHOOL_FEES_ONLY")}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSchoolFeesOnly
                      ? "bg-amber-600 text-white shadow-xs"
                      : "text-muted hover:text-amber-700 hover:bg-surface/60"
                  }`}
                  title={
                    isLockedByOwnerDiscount
                      ? locale === "ar"
                        ? "مقفل: الفوج تحت تخفيض المالك"
                        : "Verrouillé : remise propriétaire active"
                      : t("statusSchoolFeesOnlyDesc")
                  }
                >
                  {isSchoolFeesOnly ? (
                    <Check className="w-3 h-3 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-3 h-3 text-amber-600 shrink-0" />
                  )}
                  <span>{t("statusSchoolFeesOnly")}</span>
                </button>

                {/* Button 5: Suspended */}
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

            {/* Active Discount Summary Banner (Read-only for Branch Admin, Editable/Deletable for Owner) */}
            {isDiscounted && activeAppliedCalc && (
              <div className="p-2.5 rounded-xl bg-violet-50/80 border border-violet-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-violet-950">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-600 text-white font-bold text-[11px]">
                    <Tag className="w-3 h-3" />
                    {formatDiscountBadgeLabel(
                      activeDiscount.discountType,
                      activeDiscount.discountValue,
                      locale
                    )}
                  </span>
                  <span className="font-semibold">
                    {locale === "ar" ? "السعر المطبق:" : "Tarif appliqué :"}{" "}
                    <span className="line-through text-gray-400 me-1">
                      {Math.round(activeAppliedCalc.baseCycleFee).toLocaleString()} DZD
                    </span>
                    <strong className="text-violet-900">
                      {Math.round(activeAppliedCalc.studentCycleFee).toLocaleString()} DZD
                    </strong>
                    {!isGroupFormation && (
                      <span className="text-violet-700 ms-1">
                        ({Math.round(activeAppliedCalc.studentSessionFee).toLocaleString()} DZD /{" "}
                        {locale === "ar" ? "حصة" : "séance"})
                      </span>
                    )}
                  </span>
                  {activeDiscount.discountReason && (
                    <span className="text-[11px] text-violet-700 italic">
                      — {activeDiscount.discountReason}
                    </span>
                  )}
                </div>

                {isOwner ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={openDiscountModal}
                      disabled={isPending}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-violet-100 text-violet-800 border border-violet-300 font-bold text-[11px] transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      {locale === "ar" ? "تعديل" : "Modifier"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDiscount("NORMAL")}
                      disabled={isPending}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px] transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      {locale === "ar" ? "حذف التخفيض" : "Supprimer"}
                    </button>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 shrink-0">
                    <Lock className="w-3 h-3" />
                    {locale === "ar" ? "تخفيض المالك (للقراءة فقط)" : "Remise propriétaire (lecture seule)"}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Owner-Only Discount Configuration Modal */}
      {discountModalOpen && isOwner && currentGroup && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 font-sans backdrop-blur-xs"
          onClick={() => setDiscountModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl relative w-full max-w-lg p-5 border border-border animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setDiscountModalOpen(false)}
              className="absolute top-4 end-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                <Percent className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">
                  {isDiscounted
                    ? locale === "ar"
                      ? "تعديل أو حذف تخفيض التلميذ"
                      : "Modifier ou supprimer la remise"
                    : locale === "ar"
                    ? "إضافة تخفيض خاص للتلميذ"
                    : "Configurer une remise propriétaire"}
                </h3>
                <p className="text-xs text-muted font-medium">
                  {currentGroup.className} ({currentGroup.branchName})
                </p>
              </div>
            </div>

            {/* Sibling discount replacement notice */}
            {currentGroup.hasSiblingDiscount && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs mb-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  {locale === "ar"
                    ? `هذا التلميذ يستفيد حالياً من تخفيض الإخوة (${currentGroup.siblingDiscountPercentage ?? 50}%). تطبيق تخفيض المالك سيحل محل تخفيض الإخوة في هذا الفوج لتجنب ازدواجية التخفيض.`
                    : `Cet élève bénéficie d'une remise fratrie (${currentGroup.siblingDiscountPercentage ?? 50}%). La remise propriétaire remplacera la remise fratrie sur ce groupe pour éviter un double rabais.`}
                </span>
              </div>
            )}

            {/* Discount Mode Selector */}
            <div className="mb-3">
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                {locale === "ar" ? "نوع التخفيض" : "Mode de calcul de la remise"}
              </label>
              <div className="grid grid-cols-3 gap-1.5 bg-surface-muted p-1 rounded-xl border border-border text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setDiscountMode("PERCENT");
                    setDiscountInputValue("25");
                  }}
                  className={`py-2 px-2 rounded-lg transition-all cursor-pointer ${
                    discountMode === "PERCENT"
                      ? "bg-violet-600 text-white shadow-xs"
                      : "text-gray-600 hover:bg-white/60"
                  }`}
                >
                  {locale === "ar" ? "نسبة مئوية (%)" : "Pourcentage (%)"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDiscountMode("FIXED_AMOUNT");
                    setDiscountInputValue("500");
                  }}
                  className={`py-2 px-2 rounded-lg transition-all cursor-pointer ${
                    discountMode === "FIXED_AMOUNT"
                      ? "bg-violet-600 text-white shadow-xs"
                      : "text-gray-600 hover:bg-white/60"
                  }`}
                >
                  {locale === "ar" ? "مبلغ مخصوم (-دج)" : "Montant déduit (-DA)"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDiscountMode("CUSTOM_PRICE");
                    setDiscountInputValue(
                      String(Math.max(0, Math.round(baseGroupPrice * 0.75)))
                    );
                  }}
                  className={`py-2 px-2 rounded-lg transition-all cursor-pointer ${
                    discountMode === "CUSTOM_PRICE"
                      ? "bg-violet-600 text-white shadow-xs"
                      : "text-gray-600 hover:bg-white/60"
                  }`}
                >
                  {locale === "ar" ? "سعر مخصص (دج)" : "Tarif final (DA)"}
                </button>
              </div>
            </div>

            {/* Value Input + Quick Presets */}
            <div className="mb-3">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                {discountMode === "PERCENT"
                  ? locale === "ar"
                    ? "نسبة التخفيض (%)"
                    : "Pourcentage de remise (%)"
                  : discountMode === "FIXED_AMOUNT"
                  ? locale === "ar"
                    ? "المبلغ المخصوم من الدورة (د.ج)"
                    : "Montant à déduire du cycle (DZD)"
                  : locale === "ar"
                  ? "السعر النهائي للدورة بعد التخفيض (د.ج)"
                  : "Nouveau tarif du cycle / niveau (DZD)"}
              </label>
              <input
                type="number"
                min={0}
                max={discountMode === "PERCENT" ? 100 : Math.max(0, baseGroupPrice)}
                step="any"
                value={discountInputValue}
                onChange={(e) => setDiscountInputValue(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              {discountMode === "PERCENT" && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {[10, 20, 25, 30, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDiscountInputValue(String(pct))}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                        Number(discountInputValue) === pct
                          ? "bg-violet-100 border-violet-400 text-violet-900"
                          : "bg-surface-subtle border-border text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      -{pct}%
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Optional Reason Input */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                {locale === "ar" ? "سبب أو ملاحظة التخفيض (اختياري)" : "Motif / note de la remise (optionnel)"}
              </label>
              <input
                type="text"
                maxLength={250}
                value={discountReasonInput}
                onChange={(e) => setDiscountReasonInput(e.target.value)}
                placeholder={
                  locale === "ar"
                    ? "مثال: حالة اجتماعية، اتفاق خاص مع الإدارة..."
                    : "Ex: Accord spécial direction, bourse d'excellence..."
                }
                className="w-full px-3 py-2 rounded-xl border border-border text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            {/* Live Financial & Payroll Breakdown Preview */}
            <div className="p-3.5 rounded-xl bg-violet-50/70 border border-violet-200 text-xs space-y-2 mb-4">
              <div className="flex items-center justify-between text-gray-600">
                <span>
                  {isGroupFormation
                    ? locale === "ar"
                      ? "سعر المستوى الأصلي:"
                      : "Tarif initial du niveau :"
                    : locale === "ar"
                    ? "سعر الدورة الأصلي (4 حصص):"
                    : "Tarif initial du cycle (4 séances) :"}
                </span>
                <span className="font-mono font-semibold">
                  {Math.round(previewFeeCalc.baseCycleFee).toLocaleString()} DZD
                </span>
              </div>
              <div className="flex items-center justify-between text-violet-900 font-bold text-sm border-t border-violet-200/80 pt-1.5">
                <span>
                  {isGroupFormation
                    ? locale === "ar"
                      ? "السعر الجديد للمستوى:"
                      : "Nouveau tarif niveau :"
                    : locale === "ar"
                    ? "السعر الجديد للدورة:"
                    : "Nouveau tarif cycle :"}
                </span>
                <span>
                  {Math.round(previewFeeCalc.studentCycleFee).toLocaleString()} DZD
                  {!isGroupFormation && (
                    <span className="text-xs font-semibold text-violet-700 ms-1.5">
                      ({Math.round(previewFeeCalc.studentSessionFee).toLocaleString()} DZD /{" "}
                      {locale === "ar" ? "حصة" : "séance"})
                    </span>
                  )}
                </span>
              </div>
              {previewFeeCalc.teacherPercentage > 0 && (
                <div className="flex items-center justify-between text-[11px] text-gray-600 pt-1 border-t border-violet-200/60">
                  <span>
                    {locale === "ar"
                      ? `توزيع الحصة الواحدة (الأستاذ ${previewFeeCalc.teacherPercentage}% / المدرسة ${previewFeeCalc.schoolPercentage}%):`
                      : `Répartition par séance (Prof ${previewFeeCalc.teacherPercentage}% / École ${previewFeeCalc.schoolPercentage}%) :`}
                  </span>
                  <span className="font-mono font-semibold text-gray-800">
                    {Math.round(previewFeeCalc.teacherCut).toLocaleString()} DZD /{" "}
                    {Math.round(previewFeeCalc.schoolCut).toLocaleString()} DZD
                  </span>
                </div>
              )}
              <p className="text-[11px] text-violet-800/90 pt-1 leading-relaxed">
                {locale === "ar"
                  ? "• يطبق التخفيض على رسوم الدراسة فقط (حقوق التسجيل والكتب تبقى بالسعر الكامل). الوصولات والحصص المدفوعة سابقاً تحتفظ بقيمتها الأصلية."
                  : "• La remise s'applique uniquement aux frais d'études (l'inscription et les livres restent au tarif plein). Les reçus déjà payés conservent leur valeur initiale."}
              </p>
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-between gap-2 pt-2">
              <div>
                {isDiscounted && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteDiscount("NORMAL")}
                    disabled={isPending}
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    {locale === "ar" ? "حذف التخفيض" : "Supprimer la remise"}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDiscountModalOpen(false)}
                  disabled={isPending}
                >
                  {locale === "ar" ? "إلغاء" : "Annuler"}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveDiscount}
                  disabled={isPending}
                  leftIcon={
                    isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )
                  }
                >
                  {locale === "ar" ? "حفظ التخفيض" : "Enregistrer la remise"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation & Notice Modal for Suspension / Reinstatement */}
      {modalState?.isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 font-sans backdrop-blur-xs"
          onClick={() => setModalState(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl relative w-full max-w-md p-5 border border-border animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setModalState(null)}
              className="absolute top-4 end-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

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
