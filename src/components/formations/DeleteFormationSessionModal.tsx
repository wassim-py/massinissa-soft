"use client";

import { useState } from "react";
import { deleteFormationSession } from "@/lib/formationActions";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";
import { useTranslations, useLocale } from "next-intl";
import { Trash2, AlertTriangle, X } from "lucide-react";

export default function DeleteFormationSessionModal({
  isOpen,
  onClose,
  session,
  classId,
  className,
  onSessionDeleted,
}: {
  isOpen: boolean;
  onClose: () => void;
  session: {
    id: number;
    startsAt: Date | string;
    endsAt: Date | string;
    classroom?: { id: number; name: string } | null;
    teacher?: { id: string; name: string } | null;
    attendances?: Array<any>;
  } | null;
  classId: number;
  className?: string;
  onSessionDeleted?: () => void;
}) {
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [loading, setLoading] = useState(false);

  if (!isOpen || !session) return null;

  const dayFormatted = new Date(session.startsAt).toLocaleDateString(
    locale === "ar" ? "ar-DZ" : "fr-DZ",
    { weekday: "long" }
  );

  const startTimeStr = new Date(session.startsAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTimeStr = new Date(session.endsAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const attendancesCount = session.attendances?.length || 0;

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await deleteFormationSession({
        sessionId: session.id,
        classId,
      });

      if (res.success) {
        toast.success(res.message);
        if (onSessionDeleted) onSessionDeleted();
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(
        err?.message ||
          (locale === "ar" ? "فشل في حذف الحصة." : "Échec de la suppression de la séance.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-border animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-red-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-section-title font-bold text-gray-900">
                {t("deleteSessionModalTitle")}
              </h2>
              {className && (
                <p className="text-xs text-muted mt-0.5">
                  {className}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 bg-surface-subtle border border-border/80 rounded-xl space-y-1.5">
            <p className="font-bold text-gray-900 capitalize text-sm">
              {dayFormatted}
            </p>
            <p className="text-xs text-muted font-mono font-medium" dir="ltr">
              {startTimeStr} - {endTimeStr}
            </p>
            {(session.classroom || session.teacher) && (
              <div className="flex items-center gap-3 text-xs text-gray-500 pt-1">
                {session.classroom && (
                  <span>
                    {locale === "ar" ? `القاعة: ${session.classroom.name}` : `Salle : ${session.classroom.name}`}
                  </span>
                )}
                {session.teacher && (
                  <span>
                    {locale === "ar" ? `الأستاذ: ${session.teacher.name}` : `Enseignant : ${session.teacher.name}`}
                  </span>
                )}
              </div>
            )}
          </div>

          <p className="text-sm text-gray-700 leading-relaxed">
            {t("deleteSessionConfirmDesc")}
          </p>

          {attendancesCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">
                  {locale === "ar" ? "سجلات الحضور المسجلة" : "Enregistrements de présence"}
                </p>
                <p>
                  {locale === "ar"
                    ? `تحتوي هذه الحصة على (${attendancesCount}) سجلات حضور. سيتم حذفها نهائياً.`
                    : `Cette séance contient ${attendancesCount} enregistrement(s) de présence qui seront supprimés.`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border bg-surface-subtle flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleDelete}
            isLoading={loading}
            disabled={loading}
          >
            {loading ? t("saving") : t("deleteSession")}
          </Button>
        </div>
      </div>
    </div>
  );
}
