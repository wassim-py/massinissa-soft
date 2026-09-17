"use client";

import React, { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataTable, Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select } from "@/components/ui/FormField";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import {
  createAccountAction,
  updateAccountAction,
  deleteAccountAction,
} from "@/lib/configurationActions";
import { toast } from "react-toastify";
import {
  UserPlus,
  Pencil,
  Trash2,
  X,
  Search,
  KeyRound,
  Shield,
  Building2,
  User,
} from "lucide-react";

export interface AccountItem {
  id: string;
  username: string | null;
  password?: string | null;
  name: string;
  email: string | null;
  role: "OWNER" | "BRANCH_ADMIN" | "TEACHER";
  branchId: number | null;
  Branch?: { id: number; name: string } | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface AccountSectionProps {
  accounts: AccountItem[];
  branches: Array<{ id: number; name: string }>;
}

export default function AccountSection({
  accounts,
  branches,
}: AccountSectionProps) {
  const t = useTranslations("configuration.accounts");
  const tCommon = useTranslations("common");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const [isPending, startTransition] = useTransition();

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedAccount, setSelectedAccount] = useState<AccountItem | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<AccountItem | null>(null);

  // Form fields state
  const [formData, setFormData] = useState({
    id: "",
    username: "",
    password: "",
    name: "",
    role: "BRANCH_ADMIN" as "OWNER" | "BRANCH_ADMIN",
    branchId: branches[0]?.id ? String(branches[0].id) : "",
  });

