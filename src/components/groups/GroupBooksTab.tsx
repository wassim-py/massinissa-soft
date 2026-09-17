"use client";

import React, { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/FormField";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import {
  createBookAction,
  toggleBookReceiptAction,
} from "@/lib/bookActions";
import { executeWithRetry } from "@/lib/retryUtils";
import { toast } from "react-toastify";
import {
  BookOpen,
  Plus,
  CheckCircle2,
  Lock,
  CalendarDays,
  User,
  Phone,
  Receipt,
  X,
  Sparkles,
  Info,
  Check,
  Building2,
  GraduationCap,
} from "lucide-react";

export interface BookItem {
  id: number;
  title: string;
  teacherId: string;
  levelId: number;
  trimesterId: number | null;
  createdAt: string;
}

export interface FeePaidStudentItem {
  id: string;
  name: string;
  phone: string | null;
  parentPhone: string | null;
  globalNumber: number;
  voucherNumber: number;
  voucherDate: string;
  receipts: Record<number, { received: boolean; receivedAt: string | null }>;
}

export interface GroupBooksTabProps {
  classData: {
    id: number;
    name: string;
    branchId: number;
    branchName: string;
    teacherId: string | null;
    teacherName: string | null;
    levelId: number | null;
    levelName: string | null;
    hasBooks: boolean;
    bookFee: number | null;
    enrollmentsCount: number;
  };
  activeTrimester: {
    id: number;
    name: string;
    label: string;
    status: string;
    startDate: string;
    endDate: string;
  } | null;
  allTrimesters: Array<{
    id: number;
    name: string;
    label: string;
    status: string;
  }>;
  books: BookItem[];
  feePaidStudents: FeePaidStudentItem[];
  allLevels: Array<{ id: number; name: string }>;
}

