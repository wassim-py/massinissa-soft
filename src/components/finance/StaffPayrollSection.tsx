"use client";

import React, { useState, startTransition } from "react";
import ReactDOMServer from "react-dom/server";
import Image from "next/image";
import {
  UserCheck,
  Users,
  Plus,
  DollarSign,
  CheckCircle2,
  Clock,
  Loader2,
  Phone,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  createStaffMemberAction,
  recordStaffPayrollAction,
  updateStaffPayrollAction,
  deleteStaffPayrollAction,
} from "@/lib/financeActions";
import { StaffPayslipTicket, StaffPayslipPrintData } from "@/components/printable/StaffPayslipTicket";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

export interface StaffItem {
  id: number;
  name: string;
  roleTitle: string;
  phone?: string | null;
  branchId: number | null;
  branchName?: string;
  baseSalary: number;
  isActive: boolean;
}

export interface StaffPayrollItem {
  id: number;
  staffMemberId: number;
  staffName: string;
  roleTitle: string;
  phone?: string | null;
  branchName?: string | null;
  month: number;
  year: number;
  amount: number; // base salary
  bonus: number; // prime / bonus cash
  status: string;
  paidAt: string | Date | null;
  notes?: string | null;
}

interface StaffPayrollSectionProps {
  staffMembers: StaffItem[];
  payrollLogs: StaffPayrollItem[];
  branches: Array<{ id: number; name: string }>;
  locale?: string;
}

const MONTH_NAMES_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

