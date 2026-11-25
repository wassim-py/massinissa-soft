"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  createFormationGroup,
  updateFormationGroup,
} from "@/lib/formationActions";
import { X, Users, Layers } from "lucide-react";

export interface FormationGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  languageName: string;
  formationLevel: {
    id: number;
    name: string;
    levelNumber?: number;
    lumpSumPrice?: number | any;
  };
  groupData?: {
    id: number;
    name: string;
    branchId: number;
    teacherId?: string | null;
    ageGroup?: string | null;
  } | null;
  existingGroupsCount?: number;
  defaultBranchId?: number;
  defaultAgeGroup?: string | null;
  branches: Array<{ id: number; name: string }>;
  teachers: Array<{ id: string; name: string }>;
  onSuccess?: (savedGroup: any) => void;
}

export default function FormationGroupModal({
  isOpen,
  onClose,
  mode,
  languageName,
  formationLevel,
  groupData,
  existingGroupsCount = 1,
  defaultBranchId,
  defaultAgeGroup,
  branches,
  teachers,
  onSuccess,
}: FormationGroupModalProps) {
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState<number>(
    defaultBranchId || branches[0]?.id || 1
  );
  const [teacherId, setTeacherId] = useState<string>("");
  const [ageGroup, setAgeGroup] = useState<string>("Adultes (15+ ans)");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (mode === "edit" && groupData) {
      setName(groupData.name || "");
      setBranchId(groupData.branchId || defaultBranchId || branches[0]?.id || 1);
      setTeacherId(groupData.teacherId || "");
      setAgeGroup(groupData.ageGroup || defaultAgeGroup || "Adultes (15+ ans)");
    } else {
      const nextNum = (existingGroupsCount || 0) + 1;
      const suggested =
        nextNum === 1
          ? `${languageName} - ${formationLevel.name}`
          : `${languageName} - ${formationLevel.name} - ${
              locale === "ar" ? `الفوج ${nextNum}` : `Groupe ${nextNum}`
            }`;
      setName(suggested);
      setBranchId(defaultBranchId || branches[0]?.id || 1);
      setTeacherId("");
      setAgeGroup(defaultAgeGroup || "Adultes (15+ ans)");
    }
  }, [
    isOpen,
    mode,
    groupData,
    existingGroupsCount,
    languageName,
    formationLevel.name,
    defaultBranchId,
    defaultAgeGroup,
    branches,
    locale,
  ]);

  if (!isOpen) return null;

  const levelPrice = Number(formationLevel?.lumpSumPrice || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t("groupNameRequired"));
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "create") {
        const res = await createFormationGroup({
          name: name.trim(),
          branchId: Number(branchId),
          formationLevelId: formationLevel.id,
          teacherId: teacherId || null,
          ageGroup: ageGroup.trim(),
        });

        if (res.success) {
          toast.success(res.message);
          onClose();
          if (onSuccess) onSuccess(res.data);
        } else {
          toast.error(res.message);
        }
      } else if (groupData) {
        const res = await updateFormationGroup({
          id: groupData.id,
          name: name.trim(),
          branchId: Number(branchId),
          teacherId: teacherId || null,
          ageGroup: ageGroup.trim(),
        });

        if (res.success) {
          toast.success(res.message);
          onClose();
          if (onSuccess) onSuccess(res.data);
        } else {
          toast.error(res.message);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Erreur inattendue");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150 font-sans">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-indigo-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                {mode === "create" ? t("addGroupToLevel") : t("editGroupTitle")}
              </h2>
              <p className="text-xs text-white/80 mt-0.5">
                {languageName} • {formationLevel.name}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
          {/* Shared Level Context */}
          <div className="bg-surface-subtle border border-border rounded-xl p-3 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-gray-700 font-semibold">
              <Layers className="w-4 h-4 text-primary shrink-0" />
              <span>
                {languageName} — {formationLevel.name}
              </span>
            </div>
            <Badge variant="primary" size="sm" className="font-mono font-bold">
              {levelPrice.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
            </Badge>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">
              {t("groupNameLabel")} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("groupNamePlaceholder")}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm font-medium"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {branches.length > 0 && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-700">
                  {t("branch")}
                </label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary outline-none text-sm bg-white"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">
                {t("teacher")}
              </label>
              <select
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary outline-none text-sm bg-white"
              >
                <option value="">{t("unassignedTeacher")}</option>
                {teachers.map((tc) => (
                  <option key={tc.id} value={tc.id}>
                    {tc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">
              {t("ageGroup")}
            </label>
            <input
              type="text"
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              placeholder={t("ageGroupPlaceholder")}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary outline-none text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
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
              disabled={isSubmitting || !name.trim()}
            >
              {mode === "create" ? tCommon("create") : tCommon("save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