export default function GroupBooksTab({
  classData,
  activeTrimester,
  allTrimesters,
  books,
  feePaidStudents,
  allLevels,
}: GroupBooksTabProps) {
  const t = useTranslations("classes");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  // Modal State for Adding a Book
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState("");
  const [selectedLevelId, setSelectedLevelId] = useState<number>(
    classData.levelId || (allLevels[0]?.id ?? 1)
  );

  // Optimistic receipt state: key = `${studentId}_${bookId}` -> { received: boolean, receivedAt?: string | null }
  const [receiptsState, setReceiptsState] = useState<
    Record<string, { received: boolean; receivedAt: string | null }>
  >(() => {
    const initial: Record<string, { received: boolean; receivedAt: string | null }> = {};
    for (const student of feePaidStudents) {
      for (const [bookIdStr, rec] of Object.entries(student.receipts)) {
        initial[`${student.id}_${bookIdStr}`] = {
          received: rec.received,
          receivedAt: rec.receivedAt,
        };
      }
    }
    return initial;
  });

  const isTrimesterFinished = activeTrimester?.status === "finished";

  const handleToggleReceipt = (studentId: string, bookId: number) => {
    if (isTrimesterFinished) {
      toast.info(
        locale === "ar"
          ? "هذا الفصل الدراسي منتهي ومجمد كأرشيف للقراءة فقط."
          : "Ce trimestre est clôturé et gelé en lecture seule."
      );
      return;
    }

    const key = `${studentId}_${bookId}`;
    const currentVal = Boolean(receiptsState[key]?.received);
    const nextVal = !currentVal;

    // Optimistic UI update
    setReceiptsState((prev) => ({
      ...prev,
      [key]: {
        received: nextVal,
        receivedAt: nextVal ? new Date().toISOString() : null,
      },
    }));

    startTransition(async () => {
      try {
        const res = await executeWithRetry(() =>
          toggleBookReceiptAction({
            studentId,
            bookId,
            received: nextVal,
            classId: classData.id,
          })
        );

        if (res.success) {
          toast.success(res.message);
        } else {
          // Revert optimistic update
          setReceiptsState((prev) => ({
            ...prev,
            [key]: {
              received: currentVal,
              receivedAt: currentVal ? new Date().toISOString() : null,
            },
          }));
          toast.error(res.message);
        }
      } catch (err: any) {
        // Revert optimistic update
        setReceiptsState((prev) => ({
          ...prev,
          [key]: {
            received: currentVal,
            receivedAt: currentVal ? new Date().toISOString() : null,
          },
        }));
        toast.error(err?.message || "Erreur de mise à jour");
      }
    });
  };

  const handleAddBookSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBookTitle.trim()) {
      toast.error(
        locale === "ar" ? "يرجى إدخال عنوان الكتاب." : "Veuillez saisir le titre du livre."
      );
      return;
    }

    if (!classData.teacherId) {
      toast.error(
        locale === "ar"
          ? "هذا الفوج لا يملك أستاذاً معيناً."
          : "Ce groupe n'a pas d'enseignant assigné."
      );
      return;
    }

    startTransition(async () => {
      try {
        const res = await createBookAction({
          title: newBookTitle.trim(),
          levelId: selectedLevelId,
          teacherId: classData.teacherId!,
          classId: classData.id,
        });

        if (res.success) {
          toast.success(res.message);
          setNewBookTitle("");
          setIsAddModalOpen(false);
        } else {
          toast.error(res.message);
        }
      } catch (err: any) {
        toast.error(err?.message || "Erreur lors de l'ajout du livre");
      }
    });
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

  // Compute progress for each book
  const bookProgressMap = new Map<number, { receivedCount: number; totalCount: number }>();
  for (const b of books) {
    let receivedCount = 0;
    for (const s of feePaidStudents) {
      const key = `${s.id}_${b.id}`;
      if (receiptsState[key]?.received) {
        receivedCount++;
      }
    }
    bookProgressMap.set(b.id, {
      receivedCount,
      totalCount: feePaidStudents.length,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Active Trimester & Scoping Info Banner */}
      {activeTrimester ? (
        <div
          className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
            isTrimesterFinished
              ? "bg-surface-muted/80 border-border text-gray-800"
              : "bg-emerald-50/70 border-emerald-200 text-emerald-950"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                isTrimesterFinished
                  ? "bg-gray-200 text-gray-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {isTrimesterFinished ? (
                <Lock className="w-5 h-5" />
              ) : (
                <CalendarDays className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">
                  {locale === "ar"
                    ? `الفصل الدراسي النشط: ${activeTrimester.name} (${activeTrimester.label})`
                    : `Trimestre Actif : ${activeTrimester.name} (${activeTrimester.label})`}
                </h3>
                {isTrimesterFinished ? (
                  <Badge variant="neutral" size="sm">
                    {locale === "ar" ? "مجمد (أرشيف)" : "Gelé (Archive)"}
                  </Badge>
                ) : (
                  <Badge variant="success" size="sm" withDot>
                    {locale === "ar" ? "نشط" : "Actif"}
                  </Badge>
                )}
              </div>
              <p className="text-xs opacity-90 mt-1">
                {locale === "ar"
                  ? `الكتب المدرجة هنا مرتبطة بالأستاذ (${classData.teacherName || "غير محدد"}) والمستوى (${classData.levelName || "غير محدد"}) في هذا الفصل، وتظهر تلقائياً عبر جميع أفواج هذا الأستاذ.`
                  : `Les livres ici sont rattachés à l'enseignant (${classData.teacherName || "N/A"}) et au niveau (${classData.levelName || "N/A"}) pour ce trimestre, visibles sur tous ses groupes frères.`}
              </p>
            </div>
          </div>

          {/* Action to Add Book */}
          {!isTrimesterFinished && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsAddModalOpen(true)}
              className="shrink-0 font-semibold shadow-xs"
            >
              <Plus className="w-4 h-4 me-1.5" />
              {locale === "ar" ? "إضافة كتاب جديد" : "Ajouter un livre"}
            </Button>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-900 font-medium">
              {locale === "ar"
                ? "لا يوجد فصل دراسي نشط حالياً. يرجى تفعيل الفصل الدراسي من لوحة إعدادات المالك لعرض الكتب وتسليمها."
                : "Aucun trimestre n'est actif actuellement. Activez un trimestre dans les configurations pour gérer les livres."}
            </p>
          </div>
        </div>
      )}

      {/* Main Table Card */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-4 border-b border-border/70">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-section-title font-bold text-gray-900">
                <BookOpen className="w-5 h-5 text-primary" />
                <span>{locale === "ar" ? "جدول تسليم الكتب للتلاميذ الذين دفعوا الرسم" : "Grille de Remise des Livres (Élèves en règle)"}</span>
              </CardTitle>
              <CardDescription className="text-form-helper text-muted mt-1">
                {locale === "ar"
                  ? "تحديث حي ومباشر: أي تلميذ يدفع رسم الكتب في هذا الفصل يظهر في هذا الجدول فوراً. اضغط على المربع لتسجيل الاستلام."
                  : "Mise à jour en temps réel : Tout élève payant ses frais de livres ce trimestre apparaît immédiatement. Cliquez pour cocher la remise."}
              </CardDescription>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="primary" size="md">
                <GraduationCap className="w-3.5 h-3.5" />
                <span>{classData.levelName || "N/A"}</span>
              </Badge>
              <Badge variant="neutral" size="md">
                <User className="w-3.5 h-3.5" />
                <span>{classData.teacherName || "N/A"}</span>
              </Badge>
              <Badge variant="success" size="md">
                {feePaidStudents.length} {locale === "ar" ? "تلميذ دفع الرسم" : "élèves en règle"}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {books.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-surface-subtle flex items-center justify-center text-muted">
                <BookOpen className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-gray-900 text-sm">
                {locale === "ar"
                  ? "لم يتم تسجيل أي كتاب لهذا الأستاذ في هذا المستوى بعد"
                  : "Aucun livre enregistré pour cet enseignant à ce niveau"}
              </h4>
              <p className="text-xs text-muted max-w-md">
                {locale === "ar"
                  ? "عندما يحضر الأستاذ كتاباً للمستوى، اضغط على زر 'إضافة كتاب جديد' وسيظهر فوراً لجميع تلاميذ هذا الفوج والأفواج المشابهة."
                  : "Dès que l'enseignant apporte un manuel, cliquez sur 'Ajouter un livre' pour l'activer sur ce groupe et tous ses groupes frères."}
              </p>
              {!isTrimesterFinished && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsAddModalOpen(true)}
                  className="mt-2"
                >
                  <Plus className="w-4 h-4 me-1.5" />
                  {locale === "ar" ? "إضافة الكتاب الأول" : "Ajouter le premier livre"}
                </Button>
              )}
            </div>
          ) : feePaidStudents.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-surface-subtle flex items-center justify-center text-muted">
                <Receipt className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-gray-900 text-sm">
                {locale === "ar"
                  ? "لا يوجد تلاميذ دفعوا رسم الكتب لهذا الفصل حتى الآن"
                  : "Aucun élève n'a encore réglé les frais de livres ce trimestre"}
              </h4>
              <p className="text-xs text-muted max-w-md">
                {locale === "ar"
                  ? `بمجرد إصدار وصل كتاب (Bon Livre) لأي تلميذ في هذا الفوج بقيمة (${classData.bookFee || 0} دج)، سيظهر مباشرة في هذا الجدول بدون الحاجة لأي مزامنة يدوية.`
                  : `Dès qu'un bon de livre est émis pour un élève de ce groupe (${classData.bookFee || 0} DZD), il apparaîtra automatiquement dans ce tableau.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs border-collapse">
                <thead>
                  <tr className="bg-surface-muted/80 text-muted font-bold border-b border-border/80">
                    <th className="p-3 text-center w-12 font-mono">#</th>
                    <th className="p-3 text-start min-w-[200px]">
                      {locale === "ar" ? "التلميذ ورقم الهاتف" : "Élève & Coordonnées"}
                    </th>
                    <th className="p-3 text-start min-w-[150px]">
                      {locale === "ar" ? "وصل الكتاب المدفوع" : "Bon de Livre Payé"}
                    </th>
                    {books.map((book) => {
                      const prog = bookProgressMap.get(book.id) || {
                        receivedCount: 0,
                        totalCount: feePaidStudents.length,
                      };

                      return (
                        <th
                          key={book.id}
                          className="p-3 text-center min-w-[170px] border-s border-border/60 bg-surface-subtle/40"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-bold text-gray-900 text-xs">
                              {book.title}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono">
                              <span
                                className={`px-1.5 py-0.5 rounded-full font-bold ${
                                  prog.receivedCount === prog.totalCount && prog.totalCount > 0
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-primary-light text-primary"
                                }`}
                              >
                                {prog.receivedCount} / {prog.totalCount} {locale === "ar" ? "مستلم" : "remis"}
                              </span>
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {feePaidStudents.map((student, idx) => {
                    return (
                      <tr
                        key={student.id}
                        className="hover:bg-surface-subtle/60 transition-colors"
                      >
                        <td className="p-3 text-center font-mono text-muted font-bold">
                          {idx + 1}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-900 text-sm">
                              {student.name}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] text-muted mt-0.5">
                              {student.phone ? (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-muted" />
                                  <span className="font-mono">{student.phone}</span>
                                </span>
                              ) : student.parentPhone ? (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-muted" />
                                  <span className="font-mono">{student.parentPhone}</span>
                                </span>
                              ) : (
                                <span className="text-muted text-[10px]">
                                  {locale === "ar" ? "لا يوجد هاتف" : "Pas de tél"}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col">
                            <Badge variant="success" size="sm" className="font-mono w-fit">
                              Bon #{student.voucherNumber}
                            </Badge>
                            <span className="text-[10px] text-muted mt-0.5">
                              {formatDate(student.voucherDate)}
                            </span>
                          </div>
                        </td>
                        {books.map((book) => {
                          const key = `${student.id}_${book.id}`;
                          const isReceived = Boolean(receiptsState[key]?.received);
                          const receivedAt = receiptsState[key]?.receivedAt;

                          return (
                            <td
                              key={book.id}
                              className="p-3 text-center border-s border-border/60"
                            >
                              <div className="flex items-center justify-center">
                                <button
                                  type="button"
                                  disabled={isTrimesterFinished || isPending}
                                  onClick={() => handleToggleReceipt(student.id, book.id)}
                                  title={
                                    isReceived
                                      ? locale === "ar"
                                        ? `تم الاستلام في ${receivedAt ? formatDate(receivedAt) : ""}`
                                        : `Remis le ${receivedAt ? formatDate(receivedAt) : ""}`
                                      : locale === "ar"
                                      ? "انقر لتأكيد التسليم"
                                      : "Cliquer pour marquer remis"
                                  }
                                  className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all cursor-pointer select-none ${
                                    isReceived
                                      ? "bg-emerald-600 border-emerald-600 text-white shadow-xs hover:bg-emerald-700"
                                      : "bg-white border-gray-300 text-transparent hover:border-primary hover:bg-primary-light/20"
                                  } ${
                                    isTrimesterFinished
                                      ? "opacity-60 cursor-not-allowed"
                                      : ""
                                  }`}
                                >
                                  <Check
                                    className={`w-4 h-4 stroke-[3] transition-transform ${
                                      isReceived ? "scale-100" : "scale-50 opacity-0"
                                    }`}
                                  />
                                </button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal: Add New Book */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-border shadow-xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary-light text-primary flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    {locale === "ar" ? "إضافة كتاب جديد للأستاذ والمستوى" : "Ajouter un livre (Enseignant + Niveau)"}
                  </h3>
                  <p className="text-xs text-muted">
                    {locale === "ar"
                      ? `الفصل الدراسي الحالي: ${activeTrimester?.name || "T1"}`
                      : `Trimestre actuel : ${activeTrimester?.name || "T1"}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-muted hover:text-gray-900 p-1.5 rounded-lg hover:bg-surface-subtle transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddBookSubmit} className="space-y-4">
              <FormField
                label={locale === "ar" ? "عنوان الكتاب" : "Titre du livre"}
                required
              >
                <Input
                  value={newBookTitle}
                  onChange={(e) => setNewBookTitle(e.target.value)}
                  placeholder={
                    locale === "ar"
                      ? "مثال: الرياضيات الجزء 1، كتاب الإنجليزية BAC..."
                      : "Ex: Manuel de Mathématiques Tome 1, English BAC..."
                  }
                  autoFocus
                  required
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label={locale === "ar" ? "المستوى الدراسي" : "Niveau scolaire"}>
                  <select
                    value={selectedLevelId}
                    onChange={(e) => setSelectedLevelId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {allLevels.map((lvl) => (
                      <option key={lvl.id} value={lvl.id}>
                        {lvl.name}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label={locale === "ar" ? "الأستاذ" : "Enseignant"}>
                  <Input
                    value={classData.teacherName || "N/A"}
                    disabled
                    className="bg-surface-muted cursor-not-allowed opacity-80"
                  />
                </FormField>
              </div>

              <div className="p-3 bg-primary-light/40 rounded-xl text-xs text-primary-dark border border-primary/20 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{locale === "ar" ? "قاعدة النطاق (§7.20):" : "Règle de portée (§7.20) :"}</span>
                </p>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {locale === "ar"
                    ? "هذا الكتاب لا يقتصر على هذا الفوج وحده، بل سيظهر تلقائياً في كل فوج آخر يدرسه هذا الأستاذ في نفس المستوى الدراسي."
                    : "Ce livre n'est pas limité à ce seul groupe. Il apparaîtra automatiquement sur tous les autres groupes gérés par cet enseignant à ce même niveau."}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  {locale === "ar" ? "إلغاء" : "Annuler"}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isPending || !newBookTitle.trim()}
                >
                  {isPending
                    ? locale === "ar"
                      ? "جارِ الإضافة..."
                      : "Ajout..."
                    : locale === "ar"
                    ? "إضافة الكتاب"
                    : "Ajouter le livre"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
