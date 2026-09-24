"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "react-toastify";
import { deleteFormationLevel } from "@/lib/formationActions";
import { AlertTriangle } from "lucide-react";

interface DeleteFormationLevelModalProps {
  levelId: number;
  levelName: string;
  enrolledCount: number;
  isCurrentLevel?: boolean;
  onDeleted?: () => void;
}

export default function DeleteFormationLevelModal({
  levelId,
  levelName,
  enrolledCount,
  isCurrentLevel,
  onDeleted,
}: DeleteFormationLevelModalProps) {
  const router = useRouter();
  const t = useTranslations("formations");
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const hasEnrolledStudents = enrolledCount > 0;

  const handleDelete = async () => {
    if (hasEnrolledStudents) return;
    setLoading(true);
    try {
      const res = await deleteFormationLevel(levelId);
      if (res.success) {
        toast.success(res.message);
        setIsOpen(false);
        if (onDeleted) onDeleted();
        if (isCurrentLevel) {
          router.push(`/${locale}/list/formations`);
        } else {
          router.refresh();
        }
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Une erreur est survenue lors de la suppression.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(true);
        }}
        title={t("deleteLevelBtn") || (locale === "ar" ? "حذف المستوى" : "Supprimer le niveau")}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
      >
        <Image src="/delete.png" alt="Delete" width={14} height={14} />
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !loading) setIsOpen(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-red-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                  <Image src="/delete.png" alt="Delete" width={16} height={16} />
                </div>
                <h3 className="font-bold text-gray-900 text-base">
                  {t("deleteLevelModalTitle") || (locale === "ar" ? "حذف مستوى التكوين" : "Supprimer le niveau de formation")}
                </h3>
              </div>
              <button
                onClick={() => !loading && setIsOpen(false)}
                disabled={loading}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Image src="/close.png" alt="Close" width={14} height={14} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {hasEnrolledStudents ? (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-semibold mb-1">
                        {locale === "ar"
                          ? "لا يمكن حذف هذا المستوى حالياً"
                          : "Suppression impossible pour le moment"}
                      </p>
                      <p>
                        {locale === "ar"
                          ? `هذا المستوى يحتوي على (${enrolledCount}) تلاميذ مسجلين. يرجى إلغاء تسجيلهم أو نقلهم أولاً قبل حذف المستوى.`
                          : `Ce niveau contient ${enrolledCount} élève(s) inscrit(s). Vous devez d'abord désinscrire ou transférer les élèves avant de pouvoir supprimer ce niveau.`}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    {locale === "ar"
                      ? "لحذف هذا المستوى، انتقل إلى تفاصيل الفوج وقم بإلغاء تسجيل التلاميذ المسجلين."
                      : "Pour supprimer ce niveau, rendez-vous sur les détails du groupe et désinscrivez les élèves."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {locale === "ar"
                      ? `هل أنت متأكد من رغبتك في حذف المستوى « ${levelName} » نهائياً؟`
                      : `Êtes-vous sûr de vouloir supprimer définitivement le niveau « ${levelName} » ?`}
                  </p>
                  <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-100 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                    <span>
                      {locale === "ar"
                        ? "هذا الإجراء لا يمكن التراجع عنه وسيتم حذف المستوى وأي فوج فارغ مرتبط به."
                        : "Cette action est irréversible et supprimera le niveau ainsi que ses groupes vides associés."}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={loading}
                className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {locale === "ar" ? "إلغاء" : "Annuler"}
              </button>

              {!hasEnrolledStudents && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm hover:shadow transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {loading && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>
                    {loading
                      ? (locale === "ar" ? "جاري الحذف..." : "Suppression...")
                      : (locale === "ar" ? "حذف المستوى" : "Supprimer le niveau")}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
