"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { useTranslations, useLocale } from "next-intl";
import { Search, Loader2, X, AlertCircle, CheckCircle2, User, UserPlus, Banknote, Printer } from "lucide-react";
import { searchRevisionVisitorCandidatesAction, recordRevisionVisitorAction } from "@/lib/actions";
import { notifyAttendanceChanged } from "@/lib/attendanceEvents";
import PrintTicketButton from "@/components/PrintTicketButton";

interface CandidateStudent {
  id: string;
  name: string;
  globalNumber: number;
  phone: string | null;
  branchName?: string | null;
  isAlreadyEnrolled: boolean;
}

interface RevisionVisitorModalProps {
  lessonId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultFee?: number;
}

export default function RevisionVisitorModal({
  lessonId,
  isOpen,
  onClose,
  onSuccess,
  defaultFee = 500,
}: RevisionVisitorModalProps) {
  const t = useTranslations("attendance");
  const locale = useLocale();

  const [activeTab, setActiveTab] = useState<"search" | "new_guest">("search");
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [candidates, setCandidates] = useState<CandidateStudent[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<CandidateStudent | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // New walk-in guest fields
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  // Dynamic revision price (editable per group)
  const [amount, setAmount] = useState<number | string>(defaultFee);

  const [isPending, startTransition] = useTransition();
  const [issuedVoucher, setIssuedVoucher] = useState<any | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIssuedVoucher(null);
      setAmount(defaultFee);
      setActiveTab("search");
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setQuery("");
      setIsSearching(false);
      setCandidates([]);
      setSelectedStudent(null);
      setGuestName("");
      setGuestPhone("");
      setHasSearched(false);
      setIssuedVoucher(null);
    }
  }, [isOpen, defaultFee]);

  // Close modal on Escape
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleGlobalKeyDown);
    }
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isOpen, onClose]);

  // Debounced student search
  useEffect(() => {
    if (activeTab !== "search") return;
    const trimmed = query.trim();
    if (!trimmed) {
      setCandidates([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setIsSearching(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await searchRevisionVisitorCandidatesAction(lessonId, trimmed);
        if (res.success) {
          setCandidates(res.candidates || []);
        } else {
          setCandidates([]);
        }
      } catch (err) {
        console.error("Revision candidate search error:", err);
        setCandidates([]);
      } finally {
        setIsSearching(false);
        setHasSearched(true);
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, lessonId, activeTab]);

  const handleSubmit = () => {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error(
        locale === "ar"
          ? "يرجى تحديد مبلغ صالح لحصة المراجعة."
          : "Veuillez saisir un tarif valide."
      );
      return;
    }

    if (activeTab === "search") {
      if (!selectedStudent) {
        toast.error(
          locale === "ar"
            ? "يرجى اختيار التلميذ أولاً."
            : "Veuillez sélectionner un élève."
        );
        return;
      }
      if (selectedStudent.isAlreadyEnrolled) {
        toast.error(
          locale === "ar"
            ? "هذا التلميذ مسجل بالفعل في هذا الفوج ولا يمكن إضافته كزائر."
            : "Cet élève est déjà inscrit dans ce groupe."
        );
        return;
      }

      startTransition(async () => {
        const res = await recordRevisionVisitorAction({
          lessonId,
          studentId: selectedStudent.id,
          amount: numAmount,
        });

        if (res.success) {
          toast.success(res.message);
          setIssuedVoucher(res.voucher);
          notifyAttendanceChanged({ lessonId, source: "revision-visitor" });
          onSuccess?.();
        } else {
          toast.error(res.message);
        }
      });
    } else {
      // New walk-in guest
      if (!guestName.trim()) {
        toast.error(
          locale === "ar" ? "يرجى إدخال اسم الزائر." : "Veuillez saisir le nom de l'invité."
        );
        return;
      }

      startTransition(async () => {
        const res = await recordRevisionVisitorAction({
          lessonId,
          newStudentData: {
            name: guestName.trim(),
            phone: guestPhone.trim() || undefined,
          },
          amount: numAmount,
        });

        if (res.success) {
          toast.success(res.message);
          setIssuedVoucher(res.voucher);
          notifyAttendanceChanged({ lessonId, source: "revision-visitor" });
          onSuccess?.();
        } else {
          toast.error(res.message);
        }
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs font-sans animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-teal-100 bg-gradient-to-r from-teal-50 via-teal-50/50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">
                {locale === "ar" ? "إضافة زائر حصة مراجعة" : "Ajouter un visiteur de révision"}
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {locale === "ar"
                  ? "تسجيل حضور ضيف مؤقت مع دفع رسوم المراجعة واستخراج الوصل"
                  : "Enregistrement d'un invité temporaire avec paiement du cours et reçu"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {issuedVoucher ? (
            /* Success Screen with Immediate Ticket Printing */
            <div className="py-6 px-4 text-center rounded-xl border border-emerald-200 bg-emerald-50/60 flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="font-bold text-base text-emerald-950">
                {locale === "ar" ? "تم تسجيل الحضور واستخراج الوصل بنجاح!" : "Visiteur enregistré avec succès !"}
              </h4>
              <p className="text-xs text-emerald-800 max-w-sm">
                {locale === "ar"
                  ? `تم تسجيل الزائر (${issuedVoucher.student?.name || ""}) واستخراج الوصل رقم #${issuedVoucher.number} بمبلغ ${issuedVoucher.amount} دج.`
                  : `L'invité (${issuedVoucher.student?.name || ""}) a été enregistré. Reçu #${issuedVoucher.number} émis pour ${issuedVoucher.amount} DZD.`}
              </p>

              <div className="pt-2 flex items-center gap-2">
                <PrintTicketButton voucher={issuedVoucher} />
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors shadow-xs"
                >
                  {locale === "ar" ? "إغلاق" : "Fermer"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Tabs: Existing student vs new walk-in guest */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("search");
                    setSelectedStudent(null);
                  }}
                  className={`py-2 px-3 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === "search"
                      ? "bg-white text-teal-900 shadow-xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>{locale === "ar" ? "تلميذ مسجل بالمدرسة" : "Élève déjà inscrit"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("new_guest");
                    setSelectedStudent(null);
                  }}
                  className={`py-2 px-3 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === "new_guest"
                      ? "bg-white text-teal-900 shadow-xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{locale === "ar" ? "زائر خارجي جديد" : "Nouvel invité externe"}</span>
                </button>
              </div>

              {/* Mode 1: Search Existing Student */}
              {activeTab === "search" && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={
                        locale === "ar"
                          ? "ابحث باسم التلميذ أو رقم التسجيل #..."
                          : "Rechercher par nom ou matricule #..."
                      }
                      className="w-full ps-9 pe-8 py-2.5 text-xs bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white text-gray-900 placeholder:text-gray-400 transition-all shadow-2xs"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="absolute end-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {isSearching && candidates.length === 0 && (
                    <div className="py-6 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                      <p className="text-[11px]">{locale === "ar" ? "جارٍ البحث..." : "Recherche en cours..."}</p>
                    </div>
                  )}

                  {hasSearched && !isSearching && candidates.length === 0 && query.trim() && (
                    <div className="py-5 px-3 text-center rounded-xl border border-dashed border-gray-300 bg-gray-50/50 text-gray-500">
                      <p className="text-xs font-semibold">
                        {locale === "ar" ? "لم يتم العثور على أي تلميذ." : "Aucun élève trouvé."}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {locale === "ar"
                          ? "يمكنك الانتقال لتبويب 'زائر خارجي جديد' لتسجيله مباشرة."
                          : "Vous pouvez basculer vers 'Nouvel invité' pour l'enregistrer directement."}
                      </p>
                    </div>
                  )}

                  {candidates.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 border border-gray-200 rounded-xl p-2 bg-gray-50/40">
                      {candidates.map((cand) => {
                        const isSelected = selectedStudent?.id === cand.id;
                        const isEnrolled = cand.isAlreadyEnrolled;

                        return (
                          <div
                            key={cand.id}
                            onClick={() => {
                              if (!isEnrolled) setSelectedStudent(cand);
                            }}
                            className={`p-2.5 rounded-lg border text-xs transition-all flex items-center justify-between ${
                              isEnrolled
                                ? "border-rose-200 bg-rose-50/50 opacity-70 cursor-not-allowed"
                                : isSelected
                                ? "border-teal-500 bg-teal-50 shadow-xs ring-1 ring-teal-400 cursor-pointer"
                                : "border-gray-200 bg-white hover:border-teal-300 hover:bg-teal-50/30 cursor-pointer"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                  isSelected
                                    ? "bg-teal-600 text-white"
                                    : isEnrolled
                                    ? "bg-rose-100 text-rose-600"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {isSelected ? (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                ) : (
                                  <User className="w-3.5 h-3.5" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-gray-900 truncate">{cand.name}</span>
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 font-mono">
                                    #{cand.globalNumber}
                                  </span>
                                  {cand.branchName && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-50 text-blue-700">
                                      {cand.branchName}
                                    </span>
                                  )}
                                </div>
                                {isEnrolled ? (
                                  <p className="text-[10px] font-semibold text-rose-600 mt-0.5">
                                    {locale === "ar"
                                      ? "⚠️ مسجل بالفعل في هذا الفوج (لا يمكن إضافته كزائر)"
                                      : "⚠️ Déjà inscrit dans ce groupe (ne peut pas être visiteur)"}
                                  </p>
                                ) : cand.phone ? (
                                  <p className="text-[10px] text-gray-400 font-mono" dir="ltr">
                                    {cand.phone}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Mode 2: New Walk-in Guest */}
              {activeTab === "new_guest" && (
                <div className="space-y-3 bg-gray-50/70 p-3.5 rounded-xl border border-gray-200">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-700">
                      {locale === "ar" ? "اسم ولقب التلميذ الزائر *" : "Nom et prénom de l'invité *"}
                    </label>
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder={locale === "ar" ? "مثال: يونس بن علي" : "Ex: Younes Benali"}
                      className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-700">
                      {locale === "ar" ? "رقم هاتف الولي (اختياري)" : "Téléphone parent (facultatif)"}
                    </label>
                    <input
                      type="text"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="05 / 06 / 07..."
                      className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-teal-800 bg-teal-50 p-2 rounded-md border border-teal-200 leading-relaxed">
                    {locale === "ar"
                      ? "سيتم تسجيل التلميذ كضيف لهذه الحصة فقط دون إدراجه في القائمة الدائمة للفوج."
                      : "L'élève sera enregistré pour cette séance uniquement sans intégrer l'effectif permanent du groupe."}
                  </p>
                </div>
              )}

              {/* Dynamic Revision Fee Input */}
              <div className="p-3.5 bg-teal-50/60 rounded-xl border border-teal-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-teal-700" />
                    <span>{locale === "ar" ? "سعر حصة المراجعة للزائر (دج) *" : "Tarif de la séance de révision (DZD) *"}</span>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm font-mono font-bold bg-white border border-teal-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-teal-950"
                  />
                  <span className="text-xs font-bold text-teal-900 shrink-0">DZD / دج</span>
                </div>
                <p className="text-[10px] text-teal-800 leading-relaxed">
                  {locale === "ar"
                    ? "كامل هذا المبلغ يُعتبر رسوم مراجعة ويُحسب للأستاذ بنسبته المتفق عليها."
                    : "Ce montant correspond aux frais de révision et sera calculé pour l'enseignant selon son pourcentage."}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                >
                  {locale === "ar" ? "إلغاء" : "Annuler"}
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={
                    isPending ||
                    (activeTab === "search" && (!selectedStudent || selectedStudent.isAlreadyEnrolled)) ||
                    (activeTab === "new_guest" && !guestName.trim()) ||
                    !amount ||
                    Number(amount) <= 0
                  }
                  className="px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{locale === "ar" ? "جارٍ الحفظ والطباعة..." : "Enregistrement..."}</span>
                    </>
                  ) : (
                    <>
                      <Printer className="w-3.5 h-3.5" />
                      <span>
                        {locale === "ar"
                          ? `تأكيد الدفع والحضور (${amount} دج)`
                          : `Valider paiement & présence (${amount} DZD)`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
