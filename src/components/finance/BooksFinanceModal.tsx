"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import {
  BookOpen,
  X,
  Search,
  Building2,
  CalendarDays,
  User,
  CreditCard,
  CheckCircle2,
  Package,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Plus,
  Loader2,
  Phone,
  ArrowDownToLine,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import {
  getBooksFinanceOverviewAction,
  TeacherBooksFinance,
} from "@/lib/financeActions";
import { recordBookDropAction } from "@/lib/actions";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface BooksFinanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale?: string;
}

export default function BooksFinanceModal({
  isOpen,
  onClose,
  locale = "fr",
}: BooksFinanceModalProps) {
  const t = useTranslations("finance");

  // Main data state
  const [data, setData] = useState<{
    totalRevenue: number;
    totalTeachersCount: number;
    totalBooksCount: number;
    totalStudentsPaidCount: number;
    totalCopiesReceivedCount: number;
    totalCopiesDepositedCount: number;
    teachers: TeacherBooksFinance[];
    allBranches: Array<{ id: number; name: string }>;
    allTrimesters: Array<{ id: number; label: string; name: string; status: string }>;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [selectedTrimesterId, setSelectedTrimesterId] = useState<string>("all");
  const [filterType, setFilterType] = useState<"all" | "withDrops" | "pendingDelivery">("all");

  // Expanded cards state
  const [expandedTeachers, setExpandedTeachers] = useState<Record<string, boolean>>({});
  const [expandedStudents, setExpandedStudents] = useState<Record<number, boolean>>({});
  const [studentStatusFilter, setStudentStatusFilter] = useState<
    Record<number, "all" | "paid_and_received" | "paid_not_received" | "unpaid_received">
  >({});

  // Add Deposit modal state
  const [depositModalBook, setDepositModalBook] = useState<{
    bookId: number;
    bookTitle: string;
    teacherId: string;
    teacherName: string;
  } | null>(null);
  const [depositBranchId, setDepositBranchId] = useState<string>("");
  const [depositQuantity, setDepositQuantity] = useState<number>(20);
  const [isSubmittingDeposit, startDepositTransition] = useTransition();

  // Load data
  const fetchData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await getBooksFinanceOverviewAction();
      if (res.success && res.data) {
        setData(res.data);
        // By default, expand the first 3 teachers
        const initialExpanded: Record<string, boolean> = {};
        res.data.teachers.slice(0, 3).forEach((tch) => {
          initialExpanded[tch.teacherId] = true;
        });
        setExpandedTeachers(initialExpanded);
      } else {
        setErrorMsg(res.message || "Erreur de chargement");
      }
    } catch (err: any) {
      console.error("fetchData error:", err);
      setErrorMsg(err?.message || "Erreur lors du chargement des données");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (depositModalBook) {
          setDepositModalBook(null);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, depositModalBook, onClose]);

  const numLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const formatDZD = (amount: number) =>
    locale === "ar"
      ? `${amount.toLocaleString(numLocale)} دج`
      : `${amount.toLocaleString(numLocale)} DZD`;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "—";
      return new Intl.DateTimeFormat(numLocale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  // Toggle teacher expand
  const toggleTeacher = (tId: string) => {
    setExpandedTeachers((prev) => ({
      ...prev,
      [tId]: !prev[tId],
    }));
  };

  // Toggle book students list
  const toggleBookStudents = (bookId: number) => {
    setExpandedStudents((prev) => ({
      ...prev,
      [bookId]: !prev[bookId],
    }));
  };

  // Handle Record Deposit Submit
  const handleRecordDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositModalBook || !depositBranchId || depositQuantity <= 0) {
      toast.error(locale === "ar" ? "يرجى تعبئة جميع الحقول المطلوبة" : "Veuillez remplir tous les champs");
      return;
    }

    startDepositTransition(async () => {
      try {
        const res = await recordBookDropAction({
          teacherId: depositModalBook.teacherId,
          bookId: depositModalBook.bookId,
          quantity: Number(depositQuantity),
        });

        if (res.success) {
          toast.success(
            res.message || (locale === "ar" ? "تم تسجيل الإيداع بنجاح" : "Dépôt enregistré avec succès")
          );
          setDepositModalBook(null);
          await fetchData();
        } else {
          toast.error(res.message || "Erreur lors de l'enregistrement");
        }
      } catch (err: any) {
        console.error("Deposit error:", err);
        toast.error(err?.message || "Erreur inattendue");
      }
    });
  };

  // Filtered teachers & books
  const filteredTeachers = useMemo(() => {
    if (!data) return [];

    const q = searchQuery.trim().toLowerCase();

    return data.teachers
      .map((teacher) => {
        const filteredBooks = teacher.books.filter((book) => {
          if (selectedBranchId !== "all") {
            const hasBranchDrop = book.drops.some((d) => String(d.branchId) === selectedBranchId);
            const hasBranchStudent = book.students.some(
              (s) => s.branchName && data.allBranches.find((b) => String(b.id) === selectedBranchId)?.name === s.branchName
            );
            if (!hasBranchDrop && !hasBranchStudent) return false;
          }

          if (selectedTrimesterId !== "all") {
            if (String(book.trimesterId) !== selectedTrimesterId) return false;
          }

          if (filterType === "withDrops" && book.drops.length === 0) {
            return false;
          }
          if (filterType === "pendingDelivery") {
            const pending = book.studentsPaidCount - book.studentsReceivedCount;
            if (pending <= 0) return false;
          }

          if (q) {
            const matchBook =
              book.title.toLowerCase().includes(q) ||
              book.levelName.toLowerCase().includes(q) ||
              teacher.teacherName.toLowerCase().includes(q) ||
              book.students.some((s) => s.studentName.toLowerCase().includes(q));
            if (!matchBook) return false;
          }

          return true;
        });

        const filteredClassesWithoutBook = teacher.classesWithoutBook.filter((c) => {
          if (q) {
            const matchName =
              c.className.toLowerCase().includes(q) ||
              teacher.teacherName.toLowerCase().includes(q) ||
              c.students.some((s) => s.studentName.toLowerCase().includes(q));
            if (!matchName) return false;
          }
          return true;
        });

        const teacherMatchesSearch = q && teacher.teacherName.toLowerCase().includes(q);

        if (
          filteredBooks.length === 0 &&
          filteredClassesWithoutBook.length === 0 &&
          !teacherMatchesSearch
        ) {
          return null;
        }

        return {
          ...teacher,
          books: filteredBooks,
          classesWithoutBook: filteredClassesWithoutBook,
        };
      })
      .filter(Boolean) as TeacherBooksFinance[];
  }, [data, searchQuery, selectedBranchId, selectedTrimesterId, filterType]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface rounded-2xl w-full max-w-6xl shadow-2xl border border-border flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150 overflow-hidden"
        dir={locale === "ar" ? "rtl" : "ltr"}
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-border bg-surface-muted/50 shrink-0">
          <div className="flex items-center gap-3.5 sm:gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/15 text-accent flex items-center justify-center shrink-0 border border-accent/25 shadow-xs">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">
                  {t("booksModalTitle")}
                </h2>
                <Badge variant="primary" size="md">
                  {locale === "ar" ? "لوحة المالك" : "Vue Propriétaire"}
                </Badge>
              </div>
              <p className="text-sm sm:text-base text-muted mt-1">
                {t("booksModalSubtitle")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              disabled={isLoading}
              title={locale === "ar" ? "تحديث" : "Actualiser"}
              className="p-2.5 text-muted hover:text-gray-900 hover:bg-surface rounded-xl transition-all border border-transparent hover:border-border cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2.5 text-muted hover:text-gray-900 hover:bg-surface rounded-xl transition-all border border-transparent hover:border-border cursor-pointer"
              aria-label="Fermer"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-7 overflow-y-auto space-y-6 flex-1">
          {isLoading && !data ? (
            <div className="py-24 flex flex-col items-center justify-center gap-4 text-muted">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-base font-medium">
                {locale === "ar" ? "جاري تحميل تفاصيل الكتب والأساتذة..." : "Chargement des manuels et des enseignants..."}
              </p>
            </div>
          ) : errorMsg ? (
            <div className="p-8 text-center max-w-lg mx-auto my-8 border border-danger-soft rounded-2xl bg-danger-light/30">
              <AlertCircle className="w-12 h-12 text-danger mx-auto mb-3" />
              <p className="text-base font-semibold text-danger">{errorMsg}</p>
              <button
                onClick={fetchData}
                className="mt-4 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl shadow-xs hover:bg-primary-hover cursor-pointer"
              >
                {locale === "ar" ? "إعادة المحاولة" : "Réessayer"}
              </button>
            </div>
          ) : data ? (
            <>
              {/* Top 5 High-Level Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
                {/* 1: Enseignants avec manuels */}
                <Card className="p-4 sm:p-5 border-border/80 shadow-xs bg-surface flex flex-col justify-between">
                  <span className="text-xs sm:text-sm font-semibold text-muted uppercase tracking-wider">
                    {locale === "ar" ? "الأساتذة" : "Enseignants"}
                  </span>
                  <div className="mt-2.5">
                    <span className="text-2xl sm:text-3xl font-bold font-mono text-gray-900">
                      {data.totalTeachersCount}
                    </span>
                    <p className="text-xs sm:text-sm text-muted mt-1 font-medium">
                      {locale === "ar" ? "لديهم كتب مسجلة" : "avec manuels"}
                    </p>
                  </div>
                </Card>

                {/* 2: Titres de manuels */}
                <Card className="p-4 sm:p-5 border-border/80 shadow-xs bg-surface flex flex-col justify-between">
                  <span className="text-xs sm:text-sm font-semibold text-muted uppercase tracking-wider">
                    {locale === "ar" ? "عناوين الكتب" : "Titres"}
                  </span>
                  <div className="mt-2.5">
                    <span className="text-2xl sm:text-3xl font-bold font-mono text-gray-900">
                      {data.totalBooksCount}
                    </span>
                    <p className="text-xs sm:text-sm text-muted mt-1 font-medium">
                      {locale === "ar" ? "مقررات مختلفة" : "manuels scolaires"}
                    </p>
                  </div>
                </Card>

                {/* 3: Élèves ayant payé */}
                <Card className="p-4 sm:p-5 border-border/80 shadow-xs bg-surface flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-semibold text-muted uppercase tracking-wider">
                      {t("studentsPaidCount")}
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  </div>
                  <div className="mt-2.5">
                    <span className="text-2xl sm:text-3xl font-bold font-mono text-emerald-700">
                      {data.totalStudentsPaidCount}
                    </span>
                    <p className="text-xs sm:text-sm font-mono font-semibold text-emerald-600 mt-1">
                      {formatDZD(data.totalRevenue)}
                    </p>
                  </div>
                </Card>

                {/* 4: Exemplaires remis */}
                <Card className="p-4 sm:p-5 border-border/80 shadow-xs bg-surface flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-semibold text-muted uppercase tracking-wider">
                      {t("copiesReceivedCount")}
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                  </div>
                  <div className="mt-2.5">
                    <span className="text-2xl sm:text-3xl font-bold font-mono text-blue-700">
                      {data.totalCopiesReceivedCount}
                    </span>
                    <p className="text-xs sm:text-sm text-muted mt-1 font-medium">
                      {data.totalStudentsPaidCount > 0
                        ? `${Math.round(
                            (data.totalCopiesReceivedCount / data.totalStudentsPaidCount) * 100
                          )}% ${locale === "ar" ? "مسلّم" : "remis"}`
                        : "0% remis"}
                    </p>
                  </div>
                </Card>

                {/* 5: Total Dépôts (Exemplaires déposés) */}
                <Card className="p-4 sm:p-5 border-border/80 shadow-xs bg-surface flex flex-col justify-between col-span-2 sm:col-span-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-semibold text-muted uppercase tracking-wider">
                      {t("copiesDepositedCount")}
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  </div>
                  <div className="mt-2.5">
                    <span className="text-2xl sm:text-3xl font-bold font-mono text-amber-700">
                      {data.totalCopiesDepositedCount}
                    </span>
                    <p className="text-xs sm:text-sm text-muted mt-1 font-medium">
                      {t("remainingStock")}:{" "}
                      <span className="font-bold text-gray-900 font-mono">
                        {data.totalCopiesDepositedCount - data.totalCopiesReceivedCount}
                      </span>
                    </p>
                  </div>
                </Card>
              </div>

              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3.5 p-3.5 sm:p-4 bg-surface-muted/60 border border-border rounded-2xl">
                {/* Search Input */}
                <div className="relative flex-1">
                  <Search className="w-5 h-5 text-muted absolute top-1/2 -translate-y-1/2 start-3.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("booksSearchPlaceholder")}
                    className="w-full bg-surface border border-border rounded-xl ps-11 pe-4 py-2.5 text-sm font-medium text-gray-900 placeholder:text-muted focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute top-1/2 -translate-y-1/2 end-3 text-muted hover:text-gray-900 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Branch and Trimester Filters */}
                <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                  {/* Branch select */}
                  <select
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm font-medium text-gray-800 focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer shadow-2xs"
                  >
                    <option value="all">
                      {locale === "ar" ? "جميع الفروع" : "Toutes les succursales"}
                    </option>
                    {data.allBranches.map((b) => (
                      <option key={b.id} value={String(b.id)}>
                        {b.name}
                      </option>
                    ))}
                  </select>

                  {/* Trimester select */}
                  <select
                    value={selectedTrimesterId}
                    onChange={(e) => setSelectedTrimesterId(e.target.value)}
                    className="bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm font-medium text-gray-800 focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer shadow-2xs"
                  >
                    <option value="all">
                      {locale === "ar" ? "جميع الفصول" : "Tous les trimestres"}
                    </option>
                    {data.allTrimesters.map((trim) => (
                      <option key={trim.id} value={String(trim.id)}>
                        {trim.label} ({trim.name})
                      </option>
                    ))}
                  </select>

                  {/* Quick Filters */}
                  <div className="hidden md:flex items-center bg-surface border border-border rounded-xl p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => setFilterType("all")}
                      className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                        filterType === "all"
                          ? "bg-primary text-white shadow-2xs"
                          : "text-muted hover:text-gray-900"
                      }`}
                    >
                      {locale === "ar" ? "الكل" : "Tous"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType("withDrops")}
                      className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                        filterType === "withDrops"
                          ? "bg-primary text-white shadow-2xs"
                          : "text-muted hover:text-gray-900"
                      }`}
                    >
                      {locale === "ar" ? "مع إيداعات" : "Avec dépôts"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType("pendingDelivery")}
                      className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                        filterType === "pendingDelivery"
                          ? "bg-primary text-white shadow-2xs"
                          : "text-muted hover:text-gray-900"
                      }`}
                    >
                      {locale === "ar" ? "في الانتظار" : "En attente"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Teachers List Section */}
              {filteredTeachers.length === 0 ? (
                <div className="py-16 text-center text-muted border border-dashed border-border rounded-2xl bg-surface">
                  <BookOpen className="w-10 h-10 text-muted/60 mx-auto mb-3" />
                  <p className="text-base font-semibold">{t("noBooksFound")}</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {filteredTeachers.map((teacher) => {
                    const isExpanded = !!expandedTeachers[teacher.teacherId];

                    return (
                      <Card
                        key={teacher.teacherId}
                        className="border-border/80 shadow-xs bg-surface overflow-hidden transition-all rounded-2xl"
                      >
                        {/* Teacher Header Bar */}
                        <div
                          onClick={() => toggleTeacher(teacher.teacherId)}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 bg-surface-muted/40 hover:bg-surface-muted transition-colors cursor-pointer gap-3.5 border-b border-border/70"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-base shrink-0 border border-primary/20 shadow-2xs">
                              {teacher.teacherName.slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <h3 className="text-base sm:text-lg font-bold text-gray-900">
                                  {teacher.teacherName}
                                </h3>
                                {teacher.teacherPhone && (
                                  <span className="text-xs sm:text-sm text-muted flex items-center gap-1 font-mono">
                                    <Phone className="w-3.5 h-3.5 text-muted" />
                                    {teacher.teacherPhone}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs sm:text-sm text-muted mt-0.5">
                                {teacher.books.length > 0
                                  ? `${teacher.books.length} ${
                                      locale === "ar" ? "كتب مسجلة" : "manuels enregistrés"
                                    }`
                                  : locale === "ar"
                                  ? "دفعات كتب بالأفواج (بدون تسجيل عنوان)"
                                  : "Frais manuels par groupes"}
                              </p>
                            </div>
                          </div>

                          {/* Teacher Summary Badges */}
                          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                            {/* Students Paid */}
                            <Badge variant="success" size="md">
                              <CreditCard className="w-3.5 h-3.5 me-1.5" />
                              <span className="font-semibold">
                                {teacher.totalStudentsPaid} {locale === "ar" ? "مسدد" : "payés"}
                              </span>
                            </Badge>

                            {/* Copies Received */}
                            <Badge variant="primary" size="md">
                              <CheckCircle2 className="w-3.5 h-3.5 me-1.5" />
                              <span className="font-semibold">
                                {teacher.totalCopiesReceived} {locale === "ar" ? "مستلم" : "remis"}
                              </span>
                            </Badge>

                            {/* Copies Deposited */}
                            <Badge variant="warning" size="md">
                              <Package className="w-3.5 h-3.5 me-1.5" />
                              <span className="font-semibold">
                                {teacher.totalCopiesDeposited} {locale === "ar" ? "مودع" : "déposés"}
                              </span>
                            </Badge>

                            {/* Expand / Collapse Icon */}
                            <div className="p-1.5 rounded-xl text-muted hover:text-gray-900 hover:bg-surface transition-all">
                              {isExpanded ? (
                                <ChevronUp className="w-5 h-5" />
                              ) : (
                                <ChevronDown className="w-5 h-5" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Teacher Expanded Content */}
                        {isExpanded && (
                          <div className="p-4 sm:p-6 space-y-6">
                            {/* Books of this Teacher */}
                            {teacher.books.map((book) => {
                              const isStudentsExpanded = !!expandedStudents[book.id];
                              const statusFilter = studentStatusFilter[book.id] || "all";

                              const filteredBookStudents = book.students.filter((s) => {
                                if (statusFilter === "paid_and_received") return s.hasPaid && s.hasReceived;
                                if (statusFilter === "paid_not_received") return s.hasPaid && !s.hasReceived;
                                if (statusFilter === "unpaid_received") return !s.hasPaid && s.hasReceived;
                                return true;
                              });

                              return (
                                <div
                                  key={book.id}
                                  className="border border-border rounded-2xl p-4 sm:p-6 bg-surface space-y-5 shadow-2xs"
                                >
                                  {/* Book Title & Badges Header */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-border/80">
                                    <div className="flex items-center gap-3 flex-wrap">
                                      <BookOpen className="w-5 h-5 text-accent shrink-0" />
                                      <h4 className="text-base sm:text-lg font-bold text-gray-900">
                                        « {book.title} »
                                      </h4>
                                      <Badge variant="neutral" size="md">
                                        {book.levelName}
                                      </Badge>
                                      {book.trimesterLabel && (
                                        <Badge variant="primary" size="md">
                                          {book.trimesterLabel}
                                        </Badge>
                                      )}
                                    </div>

                                    {/* Action button to record new deposit */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDepositModalBook({
                                          bookId: book.id,
                                          bookTitle: book.title,
                                          teacherId: teacher.teacherId,
                                          teacherName: teacher.teacherName,
                                        });
                                        if (data.allBranches[0]) {
                                          setDepositBranchId(String(data.allBranches[0].id));
                                        }
                                        setDepositQuantity(20);
                                      }}
                                      className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer w-fit shadow-2xs active:scale-95"
                                    >
                                      <Plus className="w-4 h-4" />
                                      <span>{t("addDepositButton")}</span>
                                    </button>
                                  </div>

                                  {/* 4 Metrics Summary Grid for this Book */}
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                                    {/* 1. Students Paid */}
                                    <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-100 flex flex-col justify-between">
                                      <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-emerald-800">
                                        <span>{t("studentsPaidCount")}</span>
                                        <CreditCard className="w-4 h-4 text-emerald-600" />
                                      </div>
                                      <div className="mt-2">
                                        <span className="text-2xl sm:text-3xl font-bold font-mono text-emerald-900">
                                          {book.studentsPaidCount}
                                        </span>
                                        <span className="text-xs sm:text-sm text-emerald-700 ms-1.5 font-medium">
                                          {locale === "ar" ? "طالب" : "élèves"}
                                        </span>
                                      </div>
                                    </div>

                                    {/* 2. Copies Received */}
                                    <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-100 flex flex-col justify-between">
                                      <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-blue-800">
                                        <span>{t("copiesReceivedCount")}</span>
                                        <CheckCircle2 className="w-4 h-4 text-blue-600" />
                                      </div>
                                      <div className="mt-2">
                                        <span className="text-2xl sm:text-3xl font-bold font-mono text-blue-900">
                                          {book.studentsReceivedCount}
                                        </span>
                                        <span className="text-xs sm:text-sm text-blue-700 ms-1.5 font-medium">
                                          / {book.studentsPaidCount} (
                                          {book.studentsPaidCount > 0
                                            ? Math.round(
                                                (book.studentsReceivedCount / book.studentsPaidCount) * 100
                                              )
                                            : 0}
                                          %)
                                        </span>
                                      </div>
                                    </div>

                                    {/* 3. Total Deposited */}
                                    <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-100 flex flex-col justify-between">
                                      <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-amber-800">
                                        <span>{t("copiesDepositedCount")}</span>
                                        <ArrowDownToLine className="w-4 h-4 text-amber-600" />
                                      </div>
                                      <div className="mt-2">
                                        <span className="text-2xl sm:text-3xl font-bold font-mono text-amber-900">
                                          {book.totalCopiesDeposited}
                                        </span>
                                        <span className="text-xs sm:text-sm text-amber-700 ms-1.5 font-medium">
                                          {locale === "ar" ? "نسخة مودعة" : "ex. déposés"}
                                        </span>
                                      </div>
                                    </div>

                                    {/* 4. Remaining Stock */}
                                    <div className="p-4 rounded-xl bg-surface-muted border border-border flex flex-col justify-between">
                                      <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-muted">
                                        <span>{t("remainingStock")}</span>
                                        <Package className="w-4 h-4 text-muted" />
                                      </div>
                                      <div className="mt-2">
                                        <span
                                          className={`text-2xl sm:text-3xl font-bold font-mono ${
                                            book.remainingStock < 0
                                              ? "text-danger"
                                              : "text-gray-900"
                                          }`}
                                        >
                                          {book.remainingStock}
                                        </span>
                                        <span className="text-xs sm:text-sm text-muted ms-1.5 font-medium">
                                          {locale === "ar" ? "في المخزون" : "en stock"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* SECTION: DEPOS HISTORY (Branch, Date, Quantity) */}
                                  <div className="rounded-2xl border border-border/80 bg-surface-muted/30 p-4 sm:p-5 space-y-3.5">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2.5">
                                        <ArrowDownToLine className="w-5 h-5 text-amber-600" />
                                        <h5 className="text-sm sm:text-base font-bold text-gray-900 uppercase tracking-wide">
                                          {t("deposHistoryTitle")}
                                        </h5>
                                      </div>
                                      <Badge variant="warning" size="md">
                                        {book.drops.length}{" "}
                                        {locale === "ar" ? "عمليات إيداع" : "dépôt(s)"}
                                      </Badge>
                                    </div>

                                    {book.drops.length === 0 ? (
                                      <div className="p-4 text-center text-sm text-muted border border-dashed border-border/80 rounded-xl bg-surface">
                                        {t("deposHistoryEmpty")}
                                      </div>
                                    ) : (
                                      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                                        <table className="w-full text-sm text-start">
                                          <thead>
                                            <tr className="border-b border-border bg-surface-muted/60 text-muted font-semibold text-xs sm:text-sm uppercase tracking-wider">
                                              <th className="py-3 px-4 text-start">
                                                <div className="flex items-center gap-2">
                                                  <Building2 className="w-4 h-4" />
                                                  <span>{t("depotBranchCol")}</span>
                                                </div>
                                              </th>
                                              <th className="py-3 px-4 text-start">
                                                <div className="flex items-center gap-2">
                                                  <CalendarDays className="w-4 h-4" />
                                                  <span>{t("depotDateCol")}</span>
                                                </div>
                                              </th>
                                              <th className="py-3 px-4 text-start">
                                                <div className="flex items-center gap-2">
                                                  <Package className="w-4 h-4" />
                                                  <span>{t("depotQtyCol")}</span>
                                                </div>
                                              </th>
                                              <th className="py-3 px-4 text-start">
                                                <div className="flex items-center gap-2">
                                                  <User className="w-4 h-4" />
                                                  <span>{t("depotRecordedByCol")}</span>
                                                </div>
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-border/60">
                                            {book.drops.map((drop) => (
                                              <tr
                                                key={drop.id}
                                                className="hover:bg-surface-muted/50 transition-colors text-sm"
                                              >
                                                <td className="py-3.5 px-4 font-bold text-gray-900 text-sm sm:text-base">
                                                  {drop.branchName}
                                                </td>
                                                <td className="py-3.5 px-4 text-gray-800 font-mono text-sm sm:text-base">
                                                  {formatDate(drop.dropDate)}
                                                </td>
                                                <td className="py-3.5 px-4">
                                                  <Badge variant="warning" size="md">
                                                    <span className="font-bold font-mono text-sm">
                                                      +{drop.quantity}{" "}
                                                      {locale === "ar" ? "نسخة" : "ex."}
                                                    </span>
                                                  </Badge>
                                                </td>
                                                <td className="py-3.5 px-4 text-muted text-sm">
                                                  {drop.recordedBy || "admin"}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>

                                  {/* SECTION: DETAILED STUDENTS LIST TOGGLE */}
                                  <div className="pt-1">
                                    <button
                                      type="button"
                                      onClick={() => toggleBookStudents(book.id)}
                                      className="flex items-center gap-2 text-sm sm:text-base font-semibold text-primary hover:text-primary-hover cursor-pointer py-1"
                                    >
                                      {isStudentsExpanded ? (
                                        <>
                                          <ChevronUp className="w-4 h-4" />
                                          <span>
                                            {t("hideStudentsDetails")} ({book.students.length})
                                          </span>
                                        </>
                                      ) : (
                                        <>
                                          <ChevronDown className="w-4 h-4" />
                                          <span>
                                            {t("viewStudentsDetails")} ({book.students.length})
                                          </span>
                                        </>
                                      )}
                                    </button>

                                    {isStudentsExpanded && (
                                      <div className="mt-3.5 p-4 sm:p-5 rounded-2xl border border-border bg-surface-muted/20 space-y-4">
                                        {/* Status Filter for Students */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setStudentStatusFilter((prev) => ({
                                                ...prev,
                                                [book.id]: "all",
                                              }))
                                            }
                                            className={`px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                                              statusFilter === "all"
                                                ? "bg-primary text-white shadow-2xs"
                                                : "bg-surface text-muted hover:text-gray-900 border border-border"
                                            }`}
                                          >
                                            {locale === "ar" ? "الكل" : "Tous"} ({book.students.length})
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setStudentStatusFilter((prev) => ({
                                                ...prev,
                                                [book.id]: "paid_and_received",
                                              }))
                                            }
                                            className={`px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                                              statusFilter === "paid_and_received"
                                                ? "bg-emerald-600 text-white shadow-2xs"
                                                : "bg-surface text-muted hover:text-gray-900 border border-border"
                                            }`}
                                          >
                                            {locale === "ar" ? "مسدد ومستلم" : "Payé & Reçu"} (
                                            {
                                              book.students.filter(
                                                (s) => s.hasPaid && s.hasReceived
                                              ).length
                                            }
                                            )
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setStudentStatusFilter((prev) => ({
                                                ...prev,
                                                [book.id]: "paid_not_received",
                                              }))
                                            }
                                            className={`px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                                              statusFilter === "paid_not_received"
                                                ? "bg-amber-600 text-white shadow-2xs"
                                                : "bg-surface text-muted hover:text-gray-900 border border-border"
                                            }`}
                                          >
                                            {locale === "ar" ? "مسدد ولم يستلم بعد" : "Payé non remis"} (
                                            {
                                              book.students.filter(
                                                (s) => s.hasPaid && !s.hasReceived
                                              ).length
                                            }
                                            )
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setStudentStatusFilter((prev) => ({
                                                ...prev,
                                                [book.id]: "unpaid_received",
                                              }))
                                            }
                                            className={`px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                                              statusFilter === "unpaid_received"
                                                ? "bg-danger text-white shadow-2xs"
                                                : "bg-surface text-muted hover:text-gray-900 border border-border"
                                            }`}
                                          >
                                            {locale === "ar" ? "استلم بدون تسديد" : "Reçu sans paiement"} (
                                            {
                                              book.students.filter(
                                                (s) => !s.hasPaid && s.hasReceived
                                              ).length
                                            }
                                            )
                                          </button>
                                        </div>

                                        {/* Students Table */}
                                        <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-xl border border-border bg-surface">
                                          <table className="w-full text-sm text-start">
                                            <thead>
                                              <tr className="border-b border-border bg-surface-muted/60 text-muted font-semibold text-xs sm:text-sm uppercase sticky top-0">
                                                <th className="py-3 px-4 text-start">
                                                  {locale === "ar" ? "الطالب" : "Élève"}
                                                </th>
                                                <th className="py-3 px-4 text-start">
                                                  {locale === "ar" ? "حالة الدفع" : "Paiement"}
                                                </th>
                                                <th className="py-3 px-4 text-start">
                                                  {locale === "ar" ? "حالة الاستلام" : "Remise du manuel"}
                                                </th>
                                                <th className="py-3 px-4 text-start">
                                                  {locale === "ar" ? "الفوج / الفرع" : "Groupe / Succursale"}
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/60">
                                              {filteredBookStudents.length === 0 ? (
                                                <tr>
                                                  <td
                                                    colSpan={4}
                                                    className="py-6 text-center text-muted text-sm font-medium"
                                                  >
                                                    {locale === "ar"
                                                      ? "لا توجد نتائج تطابق هذا المعيار"
                                                      : "Aucun élève trouvé"}
                                                  </td>
                                                </tr>
                                              ) : (
                                                filteredBookStudents.map((st) => (
                                                  <tr
                                                    key={st.studentId}
                                                    className="hover:bg-surface-muted/50 transition-colors text-sm"
                                                  >
                                                    <td className="py-3 px-4 font-bold text-gray-900 text-sm sm:text-base">
                                                      <div>{st.studentName}</div>
                                                      {st.studentPhone && (
                                                        <div className="text-xs text-muted font-mono mt-0.5">
                                                          {st.studentPhone}
                                                        </div>
                                                      )}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                      {st.hasPaid ? (
                                                        <div>
                                                          <Badge variant="success" size="md">
                                                            {t("paidStatus")} (
                                                            {st.voucherAmount
                                                              ? formatDZD(st.voucherAmount)
                                                              : "—"}
                                                            )
                                                          </Badge>
                                                          {st.voucherNumber && (
                                                            <div className="text-xs text-muted font-mono mt-1">
                                                              {locale === "ar" ? "وصل #" : "Reçu #"}{st.voucherNumber} • {formatDate(st.voucherDate)}
                                                            </div>
                                                          )}
                                                        </div>
                                                      ) : (
                                                        <Badge variant="danger" size="md">
                                                          {t("unpaidStatus")}
                                                        </Badge>
                                                      )}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                      {st.hasReceived ? (
                                                        <div>
                                                          <Badge variant="primary" size="md">
                                                            {t("receivedStatus")}
                                                          </Badge>
                                                          <div className="text-xs text-muted font-mono mt-1">
                                                            {formatDate(st.receivedAt)}
                                                          </div>
                                                        </div>
                                                      ) : (
                                                        <Badge variant="neutral" size="md">
                                                          {t("notReceivedStatus")}
                                                        </Badge>
                                                      )}
                                                    </td>
                                                    <td className="py-3 px-4 text-gray-700 font-medium">
                                                      <div>{st.className || "—"}</div>
                                                      <div className="text-xs text-muted mt-0.5">
                                                        {st.branchName || "—"}
                                                      </div>
                                                    </td>
                                                  </tr>
                                                ))
                                              )}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Classes without formal books */}
                            {teacher.classesWithoutBook.length > 0 && (
                              <div className="border border-border/80 rounded-2xl p-4 sm:p-5 bg-amber-50/20 space-y-3.5">
                                <div className="flex items-center gap-2.5">
                                  <AlertCircle className="w-5 h-5 text-amber-600" />
                                  <h4 className="text-sm sm:text-base font-bold text-amber-900 uppercase tracking-wide">
                                    {locale === "ar"
                                      ? "رسوم كتب محصلة في أفواج لم يسجل لها عنوان كتاب رسمي بعد"
                                      : "Paiements de manuels enregistrés par groupe (sans titre formel)"}
                                  </h4>
                                </div>
                                <div className="space-y-2.5">
                                  {teacher.classesWithoutBook.map((grp) => (
                                    <div
                                      key={grp.classId}
                                      className="flex items-center justify-between p-3.5 rounded-xl bg-surface border border-border text-sm"
                                    >
                                      <div>
                                        <span className="font-bold text-gray-900 text-sm sm:text-base">{grp.className}</span>
                                        <span className="text-muted ms-2.5">({grp.branchName})</span>
                                      </div>
                                      <Badge variant="success" size="md">
                                        <span className="font-semibold">
                                          {grp.uniqueStudentsPaidCount} {locale === "ar" ? "طلاب سددوا" : "élèves ont payé"}
                                        </span>
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-border bg-surface-muted/40 flex items-center justify-between shrink-0">
          <div className="text-xs sm:text-sm font-medium text-muted">
            {filteredTeachers.length} {locale === "ar" ? "أساتذة معروضين" : "enseignants affichés"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-surface hover:bg-surface-muted text-gray-800 text-sm font-semibold rounded-xl border border-border shadow-2xs transition-all cursor-pointer active:scale-95"
          >
            {locale === "ar" ? "إغلاق" : "Fermer"}
          </button>
        </div>
      </div>

      {/* Sub-modal: Record New Deposit */}
      {depositModalBook && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          dir={locale === "ar" ? "rtl" : "ltr"}
        >
          <div className="bg-surface rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-border animate-in zoom-in-95 duration-150 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ArrowDownToLine className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-bold text-gray-900">
                  {locale === "ar" ? "تسجيل إيداع جديد" : "Enregistrer un nouveau dépôt"}
                </h3>
              </div>
              <button
                onClick={() => setDepositModalBook(null)}
                className="text-muted hover:text-gray-900 cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm text-muted bg-surface-muted p-3.5 rounded-xl border border-border space-y-1">
              <div>
                {locale === "ar" ? "الكتاب:" : "Manuel :"}{" "}
                <span className="font-bold text-gray-900">« {depositModalBook.bookTitle} »</span>
              </div>
              <div>
                {locale === "ar" ? "الأستاذ:" : "Enseignant :"}{" "}
                <span className="font-bold text-gray-900">{depositModalBook.teacherName}</span>
              </div>
            </div>

            <form onSubmit={handleRecordDepositSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                  {t("depotBranchCol")} *
                </label>
                <select
                  required
                  value={depositBranchId}
                  onChange={(e) => setDepositBranchId(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl p-3 text-sm font-medium text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs cursor-pointer"
                >
                  {data?.allBranches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                  {t("depotQtyCol")} *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={depositQuantity}
                  onChange={(e) => setDepositQuantity(Number(e.target.value))}
                  placeholder="20"
                  className="w-full bg-surface border border-border rounded-xl p-3 text-sm font-mono font-bold text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setDepositModalBook(null)}
                  className="px-5 py-2.5 bg-surface hover:bg-surface-muted text-gray-800 text-sm font-semibold rounded-xl border border-border cursor-pointer transition-all active:scale-95"
                >
                  {locale === "ar" ? "إلغاء" : "Annuler"}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDeposit}
                  className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-xl shadow-xs cursor-pointer transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95"
                >
                  {isSubmittingDeposit && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{locale === "ar" ? "حفظ الإيداع" : "Enregistrer le dépôt"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
