"use client";

import React, { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataTable, Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/FormField";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import {
  createFormationLanguageAction,
  updateFormationLanguageAction,
  deleteFormationLanguageAction,
  createFormationLevelConfigAction,
  updateFormationLevelConfigAction,
  deleteFormationLevelConfigAction,
} from "@/lib/configurationActions";
import { toast } from "react-toastify";
import {
  Languages,
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  Users,
  Layers,
  AlertTriangle,
  Coins,
  ChevronRight,
} from "lucide-react";

export interface FormationLevelItem {
  id: number;
  languageId: number;
  levelNumber: number;
  name: string;
  lumpSumPrice: number;
  classesCount: number;
  levelTestsCount: number;
}

export interface FormationLanguageItem {
  id: number;
  name: string;
  levelsCount: number;
  classesCount: number;
  levels: FormationLevelItem[];
}

interface FormationLanguageSectionProps {
  languages: FormationLanguageItem[];
}

export default function FormationLanguageSection({
  languages,
}: FormationLanguageSectionProps) {
  const t = useTranslations("configuration.formationLanguages");
  const tCommon = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Language Modal state
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [langModalMode, setLangModalMode] = useState<"create" | "edit">("create");
  const [selectedLang, setSelectedLang] = useState<FormationLanguageItem | null>(null);
  const [langName, setLangName] = useState("");

  // Delete Language state
  const [deleteLangTarget, setDeleteLangTarget] = useState<FormationLanguageItem | null>(null);

  // Level Management Modal state
  const [activeManagingLang, setActiveManagingLang] = useState<FormationLanguageItem | null>(null);

  // Level Create / Edit Modal state
  const [isLevelModalOpen, setIsLevelModalOpen] = useState(false);
  const [levelModalMode, setLevelModalMode] = useState<"create" | "edit">("create");
  const [selectedLevel, setSelectedLevel] = useState<FormationLevelItem | null>(null);
  const [levelName, setLevelName] = useState("");
  const [levelNumber, setLevelNumber] = useState<string>("");
  const [lumpSumPrice, setLumpSumPrice] = useState<string>("12000");

  // Delete Level state
  const [deleteLevelTarget, setDeleteLevelTarget] = useState<FormationLevelItem | null>(null);

  // Keep active managing lang synced with updated props
  const currentManagingLang = activeManagingLang
    ? languages.find((l) => l.id === activeManagingLang.id) || activeManagingLang
    : null;

  // --- LANGUAGE HANDLERS ---
  const openCreateLangModal = () => {
    setLangModalMode("create");
    setSelectedLang(null);
    setLangName("");
    setIsLangModalOpen(true);
  };

  const openEditLangModal = (lang: FormationLanguageItem) => {
    setLangModalMode("edit");
    setSelectedLang(lang);
    setLangName(lang.name);
    setIsLangModalOpen(true);
  };

  const handleLangSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        if (!langName.trim()) {
          toast.error("Le nom de la langue est requis / اسم اللغة مطلوب");
          return;
        }

        if (langModalMode === "create") {
          const res = await createFormationLanguageAction(
            { success: false, error: false },
            { name: langName.trim() }
          );
          if (res.success) {
            toast.success(res.message || "Langue créée avec succès / تم إنشاء اللغة بنجاح");
            setIsLangModalOpen(false);
          } else {
            toast.error(res.message || "Échec de création de la langue / فشل في إنشاء اللغة");
          }
        } else {
          if (!selectedLang) return;
          const res = await updateFormationLanguageAction(
            { success: false, error: false },
            { id: selectedLang.id, name: langName.trim() }
          );
          if (res.success) {
            toast.success(res.message || "Langue mise à jour avec succès / تم تحديث اللغة بنجاح");
            setIsLangModalOpen(false);
          } else {
            toast.error(res.message || "Échec de mise à jour de la langue / فشل في تحديث اللغة");
          }
        }
      } catch (err: any) {
        toast.error(err?.message || "Une erreur est survenue / حدث خطأ غير متوقع");
      }
    });
  };

  const handleDeleteLang = () => {
    if (!deleteLangTarget) return;
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("id", String(deleteLangTarget.id));
        const res = await deleteFormationLanguageAction({ success: false, error: false }, fd);
        if (res.success) {
          toast.success(res.message || "Langue supprimée avec succès / تم حذف اللغة بنجاح");
          if (activeManagingLang?.id === deleteLangTarget.id) {
            setActiveManagingLang(null);
          }
          setDeleteLangTarget(null);
        } else {
          toast.error(res.message || "Impossible de supprimer la langue / فشل في حذف اللغة");
        }
      } catch (err: any) {
        toast.error(err?.message || "Une erreur est survenue / حدث خطأ غير متوقع");
      }
    });
  };

  // --- LEVEL HANDLERS ---
  const openCreateLevelModal = (lang: FormationLanguageItem) => {
    setLevelModalMode("create");
    setSelectedLevel(null);
    const nextNum = (lang.levels?.length || 0) + 1;
    setLevelNumber(String(nextNum));
    setLevelName(`Niveau ${nextNum}`);
    setLumpSumPrice("12000");
    setIsLevelModalOpen(true);
  };

  const openEditLevelModal = (lvl: FormationLevelItem) => {
    setLevelModalMode("edit");
    setSelectedLevel(lvl);
    setLevelNumber(String(lvl.levelNumber));
    setLevelName(lvl.name);
    setLumpSumPrice(String(lvl.lumpSumPrice));
    setIsLevelModalOpen(true);
  };

  const handleLevelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentManagingLang) return;

    startTransition(async () => {
      try {
        if (!levelName.trim()) {
          toast.error("Le nom du niveau est requis / اسم المستوى مطلوب");
          return;
        }

        const parsedPrice = Number(lumpSumPrice) || 0;
        const parsedNum = Number(levelNumber) || 1;

        if (levelModalMode === "create") {
          const res = await createFormationLevelConfigAction(
            { success: false, error: false },
            {
              languageId: currentManagingLang.id,
              levelNumber: parsedNum,
              name: levelName.trim(),
              lumpSumPrice: parsedPrice,
            }
          );
          if (res.success) {
            toast.success(res.message || "Niveau ajouté avec succès / تم إضافة المستوى بنجاح");
            setIsLevelModalOpen(false);
          } else {
            toast.error(res.message || "Échec de l'ajout du niveau / فشل في إضافة المستوى");
          }
        } else {
          if (!selectedLevel) return;
          const res = await updateFormationLevelConfigAction(
            { success: false, error: false },
            {
              id: selectedLevel.id,
              languageId: currentManagingLang.id,
              levelNumber: parsedNum,
              name: levelName.trim(),
              lumpSumPrice: parsedPrice,
            }
          );
          if (res.success) {
            toast.success(res.message || "Niveau mis à jour avec succès / تم تحديث المستوى بنجاح");
            setIsLevelModalOpen(false);
          } else {
            toast.error(res.message || "Échec de mise à jour du niveau / فشل في تحديث المستوى");
          }
        }
      } catch (err: any) {
        toast.error(err?.message || "Une erreur est survenue / حدث خطأ غير متوقع");
      }
    });
  };

  const handleDeleteLevel = () => {
    if (!deleteLevelTarget) return;
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("id", String(deleteLevelTarget.id));
        const res = await deleteFormationLevelConfigAction({ success: false, error: false }, fd);
        if (res.success) {
          toast.success(res.message || "Niveau supprimé avec succès / تم حذف المستوى بنجاح");
          setDeleteLevelTarget(null);
        } else {
          toast.error(res.message || "Impossible de supprimer le niveau / فشل في حذف المستوى");
        }
      } catch (err: any) {
        toast.error(err?.message || "Une erreur est survenue / حدث خطأ غير متوقع");
      }
    });
  };

  // Filter languages by search term
  const filteredLanguages = languages.filter((lang) =>
    (lang.name || "").toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  const totalLevels = languages.reduce((sum, l) => sum + (l.levelsCount || 0), 0);
  const totalClasses = languages.reduce((sum, l) => sum + (l.classesCount || 0), 0);

  const columns: Column<FormationLanguageItem>[] = [
    {
      header: t("name"),
      accessor: "name",
      className: "font-semibold text-gray-900",
    },
    {
      header: t("levelsCount"),
      accessor: "levelsCount",
    },
    {
      header: t("classesCount"),
      accessor: "classesCount",
    },
    {
      header: tCommon("actions"),
      accessor: "action",
      align: "end",
    },
  ];

  const renderRow = (item: FormationLanguageItem) => (
    <tr
      key={item.id}
      className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
    >
      <td className="py-3 px-4 font-semibold text-gray-900">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-700 shrink-0">
            <Languages className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900">{item.name}</div>
            <div className="text-[11px] text-muted font-mono">ID #{item.id}</div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        {item.levelsCount > 0 ? (
          <Badge variant="secondary" size="sm" className="font-semibold font-mono px-2.5">
            <Layers className="w-3.5 h-3.5" />
            <span>{item.levelsCount}</span>
          </Badge>
        ) : (
          <Badge variant="neutral" size="sm" className="font-mono text-muted px-2.5">
            0
          </Badge>
        )}
      </td>
      <td className="py-3 px-4">
        {item.classesCount > 0 ? (
          <Badge variant="primary" size="sm" className="font-semibold font-mono px-2.5">
            <Users className="w-3.5 h-3.5" />
            <span>{item.classesCount}</span>
          </Badge>
        ) : (
          <Badge variant="neutral" size="sm" className="font-mono text-muted px-2.5">
            0
          </Badge>
        )}
      </td>
      <td className="py-3 px-4 text-end">
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveManagingLang(item)}
            className="h-8 px-2.5 text-amber-800 border-amber-200 hover:bg-amber-50"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline ms-1">{t("manageLevels")}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openEditLangModal(item)}
            className="h-8 px-2.5"
          >
            <Pencil className="w-3.5 h-3.5 text-gray-600" />
            <span className="hidden sm:inline ms-1">{tCommon("edit")}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteLangTarget(item)}
            className="h-8 px-2 text-danger hover:bg-danger-light/50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );

  const isLangDeleteBlocked =
    deleteLangTarget && deleteLangTarget.classesCount > 0;

  const isLevelDeleteBlocked =
    deleteLevelTarget && deleteLevelTarget.classesCount > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 border-border/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <Languages className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-muted font-medium">{t("title")}</div>
            <div className="text-xl font-bold text-gray-900 font-mono">{languages.length}</div>
          </div>
        </Card>
        <Card className="p-4 border-border/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-secondary-light text-secondary flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-muted font-medium">{t("levelsCount")}</div>
            <div className="text-xl font-bold text-gray-900 font-mono">{totalLevels}</div>
          </div>
        </Card>
        <Card className="p-4 border-border/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-muted font-medium">{t("classesCount")}</div>
            <div className="text-xl font-bold text-gray-900 font-mono">{totalClasses}</div>
          </div>
        </Card>
      </div>

      <Card className="border-border/80 shadow-xs">
        <CardHeader className="p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Languages className="w-5 h-5 text-amber-700" />
                {t("title")}
              </CardTitle>
              <CardDescription className="mt-1">
                {t("description")}
              </CardDescription>
            </div>
            <Button
              variant="primary"
              size="md"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={openCreateLangModal}
            >
              {t("createLanguage")}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-0">
          {/* Search bar */}
          <div className="mb-4">
            <div className="relative max-w-sm">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("namePlaceholder")}
                className="w-full ps-9 pe-4 py-2 text-xs border border-border rounded-lg bg-surface focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          {/* Table */}
          {filteredLanguages.length > 0 ? (
            <DataTable<FormationLanguageItem>
              columns={columns}
              data={filteredLanguages}
              renderRow={renderRow}
            />
          ) : (
            <div className="p-8 text-center border border-dashed border-border rounded-xl">
              <Languages className="w-8 h-8 text-muted/50 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-900">{t("noLanguages")}</p>
              <p className="text-xs text-muted mt-0.5">{t("noLanguagesDesc")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CREATE / EDIT LANGUAGE MODAL */}
      {isLangModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="flex items-center justify-between p-5 border-b border-border bg-surface-subtle/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                  <Languages className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-gray-900">
                  {langModalMode === "create" ? t("createLanguage") : t("editLanguage")}
                </h2>
              </div>
              <button
                onClick={() => setIsLangModalOpen(false)}
                className="text-muted hover:text-gray-900 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLangSubmit} className="p-5 flex flex-col gap-4">
              <FormField label={t("name")} required>
                <Input
                  value={langName}
                  onChange={(e) => setLangName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                  autoFocus
                  required
                />
              </FormField>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setIsLangModalOpen(false)}
                  disabled={isPending}
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isPending || !langName.trim()}
                >
                  {isPending ? tCommon("loading") : tCommon("save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE LANGUAGE CONFIRMATION MODAL */}
      {deleteLangTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="p-5 border-b border-border bg-danger-light/20 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-danger-light text-danger flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {t("deleteLanguage")}
                </h2>
                <p className="text-xs text-muted">{deleteLangTarget.name}</p>
              </div>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {isLangDeleteBlocked ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col gap-2">
                  <div className="font-semibold flex items-center gap-1.5 text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    Suppression impossible / لا يمكن حذف اللغة
                  </div>
                  <p>
                    Cette langue ne peut pas être supprimée car elle est liée à{" "}
                    <span className="font-bold">{deleteLangTarget.classesCount}</span> groupe(s) de formation actif(s).
                  </p>
                  <p className="text-[11px] text-amber-700">
                    Veuillez d&apos;abord supprimer ou réassigner les groupes de formation rattachés.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-700">
                  {t("deleteConfirm")} <br />
                  <span className="font-bold text-gray-900 mt-1 inline-block">
                    {deleteLangTarget.name}
                  </span>
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setDeleteLangTarget(null)}
                  disabled={isPending}
                >
                  {isLangDeleteBlocked ? tCommon("close") : tCommon("cancel")}
                </Button>
                {!isLangDeleteBlocked && (
                  <Button
                    type="button"
                    variant="danger"
                    size="md"
                    onClick={handleDeleteLang}
                    disabled={isPending}
                  >
                    {isPending ? tCommon("loading") : tCommon("delete")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MANAGE LEVELS MODAL (SUB-PANEL) */}
      {currentManagingLang && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scaleIn">
            <div className="flex items-center justify-between p-5 border-b border-border bg-surface-subtle/70 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                  <Languages className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-gray-900">
                      {currentManagingLang.name}
                    </h2>
                    <Badge variant="secondary" size="sm">
                      {currentManagingLang.levels?.length || 0} {t("levelCount")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted">
                    {t("description")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveManagingLang(null)}
                className="text-muted hover:text-gray-900 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  {t("levelsCount")}
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => openCreateLevelModal(currentManagingLang)}
                >
                  {t("addLevel")}
                </Button>
              </div>

              {currentManagingLang.levels && currentManagingLang.levels.length > 0 ? (
                <div className="border border-border/80 rounded-xl overflow-hidden shadow-2xs divide-y divide-border/60">
                  {currentManagingLang.levels.map((lvl) => (
                    <div
                      key={lvl.id}
                      className="p-3.5 bg-surface hover:bg-surface-subtle/50 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-muted text-gray-700 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                          #{lvl.levelNumber}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            {lvl.name}
                            {lvl.classesCount > 0 && (
                              <Badge variant="primary" size="sm" className="font-mono text-[10px]">
                                <Users className="w-2.5 h-2.5" />
                                <span>{lvl.classesCount} {t("classes")}</span>
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted flex items-center gap-1.5 mt-0.5 font-mono font-semibold text-emerald-700">
                            <Coins className="w-3 h-3 text-emerald-600" />
                            {lvl.lumpSumPrice.toLocaleString()} DZD
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditLevelModal(lvl)}
                          className="h-8 px-2.5 text-xs"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline ms-1">{tCommon("edit")}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteLevelTarget(lvl)}
                          className="h-8 px-2 text-danger hover:bg-danger-light/50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center border border-dashed border-border rounded-xl bg-surface-subtle/30">
                  <Layers className="w-8 h-8 text-muted/50 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-gray-900">{t("noLevelsForLang")}</p>
                  <p className="text-xs text-muted mt-1">
                    Cliquez sur &quot;{t("addLevel")}&quot; pour définir le premier niveau d&apos;apprentissage.
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border bg-surface-subtle/50 flex justify-end shrink-0">
              <Button
                variant="outline"
                size="md"
                onClick={() => setActiveManagingLang(null)}
              >
                {tCommon("close")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT FORMATION LEVEL MODAL */}
      {isLevelModalOpen && currentManagingLang && (
        <div className="fixed inset-0 z-60 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="flex items-center justify-between p-5 border-b border-border bg-surface-subtle/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-secondary-light text-secondary flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-gray-900">
                  {levelModalMode === "create" ? t("addLevel") : t("editLevel")}
                </h2>
              </div>
              <button
                onClick={() => setIsLevelModalOpen(false)}
                className="text-muted hover:text-gray-900 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLevelSubmit} className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <FormField label={t("levelNumber")} required>
                    <Input
                      type="number"
                      min={1}
                      value={levelNumber}
                      onChange={(e) => setLevelNumber(e.target.value)}
                      required
                    />
                  </FormField>
                </div>
                <div className="col-span-2">
                  <FormField label={t("levelName")} required>
                    <Input
                      value={levelName}
                      onChange={(e) => setLevelName(e.target.value)}
                      placeholder={t("levelNamePlaceholder")}
                      autoFocus
                      required
                    />
                  </FormField>
                </div>
              </div>

              <FormField label={t("lumpSumPrice")} required>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    step={500}
                    value={lumpSumPrice}
                    onChange={(e) => setLumpSumPrice(e.target.value)}
                    className="pe-14 font-mono font-semibold"
                    required
                  />
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted">
                    DZD
                  </span>
                </div>
              </FormField>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setIsLevelModalOpen(false)}
                  disabled={isPending}
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isPending || !levelName.trim()}
                >
                  {isPending ? tCommon("loading") : tCommon("save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE FORMATION LEVEL CONFIRMATION MODAL */}
      {deleteLevelTarget && (
        <div className="fixed inset-0 z-60 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="p-5 border-b border-border bg-danger-light/20 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-danger-light text-danger flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {t("deleteLevel")}
                </h2>
                <p className="text-xs text-muted">{deleteLevelTarget.name}</p>
              </div>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {isLevelDeleteBlocked ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col gap-2">
                  <div className="font-semibold flex items-center gap-1.5 text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    Suppression impossible / لا يمكن حذف المستوى
                  </div>
                  <p>
                    Ce niveau de formation est rattaché à{" "}
                    <span className="font-bold">{deleteLevelTarget.classesCount}</span> groupe(s) actif(s).
                  </p>
                  <p className="text-[11px] text-amber-700">
                    Vous devez d&apos;abord réassigner ou terminer ces groupes de formation avant de supprimer le niveau.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-700">
                  {t("deleteLevelConfirm")} <br />
                  <span className="font-bold text-gray-900 mt-1 inline-block">
                    {deleteLevelTarget.name}
                  </span>
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setDeleteLevelTarget(null)}
                  disabled={isPending}
                >
                  {isLevelDeleteBlocked ? tCommon("close") : tCommon("cancel")}
                </Button>
                {!isLevelDeleteBlocked && (
                  <Button
                    type="button"
                    variant="danger"
                    size="md"
                    onClick={handleDeleteLevel}
                    disabled={isPending}
                  >
                    {isPending ? tCommon("loading") : tCommon("delete")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
