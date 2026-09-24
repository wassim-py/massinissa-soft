"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "react-toastify";
import {
  deleteStudentFromFormationLevel,
  deleteMultipleStudentsFromFormationLevel,
} from "@/lib/formationActions";
import { AlertTriangle, Info } from "lucide-react";

interface StudentToDelete {
  enrollmentId: number;
  studentId: string;
  studentName: string;
  totalPaid: number;
}

export default function DeleteStudentFromFormationModal({
  isOpen,
  onClose,
  classId,
  enrollments,
  onDeleted,
}: {
  isOpen: boolean;
  onClose: () => void;
  classId: number;
  enrollments: StudentToDelete[];
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [loading, setLoading] = useState(false);

  if (!isOpen || enrollments.length === 0) return null;

  const isSingle = enrollments.length === 1;
  const singleStudent = enrollments[0];
  const totalPaidSum = enrollments.reduce((sum, e) => sum + (e.totalPaid || 0), 0);

  const handleDelete = async () => {
    setLoading(true);
    try {
      let res;
      if (isSingle) {
        res = await deleteStudentFromFormationLevel({
          enrollmentId: singleStudent.enrollmentId,
          classId,
          studentId: singleStudent.studentId,
        });
      } else {
        res = await deleteMultipleStudentsFromFormationLevel({
          classId,
          enrollments: enrollments.map((e) => ({
            enrollmentId: e.enrollmentId,
            studentId: e.studentId,
          })),
        });
      }

      if (res.success) {
        toast.success(res.message);
        onClose();
        if (onDeleted) onDeleted();
        router.refresh();
      } else {
        toast.error(res.message || "Erreur lors de la suppression");
      }
    } catch (err: any) {
      console.error("Error deleting student from formation level:", err);
      toast.error(err?.message || "Erreur lors de la suppression");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-150">
        {/* HEADER */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-red-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </div>
            <h3 className="font-bold text-gray-900 text-base">
              {isSingle
                ? t("deleteStudentModalTitle")
                : t("batchDeleteModalTitle", { count: enrollments.length })}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Image src="/close.png" alt="Close" width={14} height={14} />
          </button>
        </div>

        {/* BODY */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            {isSingle
              ? t("deleteStudentModalDesc", { name: singleStudent.studentName })
              : t("batchDeleteModalDesc", { count: enrollments.length })}
          </p>

          {!isSingle && (
            <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-gray-50 text-xs space-y-1">
              {enrollments.map((e) => (
                <div key={e.enrollmentId} className="flex justify-between items-center py-0.5 px-1 font-medium text-gray-700">
                  <span>• {e.studentName}</span>
                  {e.totalPaid > 0 && (
                    <span className="text-green-700 font-mono font-semibold">
                      {e.totalPaid.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {totalPaidSum > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <p className="leading-relaxed">
                {t("deleteStudentHasPaymentWarning", {
                  amount: totalPaidSum.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ"),
                })}
              </p>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 text-blue-600 mt-0.5" />
            <p className="leading-relaxed">
              {locale === "ar"
                ? "تنبيه: هذا الإجراء يلغي تسجيل التلميذ من هذا المستوى التكويني فقط. سيبقى ملف وحساب التلميذ محفوظاً بالكامل في قاعدة بيانات المؤسسة ولن يتم حذفه."
                : "Information : Cette action désinscrit l'élève uniquement de ce niveau de formation. Son compte et son profil dans l'établissement restent intégralement conservés dans la base de données."}
            </p>
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-semibold text-gray-700 hover:text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{t("deletingStudent")}</span>
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>{t("confirmDeleteStudent")}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
