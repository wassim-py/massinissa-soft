"use client";

import { useState, useTransition, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, Column } from "@/components/ui/DataTable";
import { recordBookDropAction } from "@/lib/actions";
import { toast } from "react-toastify";
import { BookOpen, Plus, Filter, X, GraduationCap, Building2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

export interface BookDropItem {
  id: number;
  bookId: number;
  bookTitle: string;
  levelId: number;
  levelName: string;
  branchId: number;
  branchName: string;
  quantity: number;
  dropDate: Date | string;
  recordedBy: string;
}

export interface OptionItem {
  id: number;
  name: string;
}

function formatDate(date: Date | string, locale: string) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function TeacherBooksSection({
  teacherId,
  teacherName,
  initialDrops,
  branches,
  levels,
}: {
  teacherId: string;
  teacherName: string;
  initialDrops: BookDropItem[];
  branches: OptionItem[];
  levels: OptionItem[];
}) {
  const t = useTranslations("teacherProfile");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  // Filters: Date, Branch, Level
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [selectedLevelId, setSelectedLevelId] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "thisMonth" | "thisYear">("all");

  // Record modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [bookMode, setBookMode] = useState<"existing" | "new">("new");
  const [selectedBookTitle, setSelectedBookTitle] = useState("");
  const [newBookTitle, setNewBookTitle] = useState("");
  const [newLevelId, setNewLevelId] = useState<string>(levels[0]?.id ? String(levels[0].id) : "");
  const [quantity, setQuantity] = useState<number>(15);
  const [isPending, startTransition] = useTransition();

  // Distinct existing books for the dropdown
  const existingBooks = useMemo(() => {
    const map = new Map<string, { title: string; levelId: number; levelName: string }>();
    initialDrops.forEach((d) => {
      if (!map.has(d.bookTitle)) {
        map.set(d.bookTitle, {
          title: d.bookTitle,
          levelId: d.levelId,
          levelName: d.levelName,
        });
      }
    });
    return Array.from(map.values());
  }, [initialDrops]);

  // Filtered drops based on Date, Branch, and Level (§2.11)
  const filteredDrops = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return initialDrops.filter((drop) => {
      // Branch filter
      if (selectedBranchId !== "all" && String(drop.branchId) !== selectedBranchId) {
        return false;
      }
      // Level filter (Filterable by LEVEL now, NOT by individual group per §2.11)
      if (selectedLevelId !== "all" && String(drop.levelId) !== selectedLevelId) {
        return false;
      }
      // Date filter
      if (dateFilter !== "all") {
        const d = new Date(drop.dropDate);
        if (dateFilter === "thisMonth") {
          if (d.getFullYear() !== currentYear || d.getMonth() !== currentMonth) {
            return false;
          }
        } else if (dateFilter === "thisYear") {
          if (d.getFullYear() !== currentYear) {
            return false;
          }
        }
      }
      return true;
    });
  }, [initialDrops, selectedBranchId, selectedLevelId, dateFilter]);

  const totalFilteredCopies = filteredDrops.reduce((sum, d) => sum + d.quantity, 0);

  const bookColumns: Column<BookDropItem>[] = [
    { header: t("colBookTitle"), accessor: "bookTitle" },
    { header: t("colGradeLevel"), accessor: "levelName" },
    { header: t("colDepositedQty"), accessor: "quantity", align: "center" },
    { header: t("colReceivingBranch"), accessor: "branchName" },
    { header: t("colDropDate"), accessor: "dropDate" },
    { header: t("colRecordedBy"), accessor: "recordedBy" },
  ];

  const handleRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity < 1) {
      toast.error(locale === "ar" ? "يرجى إدخال كمية صحيحة (1 على الأقل)" : "Veuillez entrer une quantité valide (au moins 1)");
      return;
    }

    const titleToSave = bookMode === "new" ? newBookTitle.trim() : selectedBookTitle;
    if (!titleToSave) {
      toast.error(locale === "ar" ? "يرجى إدخال أو اختيار عنوان الكتاب" : "Veuillez saisir ou choisir un titre de livre");
      return;
    }

    if (!newLevelId) {
      toast.error(locale === "ar" ? "يرجى تحديد المستوى الدراسي" : "Veuillez sélectionner le niveau scolaire");
      return;
    }

    startTransition(async () => {
      const res = await recordBookDropAction({
        teacherId,
        newBookTitle: titleToSave,
        levelId: Number(newLevelId),
        quantity,
      });

      if (res.success) {
        toast.success(res.message);
        setIsModalOpen(false);
        setNewBookTitle("");
        setQuantity(15);
      } else {
        toast.error(res.message || (locale === "ar" ? "فشل تسجيل إيداع الكتاب" : "Échec de l'enregistrement du dépôt"));
      }
    });
  };

  return (
    <Card className="border-border/80 shadow-xs">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              <span>{t("booksTitleFull")}</span>
            </CardTitle>
            <CardDescription className="mt-1">
              {t("booksDescFull")}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              {t("recordNewBookDrop")}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {/* Filter Bar: Date, Branch, and Level */}
        <div className="bg-surface-subtle/70 p-3 rounded-xl border border-border/80 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-muted-dark text-xs">
              <Filter className="w-3.5 h-3.5 text-muted" />
              <span className="font-semibold">{t("filterBy")}</span>
            </div>

            {/* Date Filter */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="filter-date" className="text-xs text-muted">
                {t("dateFilterLabel")}
              </label>
              <select
                id="filter-date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as any)}
                className="text-xs border border-border/80 bg-surface rounded-lg px-2.5 py-1.5 text-gray-900 shadow-xs focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="all">{t("allTime")}</option>
                <option value="thisMonth">{t("thisMonth")}</option>
                <option value="thisYear">{t("thisYear")}</option>
              </select>
            </div>

            {/* Branch Filter */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="filter-book-branch" className="text-xs text-muted">
                {t("branchFilter")}
              </label>
              <select
                id="filter-book-branch"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="text-xs border border-border/80 bg-surface rounded-lg px-2.5 py-1.5 text-gray-900 shadow-xs focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="all">{t("allBranches")}</option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Level Filter (§2.11) */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="filter-book-level" className="text-xs text-muted">
                {t("levelFilter")}
              </label>
              <select
                id="filter-book-level"
                value={selectedLevelId}
                onChange={(e) => setSelectedLevelId(e.target.value)}
                className="text-xs border border-border/80 bg-surface rounded-lg px-2.5 py-1.5 text-gray-900 shadow-xs focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="all">{t("allLevels")}</option>
                {levels.map((lvl) => (
                  <option key={lvl.id} value={String(lvl.id)}>
                    {lvl.name}
                  </option>
                ))}
              </select>
            </div>

            {(selectedBranchId !== "all" || selectedLevelId !== "all" || dateFilter !== "all") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedBranchId("all");
                  setSelectedLevelId("all");
                  setDateFilter("all");
                }}
                className="text-xs text-primary hover:text-primary-hover"
                leftIcon={<X className="w-3.5 h-3.5" />}
              >
                {t("resetFilter")}
              </Button>
            )}
          </div>

          {/* Aggregated Total Copies */}
          <div className="flex items-center gap-2">
            <Badge variant="primary" size="md">
              {t("copiesKpi")} <strong className="ms-1">{totalFilteredCopies}</strong> {locale === "ar" ? "نسخة" : "ex."}
            </Badge>
          </div>
        </div>

        {/* Book Drops Table using DataTable */}
        <DataTable
          columns={bookColumns}
          data={filteredDrops}
          renderRow={(drop) => (
            <tr
              key={drop.id}
              className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
            >
              <td className="p-3.5 font-bold text-gray-900">
                <span className="flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>{drop.bookTitle}</span>
                </span>
              </td>
              <td className="p-3.5">
                <Badge variant="neutral" size="sm">
                  <GraduationCap className="w-3 h-3 inline me-1 text-muted" />
                  {drop.levelName}
                </Badge>
              </td>
              <td className="p-3.5 text-center font-bold text-primary">
                {drop.quantity} {locale === "ar" ? "نسخة" : "ex."}
              </td>
              <td className="p-3.5">
                <Badge variant="secondary" size="sm">
                  <Building2 className="w-3 h-3 inline me-1" />
                  {drop.branchName}
                </Badge>
              </td>
              <td className="p-3.5 text-gray-700">
                {formatDate(drop.dropDate, locale)}
              </td>
              <td className="p-3.5 text-muted-dark text-xs">
                {drop.recordedBy}
              </td>
            </tr>
          )}
          emptyTitle={t("emptyBooksTitle")}
          emptyDescription={t("emptyBooksDesc")}
        />

        {/* Record Book Drop Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="max-w-md w-full border border-border shadow-xl bg-surface animate-in fade-in-50 duration-150">
              <CardHeader className="pb-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold">
                    {t("modalBookDropTitle", { name: teacherName })}
                  </CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setIsModalOpen(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="pt-4">
                <form onSubmit={handleRecordSubmit} className="space-y-4 text-xs">
                  {existingBooks.length > 0 && (
                    <div className="flex items-center gap-4 bg-surface-subtle/80 p-2.5 rounded-lg border border-border/80">
                      <label className="flex items-center gap-1.5 cursor-pointer font-medium text-gray-800">
                        <input
                          type="radio"
                          name="bookMode"
                          checked={bookMode === "new"}
                          onChange={() => setBookMode("new")}
                        />
                        <span>{t("newBook")}</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer font-medium text-gray-800">
                        <input
                          type="radio"
                          name="bookMode"
                          checked={bookMode === "existing"}
                          onChange={() => {
                            setBookMode("existing");
                            if (existingBooks[0]) {
                              setSelectedBookTitle(existingBooks[0].title);
                              setNewLevelId(String(existingBooks[0].levelId));
                            }
                          }}
                        />
                        <span>{t("existingBook")}</span>
                      </label>
                    </div>
                  )}

                  {bookMode === "existing" ? (
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1.5">
                        {t("selectExistingBook")}
                      </label>
                      <select
                        value={selectedBookTitle}
                        onChange={(e) => {
                          setSelectedBookTitle(e.target.value);
                          const found = existingBooks.find((b) => b.title === e.target.value);
                          if (found) setNewLevelId(String(found.levelId));
                        }}
                        className="w-full border border-border rounded-lg p-2 bg-surface text-gray-900 shadow-xs focus:ring-2 focus:ring-primary/20"
                        required
                      >
                        {existingBooks.map((b, idx) => (
                          <option key={idx} value={b.title}>
                            {b.title} ({b.levelName})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-gray-700 font-semibold mb-1.5">
                        {t("bookTitleLabel")}
                      </label>
                      <input
                        type="text"
                        placeholder={t("bookTitlePlaceholder")}
                        value={newBookTitle}
                        onChange={(e) => setNewBookTitle(e.target.value)}
                        className="w-full border border-border rounded-lg p-2 bg-surface text-gray-900 shadow-xs focus:ring-2 focus:ring-primary/20"
                        required
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-gray-700 font-semibold mb-1.5">
                      {t("bookLevelLabel")}
                    </label>
                    <select
                      value={newLevelId}
                      onChange={(e) => setNewLevelId(e.target.value)}
                      className="w-full border border-border rounded-lg p-2 bg-surface text-gray-900 shadow-xs focus:ring-2 focus:ring-primary/20"
                      required
                    >
                      {levels.map((lvl) => (
                        <option key={lvl.id} value={String(lvl.id)}>
                          {lvl.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-muted mt-1 block">
                      {locale === "ar"
                        ? "ملاحظة: هذا الكتاب سيكون متاحاً لجميع أفواج الأستاذ في هذا المستوى."
                        : "Remarque : ce livre sera disponible pour tous les groupes de ce niveau."}
                    </span>
                  </div>

                  <div>
                    <label className="block text-gray-700 font-semibold mb-1.5">
                      {t("depositedQuantity")}
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                      className="w-full border border-border rounded-lg p-2 bg-surface text-gray-900 font-bold shadow-xs focus:ring-2 focus:ring-primary/20"
                      required
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsModalOpen(false)}
                    >
                      {tCommon("cancel")}
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={isPending}
                    >
                      {isPending
                        ? (locale === "ar" ? "جاري الحفظ..." : "Enregistrement...")
                        : t("confirmAndRecordDrop")}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
