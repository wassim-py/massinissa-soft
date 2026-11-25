"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";
import { deleteFormationGroup } from "@/lib/formationActions";
import { AlertTriangle, Trash2, X } from "lucide-react";

export interface DeleteFormationGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: {
    id: number;
    name: string;
    enrolledCount: number;
    activeVouchersCount?: number;
  };
  levelName: string;
  totalGroupsInLevel: number;
  fallbackGroupUrl?: string;
  onDeleted?: () => void;
}

export default function DeleteFormationGroupModal({
  isOpen,
  onClose,
  group,
  levelName,
  totalGroupsInLevel,
  fallbackGroupUrl,
  onDeleted,
}: DeleteFormationGroupModalProps) {
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const isOnlyGroup = totalGroupsInLevel <= 1;
  const hasStudents = group.enrolledCount > 0;
  const hasVouchers = (group.activeVouchersCount || 0) > 0;
  const isBlocked = isOnlyGroup || hasStudents || hasVouchers;

  const handleDelete = async () => {
    if (isBlocked) return;
    setLoading(true);
    try {
      const res = await deleteFormationGroup(group.id);
      if (res.success) {
        toast.success(res.message);
        onClose();
        if (onDeleted) onDeleted();
        if (fallbackGroupUrl) {
          router.push(fallbackGroupUrl);
        } else {
          router.refresh();
        }
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erreur lors de la suppression du groupe");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 font-sans"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-red-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm">
                {t("deleteGroupTitle")}
              </h3>
              <p className="text-xs text-gray-500">
                {group.name} • {levelName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !loading && onClose()}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-sm">
          {isOnlyGroup ? (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <p className="leading-relaxed">{t("cannotDeleteOnlyGroup")}</p>
            </div>
          ) : hasStudents ? (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <p className="leading-relaxed">
                {locale === "ar"
                  ? `لا يمكن حذف هذا الفوج لاحتوائه على (${group.enrolledCount}) تلاميذ مسجلين. يرجى نقلهم إلى فوج آخر في نفس المستوى أو إلغاء تسجيلهم أولاً.`
                  : `Impossible de supprimer ce groupe car il contient ${group.enrolledCount} élève(s) inscrit(s). Transférez-les vers un autre groupe du même niveau ou désinscrivez-les d'abord.`}
              </p>
            </div>
          ) : hasVouchers ? (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <p className="leading-relaxed">
                {locale === "ar"
                  ? "لا يمكن حذف هذا الفوج لوجود وصولات دفع نشطة مسجلة عليه."
                  : "Impossible de supprimer ce groupe car des reçus de paiement actifs y sont associés."}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-700 leading-relaxed">
                {locale === "ar"
                  ? `هل أنت متأكد من رغبتك في حذف الفوج « ${group.name} » من المستوى « ${levelName} »؟`
                  : `Êtes-vous sûr de vouloir supprimer le groupe « ${group.name} » du niveau « ${levelName} » ?`}
              </p>
              <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-100 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                <span>
                  {locale === "ar"
                    ? "سيتم حذف هذا الفوج وحصصه فقط، بينما تبقى باقي أفواج هذا المستوى كما هي."
                    : "Seul ce groupe et ses séances seront supprimés ; les autres groupes de ce niveau resteront intacts."}
                </span>
              </p>
            </>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50/60 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={loading}
          >
            {isBlocked ? tCommon("close") : tCommon("cancel")}
          </Button>
          {!isBlocked && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              isLoading={loading}
              disabled={loading}
              onClick={handleDelete}
            >
              {tCommon("delete")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
