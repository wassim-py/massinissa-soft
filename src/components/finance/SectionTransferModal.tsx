"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  ArrowRightLeft,
  ArrowRight,
  Wallet,
  Copy,
  Layers,
  GraduationCap,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import {
  executeSectionTransferAction,
  getPhotocopyTransferPoolAction,
} from "@/lib/financeActions";
import { FINANCE_SECTIONS } from "@/lib/financeConstants";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

interface SectionTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultFromSection?: string;
  defaultToSection?: string;
  branches?: Array<{ id: number; name: string }>;
  locale?: string;
  onTransferSuccess?: () => void;
}

export default function SectionTransferModal({
  isOpen,
  onClose,
  defaultFromSection = "PHOTOCOPY_DEDUCTIONS",
  defaultToSection = "CAISSE_NOIRE",
  branches = [],
  locale: propLocale,
  onTransferSuccess,
}: SectionTransferModalProps) {
  const router = useRouter();
  const currentLocale = useLocale();
  const locale = propLocale || currentLocale || "fr";
  const isAr = locale === "ar";

  const [fromSection, setFromSection] = useState(defaultFromSection);
  const [toSection, setToSection] = useState(defaultToSection);
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");

  const [isLoadingPool, setIsLoadingPool] = useState(false);
  const [photocopyPool, setPhotocopyPool] = useState<{
    totalCollected: number;
    totalTransferred: number;
    available: number;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // When fromSection changes or modal opens, load available pool if photocopy
  useEffect(() => {
    if (!isOpen) return;
    if (fromSection === "PHOTOCOPY_DEDUCTIONS") {
      setIsLoadingPool(true);
      getPhotocopyTransferPoolAction().then((res) => {
        setIsLoadingPool(false);
        if (res.success) {
          setPhotocopyPool(res);
        }
      });
    } else {
      setPhotocopyPool(null);
    }
  }, [isOpen, fromSection]);

  if (!isOpen) return null;

  const formatDZD = (num: number) =>
    isAr
      ? `${num.toLocaleString("ar-DZ")} دج`
      : `${num.toLocaleString("fr-DZ")} DZD`;

  const handleFillMaxAvailable = () => {
    if (photocopyPool && photocopyPool.available > 0) {
      setAmount(String(photocopyPool.available));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error(isAr ? "يرجى إدخال مبلغ صحيح أكبر من 0." : "Veuillez saisir un montant valide supérieur à 0.");
      return;
    }

    if (fromSection === toSection) {
      toast.error(isAr ? "لا يمكن التحويل من نفس القسم إلى نفسه." : "La section source et destination ne peuvent pas être identiques.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await executeSectionTransferAction({
        fromSection,
        toSection,
        amount: numAmount,
        date,
        reason: reason.trim() || undefined,
        branchId: branchId ? Number(branchId) : null,
      });

      if (res.success) {
        toast.success(res.message);
        router.refresh();
        if (onTransferSuccess) onTransferSuccess();
        onClose();
      } else {
        toast.error(res.message || "Erreur lors du transfert.");
      }
    } catch {
      toast.error(isAr ? "حدث خطأ غير متوقع." : "Une erreur inattendue est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const fromSectionMeta = FINANCE_SECTIONS.find((s) => s.id === fromSection);
  const toSectionMeta = FINANCE_SECTIONS.find((s) => s.id === toSection);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in-50 zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
              <ArrowRightLeft className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {isAr ? "تحويل الأموال بين الأقسام المالية" : "Transfert de Fonds Inter-Sections"}
                <Badge variant="primary" size="sm">
                  Direction
                </Badge>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {isAr
                  ? "مثال: تحويل اقتطاعات التصوير من رواتب الأساتذة إلى الصندوق الأسود"
                  : "Ex : Transférer les déductions photocopies vers la Caisse Noire"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Visual Source -> Destination Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            {/* From Section */}
            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl">
              <label className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block mb-1">
                {isAr ? "من القسم (المصدر) :" : "Section Source :"}
              </label>
              <select
                value={fromSection}
                onChange={(e) => setFromSection(e.target.value)}
                className="w-full bg-white border border-amber-300 rounded-lg p-2 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              >
                {FINANCE_SECTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {isAr ? s.labelAr : s.labelFr}
                  </option>
                ))}
              </select>
            </div>

            {/* To Section */}
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl">
              <label className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider block mb-1">
                {isAr ? "إلى القسم (الوجهة) :" : "Section Destination :"}
              </label>
              <select
                value={toSection}
                onChange={(e) => setToSection(e.target.value)}
                className="w-full bg-white border border-emerald-300 rounded-lg p-2 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              >
                {FINANCE_SECTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {isAr ? s.labelAr : s.labelFr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Photocopy pool helper if source is photocopy */}
          {fromSection === "PHOTOCOPY_DEDUCTIONS" && (
            <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl text-xs space-y-1">
              <div className="flex items-center justify-between text-amber-950 font-medium">
                <span>{isAr ? "المبلغ المتوفر للتحويل من اقتطاعات التصوير:" : "Fonds photocopies disponibles :"}</span>
                {isLoadingPool ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span className="font-mono font-bold text-amber-900">
                    {formatDZD(photocopyPool?.available || 0)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-[11px] text-amber-700">
                <span>
                  {isAr
                    ? `(تم اقتطاع: ${formatDZD(photocopyPool?.totalCollected || 0)} | حُوّل سابقا: ${formatDZD(photocopyPool?.totalTransferred || 0)})`
                    : `(Total déduit : ${formatDZD(photocopyPool?.totalCollected || 0)} | Déjà transféré : ${formatDZD(photocopyPool?.totalTransferred || 0)})`}
                </span>
                {photocopyPool && photocopyPool.available > 0 && (
                  <button
                    type="button"
                    onClick={handleFillMaxAvailable}
                    className="underline hover:no-underline font-semibold cursor-pointer text-amber-900"
                  >
                    {isAr ? "تحويل الكل" : "Transférer tout"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Amount and Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                {isAr ? "المبلغ المراد تحويله (دج) *" : "Montant à transférer (DZD) *"}
              </label>
              <input
                type="number"
                min="1"
                step="any"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex : 45000"
                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm font-mono font-bold text-gray-900 focus:ring-2 focus:ring-primary focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                {isAr ? "تاريخ التحويل *" : "Date du transfert *"}
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-xs font-mono font-medium text-gray-900 focus:ring-2 focus:ring-primary focus:outline-hidden"
              />
            </div>
          </div>

          {/* Optional Branch attribution */}
          {branches.length > 0 && (
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                {isAr ? "الفرع المعني (اختياري) :" : "Branche concernée (Optionnel) :"}
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-hidden"
              >
                <option value="">{isAr ? "عام / غير محدد" : "Général / Non spécifié"}</option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Reason / Notes */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">
              {isAr ? "السبب / ملاحظات التحويل :" : "Motif / Remarque du transfert :"}
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isAr
                  ? "مثال: تحويل اقتطاعات تصوير أساتذة شهر أكتوبر إلى الصندوق الأسود"
                  : "Ex : Transfert des déductions photocopies enseignants du mois vers la Caisse Noire"
              }
              className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-xs text-gray-900 focus:ring-2 focus:ring-primary focus:outline-hidden"
            />
          </div>

          {/* Real-time Impact Alert */}
          {toSection === "CAISSE_NOIRE" && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">
                  {isAr
                    ? "تحديث فوري لـ الصندوق الأسود:"
                    : "Mise à jour automatique de la Caisse Noire :"}
                </p>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  {isAr
                    ? `سيتم تسجيل إيداع تلقائي في الصندوق الأسود بقيمة +${Number(amount || 0).toLocaleString()} دج مما يرفع رصيده فورا.`
                    : `Une opération de dépôt de +${Number(amount || 0).toLocaleString()} DZD sera automatiquement créée dans la Caisse Noire.`}
                </p>
              </div>
            </div>
          )}

          {fromSection === "CAISSE_NOIRE" && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">
                  {isAr ? "خصم فوري من الصندوق الأسود:" : "Retrait automatique de la Caisse Noire :"}
                </p>
                <p className="text-[11px] text-rose-800 mt-0.5">
                  {isAr
                    ? `سيتم تسجيل عملية سحب من الصندوق الأسود بقيمة -${Number(amount || 0).toLocaleString()} دج.`
                    : `Une opération de retrait de -${Number(amount || 0).toLocaleString()} DZD sera enregistrée dans la Caisse Noire.`}
                </p>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-gray-200 flex items-center justify-between gap-3">
            <Button variant="outline" size="sm" type="button" onClick={onClose} className="cursor-pointer">
              {isAr ? "إلغاء" : "Annuler"}
            </Button>

            <Button
              variant="primary"
              size="md"
              type="submit"
              disabled={isSubmitting || !amount || Number(amount) <= 0}
              isLoading={isSubmitting}
              leftIcon={<ArrowRightLeft className="w-4 h-4" />}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
            >
              {isAr ? "تأكيد وتنفيذ التحويل" : "Confirmer le Transfert"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
