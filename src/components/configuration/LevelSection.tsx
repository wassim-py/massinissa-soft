"use client";

import React, { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataTable, Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/FormField";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import {
  createLevelAction,
  updateLevelAction,
  deleteLevelAction,
} from "@/lib/configurationActions";
import { toast } from "react-toastify";
import {
  GraduationCap,
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  BookOpen,
  Users,
  Receipt,
  AlertTriangle,
} from "lucide-react";

export interface LevelItem {
  id: number;
  name: string;
  classesCount: number;
  booksCount: number;
  voucherSeriesCount: number;
}

interface LevelSectionProps {
  levels: LevelItem[];
}

export default function LevelSection({ levels }: LevelSectionProps) {
  const t = useTranslations("configuration.levels");
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

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedLevel, setSelectedLevel] = useState<LevelItem | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<LevelItem | null>(null);

  // Form field
  const [name, setName] = useState("");

  const openCreateModal = () => {
    setModalMode("create");
    setSelectedLevel(null);
    setName("");
    setIsModalOpen(true);
  };

  const openEditModal = (level: LevelItem) => {
    setModalMode("edit");
    setSelectedLevel(level);
    setName(level.name);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        if (!name.trim()) {
          toast.error("Le nom du niveau est requis / اسم المستوى مطلوب");
          return;
        }

        if (modalMode === "create") {
          const res = await createLevelAction(
            { success: false, error: false },
            { name: name.trim() }
          );
          if (res.success) {
            toast.success(res.message || "Niveau créé avec succès / تم إنشاء المستوى بنجاح");
            setIsModalOpen(false);
          } else {
            toast.error(res.message || "Échec de création du niveau / فشل في إنشاء المستوى");
          }
        } else {
          if (!selectedLevel) return;
          const res = await updateLevelAction(
            { success: false, error: false },
            { id: selectedLevel.id, name: name.trim() }
          );
          if (res.success) {
            toast.success(res.message || "Niveau mis à jour avec succès / تم تحديث المستوى بنجاح");
            setIsModalOpen(false);
          } else {
            toast.error(res.message || "Échec de mise à jour du niveau / فشل في تحديث المستوى");
          }
        }
      } catch (err: any) {
        toast.error(err?.message || "Une erreur est survenue / حدث خطأ غير متوقع");
      }
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("id", String(deleteTarget.id));
        const res = await deleteLevelAction({ success: false, error: false }, fd);
        if (res.success) {
          toast.success(res.message || "Niveau supprimé avec succès / تم حذف المستوى بنجاح");
          setDeleteTarget(null);
        } else {
          toast.error(res.message || "Impossible de supprimer le niveau / فشل في حذف المستوى");
        }
      } catch (err: any) {
        toast.error(err?.message || "Une erreur est survenue / حدث خطأ غير متوقع");
      }
    });
  };

  // Filter levels by search term
  const filteredLevels = levels.filter((lvl) =>
    (lvl.name || "").toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  const totalClasses = levels.reduce((sum, l) => sum + (l.classesCount || 0), 0);
  const totalBooks = levels.reduce((sum, l) => sum + (l.booksCount || 0), 0);

  const columns: Column<LevelItem>[] = [
    {
      header: t("name"),
      accessor: "name",
      className: "font-semibold text-gray-900",
    },
    {
      header: t("classesCount"),
      accessor: "classesCount",
    },
    {
      header: t("booksCount"),
      accessor: "booksCount",
    },
    {
      header: t("voucherSeriesCount"),
      accessor: "voucherSeriesCount",
    },
    {
      header: tCommon("actions"),
      accessor: "action",
      align: "end",
    },
  ];

  const renderRow = (item: LevelItem) => (
    <tr
      key={item.id}
      className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
    >
      <td className="py-3 px-4 font-semibold text-gray-900">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-700 shrink-0">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900">{item.name}</div>
            <div className="text-[11px] text-muted font-mono">ID #{item.id}</div>
          </div>
        </div>
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
      <td className="py-3 px-4">
        {item.booksCount > 0 ? (
          <Badge variant="secondary" size="sm" className="font-semibold font-mono px-2.5">
            <BookOpen className="w-3.5 h-3.5" />
            <span>{item.booksCount}</span>
          </Badge>
        ) : (
          <Badge variant="neutral" size="sm" className="font-mono text-muted px-2.5">
            0
          </Badge>
        )}
      </td>
      <td className="py-3 px-4">
        {item.voucherSeriesCount > 0 ? (
          <Badge variant="warning" size="sm" className="font-semibold font-mono px-2.5">
            <Receipt className="w-3.5 h-3.5" />
            <span>{item.voucherSeriesCount}</span>
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
            onClick={() => openEditModal(item)}
            className="h-8 px-2.5"
          >
            <Pencil className="w-3.5 h-3.5 text-gray-600" />
            <span className="hidden sm:inline ms-1">{tCommon("edit")}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteTarget(item)}
            className="h-8 px-2 text-danger hover:bg-danger-light/50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );

  const isDeleteBlocked =
    deleteTarget &&
    (deleteTarget.classesCount > 0 ||
      deleteTarget.booksCount > 0 ||
      deleteTarget.voucherSeriesCount > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 border-border/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-muted font-medium">{t("totalLevels")}</div>
            <div className="text-xl font-bold text-gray-900 font-mono">{levels.length}</div>
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
        <Card className="p-4 border-border/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-secondary-light text-secondary flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-muted font-medium">{t("booksCount")}</div>
            <div className="text-xl font-bold text-gray-900 font-mono">{totalBooks}</div>
          </div>
        </Card>
      </div>

      <Card className="border-border/80 shadow-xs">
        <CardHeader className="p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-purple-700" />
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
              onClick={openCreateModal}
            >
              {t("createLevel")}
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
          {filteredLevels.length > 0 ? (
            <DataTable<LevelItem>
              columns={columns}
              data={filteredLevels}
              renderRow={renderRow}
            />
          ) : (
            <div className="p-8 text-center border border-dashed border-border rounded-xl">
              <GraduationCap className="w-8 h-8 text-muted/50 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-900">{t("noLevels")}</p>
              <p className="text-xs text-muted mt-0.5">{t("noLevelsDesc")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="flex items-center justify-between p-5 border-b border-border bg-surface-subtle/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-gray-900">
                  {modalMode === "create" ? t("createLevel") : t("editLevel")}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted hover:text-gray-900 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
              <FormField label={t("name")} required>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
                  onClick={() => setIsModalOpen(false)}
                  disabled={isPending}
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isPending || !name.trim()}
                >
                  {isPending ? tCommon("loading") : tCommon("save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="p-5 border-b border-border bg-danger-light/20 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-danger-light text-danger flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {t("deleteLevel")}
                </h2>
                <p className="text-xs text-muted">{deleteTarget.name}</p>
              </div>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {isDeleteBlocked ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col gap-2">
                  <div className="font-semibold flex items-center gap-1.5 text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    Suppression impossible / لا يمكن حذف المستوى
                  </div>
                  <p>
                    Ce niveau scolaire ne peut pas être supprimé car des enregistrements y sont liés :
                  </p>
                  <ul className="list-disc ps-5 space-y-0.5 font-medium">
                    {deleteTarget.classesCount > 0 && (
                      <li>{deleteTarget.classesCount} classe(s) / فوج</li>
                    )}
                    {deleteTarget.booksCount > 0 && (
                      <li>{deleteTarget.booksCount} livre(s) / كتاب</li>
                    )}
                    {deleteTarget.voucherSeriesCount > 0 && (
                      <li>{deleteTarget.voucherSeriesCount} série(s) de reçus / سلسلة وصولات</li>
                    )}
                  </ul>
                  <p className="text-[11px] text-amber-700">
                    Veuillez d&apos;abord réassigner ou supprimer les classes et livres associés.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-700">
                  {t("deleteConfirm")} <br />
                  <span className="font-bold text-gray-900 mt-1 inline-block">
                    {deleteTarget.name}
                  </span>
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setDeleteTarget(null)}
                  disabled={isPending}
                >
                  {isDeleteBlocked ? tCommon("close") : tCommon("cancel")}
                </Button>
                {!isDeleteBlocked && (
                  <Button
                    type="button"
                    variant="danger"
                    size="md"
                    onClick={handleDelete}
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
