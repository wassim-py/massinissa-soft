"use client";

import React, { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/FormField";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import {
  startNextTrimesterAction,
  finishCurrentTrimesterAction,
  createAcademicYearAction,
  deleteAcademicYearAction,
} from "@/lib/configurationActions";
import { toast } from "react-toastify";
import {
  CalendarDays,
  Play,
  CheckCircle2,
  Lock,
  BookOpen,
  Receipt,
  AlertTriangle,
  Info,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from "lucide-react";

export interface TrimesterItem {
  id: number;
  academicYearId: number;
  name: string;
  label: string;
  status: "not_started" | "active" | "finished";
  startDate: string;
  endDate: string;
  booksCount: number;
  vouchersCount: number;
}

export interface AcademicYearInfo {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  enrollmentsCount?: number;
  trimestersCount?: number;
  trimesters?: TrimesterItem[];
}

interface TrimesterSectionProps {
  trimesters: TrimesterItem[];
  academicYear: AcademicYearInfo | null;
  academicYears?: AcademicYearInfo[];
}

export default function TrimesterSection({
  trimesters,
  academicYear,
  academicYears = [],
}: TrimesterSectionProps) {
  const t = useTranslations("configuration.trimesters");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  // Academic year selector state
  const [selectedYearId, setSelectedYearId] = useState<number | null>(
    academicYear?.id ?? (academicYears.length > 0 ? academicYears[0].id : null)
  );

  // Modals
  const [isYearModalOpen, setIsYearModalOpen] = useState(false);
  const [yearLabel, setYearLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [deleteYearTarget, setDeleteYearTarget] = useState<AcademicYearInfo | null>(null);

  // Confirmation dialogs
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    actionType: "start" | "finish";
  }>({
    isOpen: false,
    actionType: "start",
  });

  const currentSelectedYear =
    academicYears.find((y) => y.id === selectedYearId) ??
    (academicYear && academicYear.id === selectedYearId ? academicYear : academicYears[0] ?? academicYear);

  const currentTrimesters =
    (currentSelectedYear?.trimesters as TrimesterItem[]) ?? trimesters;

  const activeTrimester = currentTrimesters.find((t) => t.status === "active");

  const handleStartNext = () => {
    startTransition(async () => {
      try {
        const res = await startNextTrimesterAction();
        if (res.success) {
          toast.success(res.message);
          setConfirmDialog({ isOpen: false, actionType: "start" });
        } else {
          toast.error(res.message || "Erreur lors du démarrage du trimestre");
        }
      } catch (err: any) {
        toast.error(err?.message || "Erreur inattendue");
      }
    });
  };

  const handleFinishCurrent = () => {
    startTransition(async () => {
      try {
        const res = await finishCurrentTrimesterAction();
        if (res.success) {
          toast.success(res.message);
          setConfirmDialog({ isOpen: false, actionType: "finish" });
        } else {
          toast.error(res.message || "Erreur lors de la clôture du trimestre");
        }
      } catch (err: any) {
        toast.error(err?.message || "Erreur inattendue");
      }
    });
  };

  const handleCreateYear = (e: React.FormEvent) => {
    e.preventDefault();
    if (!yearLabel.trim()) {
      toast.error(
        locale === "ar"
          ? "تسمية السنة الدراسية مطلوبة"
          : "L'intitulé de l'année scolaire est requis"
      );
      return;
    }
    if (!startDate || !endDate) {
      toast.error(
        locale === "ar"
          ? "تواريخ بداية ونهاية السنة مطلوبة"
          : "Les dates de début et de fin sont requises"
      );
      return;
    }
    startTransition(async () => {
      try {
        const res = await createAcademicYearAction(
          { success: false, error: false },
          { label: yearLabel.trim(), startDate, endDate }
        );
        if (res.success) {
          toast.success(res.message);
          setIsYearModalOpen(false);
          setYearLabel("");
          setStartDate("");
          setEndDate("");
        } else {
          toast.error(res.message);
        }
      } catch (err: any) {
        toast.error(err?.message || "Erreur inattendue");
      }
    });
  };

  const handleDeleteYear = () => {
    if (!deleteYearTarget) return;
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("id", String(deleteYearTarget.id));
        const res = await deleteAcademicYearAction(
          { success: false, error: false },
          fd
        );
        if (res.success) {
          toast.success(res.message);
          setDeleteYearTarget(null);
          if (selectedYearId === deleteYearTarget.id) {
            setSelectedYearId(null);
          }
        } else {
          toast.error(res.message);
        }
      } catch (err: any) {
        toast.error(err?.message || "Erreur inattendue");
      }
    });
  };

  const getStatusBadge = (status: TrimesterItem["status"]) => {
    switch (status) {
      case "active":
        return (
          <Badge variant="success" size="md" withDot>
            {locale === "ar" ? "نشط حالياً" : "Actif actuellement"}
          </Badge>
        );
      case "finished":
        return (
          <Badge variant="neutral" size="md">
            <Lock className="w-3.5 h-3.5" />
            <span>
              {locale === "ar" ? "منتهي (مجمد - قراءة فقط)" : "Terminé (Gelé)"}
            </span>
          </Badge>
        );
      case "not_started":
      default:
        return (
          <Badge variant="neutral" size="md">
            {locale === "ar" ? "لم يبدأ بعد" : "Non commencé"}
          </Badge>
        );
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  // Determine next trimester label
  let nextTrimesterLabel = "T1";
  if (activeTrimester) {
    if (activeTrimester.label === "T1") nextTrimesterLabel = "T2";
    else if (activeTrimester.label === "T2") nextTrimesterLabel = "T3";
    else nextTrimesterLabel = "";
  } else {
    const firstNotStarted = currentTrimesters.find(
      (t) => t.status === "not_started"
    );
    if (firstNotStarted) nextTrimesterLabel = firstNotStarted.label;
  }

  const canStartNext = Boolean(nextTrimesterLabel);
  const canFinish = Boolean(activeTrimester);

  return (
    <div className="flex flex-col gap-6">
      {/* Overview Card */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-page-title font-bold text-gray-900">
                <CalendarDays className="w-6 h-6 text-primary" />
                <span>
                  {locale === "ar"
                    ? "إدارة الفصول الدراسية وتتبع الكتب (§7.20)"
                    : "Gestion des Trimestres & Suivi des Livres (§7.20)"}
                </span>
              </CardTitle>
              <CardDescription className="text-form-helper text-muted mt-1">
                {locale === "ar"
                  ? "التحكم في السنة والفصل الدراسي لمؤسسة ماسينيسا. ينشط فصل دراسي واحد في كل فترة وترتبط به صلاحيات واستحقاقات الكتب."
                  : "Contrôle de l'année scolaire et du trimestre actif de l'établissement. Un seul trimestre est actif à la fois et détermine les droits d'accès aux manuels scolaires."}
              </CardDescription>
            </div>

            {/* Academic Year Selector & Add Button */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {academicYears.length > 1 ? (
                <div className="flex items-center gap-1.5 bg-surface-muted px-3 py-1.5 rounded-xl border border-border">
                  <span className="text-xs text-muted font-medium">
                    {locale === "ar" ? "السنة:" : "Année :"}
                  </span>
                  <select
                    value={currentSelectedYear?.id ?? ""}
                    onChange={(e) => setSelectedYearId(Number(e.target.value))}
                    className="bg-transparent text-xs font-bold text-gray-900 focus:outline-hidden cursor-pointer"
                  >
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : currentSelectedYear ? (
                <div className="flex items-center gap-2 bg-surface-muted px-3.5 py-2 rounded-xl border border-border">
                  <span className="text-xs text-muted font-medium">
                    {locale === "ar" ? "السنة الدراسية:" : "Année scolaire :"}
                  </span>
                  <Badge variant="primary" size="md">
                    {currentSelectedYear.label}
                  </Badge>
                </div>
              ) : null}

              {/* Add Academic Year Button */}
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setYearLabel("");
                  const now = new Date();
                  const curYear = now.getFullYear();
                  setStartDate(`${curYear}-09-01`);
                  setEndDate(`${curYear + 1}-06-30`);
                  setIsYearModalOpen(true);
                }}
                className="font-semibold shadow-xs"
              >
                <Plus className="w-4 h-4 me-1.5" />
                <span>
                  {locale === "ar" ? "سنة دراسية جديدة" : "Nouvelle année"}
                </span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-0">
          {!currentSelectedYear ? (
            <div className="p-8 rounded-2xl bg-surface-muted/60 border border-dashed border-border text-center flex flex-col items-center justify-center gap-3 my-4">
              <div className="w-12 h-12 rounded-2xl bg-primary-light text-primary flex items-center justify-center">
                <CalendarDays className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900">
                {locale === "ar"
                  ? "لا توجد أي سنة دراسية مسجلة"
                  : "Aucune année scolaire configurée"}
              </h3>
              <p className="text-xs text-muted max-w-sm">
                {locale === "ar"
                  ? "يرجى إنشاء سنة دراسية جديدة لبدء تسجيل التلاميذ وإدارة الفصول الدراسية وحصص التدريس."
                  : "Veuillez créer une année scolaire pour démarrer les inscriptions, les trimestres et les cours."}
              </p>
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  setYearLabel("");
                  const now = new Date();
                  const curYear = now.getFullYear();
                  setStartDate(`${curYear}-09-01`);
                  setEndDate(`${curYear + 1}-06-30`);
                  setIsYearModalOpen(true);
                }}
                className="mt-2 font-semibold shadow-xs"
              >
                <Plus className="w-4 h-4 me-1.5" />
                <span>
                  {locale === "ar"
                    ? "إنشاء سنة دراسية جديدة"
                    : "Créer une année scolaire"}
                </span>
              </Button>
            </div>
          ) : (
            <>
              {/* Active Trimester Banner */}
              {activeTrimester ? (
                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-emerald-950">
                          {locale === "ar"
                            ? `${currentSelectedYear?.label ? `${currentSelectedYear.label} — ` : ""}الفصل الدراسي النشط: ${activeTrimester.name} (${activeTrimester.label})`
                            : `${currentSelectedYear?.label ? `${currentSelectedYear.label} — ` : ""}Trimestre Actif : ${activeTrimester.name} (${activeTrimester.label})`}
                        </h3>
                        <Badge variant="success" size="sm" withDot>
                          {locale === "ar" ? "نشط" : "Actif"}
                        </Badge>
                      </div>
                      <p className="text-xs text-emerald-800 mt-1">
                        {locale === "ar"
                          ? "جميع عمليات إضافة الكتب، استحقاقات وصولات الكتب، وتسليم النسخ في الحصص تجري حالياً ضمن هذا الفصل."
                          : "Tous les ajouts de livres, droits de manuels payés et remises d'exemplaires s'appliquent actuellement à ce trimestre."}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    {canStartNext && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          setConfirmDialog({ isOpen: true, actionType: "start" })
                        }
                        className="font-semibold shadow-xs"
                      >
                        <Play className="w-4 h-4 me-1.5" />
                        {locale === "ar"
                          ? `بدء الفصل التالي (${nextTrimesterLabel})`
                          : `Démarrer le trimestre suivant (${nextTrimesterLabel})`}
                      </Button>
                    )}

                    {canFinish && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          setConfirmDialog({ isOpen: true, actionType: "finish" })
                        }
                        className="border-amber-300 text-amber-900 hover:bg-amber-50"
                      >
                        <Lock className="w-4 h-4 me-1.5 text-amber-700" />
                        {locale === "ar"
                          ? "إنهاء وتجميد الفصل الحالي"
                          : "Clôturer & Geler le trimestre"}
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-amber-950">
                        {locale === "ar"
                          ? `${currentSelectedYear?.label ? `${currentSelectedYear.label} — ` : ""}لا يوجد فصل دراسي نشط حالياً`
                          : `${currentSelectedYear?.label ? `${currentSelectedYear.label} — ` : ""}Aucun trimestre n'est actif actuellement`}
                      </h3>
                      <p className="text-xs text-amber-800 mt-0.5">
                        {locale === "ar"
                          ? "يرجى بدء الفصل الدراسي لبدء تسجيل الكتب ومتابعة وصولات الكتب واستحقاقات التلاميذ."
                          : "Veuillez démarrer un trimestre pour activer la gestion des livres et les droits de remise des élèves."}
                      </p>
                    </div>
                  </div>

                  {canStartNext && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={isPending}
                      onClick={() =>
                        setConfirmDialog({ isOpen: true, actionType: "start" })
                      }
                      className="shrink-0 font-semibold"
                    >
                      <Play className="w-4 h-4 me-1.5" />
                      {locale === "ar"
                        ? `بدء الفصل الدراسي (${nextTrimesterLabel})`
                        : `Démarrer le trimestre (${nextTrimesterLabel})`}
                    </Button>
                  )}
                </div>
              )}

              {/* Trimesters Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {currentTrimesters.map((trim) => {
                  const isActive = trim.status === "active";
                  const isFinished = trim.status === "finished";

                  return (
                    <div
                      key={trim.id}
                      className={`p-5 rounded-2xl border transition-all flex flex-col justify-between gap-4 ${
                        isActive
                          ? "bg-primary-light/30 border-primary shadow-xs ring-1 ring-primary/20"
                          : isFinished
                          ? "bg-surface-muted/60 border-border opacity-90"
                          : "bg-white border-border hover:border-gray-300"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono font-bold text-sm ${
                                isActive
                                  ? "bg-primary text-white"
                                  : isFinished
                                  ? "bg-gray-200 text-gray-700"
                                  : "bg-surface-subtle text-muted"
                              }`}
                            >
                              {trim.label}
                            </span>
                            <div>
                              <h4 className="font-bold text-gray-900 text-sm">
                                {trim.name}
                              </h4>
                            </div>
                          </div>
                          {getStatusBadge(trim.status)}
                        </div>

                        <div className="text-xs text-muted space-y-1.5 border-t border-border/60 pt-3 mt-2">
                          <div className="flex items-center justify-between">
                            <span>
                              {locale === "ar" ? "الفترة الزمنية:" : "Période :"}
                            </span>
                            <span className="font-mono text-gray-700">
                              {formatDate(trim.startDate)} -{" "}
                              {formatDate(trim.endDate)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <BookOpen className="w-3.5 h-3.5 text-muted" />
                              <span>
                                {locale === "ar"
                                  ? "الكتب المسجلة:"
                                  : "Livres inscrits :"}
                              </span>
                            </span>
                            <span className="font-bold text-gray-900">
                              {trim.booksCount}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Receipt className="w-3.5 h-3.5 text-muted" />
                              <span>
                                {locale === "ar"
                                  ? "وصولات الكتب المدفوعة:"
                                  : "Bons livres payés :"}
                              </span>
                            </span>
                            <span className="font-bold text-gray-900">
                              {trim.vouchersCount}
                            </span>
                          </div>
                        </div>
                      </div>

                      {isFinished && (
                        <div className="text-[11px] text-muted-dark bg-surface-subtle px-2.5 py-1.5 rounded-lg border border-border/60 flex items-center gap-1.5">
                          <Lock className="w-3 h-3 text-muted shrink-0" />
                          <span>
                            {locale === "ar"
                              ? "بيانات هذا الفصل مجمدة كأرشيف دائم."
                              : "Données de ce trimestre gelées en archive."}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Academic Year Modal */}
      {isYearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-border shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center shrink-0">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    {locale === "ar"
                      ? "إضافة سنة دراسية جديدة"
                      : "Nouvelle année scolaire"}
                  </h3>
                  <p className="text-xs text-muted">
                    {locale === "ar"
                      ? "تحديد فترة السنة الدراسية وإعداد الفصول تلقائياً"
                      : "Définir la période et générer automatiquement les trimestres"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsYearModalOpen(false)}
                className="text-muted hover:text-gray-700 p-1.5 rounded-lg hover:bg-surface-muted transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateYear} className="space-y-4">
              <FormField
                label={locale === "ar" ? "السنة الدراسية" : "Année scolaire"}
                required
                helperText={
                  locale === "ar"
                    ? "مثال: 2026-2027 أو 2027-2028"
                    : "ex. 2026-2027 ou 2027-2028"
                }
              >
                <Input
                  type="text"
                  value={yearLabel}
                  onChange={(e) => setYearLabel(e.target.value)}
                  placeholder="2026-2027"
                  required
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label={locale === "ar" ? "تاريخ البداية" : "Date de début"}
                  required
                >
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </FormField>
                <FormField
                  label={locale === "ar" ? "تاريخ النهاية" : "Date de fin"}
                  required
                >
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </FormField>
              </div>

              <div className="p-3 bg-surface-muted rounded-xl text-xs text-muted-dark border border-border/70 flex items-start gap-2">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p>
                  {locale === "ar"
                    ? "سيتم إنشاء 3 فصول دراسية (الفصل 1، الفصل 2، الفصل 3) تلقائياً مع تفعيل الفصل الأول مباشرة."
                    : "Les trois trimestres (T1, T2, T3) seront automatiquement configurés et le premier trimestre sera activé."}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => setIsYearModalOpen(false)}
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isPending}
                >
                  {isPending
                    ? tCommon("loading")
                    : locale === "ar"
                    ? "إنشاء السنة الدراسية"
                    : "Créer l'année"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog Modal */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-border shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  confirmDialog.actionType === "start"
                    ? "bg-primary-light text-primary"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {confirmDialog.actionType === "start" ? (
                  <Play className="w-5 h-5" />
                ) : (
                  <Lock className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">
                  {confirmDialog.actionType === "start"
                    ? locale === "ar"
                      ? `تأكيد بدء الفصل التالي (${nextTrimesterLabel})`
                      : `Confirmer le démarrage du trimestre (${nextTrimesterLabel})`
                    : locale === "ar"
                    ? "تأكيد إنهاء وتجميد الفصل الحالي"
                    : "Confirmer la clôture du trimestre actif"}
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  {confirmDialog.actionType === "start"
                    ? locale === "ar"
                      ? "سيتم تفعيل الفصل التالي تلقائياً وإنهاء الفصل الحالي وتجميد بياناته."
                      : "Le trimestre suivant sera activé et l'ancien trimestre sera automatiquement clôturé et gelé."
                    : locale === "ar"
                    ? "سيتم تجميد سجلات الكتب ووصولات هذا الفصل للقراءة فقط ولا يمكن تعديلها بعد ذلك."
                    : "Les données des livres et distributions de ce trimestre deviendront en lecture seule."}
                </p>
              </div>
            </div>

            <div className="p-3 bg-surface-muted rounded-xl text-xs text-muted-dark border border-border/70">
              <p>
                {confirmDialog.actionType === "start"
                  ? locale === "ar"
                    ? "ملاحظة: استحقاقات وصولات الكتب الجديدة ستكون مقتصرة على الفصل الجديد فقط."
                    : "Remarque : Les nouveaux paiements de frais de livres seront rattachés exclusivement au nouveau trimestre."
                  : locale === "ar"
                  ? "تنبيه: لا يمكن التراجع عن تجميد الفصل بعد إغلاقه."
                  : "Attention : Cette action est irréversible."}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  setConfirmDialog({ isOpen: false, actionType: "start" })
                }
              >
                {tCommon("cancel")}
              </Button>
              <Button
                variant={
                  confirmDialog.actionType === "start" ? "primary" : "danger"
                }
                size="sm"
                disabled={isPending}
                onClick={
                  confirmDialog.actionType === "start"
                    ? handleStartNext
                    : handleFinishCurrent
                }
              >
                {isPending
                  ? tCommon("loading")
                  : confirmDialog.actionType === "start"
                  ? locale === "ar"
                    ? "تأكيد والبدء"
                    : "Confirmer & Démarrer"
                  : locale === "ar"
                  ? "تأكيد الإغلاق"
                  : "Confirmer la clôture"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
