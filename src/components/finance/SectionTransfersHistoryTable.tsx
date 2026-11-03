"use client";

import React, { useState } from "react";
import {
  ArrowRightLeft,
  ArrowRight,
  Search,
  Calendar,
  User,
  Trash2,
  Loader2,
  Building2,
  Plus,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import {
  SectionTransferItem,
  deleteSectionTransferAction,
} from "@/lib/financeActions";
import { FINANCE_SECTIONS } from "@/lib/financeConstants";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

interface SectionTransfersHistoryTableProps {
  transfers: SectionTransferItem[];
  branches?: Array<{ id: number; name: string }>;
  onOpenNewTransfer?: () => void;
  locale?: string;
}

export default function SectionTransfersHistoryTable({
  transfers: initialTransfers,
  branches = [],
  onOpenNewTransfer,
  locale: propLocale,
}: SectionTransfersHistoryTableProps) {
  const router = useRouter();
  const currentLocale = useLocale();
  const locale = propLocale || currentLocale || "fr";
  const isAr = locale === "ar";

  const [transfers, setTransfers] = useState<SectionTransferItem[]>(initialTransfers);
  const [search, setSearch] = useState("");
  const [filterSection, setFilterSection] = useState("ALL");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const formatDZD = (num: number) =>
    isAr
      ? `${num.toLocaleString("ar-DZ")} دج`
      : `${num.toLocaleString("fr-DZ")} DZD`;

  const getSectionBadge = (sectionId: string) => {
    switch (sectionId) {
      case "PHOTOCOPY_DEDUCTIONS":
        return <Badge variant="warning" size="sm">{isAr ? "اقتطاعات التصوير" : "Déductions Photocopies"}</Badge>;
      case "CAISSE_NOIRE":
        return <Badge variant="secondary" size="sm">{isAr ? "الصندوق الأسود" : "Caisse Noire"}</Badge>;
      case "FORMATION_INCOMES":
        return <Badge variant="danger" size="sm">{isAr ? "مداخيل التكوين" : "Revenus Formations"}</Badge>;
      case "INSCRIPTION_FEES":
        return <Badge variant="success" size="sm">{isAr ? "حقوق التسجيل" : "Frais Inscription"}</Badge>;
      case "FORMATION_BOOKS":
        return <Badge variant="primary" size="sm">{isAr ? "كتب التكوين" : "Livres Formation"}</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{sectionId}</Badge>;
    }
  };

  const filteredTransfers = transfers.filter((t) => {
    if (filterSection !== "ALL" && t.fromSection !== filterSection && t.toSection !== filterSection) {
      return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchReason = t.reason?.toLowerCase().includes(q);
      const matchUser = t.recordedBy.toLowerCase().includes(q);
      const matchAmount = String(t.amount).includes(q);
      return matchReason || matchUser || matchAmount;
    }
    return true;
  });

  const totalTransferred = filteredTransfers.reduce((s, t) => s + t.amount, 0);

  const handleDelete = async (id: number) => {
    if (!confirm(isAr ? "هل أنت متأكد من إلغاء وحذف هذا التحويل؟ سيتم تعديل رصيد الصندوق الأسود تلقائيا." : "Êtes-vous sûr d'annuler ce transfert ? Le solde de la Caisse Noire sera ajusté.")) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await deleteSectionTransferAction(id);
      if (res.success) {
        toast.success(res.message);
        setTransfers((prev) => prev.filter((t) => t.id !== id));
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Erreur lors de la suppression.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card className="p-5 border-border/80 shadow-xs space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border/80">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-primary" />
              {isAr ? "سجل تحويلات الأموال بين الأقسام" : "Journal des Transferts Inter-Sections"}
            </h3>
            <Badge variant="primary" size="sm">
              {filteredTransfers.length} {isAr ? "عملية" : "opération(s)"}
            </Badge>
          </div>
          <p className="text-xs text-muted mt-0.5">
            {isAr
              ? "متابعة تدفقات السيولة بين اقتطاعات التصوير، الصندوق الأسود، التكوين، والخزينة"
              : "Suivi des flux internes entre déductions, Caisse Noire, formations et trésorerie"}
          </p>
        </div>

        {onOpenNewTransfer && (
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenNewTransfer}
            leftIcon={<Plus className="w-4 h-4" />}
            className="cursor-pointer"
          >
            {isAr ? "تحويل أموال جديد" : "Nouveau Transfert"}
          </Button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? "بحث في الملاحظات أو المبلغ..." : "Rechercher par motif, montant..."}
            className="w-full bg-surface-subtle border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          <select
            value={filterSection}
            onChange={(e) => setFilterSection(e.target.value)}
            className="bg-surface-subtle border border-border rounded-lg px-3 py-1.5 text-xs font-medium text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-primary/40"
          >
            <option value="ALL">{isAr ? "جميع الأقسام" : "Toutes les sections"}</option>
            {FINANCE_SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {isAr ? s.labelAr : s.labelFr}
              </option>
            ))}
          </select>

          <span className="text-xs text-muted shrink-0 font-mono font-bold bg-surface-subtle border border-border px-3 py-1.5 rounded-lg">
            Total : {formatDZD(totalTransferred)}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs text-left">
          <thead className="bg-surface-subtle text-muted font-bold uppercase tracking-wider text-[10px] border-b border-border">
            <tr>
              <th className="p-3 text-center w-28">{isAr ? "التاريخ" : "Date"}</th>
              <th className="p-3 text-center">{isAr ? "من قسم" : "Section Source"}</th>
              <th className="p-3 text-center w-8"></th>
              <th className="p-3 text-center">{isAr ? "إلى قسم" : "Section Destination"}</th>
              <th className="p-3 text-right">{isAr ? "المبلغ" : "Montant"}</th>
              <th className="p-3">{isAr ? "السبب / البيان" : "Motif / Remarque"}</th>
              <th className="p-3 text-center">{isAr ? "المسؤول" : "Enregistré par"}</th>
              <th className="p-3 text-center w-16">{isAr ? "إجراء" : "Action"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredTransfers.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted italic">
                  {isAr ? "لا توجد تحويلات مسجلة بعد." : "Aucun transfert de fonds enregistré."}
                </td>
              </tr>
            ) : (
              filteredTransfers.map((t) => (
                <tr key={t.id} className="hover:bg-surface-subtle/50 transition-colors">
                  <td className="p-3 text-center font-mono text-gray-700">
                    {new Date(t.date).toLocaleDateString(locale)}
                  </td>
                  <td className="p-3 text-center">{getSectionBadge(t.fromSection)}</td>
                  <td className="p-3 text-center text-muted">
                    <ArrowRight className="w-3.5 h-3.5 mx-auto" />
                  </td>
                  <td className="p-3 text-center">{getSectionBadge(t.toSection)}</td>
                  <td className="p-3 text-right font-mono font-bold text-gray-900 text-sm">
                    {formatDZD(t.amount)}
                  </td>
                  <td className="p-3 text-gray-700 max-w-xs truncate" title={t.reason || ""}>
                    {t.reason || <span className="text-muted italic">—</span>}
                  </td>
                  <td className="p-3 text-center font-mono text-gray-600">{t.recordedBy}</td>
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      disabled={deletingId === t.id}
                      className="p-1 rounded text-muted hover:text-danger hover:bg-danger-light/30 transition-colors cursor-pointer"
                      title={isAr ? "إلغاء التحويل" : "Annuler ce transfert"}
                    >
                      {deletingId === t.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-danger" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
