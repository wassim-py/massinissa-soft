"use client";

import React, { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/FormField";
import { Badge } from "@/components/ui/Badge";
import { updateFixedInscriptionFeeAction } from "@/lib/configurationActions";
import { toast } from "react-toastify";
import { Tag, CheckCircle2, Loader2, Save } from "lucide-react";

interface InscriptionFeeSectionProps {
  initialFee: number;
}

export default function InscriptionFeeSection({ initialFee }: InscriptionFeeSectionProps) {
  const [fee, setFee] = useState<number>(initialFee);
  const [currentSavedFee, setCurrentSavedFee] = useState<number>(initialFee);
  const [isPending, startTransition] = useTransition();

  const handleSave = (e: React.FormEvent) => {
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

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="border-b border-border/60 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span>Frais d&apos;inscription fixes / حقوق التسجيل الثابتة</span>
                  <Badge variant="primary" size="sm">
                    Par Défaut
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-muted mt-1">
                  Définissez les droits d&apos;inscription annuels appliqués automatiquement aux nouveaux élèves
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
          <form onSubmit={handleSave} className="space-y-6">
            <div className="p-4 rounded-xl bg-surface-muted border border-border text-muted text-xs flex items-start gap-3">
              <Tag className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-gray-900">Droits d&apos;inscription par défaut</p>
                <p className="text-muted leading-relaxed">
                  Montant appliqué automatiquement lors de la création d&apos;un nouveau dossier élève pour l&apos;année scolaire en cours.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Montant des frais d&apos;inscription (DZD) / المبلغ بالدينار
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
                      <span>Enregistrer les modifications</span>
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
                Synchronisation immédiate sur toutes les branches et caisses
              </span>
              <span>Propriétaire uniquement</span>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
