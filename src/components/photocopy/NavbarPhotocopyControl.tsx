"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { toast } from "react-toastify";
import {
  Printer,
  X,
  RefreshCw,
  Pencil,
  Trash2,
  Check,
  Lock,
  Search,
  Clock,
  User,
  Calendar,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import SearchableGroupSelect, { type GroupOption } from "@/components/ui/SearchableGroupSelect";
import { formatDZD } from "@/lib/algiersDate";
import {
  getNavbarPhotocopyJournalAction,
  recordPhotocopyJournalEntryAction,
  updatePhotocopyJournalEntryAction,
  deletePhotocopyJournalEntryAction,
  type NavbarPhotocopyJournalData,
  type PhotocopyDatePreset,
  type PhotocopyJournalEntryDto,
} from "@/lib/photocopyActions";

interface NavbarPhotocopyControlProps {
  branchId: number;
  branchName: string;
  isOwner: boolean;
  initialTodayCount: number;
}

const QUICK_PAGE_PRESETS = [10, 20, 30, 50, 100] as const;
const PHOTOCOPY_SYNC_EVENT = "photocopy:changed";

function formatDisplayDate(algiersDateStr: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(algiersDateStr);
  if (!parts) return algiersDateStr;
  return `${parts[3]}/${parts[2]}/${parts[1]}`;
}

export default function NavbarPhotocopyControl({
  branchId,
  branchName,
  isOwner,
  initialTodayCount,
}: NavbarPhotocopyControlProps) {
  const locale = useLocale();
  const isAr = locale === "ar";
  const t = useTranslations("photocopyJournal");
  const router = useRouter();
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [todayCount, setTodayCount] = useState<number>(initialTodayCount);

  // Filter state
  const [datePreset, setDatePreset] = useState<PhotocopyDatePreset>("today");
  const [customDate, setCustomDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTeacherIdFilter, setSelectedTeacherIdFilter] = useState<string>("");

  // Loaded data & loading state
  const [journalData, setJournalData] = useState<NavbarPhotocopyJournalData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Quick-record form state
  const [recordTeacherId, setRecordTeacherId] = useState<string>("");
  const [recordPages, setRecordPages] = useState<string>("10");
  const [isRecording, setIsRecording] = useState(false);

  // Inline edit / delete state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTeacherId, setEditTeacherId] = useState<string>("");
  const [editPages, setEditPages] = useState<string>("1");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const pagesInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setTodayCount(initialTodayCount);
  }, [initialTodayCount, branchId]);

  const loadJournal = useCallback(
    async (opts?: {
      presetOverride?: PhotocopyDatePreset;
      customDateOverride?: string;
    }) => {
      const targetPreset = opts?.presetOverride ?? datePreset;
      const targetCustomDate = opts?.customDateOverride ?? customDate;
      setIsLoading(true);
      try {
        const res = await getNavbarPhotocopyJournalAction({
          branchId,
          datePreset: targetPreset,
          customDate:
            targetPreset === "date" && targetCustomDate ? targetCustomDate : undefined,
        });
        if (res.success && res.data) {
          setJournalData(res.data);
          setTodayCount(res.data.todaySummary.entriesCount);
        } else if (res.message) {
          toast.error(res.message);
        }
      } catch {
        toast.error(isAr ? "خطأ في تحميل السجل" : "Erreur lors du chargement du journal");
      } finally {
        setIsLoading(false);
      }
    },
    [branchId, datePreset, customDate, isAr]
  );

  // Fetch journal whenever drawer opens or active branch/date preset changes while open
  useEffect(() => {
    if (!isOpen) return;
    loadJournal();
  }, [isOpen, branchId, datePreset, customDate, loadJournal]);

  // Close on Escape key (unless editing inline)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editingId !== null) {
          setEditingId(null);
        } else if (confirmDeleteId !== null) {
          setConfirmDeleteId(null);
        } else {
          setIsOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, editingId, confirmDeleteId]);

  // Listen to external photocopy changes (e.g. Teachers page quick-record modal)
  useEffect(() => {
    const handleExternalSync = (event: Event) => {
      const source = (event as CustomEvent<{ source?: string }>)?.detail?.source;
      if (source === "navbar-photocopy-drawer") return;

      if (isOpen) {
        loadJournal();
      } else {
        getNavbarPhotocopyJournalAction({ branchId, datePreset: "today" })
          .then((res) => {
            if (res.success && res.data) {
              setTodayCount(res.data.todaySummary.entriesCount);
            }
          })
          .catch(() => {});
      }
    };
    window.addEventListener(PHOTOCOPY_SYNC_EVENT, handleExternalSync);
    return () => window.removeEventListener(PHOTOCOPY_SYNC_EVENT, handleExternalSync);
  }, [branchId, isOpen, loadJournal]);

  const notifyRelatedPagesIfVisible = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(PHOTOCOPY_SYNC_EVENT, {
        detail: { source: "navbar-photocopy-drawer" },
      })
    );
    if (
      pathname &&
      (pathname.includes("/list/teachers") ||
        pathname.includes("/list/payroll") ||
        pathname.includes("/list/finance"))
    ) {
      router.refresh();
    }
  }, [pathname, router]);

  const teacherOptions: GroupOption[] = useMemo(() => {
    const teachers = journalData?.teachers || [];
    return teachers.map((teacher) => ({
      id: teacher.id,
      name: teacher.name,
    }));
  }, [journalData?.teachers]);

  const visibleEntries = useMemo(() => {
    const entries = journalData?.entries || [];
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return entries.filter((entry) => {
      if (selectedTeacherIdFilter && entry.teacherId !== selectedTeacherIdFilter) {
        return false;
      }
      if (normalizedSearch && !entry.teacherName.toLowerCase().includes(normalizedSearch)) {
        return false;
      }
      return true;
    });
  }, [journalData?.entries, searchQuery, selectedTeacherIdFilter]);

  const visibleTotals = useMemo(() => {
    let totalPages = 0;
    let totalCost = 0;
    for (const entry of visibleEntries) {
      totalPages += entry.pages;
      if (isOwner && typeof entry.costAmount === "number") {
        totalCost += entry.costAmount;
      }
    }
    return {
      count: visibleEntries.length,
      pages: totalPages,
      cost: Math.round(totalCost * 100) / 100,
    };
  }, [visibleEntries, isOwner]);

  const handleQuickRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordTeacherId) {
      toast.error(t("selectTeacherError"));
      return;
    }

    const parsedPages = parseInt(recordPages, 10);
    if (!Number.isFinite(parsedPages) || parsedPages < 1) {
      toast.error(t("invalidPagesError"));
      return;
    }

    setIsRecording(true);
    try {
      const res = await recordPhotocopyJournalEntryAction({
        teacherId: recordTeacherId,
        pages: parsedPages,
        branchId,
      });

      if (res.success && res.data) {
        toast.success(
          t("recordSuccess", {
            name: res.data.teacherName,
            pages: res.data.pages,
          })
        );
        setRecordTeacherId("");
        setRecordPages("10");
        setSelectedTeacherIdFilter("");
        setSearchQuery("");
        if (datePreset !== "today") {
          setDatePreset("today");
        } else {
          await loadJournal({ presetOverride: "today" });
        }
        notifyRelatedPagesIfVisible();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error(isAr ? "فشل تسجيل العملية" : "Échec de l'enregistrement");
    } finally {
      setIsRecording(false);
    }
  };

  const handleStartEdit = (entry: PhotocopyJournalEntryDto) => {
    setConfirmDeleteId(null);
    setEditingId(entry.id);
    setEditTeacherId(entry.teacherId);
    setEditPages(String(entry.pages));
  };

  const handleSaveEdit = async (entryId: number) => {
    const parsedPages = parseInt(editPages, 10);
    if (!editTeacherId || !Number.isFinite(parsedPages) || parsedPages < 1) {
      toast.error(t("invalidPagesError"));
      return;
    }

    setIsSavingEdit(true);
    try {
      const res = await updatePhotocopyJournalEntryAction({
        id: entryId,
        teacherId: editTeacherId,
        pages: parsedPages,
      });

      if (res.success && res.data) {
        toast.success(
          t("updateSuccess", {
            name: res.data.teacherName,
            pages: res.data.pages,
          })
        );
        setEditingId(null);
        await loadJournal();
        notifyRelatedPagesIfVisible();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error(isAr ? "فشل التعديل" : "Échec de la modification");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async (entryId: number) => {
    setIsDeleting(true);
    try {
      const res = await deletePhotocopyJournalEntryAction({ id: entryId });
      if (res.success) {
        toast.success(t("deleteSuccess"));
        setConfirmDeleteId(null);
        await loadJournal();
        notifyRelatedPagesIfVisible();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error(isAr ? "فشل الحذف" : "Échec de la suppression");
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePresetClick = (preset: PhotocopyDatePreset) => {
    setEditingId(null);
    setConfirmDeleteId(null);
    setDatePreset(preset);
  };

  const handleTodayChipClick = (teacherId: string) => {
    setSelectedTeacherIdFilter((prev) => (prev === teacherId ? "" : teacherId));
    if (datePreset !== "today") {
      setDatePreset("today");
    }
  };

  const renderEditDetail = (entry: PhotocopyJournalEntryDto) => {
    if (!entry.lastEdit) return null;
    const { editorName, prevTeacherId, newTeacherId, prevTeacherName, newTeacherName, prevPages, newPages } =
      entry.lastEdit;
    if (prevTeacherId && newTeacherId && prevTeacherId !== newTeacherId) {
      return t("editedDetailTeacher", {
        editor: editorName,
        prevTeacher: prevTeacherName,
        newTeacher: newTeacherName,
        prevPages,
        newPages,
      });
    }
    return t("editedDetailPages", {
      editor: editorName,
      prevPages,
      newPages,
    });
  };

  const resolvedBranchName = journalData?.branchName || branchName;
  const showDateInRows = datePreset === "7d" || datePreset === "month";

  return (
    <>
      {/* Navbar Trigger Button (replaces the old Fingerprint ON/OFF widget slot) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-9 h-9 sm:w-auto sm:px-3 sm:py-1.5 rounded-full sm:rounded-md flex items-center justify-center sm:justify-start gap-1.5 border border-gray-200 sm:border-gray-300 bg-white hover:bg-gray-50 active:bg-gray-100 text-xs font-medium text-gray-700 shadow-xs transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-500 shrink-0 relative"
        title={t("triggerTooltip")}
        aria-label={t("triggerTooltip")}
      >
        <Printer className="w-4 h-4 text-gray-700 sm:text-gray-600 shrink-0" />
        <span className="hidden md:inline font-semibold text-gray-800">
          {t("triggerLabel")}
        </span>
        {todayCount > 0 && (
          <>
            <span className="sm:hidden absolute -top-1 -right-1 rtl:-left-1 rtl:right-auto px-1 min-w-[16px] h-4 rounded-full bg-amber-600 text-white font-bold text-[9px] flex items-center justify-center border border-white shadow-xs">
              {todayCount > 99 ? "99+" : todayCount}
            </span>
            <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold text-[10px] leading-none">
              {todayCount}
            </span>
          </>
        )}
      </button>

      {/* Slide-Over Portal Drawer */}
      {mounted &&
        isOpen &&
        createPortal(
          <div
            dir={isAr ? "rtl" : "ltr"}
            className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-xs"
            onClick={() => setIsOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t("drawerTitle")}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col border-s border-gray-200 overflow-hidden"
            >
              {/* 1. Drawer Header */}
              <div className="px-4 py-3.5 border-b border-gray-200 bg-white flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-700 flex items-center justify-center shrink-0">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-bold text-gray-900 truncate">
                        {t("drawerTitle")}
                      </h2>
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/80 text-[10px] font-semibold uppercase tracking-wide shrink-0">
                        {resolvedBranchName}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">
                      {t("drawerSubtitle")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => loadJournal()}
                    disabled={isLoading}
                    className="p-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 cursor-pointer transition-colors disabled:opacity-50"
                    title={t("refresh")}
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${isLoading ? "animate-spin text-blue-600" : ""}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="p-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 cursor-pointer transition-colors"
                    title={t("close")}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 2. Quick-Record Form (outside overflow scroll so dropdown never clips) */}
              <form
                onSubmit={handleQuickRecordSubmit}
                className="px-4 py-3 border-b border-gray-200 bg-amber-50/40 shrink-0 relative z-20 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-amber-600" />
                    <span>{t("quickRecordTitle")}</span>
                  </span>

                  <div className="flex items-center gap-1">
                    {QUICK_PAGE_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setRecordPages(String(preset));
                          pagesInputRef.current?.focus();
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold font-mono border cursor-pointer transition-colors ${
                          recordPages === String(preset)
                            ? "bg-amber-600 text-white border-amber-600"
                            : "bg-white text-gray-700 border-gray-200 hover:bg-amber-50 hover:border-amber-300"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <SearchableGroupSelect
                      options={teacherOptions}
                      value={recordTeacherId}
                      onChange={(val) => setRecordTeacherId(val ? String(val) : "")}
                      placeholder={t("teacherPlaceholder")}
                      searchPlaceholder={t("teacherSearchPlaceholder")}
                      allowClear
                      buttonClassName="min-h-[38px] py-1.5 text-xs bg-white border-gray-300"
                      dropdownClassName="z-50"
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative w-24 sm:w-24">
                      <input
                        ref={pagesInputRef}
                        type="number"
                        min={1}
                        max={50000}
                        step={1}
                        value={recordPages}
                        onChange={(e) => setRecordPages(e.target.value)}
                        aria-label={t("pagesAria")}
                        placeholder={t("pagesPlaceholder")}
                        className="w-full h-[38px] px-2.5 pe-7 rounded-lg border border-gray-300 bg-white text-sm font-mono font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                        required
                      />
                      <span className="absolute end-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 pointer-events-none">
                        p.
                      </span>
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      isLoading={isRecording}
                      disabled={isRecording || !recordTeacherId}
                      className="h-[38px] px-3.5 bg-amber-600 hover:bg-amber-700 border-amber-600 text-white font-semibold shrink-0"
                    >
                      {isRecording ? t("recordingButton") : t("recordButton")}
                    </Button>
                  </div>
                </div>
              </form>

              {/* 3. Today Memory Strip (Helps remember who had photocopies logged today) */}
              <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50/70 shrink-0 space-y-1.5 relative z-10">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-gray-700">
                    {t("todayStripTitle")}
                  </span>
                  <span className="font-semibold text-gray-900 font-mono">
                    {t("todayStripSummary", {
                      count: journalData?.todaySummary.entriesCount ?? todayCount,
                      pages: journalData?.todaySummary.totalPages ?? 0,
                    })}
                    {isOwner &&
                      typeof journalData?.todaySummary.totalCost === "number" && (
                        <span className="text-emerald-700 ms-2">
                          · {formatDZD(journalData.todaySummary.totalCost, locale)}
                        </span>
                      )}
                  </span>
                </div>

                {journalData && journalData.todaySummary.byTeacher.length > 0 ? (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    {selectedTeacherIdFilter && (
                      <button
                        type="button"
                        onClick={() => setSelectedTeacherIdFilter("")}
                        className="px-2 py-1 rounded-full text-[11px] font-semibold bg-gray-800 text-white shrink-0 cursor-pointer"
                      >
                        {t("clearTeacherFilter")}
                      </button>
                    )}
                    {journalData.todaySummary.byTeacher.map((item) => {
                      const active = selectedTeacherIdFilter === item.teacherId;
                      return (
                        <button
                          key={item.teacherId}
                          type="button"
                          onClick={() => handleTodayChipClick(item.teacherId)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium border shrink-0 inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                            active
                              ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                              : "bg-white text-gray-700 border-gray-200 hover:bg-blue-50 hover:border-blue-200"
                          }`}
                        >
                          <span className="truncate max-w-[140px]">{item.teacherName}</span>
                          <span
                            className={`font-mono font-bold text-[10px] ${
                              active ? "text-blue-100" : "text-amber-700"
                            }`}
                          >
                            {t("pagesUnit", { pages: item.totalPages })}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400">{t("todayEmptyStrip")}</p>
                )}
              </div>

              {/* 4. Date Preset & Search Filters Bar */}
              <div className="px-4 py-2.5 border-b border-gray-200 bg-white shrink-0 space-y-2 relative z-10">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      ["today", t("presetToday")],
                      ["yesterday", t("presetYesterday")],
                      ["7d", t("preset7d")],
                      ["month", t("presetMonth")],
                      ["date", t("presetDate")],
                    ] as Array<[PhotocopyDatePreset, string]>
                  ).map(([presetKey, label]) => {
                    const active = datePreset === presetKey;
                    return (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => handlePresetClick(presetKey)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer transition-colors ${
                          active
                            ? "bg-gray-900 text-white border-gray-900"
                            : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 hover:text-gray-900"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}

                  {datePreset === "date" && (
                    <div className="flex items-center gap-1 ms-auto">
                      <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <input
                        type="date"
                        value={customDate || journalData?.todayAlgiersDate || ""}
                        onChange={(e) => setCustomDate(e.target.value)}
                        className="px-2 py-1 rounded-md border border-gray-300 bg-white text-xs font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="relative flex items-center flex-1">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute start-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t("searchJournalPlaceholder")}
                      className="w-full ps-8 pe-7 py-1.5 rounded-md border border-gray-200 bg-gray-50/70 focus:bg-white text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute end-2 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="text-[11px] font-semibold text-gray-600 font-mono shrink-0">
                    {t("periodSummary", {
                      count: visibleTotals.count,
                      pages: visibleTotals.pages,
                    })}
                    {isOwner && visibleTotals.count > 0 && (
                      <span className="text-emerald-700 ms-1.5">
                        · {formatDZD(visibleTotals.cost, locale)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 5. Scrollable Journal History List */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 bg-gray-50/50">
                {isLoading && !journalData ? (
                  <div className="py-12 text-center text-xs text-gray-500 space-y-2">
                    <RefreshCw className="w-5 h-5 mx-auto animate-spin text-amber-600" />
                    <p>{t("loadingJournal")}</p>
                  </div>
                ) : visibleEntries.length === 0 ? (
                  <div className="py-14 text-center text-gray-400 space-y-1.5 px-4">
                    <Printer className="w-8 h-8 mx-auto opacity-30" />
                    <p className="text-xs font-semibold text-gray-600">
                      {t("emptyJournalTitle")}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {t("emptyJournalDesc")}
                    </p>
                  </div>
                ) : (
                  visibleEntries.map((entry) => {
                    const isRowEditing = editingId === entry.id;
                    const isRowConfirmDelete = confirmDeleteId === entry.id;
                    const editDetailText = renderEditDetail(entry);

                    return (
                      <div
                        key={entry.id}
                        className={`rounded-xl border bg-white p-3 shadow-2xs transition-colors ${
                          isRowEditing
                            ? "border-blue-300 ring-2 ring-blue-100"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {isRowEditing ? (
                          <div className="space-y-2.5">
                            <div className="flex flex-col sm:flex-row gap-2">
                              <select
                                value={editTeacherId}
                                onChange={(e) => setEditTeacherId(e.target.value)}
                                className="flex-1 h-9 px-2.5 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                              >
                                {(journalData?.teachers || []).map((teacher) => (
                                  <option key={teacher.id} value={teacher.id}>
                                    {teacher.name}
                                  </option>
                                ))}
                              </select>

                              <div className="relative w-28 shrink-0">
                                <input
                                  type="number"
                                  min={1}
                                  max={50000}
                                  step={1}
                                  value={editPages}
                                  onChange={(e) => setEditPages(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleSaveEdit(entry.id);
                                    }
                                  }}
                                  aria-label={t("pagesAria")}
                                  className="w-full h-9 px-2.5 pe-7 rounded-lg border border-gray-300 bg-white text-xs font-mono font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                                />
                                <span className="absolute end-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 pointer-events-none">
                                  p.
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                disabled={isSavingEdit}
                                className="px-2.5 py-1 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-600 cursor-pointer transition-colors"
                              >
                                {t("cancelEdit")}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(entry.id)}
                                disabled={isSavingEdit}
                                className="px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{t("saveEdit")}</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs sm:text-sm font-bold text-gray-900 truncate">
                                  {entry.teacherName}
                                </span>
                                <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-mono font-bold text-xs shrink-0">
                                  {t("pagesUnit", { pages: entry.pages })}
                                </span>
                                {isOwner && typeof entry.costAmount === "number" && (
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-semibold text-[11px] shrink-0">
                                    {formatDZD(entry.costAmount, locale)}
                                  </span>
                                )}
                                {entry.isEdited && (
                                  <span
                                    className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-semibold shrink-0"
                                    title={editDetailText || undefined}
                                  >
                                    {t("editedBadge")}
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-gray-500">
                                <span
                                  className="inline-flex items-center gap-1 font-mono text-gray-600"
                                  dir="ltr"
                                >
                                  <Clock className="w-3 h-3 text-gray-400" />
                                  {showDateInRows
                                    ? `${formatDisplayDate(entry.algiersDateStr)} ${entry.algiersTimeStr}`
                                    : entry.algiersTimeStr}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <User className="w-3 h-3 text-gray-400" />
                                  <span>{t("recordedBy", { name: entry.recordedByName })}</span>
                                </span>
                              </div>

                              {editDetailText && (
                                <p className="text-[10px] text-indigo-600 font-medium">
                                  {editDetailText}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {isRowConfirmDelete ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmDelete(entry.id)}
                                    disabled={isDeleting}
                                    className="px-2 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold cursor-pointer transition-colors disabled:opacity-50"
                                  >
                                    {t("confirmDelete")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    disabled={isDeleting}
                                    className="p-1 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 cursor-pointer"
                                    title={t("cancelEdit")}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : entry.canEdit || entry.canDelete ? (
                                <>
                                  {entry.canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => handleStartEdit(entry)}
                                      className="p-1.5 rounded-md border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-200 text-gray-500 hover:text-blue-600 cursor-pointer transition-colors"
                                      title={t("editAction")}
                                      aria-label={t("editAction")}
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {entry.canDelete && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingId(null);
                                        setConfirmDeleteId(entry.id);
                                      }}
                                      className="p-1.5 rounded-md border border-gray-200 bg-white hover:bg-red-50 hover:border-red-200 text-gray-500 hover:text-red-600 cursor-pointer transition-colors"
                                      title={t("deleteAction")}
                                      aria-label={t("deleteAction")}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-gray-500 text-[10px] font-medium border border-gray-200"
                                  title={
                                    entry.lockReason === "PAID_PAYROLL"
                                      ? t("lockedPaidPayroll")
                                      : t("lockedPreviousDay")
                                  }
                                >
                                  <Lock className="w-3 h-3" />
                                  <span className="hidden sm:inline">
                                    {entry.lockReason === "PAID_PAYROLL"
                                      ? t("lockedPaidPayroll")
                                      : t("lockedPreviousDay")}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