  const openCreateModal = () => {
    setModalMode("create");
    setSelectedAccount(null);
    setFormData({
      id: "",
      username: "",
      password: "",
      name: "",
      role: "BRANCH_ADMIN",
      branchId: branches[0]?.id ? String(branches[0].id) : "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (account: AccountItem) => {
    setModalMode("edit");
    setSelectedAccount(account);
    setFormData({
      id: account.id,
      username: account.username || "",
      password: "", // Left empty unless changing
      name: account.name || "",
      role: account.role === "OWNER" ? "OWNER" : "BRANCH_ADMIN",
      branchId: account.branchId ? String(account.branchId) : (branches[0]?.id ? String(branches[0].id) : ""),
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload: any = {
          id: formData.id,
          username: formData.username.trim(),
          password: formData.password ? formData.password.trim() : undefined,
          name: formData.name.trim(),
          role: formData.role,
          branchId: formData.role === "OWNER" ? null : (formData.branchId ? Number(formData.branchId) : null),
        };

        if (modalMode === "create") {
          const res = await createAccountAction({ success: false, error: false }, payload);
          if (res.success) {
            toast.success(res.message || "Compte créé avec succès / تم إنشاء الحساب بنجاح");
            setIsModalOpen(false);
          } else {
            toast.error(res.message || "Erreur lors de la création / فشل في إنشاء الحساب");
          }
        } else {
          const res = await updateAccountAction({ success: false, error: false }, payload);
          if (res.success) {
            toast.success(res.message || "Compte mis à jour avec succès / تم تحديث الحساب بنجاح");
            setIsModalOpen(false);
          } else {
            toast.error(res.message || "Erreur lors de la mise à jour / فشل في تحديث الحساب");
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
        fd.append("id", deleteTarget.id);
        const res = await deleteAccountAction({ success: false, error: false }, fd);
        if (res.success) {
          toast.success(res.message || "Compte supprimé avec succès / تم حذف الحساب بنجاح");
          setDeleteTarget(null);
        } else {
          toast.error(res.message || "Erreur lors de la suppression / فشل في حذف الحساب");
        }
      } catch (err: any) {
        toast.error(err?.message || "Une erreur est survenue / حدث خطأ غير متوقع");
      }
    });
  };

  // Filter accounts by search query
  const filteredAccounts = accounts.filter((acc) => {
    const q = debouncedSearch.toLowerCase();
    const u = (acc.username || "").toLowerCase();
    const n = (acc.name || "").toLowerCase();
    return u.includes(q) || n.includes(q);
  });

  const columns: Column<AccountItem>[] = [
    {
      header: t("username"),
      accessor: "username",
      className: "font-semibold text-gray-900",
    },
    {
      header: t("name"),
      accessor: "name",
    },
    {
      header: t("role"),
      accessor: "role",
    },
    {
      header: t("branch"),
      accessor: "branch",
    },
    {
      header: t("passwordCol"),
      accessor: "password",
    },
    {
      header: tCommon("actions"),
      accessor: "action",
      align: "end",
    },
  ];

  const renderRoleBadge = (role: string) => {
    switch (role) {
      case "OWNER":
        return (
          <Badge variant="primary" size="sm" withDot>
            Propriétaire / المالك
          </Badge>
        );
      case "BRANCH_ADMIN":
        return (
          <Badge variant="secondary" size="sm" withDot>
            Responsable Siège / مسؤول الفرع
          </Badge>
        );
      case "TEACHER":
        return (
          <Badge variant="neutral" size="sm" withDot>
            Enseignant / أستاذ
          </Badge>
        );
      default:
        return <Badge variant="neutral" size="sm">{role}</Badge>;
    }
  };

  const renderRow = (item: AccountItem) => (
    <tr
      key={item.id}
      className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
    >
      <td className="py-3 px-4 font-semibold text-gray-900">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary-light flex items-center justify-center text-primary shrink-0">
            <User className="w-4 h-4" />
          </div>
          <div className="font-mono text-xs text-primary font-bold">
            {item.username || item.id}
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-gray-800 font-medium">{item.name}</td>
      <td className="py-3 px-4">{renderRoleBadge(item.role)}</td>
      <td className="py-3 px-4">
        {item.role === "OWNER" ? (
          <Badge variant="primary" size="sm">
            {t("allBranches")}
          </Badge>
        ) : item.Branch?.name ? (
          <Badge variant="neutral" size="sm">
            {item.Branch.name}
          </Badge>
        ) : (
          <span className="text-muted text-xs">—</span>
        )}
      </td>
      <td className="py-3 px-4">
        <span className="font-mono text-xs tracking-widest text-muted-dark bg-surface-muted px-2 py-0.5 rounded border border-border/60">
          ••••••••
        </span>
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
      {/* Top Header Card */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-primary" />
                {t("title")}
              </CardTitle>
              <CardDescription className="mt-1">
                {t("description")}
              </CardDescription>
            </div>
            <Button
              variant="primary"
              size="md"
              leftIcon={<UserPlus className="w-4 h-4" />}
              onClick={openCreateModal}
            >
              {t("createAccount")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 pt-0">
          {/* Search bar */}
          <div className="mb-4 max-w-sm relative">
            <Search className="w-4 h-4 text-muted absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`${tCommon("search")}...`}
              className="ps-9 h-10 text-sm"
            />
          </div>

          {/* DataTable */}
          <DataTable
            columns={columns}
            data={filteredAccounts}
            renderRow={renderRow}
            emptyTitle={t("noAccounts")}
            emptyDescription={t("noAccountsDesc")}
          />
        </CardContent>
      </Card>

      {/* CREATE / EDIT ACCOUNT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-surface rounded-xl border border-border shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-border/80 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                {modalMode === "create" ? t("createAccount") : t("editAccount")}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label={t("username")} required>
                  <Input
                    required
                    value={formData.username}
                    onChange={(e) =>
                      setFormData({ ...formData, username: e.target.value })
                    }
                    placeholder="ex. admin_ecole"
                  />
                </FormField>

                <FormField
                  label={t("password")}
                  required={modalMode === "create"}
                  helperText={
                    modalMode === "edit"
                      ? t("passwordPlaceholderEdit")
                      : undefined
                  }
                >
                  <Input
                    type="password"
                    required={modalMode === "create"}
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    placeholder={
                      modalMode === "create"
                        ? t("passwordPlaceholderNew")
                        : "••••••••"
                    }
                  />
                </FormField>
              </div>

              <FormField label={t("name")} required>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="ex. Directeur Mohamed"
                />
              </FormField>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label={t("role")} required>
                  <Select
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        role: e.target.value as any,
                      })
                    }
                  >
                    <option value="BRANCH_ADMIN">Responsable Siège (Branch Admin)</option>
                    <option value="OWNER">Propriétaire (Owner)</option>
                  </Select>
                </FormField>

                {formData.role !== "OWNER" && (
                  <FormField label={t("branch")} required>
                    <Select
                      value={formData.branchId}
                      onChange={(e) =>
                        setFormData({ ...formData, branchId: e.target.value })
                      }
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                )}
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
                {t("deleteAccount")}
              </h3>
            </div>
            <p className="text-table-body text-muted-dark mb-4">
              {t("deleteConfirm")}
            </p>
            <div className="p-3 bg-surface-subtle rounded-lg border border-border/60 mb-6 text-sm">
              <span className="font-semibold text-gray-900">
                {deleteTarget.name}
              </span>{" "}
              <span className="text-muted font-mono">
                (@{deleteTarget.username || deleteTarget.id})
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
