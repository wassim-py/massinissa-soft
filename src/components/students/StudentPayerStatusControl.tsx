"use client";

import { useState, useTransition } from "react";
import { updateEnrollmentPayerStatusAction, updateStudentPayerStatusAction } from "@/lib/actions";
import { executeWithRetry } from "@/lib/retryUtils";
import { toast } from "react-toastify";
import { useTranslations } from "next-intl";
import { Check, Loader2, Sparkles, ShieldAlert } from "lucide-react";

export interface EnrolledGroupPayerInfo {
  enrollmentId: number;
  classId: number;
  className: string;
  branchName: string;
  payerStatus: string;
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
  const [isPending, startTransition] = useTransition();

  // Selected group state (default to first enrolled group)
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(
    enrolledGroups.length > 0 ? enrolledGroups[0].enrollmentId : null
  );

  // Status mapping per enrollment ID
  const [statusMap, setStatusMap] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    enrolledGroups.forEach((g) => {
      map[g.enrollmentId] = g.payerStatus || "NORMAL";
    });
    return map;
  });

  // Current selected group
  const currentGroup = enrolledGroups.find((g) => g.enrollmentId === selectedEnrollmentId) || enrolledGroups[0] || null;
  const activeStatus = currentGroup
    ? (statusMap[currentGroup.enrollmentId] || currentGroup.payerStatus || "NORMAL")
    : currentStatus;

  const handleToggle = (target: "NORMAL" | "NON_PAYER" | "SCHOOL_FEES_ONLY") => {
    if (!canEdit || isPending) return;

    if (!currentGroup) {
      // Fallback for student with no enrollments
      startTransition(async () => {
        try {
          const res = await executeWithRetry(() => updateStudentPayerStatusAction(studentId, target));
          if (res.success) toast.success(res.message);
          else toast.error(res.message);
        } catch (err: any) {
          toast.error(err?.message || "Erreur de mise à jour");
        }
      });
      return;
    }

    // Toggle behavior per §7.18:
    // If clicking the currently active special status, clear it back to "NORMAL" for this group.
    let newStatus: string = target;
    if (target !== "NORMAL" && activeStatus === target) {
      newStatus = "NORMAL";
    }

    if (newStatus === activeStatus && target === "NORMAL") {
      return;
    }

    const prev = activeStatus;
    const enrollId = currentGroup.enrollmentId;

    setStatusMap((prevMap) => ({ ...prevMap, [enrollId]: newStatus }));

    startTransition(async () => {
      try {
        const res = await executeWithRetry(() =>
          updateEnrollmentPayerStatusAction(studentId, enrollId, newStatus)
        );
        if (res.success) {
          toast.success(res.message);
          if (res.payerStatus) {
            setStatusMap((prevMap) => ({ ...prevMap, [enrollId]: res.payerStatus! }));
          }
        } else {
          toast.error(res.message);
          setStatusMap((prevMap) => ({ ...prevMap, [enrollId]: prev })); // revert on error
        }
      } catch (err: any) {
        toast.error(err?.message || "Erreur de mise à jour");
        setStatusMap((prevMap) => ({ ...prevMap, [enrollId]: prev })); // revert on error
      }
    });
  };

  const isNormal = activeStatus === "NORMAL";
  const isNonPayer = activeStatus === "NON_PAYER";
  const isSchoolFeesOnly = activeStatus === "SCHOOL_FEES_ONLY";

  return (
    <div className="flex flex-col gap-2.5 pt-3.5 mt-3 border-t border-border">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-gray-700">
            {t("payerStatusTitle")}:
          </span>
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />}
        </div>

        {/* Group Selector when student has multiple groups */}
        {enrolledGroups.length > 1 && (
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <label htmlFor="group-select" className="text-[11px] font-semibold text-muted">
              {t("selectGroup")}:
            </label>
            <select
              id="group-select"
              value={selectedEnrollmentId ?? ""}
              onChange={(e) => setSelectedEnrollmentId(Number(e.target.value))}
              disabled={isPending}
              className="text-xs font-semibold bg-surface-subtle border border-border rounded-lg px-2.5 py-1 text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer max-w-[220px] truncate"
            >
              {enrolledGroups.map((g) => {
                const grpStatus = statusMap[g.enrollmentId] || g.payerStatus;
                const statusTag = grpStatus === "NON_PAYER" ? " (Non-payeur)" : grpStatus === "SCHOOL_FEES_ONLY" ? " (Frais école)" : "";
                return (
                  <option key={g.enrollmentId} value={g.enrollmentId}>
                    {g.className} ({g.branchName}){statusTag}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Single group indicator */}
        {enrolledGroups.length === 1 && (
          <span className="text-xs text-muted font-medium self-start sm:self-auto">
            <span className="font-semibold text-gray-800">{enrolledGroups[0].className}</span> ({enrolledGroups[0].branchName})
          </span>
        )}
      </div>

      {enrolledGroups.length === 0 ? (
        <p className="text-xs text-muted italic bg-surface-subtle p-2 rounded-lg border border-border/60">
          {t("noGroupsForStatus")}
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Segmented selector matching global application FilterTabs style */}
          <div
            className="inline-flex items-center bg-surface-muted p-1 rounded-xl border border-border text-xs font-bold gap-1 flex-wrap"
            role="group"
            aria-label={t("payerStatusTitle")}
          >
            {/* Button 1: Normal */}
            <button
              type="button"
              disabled={!canEdit || isPending}
              onClick={() => handleToggle("NORMAL")}
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
              onClick={() => handleToggle("NON_PAYER")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed ${
                isNonPayer
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-muted hover:text-emerald-700 hover:bg-surface/60"
              }`}
              title={t("statusNonPayerDesc")}
            >
              {isNonPayer ? <Check className="w-3 h-3 shrink-0" /> : <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />}
              <span>{t("statusNonPayer")}</span>
            </button>

            {/* Button 3: School fees only */}
            <button
              type="button"
              disabled={!canEdit || isPending}
              onClick={() => handleToggle("SCHOOL_FEES_ONLY")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed ${
                isSchoolFeesOnly
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-muted hover:text-amber-700 hover:bg-surface/60"
              }`}
              title={t("statusSchoolFeesOnlyDesc")}
            >
              {isSchoolFeesOnly ? <Check className="w-3 h-3 shrink-0" /> : <ShieldAlert className="w-3 h-3 text-amber-600 shrink-0" />}
              <span>{t("statusSchoolFeesOnly")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