const MONTH_NAMES_AR = [
  "جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان",
  "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

export default function StaffPayrollSection({
  staffMembers,
  payrollLogs,
  branches,
  locale: propLocale,
}: StaffPayrollSectionProps) {
  const router = useRouter();
  const t = useTranslations("finance");
  const tModals = useTranslations("modals");
  const tCommon = useTranslations("common");
  const hookLocale = useLocale();
  const locale = propLocale || hookLocale || "fr";
  const numLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const monthNames = locale === "ar" ? MONTH_NAMES_AR : MONTH_NAMES_FR;

  // Modals
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [payrollToDelete, setPayrollToDelete] = useState<StaffPayrollItem | null>(null);

  // New staff form
  const [staffName, setStaffName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [staffBranchId, setStaffBranchId] = useState<string>("all");
  const [baseSalary, setBaseSalary] = useState("");

  // Pay staff form
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [payrollAmount, setPayrollAmount] = useState<string>("");
  const [payrollBonus, setPayrollBonus] = useState<string>("");
  const [payrollNotes, setPayrollNotes] = useState<string>("");
  const [payrollStatus, setPayrollStatus] = useState<"PAID" | "PENDING">("PAID");
  const [editingPayrollId, setEditingPayrollId] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenPayModal = (staff?: StaffItem) => {
    setEditingPayrollId(null);
    if (staff) {
      setSelectedStaffId(String(staff.id));
      setPayrollAmount(String(staff.baseSalary || ""));
    } else if (staffMembers.length > 0) {
      setSelectedStaffId(String(staffMembers[0].id));
      setPayrollAmount(String(staffMembers[0].baseSalary || ""));
    }
    setPayrollBonus("");
    setSelectedMonth(new Date().getMonth() + 1);
    setSelectedYear(new Date().getFullYear());
    setPayrollNotes("");
    setPayrollStatus("PAID");
    setIsPayrollModalOpen(true);
  };

  const handleOpenEditPayrollModal = (p: StaffPayrollItem) => {
    setEditingPayrollId(p.id);
    setSelectedStaffId(String(p.staffMemberId));
    setSelectedMonth(p.month);
    setSelectedYear(p.year);
    setPayrollAmount(String(p.amount));
    setPayrollBonus(p.bonus > 0 ? String(p.bonus) : "");
    setPayrollStatus((p.status as any) || "PAID");
    setPayrollNotes(p.notes || "");
    setIsPayrollModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!payrollToDelete) return;
    setIsDeleting(true);
    try {
      const res = await deleteStaffPayrollAction(payrollToDelete.id);
      if (res.success) {
        toast.success(res.message);
        setPayrollToDelete(null);
        startTransition(() => {
          router.refresh();
        });
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error(
        locale === "ar"
          ? "حدث خطأ غير متوقع أثناء الحذف."
          : "Une erreur est survenue lors de la suppression."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePrintStaffPayslip = (p: StaffPayrollItem) => {
    const printData: StaffPayslipPrintData = {
      id: p.id,
      staffName: p.staffName,
      roleTitle: p.roleTitle,
      phone: p.phone,
      branchName: p.branchName,
      month: p.month,
      year: p.year,
      amount: p.amount,
      bonus: p.bonus || 0,
      totalNet: p.amount + (p.bonus || 0),
      status: p.status,
      paidAt: p.paidAt,
      notes: p.notes,
    };

    const printContent = ReactDOMServer.renderToString(
      <StaffPayslipTicket data={printData} />
    );

    const printWindow = window.open("", "_blank", "width=900,height=800");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="ltr" lang="fr">
          <head>
            <meta charset="utf-8">
            <title>Bulletin de paie #STF-${p.id} - ${p.staffName}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap" rel="stylesheet">
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                background-color: #fff;
                color: #000;
                margin: 0;
                padding: 20px;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              @media print {
                body {
                  margin: 0;
                  padding: 0;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                .no-print { display: none; }
                @page {
                  size: A4 portrait;
                  margin: 8mm;
                }
              }
            </style>
          </head>
          <body>
            ${printContent}
          </body>
        </html>
      `);

      printWindow.document.close();
      printWindow.focus();

      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  };

  const handleStaffChangeInPayModal = (idStr: string) => {
    setSelectedStaffId(idStr);
    const member = staffMembers.find((s) => String(s.id) === idStr);
    if (member && member.baseSalary > 0) {
      setPayrollAmount(String(member.baseSalary));
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim() || !roleTitle.trim()) {
      toast.error(locale === "ar" ? "يرجى ملء الاسم الكامل والوظيفة." : "Veuillez renseigner le nom et le poste.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await createStaffMemberAction({
        name: staffName,
        roleTitle,
        phone,
        branchId: staffBranchId === "all" ? null : Number(staffBranchId),
        baseSalary: Number(baseSalary || 0),
      });

      if (res.success) {
        toast.success(res.message);
        setIsStaffModalOpen(false);
        setStaffName("");
        setRoleTitle("");
        setPhone("");
        setBaseSalary("");
        startTransition(() => {
          router.refresh();
        });
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error(locale === "ar" ? "حدث خطأ غير متوقع." : "Une erreur est survenue.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecordPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId || !payrollAmount || Number(payrollAmount) <= 0) {
      toast.error(locale === "ar" ? "يرجى اختيار الموظف وتحديد المبلغ." : "Veuillez sélectionner un employé et renseigner le montant.");
      return;
    }

    setIsLoading(true);
    try {
      let res;
      if (editingPayrollId) {
        res = await updateStaffPayrollAction(editingPayrollId, {
          staffMemberId: Number(selectedStaffId),
          month: Number(selectedMonth),
          year: Number(selectedYear),
          amount: Number(payrollAmount),
          bonus: Number(payrollBonus || 0),
          status: payrollStatus,
          notes: payrollNotes,
        });
      } else {
        res = await recordStaffPayrollAction({
          staffMemberId: Number(selectedStaffId),
          month: Number(selectedMonth),
          year: Number(selectedYear),
          amount: Number(payrollAmount),
          bonus: Number(payrollBonus || 0),
          status: payrollStatus,
          notes: payrollNotes,
        });
      }

      if (res.success) {
        toast.success(res.message);
        setIsPayrollModalOpen(false);
        startTransition(() => {
          router.refresh();
        });
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error(locale === "ar" ? "حدث خطأ غير متوقع." : "Une erreur est survenue.");
    } finally {
      setIsLoading(false);
    }
  };

  const totalMonthlyStaffPayroll = payrollLogs
    .filter((l) => l.status === "PAID")
    .reduce((sum, l) => sum + l.amount + (l.bonus || 0), 0);

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Top Bar */}
      <Card className="p-4 border-border/80 shadow-xs bg-surface flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span>{t("staffManagement")}</span>
          </h3>
          <p className="text-form-helper text-muted">
            {t("totalStaffSalariesPaid")}{" "}
            <strong className="text-primary font-mono">
              {totalMonthlyStaffPayroll.toLocaleString(numLocale)} {t("currency")}
            </strong>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsStaffModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-surface hover:bg-surface-muted text-gray-700 border border-border px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>{t("newStaffMember")}</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenPayModal()}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95"
          >
            <DollarSign className="w-4 h-4" />
            <span>{t("recordSalary")}</span>
          </button>
        </div>
      </Card>

      {/* Staff Members List */}
      <Card className="p-5 border-border/80 shadow-xs bg-surface">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
          {t("staffMembersCount", { count: staffMembers.length })}
        </h4>

        {staffMembers.length === 0 ? (
          <div className="p-6 text-center text-muted text-sm">
            {t("noStaffMembers")}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {staffMembers.map((s) => (
              <div
                key={s.id}
                className="p-3.5 rounded-xl border border-border/60 bg-surface-muted/40 hover:bg-surface-muted transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-gray-900 text-sm">{s.name}</span>
                    <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {s.roleTitle}
                    </span>
                  </div>
                  {s.phone && (
                    <p className="text-2xs text-muted flex items-center gap-1 mt-1 font-mono">
                      <Phone className="w-3 h-3 text-muted" />
                      <span>{s.phone}</span>
                    </p>
                  )}
                  <p className="text-xs text-muted mt-2 font-mono">
                    {t("baseSalary")} :{" "}
                    <strong className="text-gray-900">
                      {s.baseSalary.toLocaleString(numLocale)} {t("currency")}
                    </strong>
                  </p>
                  <p className="text-2xs text-muted mt-0.5">
                    {t("expenseBranch")} : {s.branchName || t("allBranchesOpt")}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenPayModal(s)}
                  className="mt-3 w-full py-1.5 px-3 bg-surface hover:bg-primary/5 text-primary border border-primary/20 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                >
                  {t("payStaffSalary")}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Staff Payroll History */}
      <Card className="border-border/80 shadow-xs bg-surface overflow-hidden">
        <div className="p-4 border-b border-border">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t("payrollHistory")}
          </h4>
        </div>

        {payrollLogs.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">
            {t("noStaffPayrollLogs")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted border-b border-border text-xs font-semibold text-muted uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">{t("monthLabel")}</th>
                  {/* Fixed column title: showing Staff Member instead of Teacher */}
                  <th className="py-3 px-4">{locale === "ar" ? "الموظف" : "Membre du personnel"}</th>
                  <th className="py-3 px-4">{t("staffRole")}</th>
                  <th className="py-3 px-4 text-right">{locale === "ar" ? "الراتب الأساسي" : "Salaire de base"}</th>
                  <th className="py-3 px-4 text-right text-orange-950 bg-orange-100/40">
                    {locale === "ar" ? "المنحة (Prime)" : "Prime / Bonus"}
                  </th>
                  <th className="py-3 px-4 text-right font-bold text-gray-900">{locale === "ar" ? "الصافي الإجمالي" : "Total Net"}</th>
                  <th className="py-3 px-4 text-center">{t("statusCol")}</th>
                  <th className="py-3 px-4">{t("date")}</th>
                  <th className="py-3 px-4 text-center">{locale === "ar" ? "إجراءات" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {payrollLogs.map((p) => {
                  const totalNet = p.amount + (p.bonus || 0);
                  return (
                    <tr key={p.id} className="hover:bg-surface-subtle/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-gray-900 whitespace-nowrap">
                        {monthNames[p.month - 1]} {p.year}
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-900">
                        {p.staffName}
                        {p.notes && <span className="block text-2xs text-muted font-normal">{p.notes}</span>}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted">{p.roleTitle}</td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-gray-700 whitespace-nowrap">
                        {p.amount.toLocaleString(numLocale)} {t("currency")}
                      </td>
                      <td className="py-3 px-4 text-right font-mono whitespace-nowrap bg-orange-50/20">
                        {p.bonus > 0 ? (
                          <span className="inline-flex items-center gap-1 font-bold text-orange-800 bg-orange-100 border border-orange-200 px-2 py-0.5 rounded text-xs">
                            + {p.bonus.toLocaleString(numLocale)} {t("currency")}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-blue-900 whitespace-nowrap text-sm">
                        {totalNet.toLocaleString(numLocale)} {t("currency")}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {p.status === "PAID" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success-light text-success border border-success-soft">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{t("statusPaid")}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-muted text-muted border border-border">
                            <Clock className="w-3 h-3" />
                            <span>{t("statusPendingLabel")}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted font-mono whitespace-nowrap">
                        {p.paidAt ? new Date(p.paidAt).toLocaleDateString(numLocale) : "-"}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          {/* Print button */}
                          <button
                            type="button"
                            onClick={() => handlePrintStaffPayslip(p)}
                            title={locale === "ar" ? "طباعة قسيمة الراتب" : "Imprimer le bulletin de paie"}
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 transition-colors cursor-pointer shrink-0"
                          >
                            <Image src="/print.png" alt={locale === "ar" ? "طباعة" : "Imprimer"} width={14} height={14} />
                          </button>
                          {/* Edit button */}
                          <Button
                            type="button"
                            variant="soft"
                            size="icon-sm"
                            onClick={() => handleOpenEditPayrollModal(p)}
                            title={tModals("update")}
                          >
                            <Image src="/update.png" alt="" width={14} height={14} />
                          </Button>
                          {/* Delete button */}
                          <Button
                            type="button"
                            variant="soft-danger"
                            size="icon-sm"
                            onClick={() => setPayrollToDelete(p)}
                            title={tModals("delete")}
                          >
                            <Image src="/delete.png" alt="" width={14} height={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Delete Confirmation Modal (Exact same as FormModal) */}
      {payrollToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border shadow-xl relative w-full max-w-md mx-4">
            <button
              type="button"
              className="absolute top-4 end-4 cursor-pointer p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors"
              onClick={() => setPayrollToDelete(null)}
            >
              <Image src="/close.png" alt={tModals("close")} width={14} height={14} />
            </button>

            <div className="p-6 flex flex-col items-center gap-4 text-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-12 w-12 text-red-500 opacity-80 mb-2"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              <h2 className="text-section-title font-bold text-gray-900">
                {tModals("deleteConfirmTitle")}
              </h2>
              <p className="text-table-body text-muted">
                {tModals("deleteConfirmMessage", {
                  name:
                    locale === "ar"
                      ? `راتب ${payrollToDelete.staffName} (${monthNames[payrollToDelete.month - 1]} ${payrollToDelete.year})`
                      : `le salaire de ${payrollToDelete.staffName} (${monthNames[payrollToDelete.month - 1]} ${payrollToDelete.year})`,
                })}
              </p>
              <div className="flex items-center gap-3 mt-4 w-full">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPayrollToDelete(null)}
                  className="flex-1"
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  isLoading={isDeleting}
                  onClick={handleConfirmDelete}
                  className="flex-1"
                >
                  {tCommon("delete")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Add Staff */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border shadow-xl relative w-full max-w-md mx-4 p-6">
            <button
              type="button"
              className="absolute top-4 end-4 cursor-pointer p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors"
              onClick={() => setIsStaffModalOpen(false)}
            >
              <Image src="/close.png" alt={tModals("close")} width={14} height={14} />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-primary" />
              <span>{t("addStaffMember")}</span>
            </h3>

            <form onSubmit={handleCreateStaff} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">{t("fullName")} *</label>
                <input
                  type="text"
                  required
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder={t("staffNamePlaceholder")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">{t("staffRole")} *</label>
                <input
                  type="text"
                  required
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder={t("roleTitlePlaceholder")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t("phoneOptional")}</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="ex: 0550123456"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t("expenseBranch")}</label>
                  <select
                    value={staffBranchId}
                    onChange={(e) => setStaffBranchId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="all">{t("allBranchesOpt")}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">{t("baseSalary")} ({t("currency")})</label>
                <input
                  type="number"
                  step="0.01"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                  placeholder="ex: 35000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsStaffModalOpen(false)}
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isLoading}
                >
                  {t("saveMember")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Pay / Edit Staff Payroll */}
      {isPayrollModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border shadow-xl relative w-full max-w-md mx-4 p-6">
            <button
              type="button"
              className="absolute top-4 end-4 cursor-pointer p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors"
              onClick={() => setIsPayrollModalOpen(false)}
            >
              <Image src="/close.png" alt={tModals("close")} width={14} height={14} />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              <span>
                {editingPayrollId
                  ? locale === "ar"
                    ? "تعديل سجل راتب الموظف"
                    : "Modifier le règlement de salaire"
                  : t("payStaffSalary")}
              </span>
            </h3>

            <form onSubmit={handleRecordPayroll} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">{t("selectStaffMember")} *</label>
                <select
                  required
                  value={selectedStaffId}
                  onChange={(e) => handleStaffChangeInPayModal(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">{t("selectStaffMember")}...</option>
                  {staffMembers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.roleTitle})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t("monthLabel")}</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {monthNames.map((name, idx) => (
                      <option key={idx + 1} value={idx + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t("yearLabel")}</label>
                  <input
                    type="number"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {locale === "ar" ? "الراتب الأساسي" : "Salaire de base"} ({t("currency")}) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={payrollAmount}
                    onChange={(e) => setPayrollAmount(e.target.value)}
                    placeholder="ex: 35000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center justify-between">
                    <span>{locale === "ar" ? "المنحة / Prime" : "Prime / Bonus"}</span>
                    <span className="text-[10px] text-orange-700 font-bold bg-orange-100 px-1.5 py-0.5 rounded">
                      Optionnel
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={payrollBonus}
                    onChange={(e) => setPayrollBonus(e.target.value)}
                    placeholder="ex: 5000"
                    className="w-full px-3 py-2 border border-orange-300 bg-orange-50/20 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-400/20 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Total Calculation Live Preview */}
              <div className="bg-blue-50/90 border border-blue-200 p-3 rounded-xl flex items-center justify-between text-xs">
                <span className="text-blue-900 font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>{locale === "ar" ? "المبلغ الصافي الإجمالي المستحق :" : "Total net à percevoir :"}</span>
                </span>
                <span className="font-mono text-sm font-bold text-blue-950">
                  {(Math.max(0, Number(payrollAmount || 0)) + Math.max(0, Number(payrollBonus || 0))).toLocaleString(numLocale)} {t("currency")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t("statusCol")}</label>
                  <select
                    value={payrollStatus}
                    onChange={(e) => setPayrollStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="PAID">{t("statusPaid")}</option>
                    <option value="PENDING">{t("statusPendingLabel")}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t("paymentNotes")}</label>
                  <input
                    type="text"
                    value={payrollNotes}
                    onChange={(e) => setPayrollNotes(e.target.value)}
                    placeholder="ex: Prime de rendement"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPayrollModalOpen(false)}
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isLoading}
                >
                  {editingPayrollId
                    ? locale === "ar"
                      ? "حفظ التعديلات"
                      : "Enregistrer les modifications"
                    : t("confirmPayment")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
