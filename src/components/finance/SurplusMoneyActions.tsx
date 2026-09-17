"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { confirmSurplusMoneyAction, rejectSurplusMoneyAction, resetSurplusMoneyAction } from "@/lib/actions";
import { toast } from "react-toastify";
import { Check, X, RotateCcw } from "lucide-react";

interface SurplusMoneyActionsProps {
  id: number;
  status: string;
}

export default function SurplusMoneyActions({ id, status }: SurplusMoneyActionsProps) {
  const t = useTranslations("finance");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      try {
        const res = await confirmSurplusMoneyAction(id);
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

  const handleReject = () => {
    startTransition(async () => {
      try {
        const res = await rejectSurplusMoneyAction(id);
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

  const handleReset = () => {
    startTransition(async () => {
      try {
        const res = await resetSurplusMoneyAction(id);
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

  return (
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
          title={t("confirmSurplus")}
        >
          {t("confirmSurplus")}
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
          title={t("rejectSurplus")}
        >
          {t("rejectSurplus")}
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
    </div>
  );
}
