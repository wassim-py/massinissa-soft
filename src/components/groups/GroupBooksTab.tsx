"use client";

import React, { useState, useTransition, useMemo } from "react";
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
  Filter,
  AlertTriangle,
  Clock,
  Search,
  Users,
  CreditCard,
} from "lucide-react";
import BookStatusBadge, { BookStudentStatus, computeBookStatus } from "@/components/books/BookStatusBadge";
import PaymentForm from "@/components/forms/PaymentForm";

export interface BookItem {
  id: number;
  title: string;
  teacherId: string;
  levelId: number;
  trimesterId: number | null;
  createdAt: string;
}

export interface GroupStudentBookItem {
  id: string;
  name: string;
  phone: string | null;
  parentPhone: string | null;
  globalNumber: number;
  hasPaidBook?: boolean;
  voucherNumber?: number | null;
  voucherDate?: string | null;
  receipts: Record<number, { received: boolean; receivedAt: string | null }>;
  receivedCount?: number;
  totalBooks?: number;
  status?: BookStudentStatus;
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
  allStudents?: GroupStudentBookItem[];
  feePaidStudents?: FeePaidStudentItem[];
  allLevels: Array<{ id: number; name: string }>;
}

type FilterTabKey = "all" | "received" | "not_received" | "paid_not_received" | "unpaid";

