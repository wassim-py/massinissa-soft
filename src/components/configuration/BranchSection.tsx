"use client";

import React, { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataTable, Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/FormField";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import {
  createBranchAction,
  updateBranchAction,
} from "@/lib/configurationActions";
import { toast } from "react-toastify";
import {
  Building2,
  Plus,
  Pencil,
  X,
  DoorOpen,
} from "lucide-react";

export interface BranchItem {
  id: number;
  name: string;
  address?: string;
  phone?: string | null;
  manager?: string | null;
  classroomsCount?: number;
}

interface BranchSectionProps {
  branches: BranchItem[];
}

export default function BranchSection({ branches }: BranchSectionProps) {
  const t = useTranslations("configuration.branches");
  const tCommon = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedBranch, setSelectedBranch] = useState<BranchItem | null>(null);

  // Form field state - only name field as requested by owner
  const [name, setName] = useState("");

  const openCreateModal = () => {
    setModalMode("create");
    setSelectedBranch(null);
    setName("");
    setIsModalOpen(true);
  };

  const openEditModal = (branch: BranchItem) => {
    setModalMode("edit");
    setSelectedBranch(branch);
    setName(branch.name);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        if (!name.trim()) {
          toast.error("Le nom de la branche est requis / اسم الفرع مطلوب");
          return;
        }

        if (modalMode === "create") {
          const res = await createBranchAction(
            { success: false, error: false },
            { name: name.trim(), address: "" }
          );
          if (res.success) {
            toast.success(res.message || "Branche créée avec succès / تم إنشاء الفرع بنجاح");
            setIsModalOpen(false);
          } else {
            toast.error(res.message || "Échec de création de la branche / فشل في إنشاء الفرع");
          }
        } else {
          if (!selectedBranch) return;
          const res = await updateBranchAction(
            { success: false, error: false },
            { id: selectedBranch.id, name: name.trim(), address: selectedBranch.address || "" }
          );
          if (res.success) {
            toast.success(res.message || "Branche mise à jour avec succès / تم تحديث الفرع بنجاح");
            setIsModalOpen(false);
          } else {
            toast.error(res.message || "Échec de mise à jour de la branche / فشل في تحديث الفرع");
          }
        }
      } catch (err: any) {
        toast.error(err?.message || "Une erreur est survenue / حدث خطأ غير متوقع");
      }
    });
  };

  const columns: Column<BranchItem>[] = [
    {
      header: t("name"),
      accessor: "name",
      className: "font-semibold text-gray-900",
    },
    {
      header: t("classroomsCount"),
      accessor: "classroomsCount",
    },
    {
      header: tCommon("actions"),
      accessor: "action",
      align: "end",
    },
  ];

  const renderRow = (item: BranchItem) => (
    <tr
      key={item.id}
      className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
    >
      <td className="py-3 px-4 font-semibold text-gray-900">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-secondary-light flex items-center justify-center text-secondary shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900">{item.name}</div>
            <div className="text-[11px] text-muted font-mono">ID #{item.id}</div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        {item.classroomsCount && item.classroomsCount > 0 ? (
          <Badge variant="secondary" size="sm" className="font-semibold font-mono px-2.5">
            {item.classroomsCount}
          </Badge>
        ) : (
          <Badge variant="neutral" size="sm" className="font-mono text-muted px-2.5">
            0
          </Badge>
        )}
      </td>
      <td className="py-3 px-4 text-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => openEditModal(item)}
          className="h-8 px-2.5"
        >
          <Pencil className="w-3.5 h-3.5 text-gray-600" />
          <span className="hidden sm:inline ms-1">{tCommon("edit")}</span>
        </Button>
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
                <Building2 className="w-5 h-5 text-secondary" />
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
              {t("createBranch")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 pt-0">
          <DataTable
            columns={columns}
            data={branches}
            renderRow={renderRow}
            emptyTitle={t("noBranches")}
            emptyDescription={t("noBranchesDesc")}
          />
        </CardContent>
      </Card>

      {/* CREATE / EDIT BRANCH MODAL (Name only, per requirement) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface rounded-xl border border-border shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-border/80 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-secondary" />
                {modalMode === "create" ? t("createBranch") : t("editBranch")}
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
    </div>
  );
}
