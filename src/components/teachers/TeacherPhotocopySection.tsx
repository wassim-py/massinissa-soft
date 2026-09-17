"use client";

import { useState, useTransition, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, Column } from "@/components/ui/DataTable";
import { recordTeacherPhotocopyAction } from "@/lib/actions";
import { toast } from "react-toastify";
import { Printer, Plus, Filter, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

export interface PhotocopyItem {
  id: number;
  branchId: number;
  branchName: string;
  classId?: number | null;
  className?: string | null;
  pages: number;
  costAmount: number;
  date: Date | string;
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

const formatDZD = (num: number, locale: string) =>
  `${Number(num || 0).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD`;

export default function TeacherPhotocopySection({
  teacherId,
  teacherName,
  initialCharges,
  branches,
  groups,
  ratePerPage,
}: {
  teacherId: string;
  teacherName: string;
  initialCharges: PhotocopyItem[];
  branches: OptionItem[];
  groups: OptionItem[];
  ratePerPage: number;
}) {
  const t = useTranslations("teacherProfile");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state for adding new photocopy charge
  const [newBranchId, setNewBranchId] = useState<string>(
    branches[0]?.id ? String(branches[0].id) : ""
  );
  const [newGroupId, setNewGroupId] = useState<string>("");
  const [newPages, setNewPages] = useState<number>(10);
  const [isPending, startTransition] = useTransition();

  // Filtered charges
  const filteredCharges = useMemo(() => {
    return initialCharges.filter((charge) => {
      if (selectedBranchId !== "all" && String(charge.branchId) !== selectedBranchId) {
        return false;
      }
      if (selectedGroupId !== "all") {
        if (!charge.classId || String(charge.classId) !== selectedGroupId) {
          return false;
        }
      }
      return true;
    });
  }, [initialCharges, selectedBranchId, selectedGroupId]);

  // Aggregate totals from filtered charges
  const totalFilteredPages = filteredCharges.reduce((sum, c) => sum + c.pages, 0);
  const totalFilteredCost = filteredCharges.reduce((sum, c) => sum + c.costAmount, 0);

  const photocopyColumns: Column<PhotocopyItem>[] = [
    { header: t("colId"), accessor: "id" },
    { header: t("colPagesCount"), accessor: "pages", align: "center" },
    { header: t("colCalculatedCost"), accessor: "costAmount", align: "end" },
    { header: t("colBranch"), accessor: "branchName" },
    { header: t("colBeneficiaryGroup"), accessor: "className" },
    { header: t("colRecordDate"), accessor: "date" },
    { header: t("colRecordedBy"), accessor: "recordedBy" },
  ];

  const handleRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPages < 1) {
      toast.error(locale === "ar" ? "يرجى إدخال عدد صفحات صالح (1 على الأقل)" : "Veuillez entrer un nombre de pages valide (au moins 1)");
      return;
    }

    startTransition(async () => {
      const res = await recordTeacherPhotocopyAction({
        teacherId,
        pages: newPages,
        branchId: newBranchId ? Number(newBranchId) : undefined,
        classId: newGroupId ? Number(newGroupId) : null,
      });

      if (res.success) {
        toast.success(res.message);
        setIsModalOpen(false);
        setNewPages(10);
      } else {
        toast.error(res.message || (locale === "ar" ? "فشل تسجيل تكلفة النسخ" : "Échec de l'enregistrement"));
      }
    });
  };

  return (
    <Card className="border-border/80 shadow-xs">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-primary" />
              <span>{t("photocopyTitleFull")}</span>
            </CardTitle>
            <CardDescription className="mt-1">
              {t("photocopyDescFull", { rate: ratePerPage })}
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
              {t("recordNewPhotocopy")}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {/* Filter Bar */}
        <div className="bg-surface-subtle/70 p-3 rounded-xl border border-border/80 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-muted-dark text-xs">
              <Filter className="w-3.5 h-3.5 text-muted" />
              <span className="font-semibold">{t("filterBy")}</span>
            </div>

            {/* Branch Filter */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="filter-branch" className="text-xs text-muted">
                {t("branchFilter")}
              </label>
              <select
                id="filter-branch"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="text-xs border border-border/80 bg-surface rounded-lg px-2.5 py-1.5 text-gray-900 shadow-xs focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="all">{t("allBranches")}</option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    🏢 {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Group Filter */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="filter-group" className="text-xs text-muted">
                {t("groupFilter")}
              </label>
              <select
                id="filter-group"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="text-xs border border-border/80 bg-surface rounded-lg px-2.5 py-1.5 text-gray-900 shadow-xs focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="all">{t("allGroups")}</option>
                {groups.map((g) => (
                  <option key={g.id} value={String(g.id)}>
                    👥 {g.name}
                  </option>
                ))}
              </select>
            </div>

            {(selectedBranchId !== "all" || selectedGroupId !== "all") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedBranchId("all");
                  setSelectedGroupId("all");
                }}
                className="text-xs text-primary hover:text-primary-hover"
                leftIcon={<X className="w-3.5 h-3.5" />}
              >
                {t("resetFilter")}
              </Button>
            )}
          </div>

          {/* Aggregated Totals matching active filters */}
          <div className="flex items-center gap-2">
            <Badge variant="warning" size="md">
              {t("pagesKpi")} <strong className="ms-1">{totalFilteredPages}</strong>
            </Badge>
            <Badge variant="danger" size="md">
              {t("deductionKpi")} <strong className="ms-1">{formatDZD(totalFilteredCost, locale)}</strong>
            </Badge>
          </div>
        </div>

        {/* Photocopy Charges Audit Table using DataTable */}
        <DataTable
          columns={photocopyColumns}
          data={filteredCharges}
          renderRow={(charge) => (
            <tr
              key={charge.id}
              className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
            >
              <td className="p-3.5 text-muted text-xs">
                #{charge.id}
              </td>
              <td className="p-3.5 text-center font-bold text-gray-900">
                {charge.pages} {locale === "ar" ? "صفحة" : "pages"}
              </td>
              <td className="p-3.5 text-end font-bold text-danger">
                {formatDZD(charge.costAmount, locale)}
              </td>
              <td className="p-3.5">
                <Badge variant="secondary" size="sm">
                  🏢 {charge.branchName}
                </Badge>
              </td>
              <td className="p-3.5">
                {charge.className ? (
                  <Badge variant="primary" size="sm">
                    👥 {charge.className}
                  </Badge>
                ) : (
                  <span className="text-muted text-xs">{t("generalNotAssigned")}</span>
                )}
              </td>
              <td className="p-3.5 text-gray-700">
                {formatDate(charge.date, locale)}
              </td>
              <td className="p-3.5 text-muted-dark text-xs">
                {charge.recordedBy}
              </td>
            </tr>
          )}
          emptyTitle={t("emptyPhotocopiesTitle")}
          emptyDescription={t("emptyPhotocopiesDesc")}
        />

        {/* Add Photocopy Modal for Owner */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="max-w-md w-full border border-border shadow-xl bg-surface animate-in fade-in-50 duration-150">
              <CardHeader className="pb-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold">
                    {t("modalPhotocopyTitle", { name: teacherName })}
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
                  <div>
                    <label className="block text-gray-700 font-semibold mb-1.5">
                      {t("executingBranch")}
                    </label>
                    <select
                      value={newBranchId}
                      onChange={(e) => setNewBranchId(e.target.value)}
                      className="w-full border border-border rounded-lg p-2 bg-surface text-gray-900 shadow-xs focus:ring-2 focus:ring-primary/20"
                      required
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={String(b.id)}>
                          🏢 {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-700 font-semibold mb-1.5">
                      {t("beneficiaryGroupOptional")}
                    </label>
                    <select
                      value={newGroupId}
                      onChange={(e) => setNewGroupId(e.target.value)}
                      className="w-full border border-border rounded-lg p-2 bg-surface text-gray-900 shadow-xs focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">{t("noGroupGeneral")}</option>
                      {groups.map((g) => (
                        <option key={g.id} value={String(g.id)}>
                          👥 {g.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-700 font-semibold mb-1.5">
                      {t("copiedPagesCount")}
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={newPages}
                      onChange={(e) => setNewPages(parseInt(e.target.value) || 0)}
                      className="w-full border border-border rounded-lg p-2 bg-surface text-gray-900 font-mono font-bold shadow-xs focus:ring-2 focus:ring-primary/20"
                      required
                    >
                    </input>
                  </div>

                  <div className="bg-surface-subtle/80 p-3.5 rounded-xl border border-border/80 text-gray-800">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted">{t("pricePerPageTeacher")}</span>
                      <span className="font-bold text-gray-900">
                        {formatDZD(ratePerPage, locale)}/{locale === "ar" ? "صفحة" : "page"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-1.5 pt-1.5 border-t border-border/60 font-bold">
                      <span>{t("amountToDeduct")}</span>
                      <span className="text-danger text-sm font-bold">
                        {formatDZD(newPages * ratePerPage, locale)}
                      </span>
                    </div>
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
                      {isPending ? t("recording") : t("confirmAndDeduct")}
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