export default function GroupBooksTab({
  classData,
  activeTrimester,
  allTrimesters,
  books,
  allStudents = [],
  feePaidStudents = [],
  allLevels,
}: GroupBooksTabProps) {
  const t = useTranslations("classes");
  const locale = useLocale();
  const isAr = locale === "ar";
  const [isPending, startTransition] = useTransition();

  // Combine or fallback to allStudents
  const initialStudents: GroupStudentBookItem[] = useMemo(() => {
    if (allStudents && allStudents.length > 0) {
      return allStudents;
    }
    return feePaidStudents.map((s) => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      parentPhone: s.parentPhone,
      globalNumber: s.globalNumber,
      hasPaidBook: true,
      voucherNumber: s.voucherNumber,
      voucherDate: s.voucherDate,
      receipts: s.receipts,
      receivedCount: Object.values(s.receipts).filter((r) => r.received).length,
      totalBooks: books.length,
      status: computeBookStatus(
        true,
        Object.values(s.receipts).filter((r) => r.received).length,
        books.length
      ),
    }));
  }, [allStudents, feePaidStudents, books.length]);

  // Modal State for Adding a Book
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState("");
  const [selectedLevelId, setSelectedLevelId] = useState<number>(
    classData.levelId || (allLevels[0]?.id ?? 1)
  );

  // Payment Form Modal for issuing voucher
  const [paymentModalStudent, setPaymentModalStudent] = useState<GroupStudentBookItem | null>(null);

  // Filter & Search State
  const [activeFilter, setActiveFilter] = useState<FilterTabKey>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Optimistic receipt state: key = `${studentId}_${bookId}` -> { received: boolean, receivedAt?: string | null }
  const [receiptsState, setReceiptsState] = useState<
    Record<string, { received: boolean; receivedAt: string | null }>
  >(() => {
    const initial: Record<string, { received: boolean; receivedAt: string | null }> = {};
    for (const student of initialStudents) {
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
        isAr
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
        isAr ? "يرجى إدخال عنوان الكتاب." : "Veuillez saisir le titre du livre."
      );
      return;
    }

    if (!classData.teacherId) {
      toast.error(
        isAr
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
      return d.toLocaleDateString(isAr ? "ar-DZ" : "fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  // Compute live per-student metrics
  const processedStudents = useMemo(() => {
    return initialStudents.map((student) => {
      let receivedCount = 0;
      const details = books.map((b) => {
        const key = `${student.id}_${b.id}`;
        const isRec = Boolean(receiptsState[key]?.received);
        if (isRec) receivedCount++;
        return {
          id: b.id,
          title: b.title,
          received: isRec,
          receivedAt: receiptsState[key]?.receivedAt,
        };
      });

      const hasPaid = Boolean(student.hasPaidBook);
      const computedStatus = computeBookStatus(hasPaid, receivedCount, books.length);

      return {
        ...student,
        receivedCount,
        totalBooks: books.length,
        status: computedStatus,
        details,
      };
    });
  }, [initialStudents, books, receiptsState]);

  // Compute overall group KPI statistics
  const kpis = useMemo(() => {
    const total = processedStudents.length;
    let fullyReceived = 0;
    let anyReceived = 0;
    let paidNotReceived = 0;
    let unpaid = 0;
    let unpaidReceived = 0;

    for (const s of processedStudents) {
      if (s.receivedCount > 0) anyReceived++;
      if (books.length > 0 && s.receivedCount === books.length) fullyReceived++;
      if (s.hasPaidBook && s.receivedCount === 0) paidNotReceived++;
      if (!s.hasPaidBook && s.receivedCount === 0) unpaid++;
      if (!s.hasPaidBook && s.receivedCount > 0) unpaidReceived++;
    }

    return {
      total,
      fullyReceived,
      anyReceived,
      paidNotReceived,
      unpaid,
      unpaidReceived,
    };
  }, [processedStudents, books.length]);

  // Filter students by active tab & search query
  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const queryNum = query.replace(/[^0-9]/g, "");

    return processedStudents.filter((student) => {
      // 1. Tab Filter
      if (activeFilter === "received") {
        if (student.receivedCount === 0) return false;
      } else if (activeFilter === "not_received") {
        if (books.length > 0 && student.receivedCount === books.length) return false;
      } else if (activeFilter === "paid_not_received") {
        if (!student.hasPaidBook || student.receivedCount > 0) return false;
      } else if (activeFilter === "unpaid") {
        if (student.hasPaidBook) return false;
      }

      // 2. Search Query
      if (query) {
        const matchName = student.name.toLowerCase().includes(query);
        const matchNum =
          queryNum && student.globalNumber !== undefined && student.globalNumber !== null
            ? String(student.globalNumber).includes(queryNum)
            : false;
        const matchPhone =
          (student.phone && student.phone.includes(query)) ||
          (student.parentPhone && student.parentPhone.includes(query));
        return matchName || matchNum || matchPhone;
      }

      return true;
    });
  }, [processedStudents, activeFilter, searchQuery, books.length]);

  // Compute progress for each book column header
  const bookProgressMap = useMemo(() => {
    const map = new Map<number, { receivedCount: number; totalCount: number }>();
    for (const b of books) {
      let receivedCount = 0;
      for (const s of processedStudents) {
        const key = `${s.id}_${b.id}`;
        if (receiptsState[key]?.received) {
          receivedCount++;
        }
      }
      map.set(b.id, {
        receivedCount,
        totalCount: processedStudents.length,
      });
    }
    return map;
  }, [books, processedStudents, receiptsState]);

  return (
    <div className="flex flex-col gap-6 font-sans">
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
                  {isAr
                    ? `الفصل الدراسي النشط: ${activeTrimester.name} (${activeTrimester.label})`
                    : `Trimestre Actif : ${activeTrimester.name} (${activeTrimester.label})`}
                </h3>
                {isTrimesterFinished ? (
                  <Badge variant="neutral" size="sm">
                    {isAr ? "مجمد (أرشيف)" : "Gelé (Archive)"}
                  </Badge>
                ) : (
                  <Badge variant="success" size="sm" withDot>
                    {isAr ? "نشط" : "Actif"}
                  </Badge>
                )}
              </div>
              <p className="text-xs opacity-90 mt-1">
                {isAr
                  ? `الكتب المدرجة هنا مرتبطة بالأستاذ (${classData.teacherName || "غير محدد"}) والمستوى (${classData.levelName || "غير محدد"})، وكل فوج تابع لهذا الأستاذ في هذا المستوى له الحق في استلام نسخة.`
                  : `Les livres ici sont rattachés à l'enseignant (${classData.teacherName || "N/A"}) et au niveau (${classData.levelName || "N/A"}). Tous les groupes de ce niveau ont le droit de recevoir une copie.`}
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
              {isAr ? "إضافة كتاب جديد للأستاذ" : "Ajouter un livre"}
            </Button>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-900 font-medium">
              {isAr
                ? "لا يوجد فصل دراسي نشط حالياً. يرجى تفعيل الفصل الدراسي من لوحة إعدادات المالك لعرض الكتب وتسليمها."
                : "Aucun trimestre n'est actif actuellement. Activez un trimestre dans les configurations pour gérer les livres."}
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards: Complete Visibility (§Overview) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Enrolled */}
        <div className="p-3.5 bg-white border border-border/80 rounded-xl shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-muted font-medium block">
              {isAr ? "إجمالي التلاميذ" : "Total élèves"}
            </span>
            <span className="text-lg font-bold text-gray-900 font-mono">
              {kpis.total}
            </span>
          </div>
        </div>

        {/* Copies Remitted */}
        <div className="p-3.5 bg-white border border-border/80 rounded-xl shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-muted font-medium block">
              {isAr ? "استلموا نسخة" : "Copies remises"}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-emerald-800 font-mono">
                {kpis.anyReceived}
              </span>
              <span className="text-[11px] text-muted">
                ({kpis.total > 0 ? Math.round((kpis.anyReceived / kpis.total) * 100) : 0}%)
              </span>
            </div>
          </div>
        </div>

        {/* Paid & Awaiting Copy */}
        <div className="p-3.5 bg-white border border-border/80 rounded-xl shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-muted font-medium block">
              {isAr ? "دفعوا ولم يستلموا" : "Payés en attente"}
            </span>
            <span className="text-lg font-bold text-amber-700 font-mono">
              {kpis.paidNotReceived}
            </span>
          </div>
        </div>

        {/* Unpaid */}
        <div className="p-3.5 bg-white border border-border/80 rounded-xl shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-muted font-medium block">
              {isAr ? "رسوم غير مسددة" : "Frais non réglés"}
            </span>
            <span className="text-lg font-bold text-rose-700 font-mono">
              {kpis.unpaid}
            </span>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-4 border-b border-border/70 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-section-title font-bold text-gray-900">
                <BookOpen className="w-5 h-5 text-primary" />
                <span>{isAr ? "جدول تسليم ومتابعة الكتب لجميع تلاميذ الفوج" : "Grille de Suivi et Remise des Manuels"}</span>
              </CardTitle>
              <CardDescription className="text-form-helper text-muted mt-1">
                {isAr
                  ? "متابعة شاملة: من استلم أي نسخة، من دفع ولم يستلم، ومن لم يدفع إطلاقاً. اضغط على المربع لتسجيل تسليم أو استرجاع النسخة."
                  : "Visibilité complète : qui a reçu quelle version, qui a payé sans remise, et qui n'a pas payé. Cochez pour valider la remise."}
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
              {classData.bookFee && (
                <Badge variant="accent" size="md">
                  <span>
                    {isAr
                      ? `رسم الكتاب: ${classData.bookFee.toLocaleString()} دج`
                      : `Frais livre : ${classData.bookFee.toLocaleString()} DZD`}
                  </span>
                </Badge>
              )}
            </div>
          </div>

          {/* Filter Tabs & Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            {/* 5 Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeFilter === "all"
                    ? "bg-primary text-white shadow-2xs"
                    : "bg-surface-subtle text-muted hover:text-gray-900 hover:bg-gray-200"
                }`}
              >
                <span>{isAr ? "الكل" : "Tous"}</span>
                <span className="ms-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 font-mono">
                  {kpis.total}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("received")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeFilter === "received"
                    ? "bg-emerald-600 text-white shadow-2xs"
                    : "bg-surface-subtle text-muted hover:text-emerald-900 hover:bg-emerald-50"
                }`}
              >
                <span>{isAr ? "استلموا نسخة" : "Ayant reçu"}</span>
                <span className="ms-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 font-mono">
                  {kpis.anyReceived}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("not_received")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeFilter === "not_received"
                    ? "bg-gray-700 text-white shadow-2xs"
                    : "bg-surface-subtle text-muted hover:text-gray-900 hover:bg-gray-200"
                }`}
              >
                <span>{isAr ? "لم يستلموا بعد" : "N'ayant pas reçu"}</span>
                <span className="ms-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 font-mono">
                  {kpis.total - kpis.fullyReceived}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("paid_not_received")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeFilter === "paid_not_received"
                    ? "bg-amber-600 text-white shadow-2xs"
                    : "bg-surface-subtle text-muted hover:text-amber-900 hover:bg-amber-50"
                }`}
              >
                <span>{isAr ? "دفعوا ولم يستلموا" : "Payé sans remise"}</span>
                <span className="ms-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 font-mono">
                  {kpis.paidNotReceived}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("unpaid")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeFilter === "unpaid"
                    ? "bg-rose-600 text-white shadow-2xs"
                    : "bg-surface-subtle text-muted hover:text-rose-900 hover:bg-rose-50"
                }`}
              >
                <span>{isAr ? "لم يدفعوا إطلاقاً" : "Non payés"}</span>
                <span className="ms-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 font-mono">
                  {kpis.unpaid}
                </span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-muted absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder={isAr ? "بحث بالتلميذ أو المعرف..." : "Rechercher un élève..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full ps-8 pe-3 py-1.5 text-xs bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-gray-700 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
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
                {isAr
                  ? "لم يتم تسجيل أي كتاب لهذا الأستاذ في هذا المستوى بعد"
                  : "Aucun livre enregistré pour cet enseignant à ce niveau"}
              </h4>
              <p className="text-xs text-muted max-w-md">
                {isAr
                  ? "عندما يحدد الأستاذ كتاباً للمستوى، اضغط على زر 'إضافة كتاب جديد' وسيظهر فوراً لجميع تلاميذ هذا الفوج وكافة الأفواج المشابهة."
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
                  {isAr ? "إضافة الكتاب الأول" : "Ajouter le premier livre"}
                </Button>
              )}
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-surface-subtle flex items-center justify-center text-muted">
                <Users className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-gray-900 text-sm">
                {isAr ? "لا توجد نتائج مطابقة لمعايير البحث الحالية" : "Aucun élève ne correspond aux critères sélectionnés"}
              </h4>
              <button
                type="button"
                onClick={() => {
                  setActiveFilter("all");
                  setSearchQuery("");
                }}
                className="text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                {isAr ? "إعادة ضبط التصفية" : "Réinitialiser les filtres"}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs border-collapse">
                <thead>
                  <tr className="bg-surface-muted/80 text-muted font-bold border-b border-border/80">
                    <th className="p-3 text-center w-12 font-mono">#</th>
                    <th className="p-3 text-start min-w-[200px]">
                      {isAr ? "التلميذ ورقم الهاتف" : "Élève & Coordonnées"}
                    </th>
                    <th className="p-3 text-center min-w-[140px]">
                      {isAr ? "رسم الكتاب" : "Paiement Frais Livre"}
                    </th>
                    <th className="p-3 text-center min-w-[150px]">
                      {isAr ? "حالة الكتاب" : "Statut Global Manuels"}
                    </th>
                    {books.map((book) => {
                      const prog = bookProgressMap.get(book.id) || {
                        receivedCount: 0,
                        totalCount: processedStudents.length,
                      };

                      return (
                        <th
                          key={book.id}
                          className="p-3 text-center min-w-[160px] border-s border-border/60 bg-surface-subtle/40"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-bold text-gray-900 text-xs">
                              {book.title}
                            </span>
                            <div className="flex items-center gap-1 text-[10px] font-mono">
                              <span
                                className={`px-1.5 py-0.5 rounded-full font-bold ${
                                  prog.receivedCount === prog.totalCount && prog.totalCount > 0
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-primary-light text-primary"
                                }`}
                              >
                                {prog.receivedCount} / {prog.totalCount} {isAr ? "مستلم" : "remis"}
                              </span>
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredStudents.map((student, idx) => {
                    return (
                      <tr
                        key={student.id}
                        className="hover:bg-surface-subtle/60 transition-colors"
                      >
                        <td className="p-3 text-center font-mono text-muted font-bold">
                          #{student.globalNumber ?? idx + 1}
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
                                  {isAr ? "لا يوجد هاتف" : "Pas de tél"}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Payment Voucher Status */}
                        <td className="p-3 text-center">
                          {student.hasPaidBook ? (
                            <div className="flex flex-col items-center">
                              <Badge variant="success" size="sm" className="font-mono">
                                Bon #{student.voucherNumber}
                              </Badge>
                              {student.voucherDate && (
                                <span className="text-[10px] text-muted mt-0.5">
                                  {formatDate(student.voucherDate)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <Badge variant="danger" size="sm" withDot>
                                {isAr ? "غير مدفوع" : "Frais non payés"}
                              </Badge>
                              <button
                                type="button"
                                onClick={() => setPaymentModalStudent(student)}
                                className="text-[10px] text-primary hover:underline font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <CreditCard className="w-3 h-3" />
                                <span>{isAr ? "تسجيل دفع" : "Émettre bon"}</span>
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Overall Book Status Badge */}
                        <td className="p-3 text-center">
                          <BookStatusBadge
                            status={student.status}
                            receivedCount={student.receivedCount}
                            totalBooks={student.totalBooks}
                            details={student.details}
                          />
                        </td>

                        {/* Per-Book-Version Checkmark Cells */}
                        {books.map((book) => {
                          const key = `${student.id}_${book.id}`;
                          const isReceived = Boolean(receiptsState[key]?.received);
                          const receivedAt = receiptsState[key]?.receivedAt;

                          return (
                            <td
                              key={book.id}
                              className="p-3 text-center border-s border-border/60"
                            >
                              <div className="flex flex-col items-center justify-center gap-1">
                                <button
                                  type="button"
                                  disabled={isTrimesterFinished || isPending}
                                  onClick={() => handleToggleReceipt(student.id, book.id)}
                                  title={
                                    isReceived
                                      ? isAr
                                        ? `تم الاستلام في ${receivedAt ? formatDate(receivedAt) : ""}`
                                        : `Remis le ${receivedAt ? formatDate(receivedAt) : ""}`
                                      : isAr
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
                                {isReceived && receivedAt && (
                                  <span className="text-[9px] text-muted font-mono leading-none">
                                    {formatDate(receivedAt)}
                                  </span>
                                )}
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
                    {isAr ? "إضافة كتاب جديد للأستاذ والمستوى" : "Ajouter un livre (Enseignant + Niveau)"}
                  </h3>
                  <p className="text-xs text-muted">
                    {isAr
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
                label={isAr ? "عنوان الكتاب" : "Titre du livre"}
                required
              >
                <Input
                  value={newBookTitle}
                  onChange={(e) => setNewBookTitle(e.target.value)}
                  placeholder={
                    isAr
                      ? "مثال: الرياضيات الجزء 1، كتاب الإنجليزية BAC..."
                      : "Ex: Manuel de Mathématiques Tome 1, English BAC..."
                  }
                  autoFocus
                  required
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label={isAr ? "المستوى الدراسي" : "Niveau scolaire"}>
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

                <FormField label={isAr ? "الأستاذ" : "Enseignant"}>
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
                  <span>{isAr ? "قاعدة النطاق والشمول:" : "Règle de portée :"}</span>
                </p>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {isAr
                    ? "عند إضافة كتاب للأستاذ في هذا المستوى، يحصل كل فوج يدرسه هذا الأستاذ في نفس المستوى تلقائياً على الحق في استلام نسخة."
                    : "Quand un livre est ajouté pour cet enseignant à ce niveau, tous ses groupes à ce niveau ont automatiquement le droit d'obtenir une copie."}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  {isAr ? "إلغاء" : "Annuler"}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isPending || !newBookTitle.trim()}
                >
                  {isPending
                    ? isAr
                      ? "جارِ الإضافة..."
                      : "Ajout..."
                    : isAr
                    ? "إضافة الكتاب"
                    : "Ajouter le livre"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Form Modal for issuing book fee voucher */}
      {paymentModalStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
            <PaymentForm
              student={paymentModalStudent as any}
              classData={classData as any}
              type="create"
              setOpen={(open) => {
                if (!open) setPaymentModalStudent(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
