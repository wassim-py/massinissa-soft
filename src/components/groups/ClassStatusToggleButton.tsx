"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "react-toastify";
import { toggleClassStatusAction } from "@/lib/actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PauseCircle, PlayCircle, AlertTriangle, CheckCircle2, X } from "lucide-react";

interface ClassStatusToggleButtonProps {
  classId: number;
  groupName: string;
  isPaused?: boolean | null;
  isCompleted?: boolean | null;
  pausedAt?: Date | string | null;
  completedAt?: Date | string | null;
  isOwner?: boolean;
  size?: "sm" | "md";
  showBadge?: boolean;
}

export default function ClassStatusToggleButton({
  classId,
  groupName,
  isPaused = false,
  isCompleted = false,
  pausedAt = null,
  completedAt = null,
  isOwner = false,
  size = "sm",
  showBadge = false,
}: ClassStatusToggleButtonProps) {
  const router = useRouter();
  const locale = useLocale();
  const isAr = locale === "ar";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isInactive = Boolean(isPaused || isCompleted);
  const rawDate = pausedAt || completedAt;
  const formattedDate = rawDate
    ? new Date(rawDate).toLocaleDateString(isAr ? "ar-DZ" : "fr-DZ", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  const statusBadge = isInactive ? (
    <Badge
      variant="warning"
      size={size}
      withDot
      title={
        formattedDate
          ? isAr
            ? `مغلق / متوقف منذ ${formattedDate}`
            : `Fermé / En pause depuis le ${formattedDate}`
          : undefined
      }
    >
      {isAr ? "مغلق / متوقف" : "Fermé / En pause"}
    </Badge>
  ) : (
    <Badge variant="success" size={size} withDot>
      {isAr ? "نشط" : "Actif"}
    </Badge>
  );

  if (!isOwner) {
    return showBadge ? statusBadge : null;
  }

  const handleConfirm = () => {
    startTransition(async () => {
      try {
        const res = await toggleClassStatusAction({
          classId,
          isPaused: !isInactive,
        });
        if (res.success) {
          toast.success(res.message);
          setIsModalOpen(false);
          router.refresh();
        } else {
          toast.error(res.message);
        }
      } catch (err: any) {
        toast.error(
          err?.message ||
            (isAr
              ? "حدث خطأ أثناء تحديث حالة الفوج"
              : "Erreur lors de la mise à jour du statut du groupe")
        );
      }
    });
  };

  return (
    <>
      <div className="inline-flex items-center gap-2">
        {showBadge && statusBadge}
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          disabled={isPending}
          title={
            isInactive
              ? isAr
                ? "إعادة فتح الفوج واستئناف برمجته في الجدول"
                : "Réouvrir ce groupe et réactiver son créneau"
              : isAr
              ? "إغلاق / إيقاف الفوج مؤقتاً وتحرير توقيته في الجدول"
              : "Fermer / mettre en pause ce groupe et libérer son créneau"
          }
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 ${
            isInactive
              ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-200"
              : "bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-200"
          }`}
        >
          {isInactive ? (
            <>
              <PlayCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{isAr ? "إعادة فتح" : "Réouvrir"}</span>
            </>
          ) : (
            <>
              <PauseCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{isAr ? "إغلاق / إيقاف" : "Fermer / Pause"}</span>
            </>
          )}
        </button>
      </div>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 font-sans text-start"
          dir={isAr ? "rtl" : "ltr"}
          onClick={() => !isPending && setIsModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-border animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      isInactive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {isInactive ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">
                      {isInactive
                        ? isAr
                          ? "إعادة فتح الفوج"
                          : "Réouvrir le groupe"
                        : isAr
                        ? "إغلاق / إيقاف الفوج مؤقتاً"
                        : "Fermer / Mettre le groupe en pause"}
                    </h3>
                    <p className="text-xs font-semibold text-primary mt-0.5">
                      {groupName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isPending && setIsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div
                className={`p-3.5 rounded-xl border text-xs leading-relaxed space-y-1.5 ${
                  isInactive
                    ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                    : "bg-amber-50/70 border-amber-200 text-amber-950"
                }`}
              >
                {isInactive ? (
                  <p>
                    {isAr
                      ? "سيعود هذا الفوج إلى قائمة الأفواج النشطة، وستعود حصصه الأسبوعية للظهور في جدول التوقيت."
                      : "Ce groupe redeviendra actif et ses séances hebdomadaires réapparaîtront dans l'emploi du temps."}
                  </p>
                ) : (
                  <>
                    <p className="font-semibold">
                      {isAr
                        ? "• سيتم تحرير توقيت هذا الفوج فوراً في جدول الحصص (القاعة والأستاذ يصبحان متاحين)."
                        : "• Le créneau horaire sera immédiatement libéré dans l'emploi du temps (salle et enseignant disponibles)."}
                    </p>
                    <p>
                      {isAr
                        ? "• لن يتم المساس بأي بيانات مسجلة (المدفوعات، الوصولات، سجلات الحضور، التلاميذ، رواتب الأساتذة)."
                        : "• Aucune donnée enregistrée (paiements, reçus, présences, élèves, paie) ne sera modifiée ni supprimée."}
                    </p>
                    <p>
                      {isAr
                        ? "• يبقى الفوج وجميع سجلاته متاحاً في أي وقت ضمن تبويب « مغلقة / متوقفة »."
                        : "• Le groupe et son historique restent accessibles à tout moment dans l'onglet « Fermés / En pause »."}
                    </p>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isPending}
                >
                  {isAr ? "إلغاء" : "Annuler"}
                </Button>
                <Button
                  type="button"
                  variant={isInactive ? "primary" : "secondary"}
                  size="sm"
                  onClick={handleConfirm}
                  isLoading={isPending}
                >
                  {isInactive
                    ? isAr
                      ? "تأكيد إعادة الفتح"
                      : "Confirmer la réouverture"
                    : isAr
                    ? "تأكيد الإغلاق / الإيقاف"
                    : "Confirmer la mise en pause"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
