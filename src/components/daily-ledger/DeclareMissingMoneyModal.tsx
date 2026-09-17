"use client";

import React, { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { toast } from "react-toastify";
import { declareMissingMoneyAction } from "@/lib/actions";
import { AlertCircle, X } from "lucide-react";

interface DeclareMissingMoneyModalProps {
  branchId: number;
  branchName: string;
}

export default function DeclareMissingMoneyModal({
  branchId,
  branchName,
}: DeclareMissingMoneyModalProps) {
  const t = useTranslations("dailyLedger");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const handleOpen = () => {
    setAmount("");
    setReason("");
    setIsOpen(true);
  };

  const handleClose = () => {
    if (isPending) return;
    setIsOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error(t("amountLabel"));
      return;
    }

    startTransition(async () => {
      try {
        const res = await declareMissingMoneyAction({
          branchId,
          amount: numAmount,
          reason,
        });

        if (res.success) {
          toast.success(res.message);
          setIsOpen(false);
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
    <>
      <Button
        type="button"
        variant="soft-danger"
        size="sm"
        onClick={handleOpen}
        leftIcon={<AlertCircle className="w-4 h-4 text-danger" />}
      >
        {t("declareMissingBtn")}
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-surface rounded-2xl shadow-xl border border-border/80 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-border/80 bg-danger-light/20">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-danger-soft text-danger">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {t("modalTitle")}
                  </h3>
                  <p className="text-xs text-muted font-medium">{branchName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-surface-subtle transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("amountLabel")}
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={t("amountPlaceholder")}
                    className="w-full ps-3.5 pe-16 py-2.5 text-sm bg-surface border border-border rounded-xl focus:ring-2 focus:ring-danger/20 focus:border-danger font-mono outline-hidden transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    disabled={isPending}
                    autoFocus
                  />
                  <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none">
                    <span className="px-2.5 py-1 text-xs font-bold font-mono text-gray-500 bg-surface-muted border border-border/80 rounded-md">
                      DZD
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("reasonLabel")}
                </label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("reasonPlaceholder")}
                  className="w-full px-3.5 py-2 text-sm bg-surface border border-border rounded-xl focus:ring-2 focus:ring-danger/20 focus:border-danger outline-hidden transition-all resize-none"
                  disabled={isPending}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClose}
                  disabled={isPending}
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  size="sm"
                  isLoading={isPending}
                >
                  {isPending ? t("submitting") : t("submitDeclaration")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
