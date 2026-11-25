"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { transferStudentFormationGroup } from "@/lib/formationActions";
import {
  ArrowRightLeft,
  Building2,
  CheckCircle2,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

export interface TransferFormationGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  enrollmentId: number;
  student: { id: string; name: string; globalNumber?: number };
  currentGroup: { id: number; name: string; branchName?: string };
  formationLevel: { id: number; name: string };
  totalPaid: number;
  latestTest?: { passed: boolean; score: number | null } | null;
  availableTargetGroups: Array<{
    id: number;
    name: string;
    branch?: { id?: number; name: string } | null;
    teacher?: { id?: string; name: string } | null;
    ageGroup?: string | null;
    lessons?: Array<{
      startsAt: Date | string;
      endsAt: Date | string;
      classroom?: { name: string } | null;
      teacher?: { name: string } | null;
    }>;
    _count?: { enrollments: number };
  }>;
  onTransferred?: () => void;
}

export default function TransferFormationGroupModal({
  isOpen,
  onClose,
  enrollmentId,
  student,
  currentGroup,
  formationLevel,
  totalPaid,
  latestTest,
  availableTargetGroups,
  onTransferred,
}: TransferFormationGroupModalProps) {
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(
    availableTargetGroups[0]?.id || null
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedGroupId(availableTargetGroups[0]?.id || null);
      setSearchTerm("");
      setNotes("");
    }
  }, [isOpen, availableTargetGroups]);

  if (!isOpen) return null;

  const filteredGroups = availableTargetGroups.filter((grp) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      grp.name.toLowerCase().includes(term) ||
      grp.branch?.name?.toLowerCase().includes(term) ||
      grp.teacher?.name?.toLowerCase().includes(term) ||
      grp.ageGroup?.toLowerCase().includes(term)
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId) return;

    setIsSubmitting(true);
    try {
      const res = await transferStudentFormationGroup({
        enrollmentId,
        fromClassId: currentGroup.id,
        toClassId: selectedGroupId,
        studentId: student.id,
        notes: notes.trim() || undefined,
      });

      if (res.success) {
        toast.success(res.message);
        onClose();
        if (onTransferred) onTransferred();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erreur lors du transfert");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 font-sans"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-primary px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <ArrowRightLeft className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold">{t("transferGroupTitle")}</h2>
              <p className="text-xs text-white/85 mt-0.5">
                {student.name} • {formationLevel.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-sm">
          {/* Student & Current Group Summary */}
          <div className="bg-surface-subtle border border-border rounded-xl p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500">{t("student")}:</span>
              <span className="font-bold text-gray-900">
                {student.globalNumber ? `#${student.globalNumber} ` : ""}
                {student.name}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500">{t("currentGroup")}</span>
              <span className="font-semibold text-gray-800">
                {currentGroup.name}
                {currentGroup.branchName ? ` (${currentGroup.branchName})` : ""}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/70">
              <span className="text-gray-500">{t("totalPreviouslyPaid")}</span>
              <div className="flex items-center gap-2">
                <Badge variant="success" size="sm" className="font-mono font-bold">
                  {totalPaid.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                </Badge>
                {latestTest && (
                  <Badge
                    variant={latestTest.passed ? "primary" : "warning"}
                    size="sm"
                  >
                    {latestTest.passed ? t("passed") : t("failed")}
                    {latestTest.score !== null ? ` (${latestTest.score}/100)` : ""}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Preservation Notice */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{t("transferGroupPreservesNote")}</p>
          </div>

          {/* Target Group Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
              {t("targetFormationGroup")}
            </label>

            {availableTargetGroups.length > 2 && (
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute start-3 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={
                    locale === "ar"
                      ? "بحث في الأفواج المتاحة..."
                      : "Rechercher un groupe..."
                  }
                  className="w-full ps-8 pe-3 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            <div className="space-y-2.5 max-h-60 overflow-y-auto pe-1">
              {filteredGroups.map((grp) => {
                const isSelected = selectedGroupId === grp.id;
                const lessons = grp.lessons || [];
                return (
                  <div
                    key={grp.id}
                    onClick={() => setSelectedGroupId(grp.id)}
                    className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                      isSelected
                        ? "border-primary bg-primary/[0.04] ring-2 ring-primary/30 shadow-xs"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          checked={isSelected}
                          onChange={() => setSelectedGroupId(grp.id)}
                          className="text-primary focus:ring-primary h-4 w-4"
                        />
                        <div>
                          <div className="font-bold text-gray-900 text-sm flex items-center gap-2 flex-wrap">
                            <span>{grp.name}</span>
                            {grp.ageGroup && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700 border">
                                {grp.ageGroup}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                            {grp.branch?.name && (
                              <span className="font-medium text-sky-800 flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {grp.branch.name}
                              </span>
                            )}
                            {grp.teacher?.name && (
                              <>
                                <span>•</span>
                                <span className="font-medium text-gray-700">
                                  {grp.teacher.name}
                                </span>
                              </>
                            )}
                            <span>•</span>
                            <span>
                              {grp._count?.enrollments || 0} {t("enrolled")}
                            </span>
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      )}
                    </div>

                    {lessons.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-gray-100 text-[11px] text-gray-600 flex flex-wrap gap-1.5">
                        {lessons.map((les, idx) => {
                          const start = new Date(les.startsAt);
                          const end = new Date(les.endsAt);
                          const dayStr = start.toLocaleDateString(
                            locale === "ar" ? "ar-DZ" : "fr-DZ",
                            { weekday: "short", timeZone: "Africa/Algiers" }
                          );
                          const timeStr = `${start.toLocaleTimeString("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Africa/Algiers",
                          })}-${end.toLocaleTimeString("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Africa/Algiers",
                          })}`;
                          return (
                            <span
                              key={idx}
                              className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded font-mono"
                            >
                              {dayStr} {timeStr}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Optional Note */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-gray-700">
              {t("voucherNotes")}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                locale === "ar"
                  ? "سبب تغيير الفوج (اختياري)..."
                  : "Motif du changement de groupe (facultatif)..."
              }
              className="w-full px-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary outline-none text-xs"
            />
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={isSubmitting || !selectedGroupId}
              leftIcon={<ArrowRightLeft className="w-4 h-4" />}
            >
              {t("switchStudentGroup")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
