"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "react-toastify";
import {
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  UserX,
  Edit2,
  Trash2,
  MessageSquare,
  Sparkles,
  Phone,
  ShieldAlert,
} from "lucide-react";
import {
  getBranchWhatsAppQueueAction,
  sendSingleWhatsAppNotificationAction,
  sendAllPendingBranchAction,
  dismissWhatsAppNotificationAction,
  updatePendingNotificationMessageAction,
} from "@/lib/whatsappActions";
import { WhatsAppTriggerType } from "@prisma/client";

interface Props {
  initialBranchId?: number;
  branches: Array<{ id: number; name: string }>;
  isOwner: boolean;
  userBranchIds: number[];
}

export default function WhatsAppQueueClient({
  initialBranchId,
  branches,
  isOwner,
  userBranchIds,
}: Props) {
  const t = useTranslations("common");
  const locale = useLocale();
  const isAr = locale === "ar";
  const [isPending, startTransition] = useTransition();

  const defaultBranch =
    initialBranchId || (userBranchIds.length > 0 ? userBranchIds[0] : branches[0]?.id || 1);

  const [selectedBranchId, setSelectedBranchId] = useState<number>(defaultBranch);
  const [triggerFilter, setTriggerFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Edit message modal state
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editText, setEditText] = useState("");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBranchWhatsAppQueueAction({
        branchId: selectedBranchId,
        triggerType: triggerFilter as any,
        status: statusFilter,
        search: searchTerm,
        page,
        pageSize: 15,
      });

      if (res.success) {
        setItems(res.items || []);
        setTotal(res.total || 0);
        setPendingCount(res.pendingCount || 0);
        setTotalPages(res.totalPages || 1);
      }
    } catch (err) {
      console.error(err);
      toast.error(isAr ? "فشل تحميل قائمة الانتظار" : "Erreur de chargement de la file d'attente");
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId, triggerFilter, statusFilter, searchTerm, page, isAr]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadQueue();
  };

  const handleSendSingle = (notificationId: string) => {
    startTransition(async () => {
      const res = await sendSingleWhatsAppNotificationAction(notificationId);
      if (res.success) {
        toast.success(res.message);
        loadQueue();
      } else if (res.revoked) {
        toast.info(res.message);
        loadQueue();
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleSendAllPending = () => {
    if (pendingCount === 0) return;
    if (
      !confirm(
        isAr
          ? `هل أنت متأكد من إرسال جميع الرسائل المعلقة (${pendingCount}) لهذا الفرع؟`
          : `Confirmez-vous l'envoi de toutes les notifications en attente (${pendingCount}) ?`
      )
    ) {
      return;
    }

    startTransition(async () => {
      const res = await sendAllPendingBranchAction(selectedBranchId);
      if (res.success) {
        toast.success(res.message);
        loadQueue();
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleDismiss = (notificationId: string) => {
    startTransition(async () => {
      const res = await dismissWhatsAppNotificationAction(notificationId);
      if (res.success) {
        toast.info(res.message);
        loadQueue();
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    startTransition(async () => {
      const res = await updatePendingNotificationMessageAction(editingItem.id, editText);
      if (res.success) {
        toast.success(res.message);
        setEditingItem(null);
        loadQueue();
      } else {
        toast.error(res.message);
      }
    });
  };

  const getTriggerBadge = (type: string, revision: number = 1) => {
    switch (type) {
      case "ABSENCE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800">
            {isAr ? "غياب عن الحصة" : "Absence"}
          </span>
        );
      case "ABSENCE_CORRECTION":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
            {isAr ? "تصحيح حضور" : "Rectification"}
          </span>
        );
      case "CREDIT_ZERO_INSTANT":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
            {isAr ? "نفاد الرصيد (0)" : "Solde 0"}
          </span>
        );
      case "CREDIT_ZERO_PRE_LESSON_24H":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-900">
            ⚠️ {isAr ? "تنبيه 24h (رصيد -1)" : "Avertissement 24h (-1)"}
          </span>
        );
      case "SPECIAL_LESSON_NEW":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800">
            {isAr ? "حصة خاصة جديدة" : "Séance Spéciale"}
          </span>
        );
      case "SPECIAL_LESSON_UPDATE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
            🔄 {isAr ? `تعديل مؤكد (تعديل ${revision})` : `Révision ${revision}`}
          </span>
        );
      case "SPECIAL_LESSON_CANCELLED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gray-200 text-gray-800">
            ❌ {isAr ? "إلغاء حصة" : "Séance Annulée"}
          </span>
        );
      default:
        return <span className="text-xs text-gray-500">{type}</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING_MANUAL":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3 h-3" />
            {isAr ? "بانتظار الإرسال" : "En attente"}
          </span>
        );
      case "SENT":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="w-3 h-3" />
            {isAr ? "تم الإرسال" : "Envoyé"}
          </span>
        );
      case "REVOKED_PAYMENT":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200" title="Paiement réglé au guichet">
            <CheckCircle2 className="w-3 h-3 text-teal-600" />
            {isAr ? "مُلغى (تم الدفع)" : "Réglé au guichet"}
          </span>
        );
      case "REVOKED_CORRECTED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-gray-100 text-gray-700">
            {isAr ? "مُلغى (حضر التلميذ)" : "Corrigé présent"}
          </span>
        );
      case "FAILED_NO_WHATSAPP":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <UserX className="w-3 h-3" />
            {isAr ? "لا يوجد واتساب" : "Sans WhatsApp"}
          </span>
        );
      case "DISMISSED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-gray-100 text-gray-500">
            {isAr ? "تم التجاهل" : "Ignoré"}
          </span>
        );
      default:
        return <span className="text-xs text-gray-500">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {isAr ? "صندوق إرسال رسائل واتساب (WhatsApp Outbox)" : "Boîte d'envoi WhatsApp"}
              </h1>
              <p className="text-xs text-gray-500">
                {isAr
                  ? "مراجعة وإرسال التنبيهات المجدولة (غيابات، تحذيرات الرصيد، الحصص الخاصة)"
                  : "Validation et expédition des notifications aux parents et élèves"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* BRANCH SELECTOR */}
          {isOwner ? (
            <select
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(Number(e.target.value));
                setPage(1);
              }}
              className="text-xs font-bold border border-gray-300 rounded-lg p-2.5 bg-white text-gray-800"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold">
              {branches.find((b) => b.id === selectedBranchId)?.name || "Siège"}
            </span>
          )}

          {/* BULK SEND BUTTON */}
          <button
            onClick={handleSendAllPending}
            disabled={isPending || pendingCount === 0}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            <span>
              {isAr
                ? `إرسال كل المعلق (${pendingCount})`
                : `Tout envoyer (${pendingCount})`}
            </span>
          </button>
        </div>
      </div>

      {/* FILTER CONTROLS */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Trigger filter */}
          <select
            value={triggerFilter}
            onChange={(e) => {
              setTriggerFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs font-medium border border-gray-300 rounded-lg p-2 bg-gray-50 text-gray-700"
          >
            <option value="ALL">{isAr ? "جميع أنواع التنبيهات" : "Tous les types"}</option>
            <option value="ABSENCE">{isAr ? "الغيابات" : "Absences"}</option>
            <option value="CREDIT_ZERO_PRE_LESSON_24H">{isAr ? "تنبيه 24h قبل الحصة (-1)" : "Alerte 24h (-1)"}</option>
            <option value="CREDIT_ZERO_INSTANT">{isAr ? "نفاد الرصيد (0)" : "Solde à 0"}</option>
            <option value="SPECIAL_LESSON_NEW">{isAr ? "حصص خاصة جديدة" : "Séances Spéciales"}</option>
            <option value="SPECIAL_LESSON_UPDATE">{isAr ? "تعديلات المواعيد" : "Modifications"}</option>
            <option value="SPECIAL_LESSON_CANCELLED">{isAr ? "الحصص الملغاة" : "Annulations"}</option>
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs font-medium border border-gray-300 rounded-lg p-2 bg-gray-50 text-gray-700"
          >
            <option value="ALL">{isAr ? "جميع الحالات" : "Tous les statuts"}</option>
            <option value="PENDING_MANUAL">{isAr ? "معلق بانتظار الإرسال" : "En attente"}</option>
            <option value="SENT">{isAr ? "تم الإرسال بنجاح" : "Envoyés"}</option>
            <option value="REVOKED_PAYMENT">{isAr ? "مُلغى (تم دفع الاشتراك)" : "Régularisé guichet"}</option>
            <option value="FAILED_NO_WHATSAPP">{isAr ? "أرقام بدون واتساب" : "Sans WhatsApp"}</option>
          </select>
        </div>

        {/* SEARCH BAR */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? "بحث عن تلميذ أو هاتف..." : "Recherche élève ou téléphone..."}
              className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition"
          >
            {isAr ? "بحث" : "Filtrer"}
          </button>
        </form>
      </div>

      {/* QUEUE TABLE */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
            <span className="text-xs">{isAr ? "جارٍ التحميل..." : "Chargement de la file..."}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-16 text-center text-gray-400">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-gray-800">
              {isAr ? "صندوق الإرسال فارغ تماماً" : "File d'attente vide"}
            </h4>
            <p className="text-xs text-gray-500 mt-1">
              {isAr
                ? "لا توجد رسائل معلقة حالياً لهذا الفرع."
                : "Toutes les alertes ont été traitées ou envoyées."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3.5">{isAr ? "التلميذ والفوج" : "Élève & Classe"}</th>
                  <th className="p-3.5">{isAr ? "نوع التنبيه" : "Déclencheur"}</th>
                  <th className="p-3.5">{isAr ? "المستلم والهدف" : "Destinataire"}</th>
                  <th className="p-3.5">{isAr ? "معاينة الرسالة" : "Aperçu du message"}</th>
                  <th className="p-3.5">{isAr ? "الحالة" : "Statut"}</th>
                  <th className="p-3.5 text-right">{isAr ? "الإجراءات" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/70 transition">
                    {/* Student Info */}
                    <td className="p-3.5">
                      <div className="font-bold text-gray-900 text-sm">{item.student?.name}</div>
                      <div className="text-[11px] text-gray-400 font-mono">
                        Mat: {item.student?.globalNumber} • {item.class?.name || "Classe"}
                      </div>
                    </td>

                    {/* Trigger */}
                    <td className="p-3.5">
                      {getTriggerBadge(item.triggerType, item.revisionNumber)}
                    </td>

                    {/* Recipient */}
                    <td className="p-3.5">
                      {item.recipientPhone ? (
                        <div>
                          <span className="font-mono font-bold text-gray-800 block" dir="ltr">
                            +{item.recipientPhone}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {item.recipientType === "STUDENT_PRIMARY"
                              ? isAr
                                ? "📱 هاتف التلميذ"
                                : "📱 Élève"
                              : isAr
                              ? "👨‍👩‍👦 ولي الأمر"
                              : "👨‍👩‍👦 Parent"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-rose-600 font-bold flex items-center gap-1">
                          <UserX className="w-3.5 h-3.5" />
                          {isAr ? "لا يوجد رقم مسجل" : "Aucun numéro"}
                        </span>
                      )}
                    </td>

                    {/* Message Preview */}
                    <td className="p-3.5 max-w-xs">
                      <p className="line-clamp-2 text-gray-600 text-[11px] leading-relaxed">
                        {item.messageContent}
                      </p>
                    </td>

                    {/* Status */}
                    <td className="p-3.5">{getStatusBadge(item.status)}</td>

                    {/* Actions */}
                    <td className="p-3.5 text-right space-x-1">
                      {item.status === "PENDING_MANUAL" && (
                        <>
                          <button
                            onClick={() => handleSendSingle(item.id)}
                            disabled={isPending || !item.recipientPhone}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold transition shadow-xs disabled:bg-gray-200 disabled:text-gray-400 inline-flex items-center gap-1"
                            title={isAr ? "إرسال الآن" : "Envoyer"}
                          >
                            <Send className="w-3 h-3" />
                            <span>{isAr ? "إرسال" : "Envoyer"}</span>
                          </button>

                          <button
                            onClick={() => {
                              setEditingItem(item);
                              setEditText(item.messageContent);
                            }}
                            className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition"
                            title={isAr ? "تعديل النص" : "Modifier"}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDismiss(item.id)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition"
                            title={isAr ? "تجاهل" : "Ignorer"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION */}
        {totalPages > 1 && (
          <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>
              {isAr
                ? `صفحة ${page} من ${totalPages} (إجمالي ${total} رسالة)`
                : `Page ${page} sur ${totalPages} (${total} notifications)`}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-2.5 py-1 border border-gray-200 rounded bg-white disabled:opacity-40"
              >
                {isAr ? "السابق" : "Précédent"}
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-2.5 py-1 border border-gray-200 rounded bg-white disabled:opacity-40"
              >
                {isAr ? "التالي" : "Suivant"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* EDIT MESSAGE MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-gray-900 text-base">
              {isAr ? "تعديل نص الرسالة قبل الإرسال" : "Modifier le texte avant l'envoi"}
            </h3>
            <p className="text-xs text-gray-500">
              {isAr
                ? `المستلم: ${editingItem.student?.name} (${editingItem.recipientPhone})`
                : `Destinataire : ${editingItem.student?.name}`}
            </p>
            <textarea
              rows={6}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full border border-gray-300 rounded-xl p-3 text-xs text-gray-800 leading-relaxed font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-50"
              >
                {isAr ? "إلغاء" : "Annuler"}
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isPending}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700"
              >
                {isAr ? "حفظ التعديل" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
