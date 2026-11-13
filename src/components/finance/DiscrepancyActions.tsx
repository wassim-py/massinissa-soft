"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/Button";
import {
  confirmMissingMoneyAction,
  rejectMissingMoneyAction,
  resetMissingMoneyAction,
  deleteMissingMoneyAction,
  confirmSurplusMoneyAction,
  rejectSurplusMoneyAction,
  resetSurplusMoneyAction,
  deleteSurplusMoneyAction,
} from "@/lib/actions";
import { toast } from "react-toastify";
import { Check, X, RotateCcw, Trash2, Pencil } from "lucide-react";
import EditDiscrepancyModal from "./EditDiscrepancyModal";

export interface DiscrepancyActionsProps {
  type: "MISSING" | "SURPLUS";
  id: number;
  status: string;
  amount?: number;
  reason?: string | null;
  date?: string | Date | null;
  branchId?: number;
  branches?: Array<{ id: number; name: string }>;
}

export default function DiscrepancyActions({
  type,
  id,
  status,
  amount,
  reason,
  date,
  branchId,
  branches,
}: DiscrepancyActionsProps) {
  const t = useTranslations("finance");
  const locale = useLocale();
  const isAr = locale === "ar";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const isMissing = type === "MISSING";

  const runAction = (
    fn: (recordId: number) => Promise<{ success: boolean; message: string }>
  ) => {
    startTransition(async () => {
      try {
        const res = await fn(id);
        if (res.success) {
          toast.success(res.message);
          router.refresh();
        } else {
          toast.error(res.message);
        }
      } catch (err: any) {
        toast.error(err?.message || "Erreur inattendue");
      }
    });
  };

  const handleConfirm = () =>
    runAction(isMissing ? confirmMissingMoneyAction : confirmSurplusMoneyAction);
  const handleReject = () =>
    runAction(isMissing ? rejectMissingMoneyAction : rejectSurplusMoneyAction);
  const handleReset = () =>
    runAction(isMissing ? resetMissingMoneyAction : resetSurplusMoneyAction);

  const handleDelete = () => {
    const promptText = isAr
      ? "هل أنت متأكد من حذف هذا السجل؟"
      : "Êtes-vous sûr de vouloir supprimer cet enregistrement ?";
    if (!window.confirm(promptText)) return;
    runAction(isMissing ? deleteMissingMoneyAction : deleteSurplusMoneyAction);
  };

  return (
    <>
      <div className="flex items-center justify-end gap-1.5 flex-wrap">
        {status !== "CONFIRMED" && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            disabled={isPending}
            isLoading={isPending}
            leftIcon={<Check className="w-3.5 h-3.5" />}
            className="!py-1 !px-2.5 text-xs bg-success hover:bg-success/90"
            title={isMissing ? t("confirmMissing") : t("confirmSurplus")}
          >
            {isMissing ? t("confirmMissing") : t("confirmSurplus")}
          </Button>
        )}

        {status !== "REJECTED" && (
          <Button
            type="button"
            variant="soft-danger"
            size="sm"
            onClick={handleReject}
            disabled={isPending}
            isLoading={isPending}
            leftIcon={<X className="w-3.5 h-3.5" />}
            className="!py-1 !px-2.5 text-xs"
            title={isMissing ? t("rejectMissing") : t("rejectSurplus")}
          >
            {isMissing ? t("rejectMissing") : t("rejectSurplus")}
          </Button>
        )}

        {status !== "PENDING" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={isPending}
            isLoading={isPending}
            leftIcon={<RotateCcw className="w-3 h-3 text-muted" />}
            className="!py-1 !px-2 text-xs"
            title={t("undoConfirmation")}
          >
            {t("undoConfirmation")}
          </Button>
        )}

        {amount !== undefined && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsEditOpen(true)}
            disabled={isPending}
            leftIcon={<Pencil className="w-3.5 h-3.5 text-indigo-600" />}
            className="!py-1 !px-2 text-xs border-indigo-200 hover:bg-indigo-50 text-indigo-700"
            title={isAr ? "تعديل" : "Modifier"}
          >
            <span className="sr-only">{isAr ? "تعديل" : "Modifier"}</span>
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={isPending}
          isLoading={isPending}
          leftIcon={<Trash2 className="w-3.5 h-3.5 text-danger" />}
          className="!py-1 !px-2 text-xs hover:bg-danger/10 text-danger"
          title={isAr ? "حذف" : "Supprimer"}
        >
          <span className="sr-only">{isAr ? "حذف" : "Supprimer"}</span>
        </Button>
      </div>

      {amount !== undefined && (
        <EditDiscrepancyModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          type={type}
          id={id}
          initialAmount={amount}
          initialReason={reason}
          initialDate={date}
          initialBranchId={branchId}
          branches={branches}
        />
      )}
    </>
  );
}
