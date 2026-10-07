"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  updateTeacherGroupPercentageAction,
  resetAllTeacherGroupPercentagesAction,
} from "@/lib/actions";
import { toast } from "react-toastify";
import {
  SlidersHorizontal,
  Edit2,
  Check,
  X,
  RotateCcw,
  Sparkles,
  Building2,
  GraduationCap,
  Users,
  Coins,
  Percent,
  Info,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

export interface ConfigurableGroup {
  id: number;
  name: string;
  branchName: string;
  levelName: string;
  studentsCount: number;
  pricePerCycle: number;
  customPercentage: number | null; // null means uses overall percentage
}

interface TeacherGroupPercentageConfiguratorProps {
  teacherId: string;
  overallPercentage: number;
  groups: ConfigurableGroup[];
}

const PRESET_PERCENTAGES = [30, 35, 40, 45, 50, 55, 60, 70];

export default function TeacherGroupPercentageConfigurator({
  teacherId,
  overallPercentage,
  groups,
}: TeacherGroupPercentageConfiguratorProps) {
  const t = useTranslations("teacherProfile");
  const locale = useLocale();

  const [groupList, setGroupList] = useState<ConfigurableGroup[]>(groups);
  const [editingGroup, setEditingGroup] = useState<ConfigurableGroup | null>(null);
  const [editValue, setEditValue] = useState<number>(overallPercentage);
  const [isPending, startTransition] = useTransition();

  const formatDZD = (num: number) =>
    `${Number(num || 0).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD`;

  const customCount = groupList.filter((g) => g.customPercentage !== null).length;
  const defaultCount = groupList.length - customCount;

  const handleOpenEdit = (group: ConfigurableGroup) => {
    setEditingGroup(group);
    setEditValue(group.customPercentage !== null ? group.customPercentage : overallPercentage);
  };

  const handleCloseEdit = () => {
    if (isPending) return;
    setEditingGroup(null);
  };

  const handleSaveGroupRate = (customPct: number | null) => {
    if (!editingGroup) return;

    if (customPct !== null && (customPct < 0 || customPct > 100 || isNaN(customPct))) {
      toast.error(t("invalidPercentageError"));
      return;
    }

    const targetGroupId = editingGroup.id;
    startTransition(async () => {
      const res = await updateTeacherGroupPercentageAction({
        teacherId,
        classId: targetGroupId,
        percentage: customPct,
      });

      if (res.success) {
        toast.success(res.message);
        setGroupList((prev) =>
          prev.map((g) => (g.id === targetGroupId ? { ...g, customPercentage: customPct } : g))
        );
        setEditingGroup(null);
      } else {
        toast.error(res.message || t("rateUpdated"));
      }
    });
  };

  const handleResetAll = () => {
    if (customCount === 0) return;
    if (!window.confirm(t("revertAllConfirm", { rate: overallPercentage }))) {
      return;
    }

    startTransition(async () => {
      const res = await resetAllTeacherGroupPercentagesAction(teacherId);
      if (res.success) {
        toast.success(res.message);
        setGroupList((prev) => prev.map((g) => ({ ...g, customPercentage: null })));
      } else {
        toast.error(res.message || t("rateUpdated"));
      }
    });
  };

  if (groupList.length === 0) {
    return (
      <Card className="border-border/80 shadow-xs">
        <CardContent className="p-6 text-center text-muted text-sm">
          {t("noGroupsAssigned")}
        </CardContent>
      </Card>
    );
  }

  // Pre-calculations for currently edited group in modal
  const editingSessionPrice =
    editingGroup && editingGroup.pricePerCycle > 0 ? editingGroup.pricePerCycle / 4 : 0;
  const editingTeacherCut = Math.round((editingSessionPrice * editValue) / 100);
  const editingSchoolCut = Math.max(0, editingSessionPrice - editingTeacherCut);

  return (
    <Card className="border-border/80 shadow-xs">
      <CardHeader className="p-4 sm:p-5 border-b border-border/70">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-2">
                <span>{t("groupPercentagesTitle")}</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted mt-0.5">
                {t("groupPercentagesDesc")}
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto flex-wrap">
            <Badge variant={customCount > 0 ? "success" : "neutral"} size="md">
              {t("groupsCountStatus", { customCount, defaultCount })}
            </Badge>

            {customCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetAll}
                disabled={isPending}
                className="text-xs text-muted-dark hover:text-danger hover:bg-danger/10 h-8 px-2.5"
                leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                {t("revertAllToOverall")}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-5">
        {/* Responsive Grid of Cards - Optimized for Smartphone touch screens */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {groupList.map((g) => {
            const hasCustom = g.customPercentage !== null;
            const effectivePercentage = hasCustom ? g.customPercentage! : overallPercentage;
            const sessionPrice = g.pricePerCycle > 0 ? g.pricePerCycle / 4 : 0;
            const teacherCut = Math.round((sessionPrice * effectivePercentage) / 100);
            const schoolCut = Math.max(0, sessionPrice - teacherCut);

            return (
              <div
                key={g.id}
                className={`p-3.5 sm:p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 shadow-xs ${
                  hasCustom
                    ? "bg-emerald-50/40 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-800/60"
                    : "bg-surface-subtle/70 border-border/80 hover:border-border-dark"
                }`}
              >
                {/* Header: Group Name & Overridden Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm sm:text-base text-gray-900 truncate">
                      {g.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted flex-wrap">
                      <span className="flex items-center gap-1">
                        <GraduationCap className="w-3.5 h-3.5 text-muted" />
                        <span>{g.levelName}</span>
                      </span>
                      {g.branchName && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-muted" />
                            <span>{g.branchName}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <Badge
                    variant={hasCustom ? "success" : "neutral"}
                    size="sm"
                    className="shrink-0 font-semibold"
                  >
                    {hasCustom ? (
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                        {g.customPercentage}% ({t("customBadge")})
                      </span>
                    ) : (
                      <span>
                        {overallPercentage}% ({t("defaultBadge")})
                      </span>
                    )}
                  </Badge>
                </div>

                {/* Financial breakdown mini-card */}
                <div className="bg-surface p-2.5 rounded-lg border border-border/70 text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-muted">
                    <span>{t("studentPays")}</span>
                    <span className="font-semibold text-gray-900">
                      {formatDZD(sessionPrice)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <Percent className="w-3 h-3" />
                      {t("teacherSharePerStudent")}
                    </span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      {formatDZD(teacherCut)}{" "}
                      <span className="text-[10px] font-normal text-muted">
                        ({effectivePercentage}%)
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-blue-700 dark:text-blue-400">
                    <span className="font-medium">{t("schoolSharePerStudent")}</span>
                    <span className="font-bold">
                      {formatDZD(schoolCut)}{" "}
                      <span className="text-[10px] font-normal text-muted">
                        ({100 - effectivePercentage}%)
                      </span>
                    </span>
                  </div>
                </div>

                {/* Mobile Touch-Friendly Edit Button */}
                <div className="flex items-center justify-between pt-1 border-t border-border/60">
                  <span className="text-xs text-muted flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    <span>
                      {g.studentsCount} {t("studentUnit")}
                    </span>
                  </span>

                  <Button
                    type="button"
                    variant={hasCustom ? "primary" : "outline"}
                    size="sm"
                    onClick={() => handleOpenEdit(g)}
                    className="text-xs py-1.5 px-3 h-8 shadow-xs"
                    leftIcon={<Edit2 className="w-3 h-3" />}
                  >
                    {t("edit")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      {/* ========================================================================= */}
      {/* MOBILE-OPTIMIZED EDIT MODAL / BOTTOM SHEET                                */}
      {/* ========================================================================= */}
      {editingGroup && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200"
        >
          <div
            className="w-full sm:max-w-md bg-surface border border-border rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Percent className="w-4 h-4 text-primary" />
                  <span>{t("editGroupRateTitle")}</span>
                </h3>
                <p className="text-xs text-muted mt-0.5 font-medium truncate max-w-[280px]">
                  {editingGroup.name}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCloseEdit}
                disabled={isPending}
                className="w-8 h-8 p-0 rounded-full text-muted hover:text-gray-900"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              {/* Group Meta summary */}
              <div className="bg-surface-subtle p-3 rounded-xl border border-border/80 flex items-center justify-between text-xs">
                <div>
                  <span className="text-muted block">{t("colSessionPrice")}</span>
                  <span className="text-sm font-bold text-gray-900">
                    {formatDZD(editingSessionPrice)}
                  </span>
                </div>
                <div className="text-end">
                  <span className="text-muted block">{t("overallPercentageBadge")}</span>
                  <span className="text-sm font-semibold text-gray-700">
                    {overallPercentage}%
                  </span>
                </div>
              </div>

              {/* Quick Preset Buttons (1-Tap on mobile phone) */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-2">
                  {t("quickPresets")}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_PERCENTAGES.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setEditValue(preset)}
                      className={`py-2 px-2 rounded-lg text-xs font-bold transition-all border ${
                        editValue === preset
                          ? "bg-primary text-white border-primary shadow-xs scale-[1.02]"
                          : "bg-surface hover:bg-surface-subtle text-gray-800 border-border"
                      }`}
                    >
                      {preset}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Precise Stepper Input */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-2">
                  {t("colAppliedRate")} (%)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditValue((prev) => Math.max(0, prev - 1))}
                    className="w-11 h-11 rounded-xl border border-border bg-surface-subtle hover:bg-surface text-gray-700 font-bold text-base flex items-center justify-center shrink-0 active:scale-95 transition-transform"
                  >
                    -
                  </button>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={editValue}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setEditValue(isNaN(val) ? 0 : val);
                      }}
                      className="w-full text-center font-bold text-lg py-2.5 px-3 rounded-xl border border-border bg-surface text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-primary/30"
                    />
                    <span className="absolute end-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted">
                      %
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditValue((prev) => Math.min(100, prev + 1))}
                    className="w-11 h-11 rounded-xl border border-border bg-surface-subtle hover:bg-surface text-gray-700 font-bold text-base flex items-center justify-center shrink-0 active:scale-95 transition-transform"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Real-time Financial Preview */}
              <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 p-3.5 rounded-xl space-y-2">
                <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-300 block uppercase tracking-wider">
                  Simulation séance ({editValue}%)
                </span>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-800 dark:text-emerald-400 font-medium">
                    {t("teacherSharePerStudent")}
                  </span>
                  <span className="font-bold text-emerald-900 dark:text-emerald-200 text-sm">
                    {formatDZD(editingTeacherCut)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-blue-800 dark:text-blue-400 font-medium">
                    {t("schoolSharePerStudent")}
                  </span>
                  <span className="font-bold text-blue-900 dark:text-blue-200 text-sm">
                    {formatDZD(editingSchoolCut)}
                  </span>
                </div>
              </div>

              {/* Revert Button if currently overridden */}
              {editingGroup.customPercentage !== null && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSaveGroupRate(null)}
                  disabled={isPending}
                  className="w-full text-xs text-muted-dark hover:text-danger hover:border-danger/40 h-9"
                  leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                >
                  {t("revertToOverall", { rate: overallPercentage })}
                </Button>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-border bg-surface-subtle/50 flex flex-col sm:flex-row items-center gap-2.5">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => handleSaveGroupRate(editValue)}
                disabled={isPending}
                isLoading={isPending}
                className="w-full sm:flex-1 h-11 font-bold text-sm shadow-xs"
                leftIcon={<Check className="w-4 h-4" />}
              >
                {t("save")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={handleCloseEdit}
                disabled={isPending}
                className="w-full sm:w-auto h-11 text-xs text-muted"
              >
                {t("cancel")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
