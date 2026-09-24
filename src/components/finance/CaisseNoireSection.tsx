"use client";

import React, { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Wallet, Plus, Minus, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createCaisseNoireTransactionAction } from "@/lib/financeActions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

export interface CaisseNoireTxItem {
  id: number;
  type: string;
  amount: number;
  description: string;
  date: string | Date;
  recordedBy: string;
}

interface CaisseNoireSectionProps {
  balance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  transactions: CaisseNoireTxItem[];
  locale?: string;
}

export default function CaisseNoireSection({
  balance,
  totalDeposited,
  totalWithdrawn,
  transactions,
  locale: propLocale,
}: CaisseNoireSectionProps) {
  const router = useRouter();
  const t = useTranslations("finance");
  const hookLocale = useLocale();
  const locale = propLocale || hookLocale || "fr";

  const [modalType, setModalType] = useState<"DEPOSIT" | "WITHDRAWAL" | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [isLoading, setIsLoading] = useState(false);

  const numLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";

  const handleOpen = (type: "DEPOSIT" | "WITHDRAWAL") => {
    setModalType(type);
    setAmount("");
    setDescription("");
    setDate(new Date().toISOString().split("T")[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalType || !amount || Number(amount) <= 0 || !description.trim()) {
      toast.error(locale === "ar" ? "يرجى ملء جميع الحقول المطلوبة." : "Veuillez remplir tous les champs obligatoires.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await createCaisseNoireTransactionAction({
        type: modalType,
        amount: Number(amount),
        description,
        date,
      });

      if (res.success) {
        toast.success(res.message);
        setModalType(null);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error(locale === "ar" ? "حدث خطأ غير متوقع." : "Une erreur est survenue.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Current Balance */}
        <Card className="p-5 border-border/80 shadow-xs bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              {t("caisseNoireBalance")}
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-bold font-mono tracking-tight text-gray-900">
              {balance.toLocaleString(numLocale)}{" "}
              <span className="text-xs font-normal text-muted">{t("currency")}</span>
            </span>
            <p className="text-form-helper text-muted mt-1">
              {t("caisseNoireLongDesc")}
            </p>
          </div>
        </Card>

        {/* Total Injected / Deposited */}
        <Card className="p-5 border-border/80 shadow-xs bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              {t("totalDeposited")}
            </span>
            <div className="w-9 h-9 rounded-xl bg-success-light/50 text-success flex items-center justify-center">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-bold font-mono text-success-text">
              + {totalDeposited.toLocaleString(numLocale)}{" "}
              <span className="text-xs font-normal text-muted">{t("currency")}</span>
            </span>
            <p className="text-form-helper text-muted mt-1">{t("fundsInjected")}</p>
          </div>
        </Card>

        {/* Total Spent / Withdrawn */}
        <Card className="p-5 border-border/80 shadow-xs bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              {t("totalWithdrawn")}
            </span>
            <div className="w-9 h-9 rounded-xl bg-danger-light/50 text-danger flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-bold font-mono text-danger">
              - {totalWithdrawn.toLocaleString(numLocale)}{" "}
              <span className="text-xs font-normal text-muted">{t("currency")}</span>
            </span>
            <p className="text-form-helper text-muted mt-1">{t("personalWithdrawals")}</p>
          </div>
        </Card>
      </div>

      {/* Action Buttons */}
      <Card className="p-4 border-border/80 shadow-xs bg-surface flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <span>{t("recentTransactions")}</span>
          <span className="text-xs font-normal text-muted">({transactions.length})</span>
        </h3>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => handleOpen("DEPOSIT")}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>{t("addDeposit")}</span>
          </button>
          <button
            onClick={() => handleOpen("WITHDRAWAL")}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-surface hover:bg-surface-muted text-gray-700 border border-border px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95"
          >
            <Minus className="w-4 h-4" />
            <span>{t("addWithdrawal")}</span>
          </button>
        </div>
      </Card>

      {/* Transactions List */}
      <Card className="border-border/80 shadow-xs bg-surface overflow-hidden">
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">
            {t("noTransactionsYet")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted border-b border-border text-xs font-semibold text-muted uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">{t("date")}</th>
                  <th className="py-3 px-4">{t("type")}</th>
                  <th className="py-3 px-4">{t("description")}</th>
                  <th className="py-3 px-4 text-right">{t("amount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-surface-subtle/80 transition-colors">
                    <td className="py-3 px-4 text-muted font-mono text-xs whitespace-nowrap">
                      {new Date(tx.date).toLocaleDateString(numLocale)}
                    </td>
                    <td className="py-3 px-4">
                      {tx.type === "DEPOSIT" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success-light text-success border border-success-soft">
                          <ArrowDownLeft className="w-3 h-3" />
                          <span>{t("deposit")}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-muted text-muted border border-border">
                          <ArrowUpRight className="w-3 h-3" />
                          <span>{t("withdrawal")}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium text-gray-900">
                      {tx.description}
                      <span className="block text-2xs text-muted font-normal">
                        {locale === "ar" ? `بواسطة: ${tx.recordedBy}` : `Par : ${tx.recordedBy}`}
                      </span>
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono font-bold whitespace-nowrap ${
                        tx.type === "DEPOSIT" ? "text-success-text" : "text-danger"
                      }`}
                    >
                      {tx.type === "DEPOSIT" ? "+" : "-"} {tx.amount.toLocaleString(numLocale)} {t("currency")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal Transaction */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-slate-800" />
              <span>
                {modalType === "DEPOSIT" ? t("addDeposit") : t("addWithdrawal")}
              </span>
            </h3>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("amount")} ({t("currency")}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="ex: 10000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("description")} *
                </label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    modalType === "DEPOSIT"
                      ? (locale === "ar" ? "مثال: إضافة رصيد احتياطي خاص" : "ex: Injection personnelle pour réserve")
                      : (locale === "ar" ? "مثال: شراء مستلزمات طارئة" : "ex: Achat urgent de matériel")
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("date")}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg font-medium cursor-pointer"
                >
                  {t("cancelBtn")}
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-xs cursor-pointer disabled:opacity-50 ${
                    modalType === "DEPOSIT" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-800 hover:bg-slate-900"
                  }`}
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{modalType === "DEPOSIT" ? t("confirmDeposit") : t("confirmWithdrawal")}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

