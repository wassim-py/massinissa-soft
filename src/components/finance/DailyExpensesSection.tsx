"use client";

import React, { useState } from "react";
import { Plus, Trash2, Edit2, DollarSign, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createDailyExpenseAction, updateDailyExpenseAction, deleteDailyExpenseAction } from "@/lib/financeActions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

export interface ExpenseItem {
  id: number;
  branchId: number | null;
  branchName?: string;
  amount: number;
  description: string;
  category: string;
  date: string | Date;
  recordedBy: string;
}

interface DailyExpensesSectionProps {
  expenses: ExpenseItem[];
  branches: Array<{ id: number; name: string }>;
  locale?: string;
}

export default function DailyExpensesSection({ expenses, branches, locale: propLocale }: DailyExpensesSectionProps) {
  const router = useRouter();
  const t = useTranslations("finance");
  const hookLocale = useLocale();
  const locale = propLocale || hookLocale || "fr";
  const numLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";

  const categories = [
    { value: "GENERAL", label: locale === "ar" ? "عام" : "Général" },
    { value: "SUPPLIES", label: locale === "ar" ? "لوازم ومعدات" : "Fournitures & Matériel" },
    { value: "UTILITIES", label: locale === "ar" ? "فواتير (كهرباء، ماء، إنترنت)" : "Factures (Électricité, Eau, Internet)" },
    { value: "RENT", label: locale === "ar" ? "كراء ومصاريف إيجار" : "Loyer & Charges" },
    { value: "MAINTENANCE", label: locale === "ar" ? "صيانة وتصليح" : "Entretien & Réparations" },
    { value: "REFRESHMENT", label: locale === "ar" ? "ضيافة واستقبال" : "Collation & Réception" },
    { value: "OTHER", label: locale === "ar" ? "أخرى" : "Autre" },
  ];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form state
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("GENERAL");
  const [branchId, setBranchId] = useState<string>("all");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");

  const handleOpenAdd = () => {
    setEditingId(null);
    setAmount("");
    setDescription("");
    setCategory("GENERAL");
    setBranchId("all");
    setDate(new Date().toISOString().split("T")[0]);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (exp: ExpenseItem) => {
    setEditingId(exp.id);
    setAmount(String(exp.amount));
    setDescription(exp.description);
    setCategory(exp.category);
    setBranchId(exp.branchId ? String(exp.branchId) : "all");
    setDate(new Date(exp.date).toISOString().split("T")[0]);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0 || !description.trim()) {
      toast.error(locale === "ar" ? "يرجى تحديد المبلغ والبيان." : "Veuillez renseigner le montant et la description.");
      return;
    }

    setIsLoading(true);
    try {
      if (editingId) {
        const res = await updateDailyExpenseAction(editingId, {
          amount: Number(amount),
          description,
          category,
          branchId: branchId === "all" ? null : Number(branchId),
          date,
        });
        if (res.success) {
          toast.success(res.message);
          setIsModalOpen(false);
          router.refresh();
        } else {
          toast.error(res.message);
        }
      } else {
        const res = await createDailyExpenseAction({
          amount: Number(amount),
          description,
          category,
          branchId: branchId === "all" ? null : Number(branchId),
          date,
        });
        if (res.success) {
          toast.success(res.message);
          setIsModalOpen(false);
          router.refresh();
        } else {
          toast.error(res.message);
        }
      }
    } catch {
      toast.error(locale === "ar" ? "حدث خطأ غير متوقع." : "Une erreur est survenue.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("confirmDeleteExpense"))) return;

    try {
      const res = await deleteDailyExpenseAction(id);
      if (res.success) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error(t("deleteExpenseError"));
    }
  };

  const filteredExpenses = expenses.filter((e) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      e.description.toLowerCase().includes(term) ||
      (e.branchName && e.branchName.toLowerCase().includes(term)) ||
      e.category.toLowerCase().includes(term)
    );
  });

  const totalFilteredAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Top Bar */}
      <Card className="p-4 border-border/80 shadow-xs bg-surface flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder={t("searchExpense")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3.5 py-2 text-xs border border-border rounded-lg bg-surface text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary w-full sm:w-64"
          />
          <span className="text-xs font-semibold text-muted hidden sm:inline">
            {t("filteredTotal")}{" "}
            <strong className="text-danger font-mono text-sm">
              {totalFilteredAmount.toLocaleString(numLocale)} {t("currency")}
            </strong>
          </span>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t("addExpense")}</span>
        </button>
      </Card>

      {/* Expenses Table */}
      <Card className="border-border/80 shadow-xs bg-surface overflow-hidden">
        {filteredExpenses.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">
            {t("noExpensesFound")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted border-b border-border text-xs font-semibold text-muted uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">{t("date")}</th>
                  <th className="py-3 px-4">{t("expenseDescription")}</th>
                  <th className="py-3 px-4">{t("expenseCategory")}</th>
                  <th className="py-3 px-4">{t("expenseBranch")}</th>
                  <th className="py-3 px-4 text-right">{t("expenseAmount")}</th>
                  <th className="py-3 px-4 text-center">{t("actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-surface-subtle/80 transition-colors">
                    <td className="py-3 px-4 text-muted font-mono text-xs whitespace-nowrap">
                      {new Date(exp.date).toLocaleDateString(numLocale)}
                    </td>
                    <td className="py-3 px-4 font-medium text-gray-900">
                      {exp.description}
                      <span className="block text-2xs text-muted font-normal">
                        {locale === "ar" ? `بواسطة: ${exp.recordedBy}` : `Par : ${exp.recordedBy}`}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-muted">
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-surface-muted text-gray-700 font-medium border border-border">
                        {categories.find((c) => c.value === exp.category)?.label || exp.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-muted">
                      {exp.branchName || t("allBranchesOpt")}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-danger whitespace-nowrap">
                      - {exp.amount.toLocaleString(numLocale)} {t("currency")}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(exp)}
                          title={t("editExpense")}
                          className="p-1.5 text-muted hover:text-primary rounded-md hover:bg-surface-muted transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(exp.id)}
                          title={locale === "ar" ? "حذف" : "Supprimer"}
                          className="p-1.5 text-muted hover:text-danger rounded-md hover:bg-danger-light transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal Add / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-red-600" />
              <span>{editingId ? t("editExpense") : t("recordExpense")}</span>
            </h3>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("expenseAmount")} ({t("currency")}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="ex: 3500"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("expenseDescription")} *
                </label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={locale === "ar" ? "مثال: شراء أوراق وأقلام للدروس" : "ex: Achat papier ramettes pour cours"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {t("expenseCategory")}
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  >
                    {categories.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {t("expenseBranch")}
                  </label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  >
                    <option value="all">{t("allBranchesOpt")}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("date")}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg font-medium cursor-pointer"
                >
                  {t("cancelBtn")}
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingId ? (locale === "ar" ? "تحديث" : "Mettre à jour") : (locale === "ar" ? "حفظ" : "Enregistrer")}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
