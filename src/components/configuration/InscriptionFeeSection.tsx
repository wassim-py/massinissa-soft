"use client";

import React, { useState, useTransition } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  updateFixedInscriptionFeeAction,
  updateFormationInscriptionFeeAction,
} from "@/lib/configurationActions";
import { toast } from "react-toastify";
import { Tag, CheckCircle2, Loader2, Save, GraduationCap, ShieldCheck } from "lucide-react";

interface InscriptionFeeSectionProps {
  initialFee: number;
  initialFormationFee?: number;
}

export default function InscriptionFeeSection({
  initialFee,
  initialFormationFee = 1500,
}: InscriptionFeeSectionProps) {
  // Regular Classes State
  const [fee, setFee] = useState<number>(initialFee);
  const [currentSavedFee, setCurrentSavedFee] = useState<number>(initialFee);
  const [isPending, startTransition] = useTransition();

  // Formation Classes State
  const [formationFee, setFormationFee] = useState<number>(initialFormationFee);
  const [currentSavedFormationFee, setCurrentSavedFormationFee] = useState<number>(initialFormationFee);
  const [isFormationPending, startFormationTransition] = useTransition();

  const handleSaveRegular = (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(fee) || fee < 0) {
      toast.error("Veuillez saisir un montant valide (≥ 0 DZD) / يرجى إدخال مبلغ صالح");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("amount", fee.toString());

      try {
        const res = await updateFixedInscriptionFeeAction({ success: false, error: false }, formData);
        if (res.success) {
          toast.success(res.message || "Frais d'inscription mis à jour avec succès / تم تحديث حقوق التسجيل بنجاح");
          setCurrentSavedFee(fee);
        } else {
          toast.error(res.message || "Échec de la mise à jour / فشل التحديث");
        }
      } catch (err: any) {
        toast.error(err?.message || "Une erreur est survenue / حدث خطأ غير متوقع");
      }
    });
  };

  const handleSaveFormation = (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(formationFee) || formationFee < 0) {
      toast.error("Veuillez saisir un montant valide (≥ 0 DZD) / يرجى إدخال مبلغ صالح");
      return;
    }

    startFormationTransition(async () => {
      const formData = new FormData();
      formData.append("amount", formationFee.toString());

      try {
        const res = await updateFormationInscriptionFeeAction({ success: false, error: false }, formData);
        if (res.success) {
          toast.success(res.message || "Frais d'inscription des formations mis à jour avec succès / تم تحديث حقوق تسجيل التكوينات بنجاح");
          setCurrentSavedFormationFee(formationFee);
        } else {
          toast.error(res.message || "Échec de la mise à jour / فشل التحديث");
        }
      } catch (err: any) {
        toast.error(err?.message || "Une erreur est survenue / حدث خطأ غير متوقع");
      }
    });
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* 1. COURS DE SOUTIEN (REGULAR GROUPS) */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="border-b border-border/60 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span>Frais d&apos;inscription - Cours de soutien / حقوق التسجيل - أفواج الدعم</span>
                  <Badge variant="primary" size="sm">
                    Cours réguliers
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-muted mt-1">
                  Droits d&apos;inscription annuels par défaut pour les cours de soutien scolaire (soumis à la règle des 3 groupes payants max)
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-surface-muted px-3.5 py-2 rounded-xl border border-border">
              <span className="text-2xs font-semibold text-muted uppercase">Montant Actuel:</span>
              <span className="text-base font-black font-mono text-primary">
                {currentSavedFee.toLocaleString("fr-FR")} DZD
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <form onSubmit={handleSaveRegular} className="space-y-6">
            <div className="p-4 rounded-xl bg-surface-muted border border-border text-muted text-xs flex items-start gap-3">
              <Tag className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-gray-900">Règle des 3 groupes & cours de soutien</p>
                <p className="text-muted leading-relaxed">
                  Montant appliqué aux groupes réguliers. Dès le 4ème groupe régulier de l&apos;élève dans l&apos;année scolaire, les frais sont automatiquement exonérés.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Frais d&apos;inscription cours de soutien (DZD) / المبلغ بالدينار
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={fee}
                    onChange={(e) => setFee(Number(e.target.value))}
                    disabled={isPending}
                    className="w-full h-11 px-3.5 rounded-xl border border-border bg-surface text-gray-900 font-mono font-bold text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
                    placeholder="Ex: 1000"
                    required
                  />
                  <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-xs font-bold text-muted">
                    DZD
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  disabled={isPending || fee === currentSavedFee}
                  className="h-11 px-6 rounded-xl flex items-center gap-2 font-bold shadow-xs cursor-pointer"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Enregistrement...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Enregistrer</span>
                    </>
                  )}
                </Button>
                {fee !== currentSavedFee && (
                  <button
                    type="button"
                    onClick={() => setFee(currentSavedFee)}
                    className="h-11 px-4 text-xs font-semibold text-muted hover:text-gray-900 transition-colors cursor-pointer"
                  >
                    Annuler
                  </button>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-border/60 flex items-center justify-between text-2xs text-muted">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                S&apos;applique à tous les cours de soutien non-formations
              </span>
              <span>Propriétaire uniquement</span>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 2. FORMATIONS (SEPARATED INSCRIPTION FEES) */}
      <Card className="border-border/80 shadow-xs border-amber-500/30">
        <CardHeader className="border-b border-border/60 pb-5 bg-amber-500/5 rounded-t-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-600/10 text-amber-600 flex items-center justify-center font-bold">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span>Frais d&apos;inscription - Formations / حقوق التسجيل - التكوينات</span>
                  <Badge variant="warning" size="sm">
                    Formations
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-muted mt-1">
                  Droits d&apos;inscription distincts appliqués aux formations (non affectés par la règle d&apos;exonération des 3 groupes)
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-surface-muted px-3.5 py-2 rounded-xl border border-border">
              <span className="text-2xs font-semibold text-muted uppercase">Montant Actuel:</span>
              <span className="text-base font-black font-mono text-amber-600">
                {currentSavedFormationFee.toLocaleString("fr-FR")} DZD
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <form onSubmit={handleSaveFormation} className="space-y-6">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-amber-950">Indépendance vis-à-vis de la règle d&apos;exonération</p>
                <p className="text-amber-800 leading-relaxed">
                  Les formations possèdent leurs propres frais d&apos;inscription séparés. L&apos;élève est toujours soumis à ces frais, même s&apos;il est déjà inscrit dans plus de 3 groupes de soutien.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Frais d&apos;inscription formations (DZD) / المبلغ بالدينار
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={formationFee}
                    onChange={(e) => setFormationFee(Number(e.target.value))}
                    disabled={isFormationPending}
                    className="w-full h-11 px-3.5 rounded-xl border border-border bg-surface text-gray-900 font-mono font-bold text-base focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 disabled:opacity-50"
                    placeholder="Ex: 1500"
                    required
                  />
                  <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-xs font-bold text-muted">
                    DZD
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  disabled={isFormationPending || formationFee === currentSavedFormationFee}
                  className="h-11 px-6 rounded-xl flex items-center gap-2 font-bold shadow-xs cursor-pointer bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {isFormationPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Enregistrement...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Enregistrer</span>
                    </>
                  )}
                </Button>
                {formationFee !== currentSavedFormationFee && (
                  <button
                    type="button"
                    onClick={() => setFormationFee(currentSavedFormationFee)}
                    className="h-11 px-4 text-xs font-semibold text-muted hover:text-gray-900 transition-colors cursor-pointer"
                  >
                    Annuler
                  </button>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-border/60 flex items-center justify-between text-2xs text-muted">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                S&apos;applique à tous les groupes de formation (langues et formations professionnelles)
              </span>
              <span>Propriétaire uniquement</span>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
