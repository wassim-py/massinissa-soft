"use client";

import React, { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataTable, Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/FormField";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { createSubject, updateSubject, deleteSubject } from "@/lib/actions";
import { toast } from "react-toastify";
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  Check,
} from "lucide-react";

export interface SubjectItem {
  id: number;
  name: string;
  teachers: Array<{ id: string; name: string }>;
}

interface SubjectSectionProps {
  subjects: SubjectItem[];
  allTeachers: Array<{ id: string; name: string }>;
}

export default function SubjectSection({
  subjects,
  allTeachers,
}: SubjectSectionProps) {
  const t = useTranslations("configuration.subjects");
  const tCommon = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState("");

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedSubject, setSelectedSubject] = useState<SubjectItem | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<SubjectItem | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [teacherSearch, setTeacherSearch] = useState("");

  const openCreateModal = () => {
    setModalMode("create");
    setSelectedSubject(null);
    setName("");
    setSelectedTeacherIds([]);
    setTeacherSearch("");
    setIsModalOpen(true);
  };

  const openEditModal = (subject: SubjectItem) => {
    setModalMode("edit");
    setSelectedSubject(subject);
    setName(subject.name);
    setSelectedTeacherIds(subject.teachers?.map((t) => t.id) || []);
    setTeacherSearch("");
    setIsModalOpen(true);
  };

  const toggleTeacher = (id: string) => {
    setSelectedTeacherIds((prev) =>
      prev.includes(id) ? prev.filter((tId) => tId !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        if (!name.trim()) {
          toast.error("Le nom de la matière est requis / اسم المادة مطلوب");
          return;
        }

        if (modalMode === "create") {
          const res = await createSubject(
            { success: false, error: false },
            { name: name.trim(), teachers: selectedTeacherIds }
          );
          if (res.success) {
            toast.success(res.message || "Matière créée avec succès / تم إنشاء المادة بنجاح");
            setIsModalOpen(false);
          } else {
            toast.error(res.message || "Échec de création de la matière / فشل في إنشاء المادة");
          }
        } else {
          if (!selectedSubject) return;
          const res = await updateSubject(
            { success: false, error: false },
            { id: selectedSubject.id, name: name.trim(), teachers: selectedTeacherIds }
          );
          if (res.success) {
            toast.success(res.message || "Matière mise à jour avec succès / تم تحديث المادة بنجاح");
            setIsModalOpen(false);
          } else {
            toast.error(res.message || "Échec de mise à jour de la matière / فشل في تحديث المادة");
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
        const res = await deleteSubject({ success: false, error: false }, fd);
        if (res.success) {
          toast.success(res.message || "Matière supprimée avec succès / تم حذف المادة بنجاح");
          setDeleteTarget(null);
        } else {
          toast.error(res.message || "Impossible de supprimer la matière / فشل في حذف المادة");
        }
      } catch (err: any) {
        toast.error(err?.message || "Une erreur est survenue / حدث خطأ غير متوقع");
      }
    });
  };

  const filteredSubjects = subjects.filter((s) => {
    const q = searchTerm.toLowerCase();
    const nameMatch = (s.name || "").toLowerCase().includes(q);
    const teacherMatch = (s.teachers || []).some((t) =>
      t.name.toLowerCase().includes(q)
    );
    return nameMatch || teacherMatch;
  });

  const filteredTeachersList = allTeachers.filter((t) =>
    t.name.toLowerCase().includes(teacherSearch.toLowerCase())
  );

  const columns: Column<SubjectItem>[] = [
    {
      header: t("name"),
      accessor: "name",
      className: "font-semibold text-gray-900",
    },
    {
      header: t("teachers"),
      accessor: "teachers",
    },
    {
      header: tCommon("actions"),
      accessor: "action",
      align: "end",
    },
  ];

  const renderRow = (item: SubjectItem) => (
    <tr
      key={item.id}
      className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
    >
      <td className="py-3 px-4 font-semibold text-gray-900">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-light flex items-center justify-center text-primary shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900">{item.name}</div>
            <div className="text-[11px] text-muted font-mono">ID #{item.id}</div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        {item.teachers && item.teachers.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 max-w-md">
            {item.teachers.map((teacher) => (
              <Badge key={teacher.id} variant="neutral" size="sm">
                {teacher.name}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted text-xs">—</span>
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

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
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
              {t("createSubject")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 pt-0">
          <div className="mb-4 max-w-sm relative">
            <Search className="w-4 h-4 text-muted absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`${tCommon("search")}...`}
              className="ps-9 h-10 text-sm"
            />
          </div>

          <DataTable
            columns={columns}
            data={filteredSubjects}
            renderRow={renderRow}
            emptyTitle={t("noSubjects")}
            emptyDescription={t("noSubjectsDesc")}
          />
        </CardContent>
      </Card>

      {/* CREATE / EDIT SUBJECT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface rounded-xl border border-border shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-border/80 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                {modalMode === "create" ? t("createSubject") : t("editSubject")}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
              <FormField label={t("name")} required>
                <Input
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                />
              </FormField>

              {/* Teachers selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-form-label text-gray-700 select-none">
                  {t("teachers")} ({selectedTeacherIds.length})
                </label>
                <div className="border border-border rounded-lg p-3 bg-surface-subtle/50">
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 text-muted absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <Input
                      value={teacherSearch}
                      onChange={(e) => setTeacherSearch(e.target.value)}
                      placeholder={`${tCommon("search")}...`}
                      className="ps-8 h-8 text-xs"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-border/40">
                    {filteredTeachersList.length > 0 ? (
                      filteredTeachersList.map((teacher) => {
                        const isSelected = selectedTeacherIds.includes(teacher.id);
                        return (
                          <div
                            key={teacher.id}
                            onClick={() => toggleTeacher(teacher.id)}
                            className={`flex items-center justify-between py-1.5 px-2 rounded cursor-pointer text-xs transition-colors ${
                              isSelected
                                ? "bg-primary-light/70 text-primary font-medium"
                                : "hover:bg-surface text-gray-700"
                            }`}
                          >
                            <span>{teacher.name}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-xs text-muted text-center py-2">
                        {tCommon("noResults")}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/80 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isPending}
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isPending}
                >
                  {modalMode === "create" ? tCommon("create") : tCommon("save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface rounded-xl border border-border shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 text-danger mb-4">
              <div className="w-10 h-10 rounded-full bg-danger-light flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-gray-900">
                {t("deleteSubject")}
              </h3>
            </div>
            <p className="text-table-body text-muted-dark mb-4">
              {t("deleteConfirm")}
            </p>
            <div className="p-3 bg-surface-subtle rounded-lg border border-border/60 mb-6 text-sm">
              <span className="font-semibold text-gray-900">
                {deleteTarget.name}
              </span>
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={isPending}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={handleDelete}
                isLoading={isPending}
              >
                {tCommon("delete")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
