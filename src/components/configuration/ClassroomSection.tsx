"use client";

import React, { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataTable, Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select } from "@/components/ui/FormField";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import {
  createClassroomAction,
  updateClassroomAction,
  deleteClassroomAction,
} from "@/lib/configurationActions";
import { toast } from "react-toastify";
import {
  DoorOpen,
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  Filter,
  Calendar,
} from "lucide-react";

export interface ClassroomItem {
  id: number;
  name: string;
  branchId: number;
  branchName?: string;
  lessonsCount?: number;
}

interface ClassroomSectionProps {
  classrooms: ClassroomItem[];
  branches: Array<{ id: number; name: string }>;
}

export default function ClassroomSection({
  classrooms,
  branches,
}: ClassroomSectionProps) {
  const t = useTranslations("configuration.classrooms");
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

  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>("all");

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedClassroom, setSelectedClassroom] = useState<ClassroomItem | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<ClassroomItem | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState(branches[0]?.id ? String(branches[0].id) : "");

  const openCreateModal = () => {
    setModalMode("create");
    setSelectedClassroom(null);
    setName("");
    setBranchId(branches[0]?.id ? String(branches[0].id) : "");
    setIsModalOpen(true);
  };

  const openEditModal = (room: ClassroomItem) => {
    setModalMode("edit");
    setSelectedClassroom(room);
    setName(room.name);
    setBranchId(String(room.branchId));
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        if (!name.trim()) {
          toast.error("Le nom de la salle est requis / اسم القاعة مطلوب");
          return;
        }
        if (!branchId) {
          toast.error("Veuillez sélectionner un siège / يرجى اختيار الفرع");
          return;
        }

        if (modalMode === "create") {
          const res = await createClassroomAction(
            { success: false, error: false },
            { name: name.trim(), branchId: Number(branchId) }
          );
          if (res.success) {
            toast.success(res.message || "Salle créée avec succès / تم إنشاء القاعة بنجاح");
            setIsModalOpen(false);
          } else {
            toast.error(res.message || "Échec de création de la salle / فشل في إنشاء القاعة");
          }
        } else {
          if (!selectedClassroom) return;
          const res = await updateClassroomAction(
            { success: false, error: false },
            { id: selectedClassroom.id, name: name.trim(), branchId: Number(branchId) }
          );
          if (res.success) {
            toast.success(res.message || "Salle mise à jour avec succès / تم تحديث القاعة بنجاح");
            setIsModalOpen(false);
          } else {
            toast.error(res.message || "Échec de mise à jour de la salle / فشل في تحديث القاعة");
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
        const res = await deleteClassroomAction({ success: false, error: false }, fd);
        if (res.success) {
          toast.success(res.message || "Salle supprimée avec succès / تم حذف القاعة بنجاح");
          setDeleteTarget(null);
        } else {
          toast.error(res.message || "Impossible de supprimer la salle / فشل في حذف القاعة");
        }
      } catch (err: any) {
        toast.error(err?.message || "Une erreur est survenue / حدث خطأ غير متوقع");
      }
    });
  };

  // Filter classrooms by branch and search term
  const filteredClassrooms = classrooms.filter((room) => {
    const matchesBranch =
      selectedBranchFilter === "all" ||
      String(room.branchId) === selectedBranchFilter;
    const matchesSearch =
      (room.name || "").toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      (room.branchName || "").toLowerCase().includes(debouncedSearch.toLowerCase());
    return matchesBranch && matchesSearch;
  });

  const columns: Column<ClassroomItem>[] = [
    {
      header: t("roomName"),
      accessor: "name",
      className: "font-semibold text-gray-900",
    },
    {
      header: t("branch"),
      accessor: "branchName",
    },
    {
      header: t("scheduledLessons"),
      accessor: "lessonsCount",
    },
    {
      header: tCommon("actions"),
      accessor: "action",
      align: "end",
    },
  ];

  const renderRow = (item: ClassroomItem) => (
    <tr
      key={item.id}
      className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
    >
      <td className="py-3 px-4 font-semibold text-gray-900">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center text-accent-hover shrink-0">
            <DoorOpen className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900">{item.name}</div>
            <div className="text-[11px] text-muted font-mono">ID #{item.id}</div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        <Badge variant="neutral" size="sm">
          {item.branchName || `Branch #${item.branchId}`}
        </Badge>
      </td>
      <td className="py-3 px-4">
        {item.lessonsCount && item.lessonsCount > 0 ? (
          <Badge variant="primary" size="sm" className="font-semibold font-mono px-2.5">
            {item.lessonsCount}
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

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <DoorOpen className="w-5 h-5 text-accent-hover" />
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
              {t("createClassroom")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 pt-0">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
            <div className="w-full sm:w-64 relative">
              <Search className="w-4 h-4 text-muted absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`${tCommon("search")}...`}
                className="ps-9 h-10 text-sm"
              />
            </div>
            <div className="w-full sm:w-56 flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted shrink-0" />
              <Select
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="h-10 text-sm"
              >
                <option value="all">{t("allBranches")}</option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <DataTable
            columns={columns}
            data={filteredClassrooms}
            renderRow={renderRow}
            emptyTitle={t("noClassrooms")}
            emptyDescription={t("noClassroomsDesc")}
          />
        </CardContent>
      </Card>

      {/* CREATE / EDIT CLASSROOM MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface rounded-xl border border-border shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-border/80 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <DoorOpen className="w-4 h-4 text-accent-hover" />
                {modalMode === "create" ? t("createClassroom") : t("editClassroom")}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
              <FormField label={t("roomName")} required>
                <Input
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("roomNamePlaceholder")}
                />
              </FormField>

              <FormField label={t("branch")} required>
                <Select
                  required
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </FormField>

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
                {t("deleteClassroom")}
              </h3>
            </div>
            <p className="text-table-body text-muted-dark mb-4">
              {t("deleteConfirm")}
            </p>
            <div className="p-3 bg-surface-subtle rounded-lg border border-border/60 mb-6 text-sm">
              <span className="font-semibold text-gray-900">
                {deleteTarget.name}
              </span>{" "}
              <span className="text-muted">
                ({deleteTarget.branchName || `Branch #${deleteTarget.branchId}`})
              </span>
              {deleteTarget.lessonsCount && deleteTarget.lessonsCount > 0 && (
                <div className="text-danger text-xs mt-2 font-medium">
                  ⚠️ {deleteTarget.lessonsCount} cours sont programmés dans cette salle.
                </div>
              )}
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
