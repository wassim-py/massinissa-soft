"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { recordBookDropAction, recordTeacherPhotocopyAction } from "@/lib/actions";
import { toast } from "react-toastify";
import { useTranslations, useLocale } from "next-intl";

export type BookItem = {
  id: number;
  title: string;
  levelId: number;
  levelName?: string;
};

export type LevelItem = {
  id: number;
  name: string;
};

interface BranchAdminTeacherActionsProps {
  teacher: {
    id: string;
    name: string;
  };
  levels: LevelItem[];
  existingBooks: BookItem[];
  activeBranchName?: string;
}

export default function BranchAdminTeacherActions({
  teacher,
  levels,
  existingBooks,
  activeBranchName,
}: BranchAdminTeacherActionsProps) {
  const t = useTranslations("teacherProfile");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  // Modal states
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [isPhotocopyModalOpen, setIsPhotocopyModalOpen] = useState(false);

  // Book drop form state
  const [bookMode, setBookMode] = useState<"existing" | "new">(
    existingBooks.length > 0 ? "existing" : "new"
  );
  const [selectedBookId, setSelectedBookId] = useState<string>(
    existingBooks[0]?.id ? String(existingBooks[0].id) : ""
  );
  const [newBookTitle, setNewBookTitle] = useState("");
  const [newBookLevelId, setNewBookLevelId] = useState<string>(
    levels[0]?.id ? String(levels[0].id) : ""
  );
  const [bookQuantity, setBookQuantity] = useState<number>(10);

  // Photocopy form state
  const [pagesCount, setPagesCount] = useState<number>(10);

  const [isPending, startTransition] = useTransition();

  const handleBookDropSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bookQuantity < 1) {
      toast.error(locale === "ar" ? "يرجى إدخال كمية صحيحة (1 على الأقل)" : "Veuillez entrer une quantité valide (au moins 1)");
      return;
    }

    if (bookMode === "existing" && !selectedBookId) {
      toast.error(locale === "ar" ? "يرجى اختيار كتاب من القائمة" : "Veuillez choisir un livre dans la liste");
      return;
    }

    if (bookMode === "new" && (!newBookTitle.trim() || !newBookLevelId)) {
      toast.error(locale === "ar" ? "يرجى إدخال عنوان الكتاب واختيار المستوى الدراسي" : "Veuillez entrer le titre du livre et choisir le niveau");
      return;
    }

    startTransition(async () => {
      const res = await recordBookDropAction({
        teacherId: teacher.id,
        bookId: bookMode === "existing" ? Number(selectedBookId) : undefined,
        newBookTitle: bookMode === "new" ? newBookTitle.trim() : undefined,
        levelId: bookMode === "new" ? Number(newBookLevelId) : undefined,
        quantity: bookQuantity,
      });

      if (res.success) {
        toast.success(res.message);
        setIsBookModalOpen(false);
        setNewBookTitle("");
        setBookQuantity(10);
      } else {
        toast.error(res.message || (locale === "ar" ? "فشل تسجيل إيداع الكتاب" : "Échec de l'enregistrement du dépôt"));
      }
    });
  };

  const handlePhotocopySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pagesCount < 1) {
      toast.error(locale === "ar" ? "يرجى إدخال عدد صفحات صالح (1 على الأقل)" : "Veuillez entrer un nombre de pages valide (au moins 1)");
      return;
    }

    startTransition(async () => {
      const res = await recordTeacherPhotocopyAction({
        teacherId: teacher.id,
        pages: pagesCount,
      });

      if (res.success) {
        toast.success(res.message);
        setIsPhotocopyModalOpen(false);
        setPagesCount(10);
      } else {
        toast.error(res.message || (locale === "ar" ? "فشل تسجيل تكلفة النسخ" : "Échec de l'enregistrement"));
      }
    });
  };

  const todayStr = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    dateStyle: "medium",
  }).format(new Date());

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {/* Button 1: "See profile" -> Lightweight modal for Book Drop */}
        <Button
          variant="soft"
          size="sm"
          onClick={() => setIsBookModalOpen(true)}
          className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
          title={t("recordBookTooltip")}
        >
          <Image src="/view.png" alt={t("recordBook")} width={13} height={13} className="opacity-80" />
          <span>{t("recordBook")}</span>
        </Button>

        {/* Button 2: Photocopy recording button (replaces old delete button for branch admins) */}
        <Button
          variant="soft"
          size="sm"
          onClick={() => setIsPhotocopyModalOpen(true)}
          className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
          title={t("recordPhotocopyTooltip")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-90"
          >
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
          <span>{t("recordPhotocopy")}</span>
        </Button>
      </div>

      {/* MODAL 1: BOOK DROP (Lightweight Profile Panel for Branch Admin) */}
      {isBookModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface p-6 rounded-xl border border-border shadow-xl relative w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              className="absolute top-4 start-4 cursor-pointer p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors"
              onClick={() => setIsBookModalOpen(false)}
            >
              <Image src="/close.png" alt={tCommon("cancel")} width={14} height={14} />
            </button>

            <div className="mb-4">
              <h2 className="text-section-title font-bold text-gray-900 mt-1">
                {t("quickBookDropTitle", { name: teacher.name })}
              </h2>
            </div>

            {/* Auto-captured meta banner */}
            <div className="bg-surface-subtle border border-border rounded-lg p-3 text-xs flex justify-between items-center mb-5 text-gray-700">
              <div>
                <span className="text-muted">{locale === "ar" ? "الفرع المسجل: " : "Siège : "}</span>
                <strong className="text-gray-900">
                  {activeBranchName || (locale === "ar" ? "الفرع الحالي (تلقائي)" : "Siège actuel (auto)")}
                </strong>
              </div>
              <div>
                <span className="text-muted">{locale === "ar" ? "التاريخ: " : "Date : "}</span>
                <strong className="text-gray-900">{todayStr}</strong>
              </div>
            </div>

            <form onSubmit={handleBookDropSubmit} className="flex flex-col gap-4">
              {/* Tab: Existing Book vs New Book */}
              <div className="flex rounded-lg bg-gray-100 p-1 border border-border">
                <button
                  type="button"
                  onClick={() => setBookMode("existing")}
                  disabled={existingBooks.length === 0}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    bookMode === "existing"
                      ? "bg-white text-gray-900 shadow-xs"
                      : "text-gray-500 hover:text-gray-900 disabled:opacity-40"
                  }`}
                >
                  {locale === "ar" ? `كتاب مسجل سابقاً (${existingBooks.length})` : `Livre existant (${existingBooks.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setBookMode("new")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    bookMode === "new"
                      ? "bg-white text-gray-900 shadow-xs"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {locale === "ar" ? "+ إضافة كتاب جديد لهذا الأستاذ" : "+ Nouveau livre pour cet enseignant"}
                </button>
              </div>

              {bookMode === "existing" ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-700">{t("selectExistingBook")}</label>
                  <select
                    className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full bg-white focus:ring-primary focus:outline-hidden"
                    value={selectedBookId}
                    onChange={(e) => setSelectedBookId(e.target.value)}
                  >
                    {existingBooks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title} {b.levelName ? `(${b.levelName})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-gray-700">{t("bookTitleLabel")}</label>
                    <input
                      type="text"
                      className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full bg-white focus:ring-primary focus:outline-hidden"
                      placeholder={t("bookTitlePlaceholder")}
                      value={newBookTitle}
                      onChange={(e) => setNewBookTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-gray-700">{t("bookLevelLabel")}</label>
                    <select
                      className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full bg-white focus:ring-primary focus:outline-hidden"
                      value={newBookLevelId}
                      onChange={(e) => setNewBookLevelId(e.target.value)}
                    >
                      {levels.map((lvl) => (
                        <option key={lvl.id} value={lvl.id}>
                          {lvl.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted">
                      {locale === "ar"
                        ? "ملاحظة: لا يتم تحديد أفواج فردية. يغطي الكتاب تلقائياً جميع أفواج هذا الأستاذ في هذا المستوى."
                        : "Remarque : aucun groupe individuel requis. Le livre couvre automatiquement tous les groupes de ce niveau."}
                    </p>
                  </div>
                </div>
              )}

              {/* Quantity input */}
              <div className="flex flex-col gap-1.5 mt-2">
                <label className="text-xs font-semibold text-gray-700">{t("depositedQuantity")}</label>
                <input
                  type="number"
                  min="1"
                  className="ring-[1.5px] ring-gray-300 p-2.5 rounded-md text-sm w-full bg-white font-mono font-bold text-gray-900 focus:ring-primary focus:outline-hidden"
                  value={bookQuantity}
                  onChange={(e) => setBookQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  required
                />
              </div>

              <div className="flex items-center gap-3 mt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsBookModalOpen(false)}
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="flex-1"
                  disabled={isPending}
                >
                  {isPending
                    ? (locale === "ar" ? "قيد التسجيل..." : "Enregistrement...")
                    : t("confirmAndRecordDrop")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: PHOTOCOPY RECORDING (Page count only, no cost shown) */}
      {isPhotocopyModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface p-6 rounded-xl border border-border shadow-xl relative w-full max-w-md max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              className="absolute top-4 start-4 cursor-pointer p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors"
              onClick={() => setIsPhotocopyModalOpen(false)}
            >
              <Image src="/close.png" alt={tCommon("cancel")} width={14} height={14} />
            </button>

            <div className="mb-4">
              <h2 className="text-section-title font-bold text-gray-900 mt-1">
                {t("quickPhotocopyTitle", { name: teacher.name })}
              </h2>
            </div>

            {/* Auto-captured meta banner */}
            <div className="bg-surface-subtle border border-border rounded-lg p-3 text-xs flex justify-between items-center mb-5 text-gray-700">
              <div>
                <span className="text-muted">{locale === "ar" ? "الفرع: " : "Siège : "}</span>
                <strong className="text-gray-900">
                  {activeBranchName || (locale === "ar" ? "الفرع الحالي (تلقائي)" : "Siège actuel (auto)")}
                </strong>
              </div>
              <div>
                <span className="text-muted">{locale === "ar" ? "التاريخ: " : "Date : "}</span>
                <strong className="text-gray-900">{todayStr}</strong>
              </div>
            </div>

            <form onSubmit={handlePhotocopySubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">
                  {locale === "ar" ? "عدد الصفحات المنسوخة (Page Count)" : "Nombre de pages (Page Count)"}
                </label>
                <input
                  type="number"
                  min="1"
                  className="ring-[1.5px] ring-gray-300 p-3 rounded-md text-base w-full bg-white font-mono font-bold text-gray-900 focus:ring-primary focus:outline-hidden"
                  placeholder={locale === "ar" ? "مثال: 25" : "Ex. : 25"}
                  value={pagesCount}
                  onChange={(e) => setPagesCount(Math.max(1, parseInt(e.target.value) || 1))}
                  autoFocus
                  required
                />
              </div>

              <div className="flex items-center gap-3 mt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsPhotocopyModalOpen(false)}
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={isPending}
                >
                  {isPending
                    ? (locale === "ar" ? "قيد التسجيل..." : "Enregistrement...")
                    : (locale === "ar" ? "تسجيل الصفحات" : "Enregistrer les pages")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
