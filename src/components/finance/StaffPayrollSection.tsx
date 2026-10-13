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
  Edit2,
  HandCoins,
  Receipt,
  Trash2,
  AlertTriangle,
  History,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  createStaffMemberAction,
  updateStaffMemberAction,
  deleteStaffMemberAction,
  recordStaffPayrollAction,
  updateStaffPayrollAction,
  deleteStaffPayrollAction,
  recordStaffAdvanceAction,
  updateStaffAdvanceAction,
  deleteStaffAdvanceAction,
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
  amount: number; // base salary (configurable/editable)
  advance: number; // avances sur salaire
  bonus: number; // prime / bonus cash
  status: string;
  paidAt: string | Date | null;
  notes?: string | null;
}

export interface StaffAdvanceItem {
  id: number;
  staffMemberId: number;
  staffName: string;
  roleTitle?: string;
  amount: number;
  date: string;
  month?: number | null;
  year?: number | null;
  notes?: string | null;
  recordedBy?: string;
}

interface StaffPayrollSectionProps {
  staffMembers: StaffItem[];
  payrollLogs: StaffPayrollItem[];
  staffAdvances?: StaffAdvanceItem[];
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
  staffAdvances = [],
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

  // Tabs for the bottom section
  const [activeBottomTab, setActiveBottomTab] = useState<"payrolls" | "advances">("payrolls");

  // Modals state
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isEditStaffModalOpen, setIsEditStaffModalOpen] = useState(false);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);

  // Deletion modals
  const [payrollToDelete, setPayrollToDelete] = useState<StaffPayrollItem | null>(null);
  const [advanceToDelete, setAdvanceToDelete] = useState<StaffAdvanceItem | null>(null);
  const [staffToDelete, setStaffToDelete] = useState<StaffItem | null>(null);

  // New staff form
  const [staffName, setStaffName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [staffBranchId, setStaffBranchId] = useState<string>("all");
  const [baseSalary, setBaseSalary] = useState("");

  // Edit staff form
  const [editingStaffId, setEditingStaffId] = useState<number | null>(null);
  const [editStaffName, setEditStaffName] = useState("");
  const [editRoleTitle, setEditRoleTitle] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStaffBranchId, setEditStaffBranchId] = useState<string>("all");
  const [editBaseSalary, setEditBaseSalary] = useState("");

  // Pay staff form
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [payrollAmount, setPayrollAmount] = useState<string>("");
  const [payrollAdvance, setPayrollAdvance] = useState<string>("");
  const [payrollBonus, setPayrollBonus] = useState<string>("");
  const [payrollNotes, setPayrollNotes] = useState<string>("");
  const [payrollStatus, setPayrollStatus] = useState<"PAID" | "PENDING">("PAID");
  const [updateDefaultBaseSalary, setUpdateDefaultBaseSalary] = useState(false);
  const [editingPayrollId, setEditingPayrollId] = useState<number | null>(null);

  // Standalone advance form
  const [advanceStaffId, setAdvanceStaffId] = useState<string>("");
  const [advanceAmount, setAdvanceAmount] = useState<string>("");
  const [advanceMonth, setAdvanceMonth] = useState<number>(new Date().getMonth() + 1);
  const [advanceYear, setAdvanceYear] = useState<number>(new Date().getFullYear());
  const [advanceDate, setAdvanceDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [advanceNotes, setAdvanceNotes] = useState<string>("");
  const [editingAdvanceId, setEditingAdvanceId] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Helper: auto calculate recorded advances for staff in a given month/year
  const getAutoAdvanceForStaff = (staffIdStr: string, m: number, y: number) => {
    if (!staffAdvances || staffAdvances.length === 0) return 0;
    return staffAdvances
      .filter((a) => {
        const matchesStaff = String(a.staffMemberId) === staffIdStr;
        const matchesMonth = a.month ? a.month === m : true;
        const matchesYear = a.year ? a.year === y : true;
        return matchesStaff && matchesMonth && matchesYear;
      })
      .reduce((sum, a) => sum + a.amount, 0);
  };

  // Open Pay Modal
  const handleOpenPayModal = (staff?: StaffItem) => {
    setEditingPayrollId(null);
    setUpdateDefaultBaseSalary(false);
    const m = new Date().getMonth() + 1;
    const y = new Date().getFullYear();
    setSelectedMonth(m);
    setSelectedYear(y);

    let chosenStaffId = "";
    if (staff) {
      chosenStaffId = String(staff.id);
      setSelectedStaffId(chosenStaffId);
      setPayrollAmount(String(staff.baseSalary || ""));
    } else if (staffMembers.length > 0) {
      chosenStaffId = String(staffMembers[0].id);
      setSelectedStaffId(chosenStaffId);
      setPayrollAmount(String(staffMembers[0].baseSalary || ""));
    }

    // Prefill advances if already logged
    const existingAdvance = getAutoAdvanceForStaff(chosenStaffId, m, y);
    setPayrollAdvance(existingAdvance > 0 ? String(existingAdvance) : "");

    setPayrollBonus("");
    setPayrollNotes("");
    setPayrollStatus("PAID");
    setIsPayrollModalOpen(true);
  };

  // Open Edit Payroll Modal
  const handleOpenEditPayrollModal = (p: StaffPayrollItem) => {
    setEditingPayrollId(p.id);
    setSelectedStaffId(String(p.staffMemberId));
    setSelectedMonth(p.month);
    setSelectedYear(p.year);
    setPayrollAmount(String(p.amount));
    setPayrollAdvance(p.advance > 0 ? String(p.advance) : "");
    setPayrollBonus(p.bonus > 0 ? String(p.bonus) : "");
    setPayrollStatus((p.status as any) || "PAID");
    setPayrollNotes(p.notes || "");
    setUpdateDefaultBaseSalary(false);
    setIsPayrollModalOpen(true);
  };

  // Open Edit Staff Modal
  const handleOpenEditStaffModal = (s: StaffItem) => {
    setEditingStaffId(s.id);
    setEditStaffName(s.name);
    setEditRoleTitle(s.roleTitle);
    setEditPhone(s.phone || "");
    setEditStaffBranchId(s.branchId ? String(s.branchId) : "all");
    setEditBaseSalary(String(s.baseSalary || ""));
    setIsEditStaffModalOpen(true);
  };

  // Open Standalone Advance Modal
  const handleOpenAdvanceModal = (staff?: StaffItem) => {
    setEditingAdvanceId(null);
    if (staff) {
      setAdvanceStaffId(String(staff.id));
    } else if (staffMembers.length > 0) {
      setAdvanceStaffId(String(staffMembers[0].id));
    }
    setAdvanceAmount("");
    setAdvanceMonth(new Date().getMonth() + 1);
    setAdvanceYear(new Date().getFullYear());
    setAdvanceDate(new Date().toISOString().split("T")[0]);
    setAdvanceNotes("");
    setIsAdvanceModalOpen(true);
  };

  // Open Edit Advance Modal
  const handleOpenEditAdvanceModal = (adv: StaffAdvanceItem) => {
    setEditingAdvanceId(adv.id);
    setAdvanceStaffId(String(adv.staffMemberId));
    setAdvanceAmount(String(adv.amount));
    setAdvanceMonth(adv.month || (new Date().getMonth() + 1));
    setAdvanceYear(adv.year || new Date().getFullYear());
    setAdvanceDate(new Date(adv.date).toISOString().split("T")[0]);
    setAdvanceNotes(adv.notes || "");
    setIsAdvanceModalOpen(true);
  };

  // Change staff in pay modal
  const handleStaffChangeInPayModal = (idStr: string) => {
    setSelectedStaffId(idStr);
    const member = staffMembers.find((s) => String(s.id) === idStr);
    if (member && member.baseSalary > 0) {
      setPayrollAmount(String(member.baseSalary));
    }
    const existingAdvance = getAutoAdvanceForStaff(idStr, selectedMonth, selectedYear);
    if (existingAdvance > 0) {
      setPayrollAdvance(String(existingAdvance));
    } else {
      setPayrollAdvance("");
    }
  };

  // Change month in pay modal
  const handleMonthChangeInPayModal = (monthNum: number) => {
    setSelectedMonth(monthNum);
    if (selectedStaffId && !editingPayrollId) {
      const existingAdvance = getAutoAdvanceForStaff(selectedStaffId, monthNum, selectedYear);
      setPayrollAdvance(existingAdvance > 0 ? String(existingAdvance) : "");
    }
  };

  // Create Staff
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

  // Update Staff Member
  const handleUpdateStaffMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaffId || !editStaffName.trim() || !editRoleTitle.trim()) {
      toast.error(locale === "ar" ? "يرجى ملء الاسم والوظيفة." : "Veuillez renseigner le nom et le poste.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await updateStaffMemberAction(editingStaffId, {
        name: editStaffName,
        roleTitle: editRoleTitle,
        phone: editPhone,
        branchId: editStaffBranchId === "all" ? null : Number(editStaffBranchId),
        baseSalary: Number(editBaseSalary || 0),
      });

      if (res.success) {
        toast.success(res.message);
        setIsEditStaffModalOpen(false);
        setEditingStaffId(null);
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

  // Record or Update Payroll
  const handleRecordPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId || !payrollAmount || Number(payrollAmount) <= 0) {
      toast.error(
        locale === "ar"
          ? "يرجى اختيار الموظف وتحديد الراتب الأساسي."
          : "Veuillez sélectionner un employé et renseigner le salaire de base."
      );
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
          advance: Number(payrollAdvance || 0),
          bonus: Number(payrollBonus || 0),
          status: payrollStatus,
          notes: payrollNotes,
          updateDefaultBaseSalary,
        });
      } else {
        res = await recordStaffPayrollAction({
          staffMemberId: Number(selectedStaffId),
          month: Number(selectedMonth),
          year: Number(selectedYear),
          amount: Number(payrollAmount),
          advance: Number(payrollAdvance || 0),
          bonus: Number(payrollBonus || 0),
          status: payrollStatus,
          notes: payrollNotes,
          updateDefaultBaseSalary,
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

  // Record Standalone Advance
  const handleRecordAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advanceStaffId || !advanceAmount || Number(advanceAmount) <= 0) {
      toast.error(
        locale === "ar"
          ? "يرجى اختيار الموظف وتحديد مبلغ التسبيق."
          : "Veuillez sélectionner un employé et renseigner le montant de l'avance."
      );
      return;
    }

    setIsLoading(true);
    try {
      let res;
      if (editingAdvanceId) {
        res = await updateStaffAdvanceAction(editingAdvanceId, {
          staffMemberId: Number(advanceStaffId),
          amount: Number(advanceAmount),
          date: advanceDate,
          month: Number(advanceMonth),
          year: Number(advanceYear),
          notes: advanceNotes,
        });
      } else {
        res = await recordStaffAdvanceAction({
          staffMemberId: Number(advanceStaffId),
          amount: Number(advanceAmount),
          date: advanceDate,
          month: Number(advanceMonth),
          year: Number(advanceYear),
          notes: advanceNotes,
        });
      }

      if (res.success) {
        toast.success(res.message);
        setIsAdvanceModalOpen(false);
        setEditingAdvanceId(null);
        setAdvanceAmount("");
        setAdvanceNotes("");
        setActiveBottomTab("advances");
        startTransition(() => {
          router.refresh();
        });
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error(locale === "ar" ? "حدث خطأ أثناء معالجة التسبيق." : "Une erreur est survenue.");
    } finally {
      setIsLoading(false);
    }
  };

  // Delete Payroll Confirm
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

  // Delete Advance Confirm
  const handleConfirmDeleteAdvance = async () => {
    if (!advanceToDelete) return;
    setIsDeleting(true);
    try {
      const res = await deleteStaffAdvanceAction(advanceToDelete.id);
      if (res.success) {
        toast.success(res.message);
        setAdvanceToDelete(null);
        startTransition(() => {
          router.refresh();
        });
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error(locale === "ar" ? "حدث خطأ أثناء حذف التسبيق." : "Une erreur est survenue lors de la suppression.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Delete Staff Member Confirm
  const handleConfirmDeleteStaff = async () => {
    if (!staffToDelete) return;
    setIsDeleting(true);
    try {
      const res = await deleteStaffMemberAction(staffToDelete.id);
      if (res.success) {
        toast.success(res.message);
        setStaffToDelete(null);
        startTransition(() => {
          router.refresh();
        });
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error(locale === "ar" ? "حدث خطأ أثناء حذف الموظف." : "Une erreur est survenue lors de la suppression.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Print Staff Payslip
  const handlePrintStaffPayslip = (p: StaffPayrollItem) => {
    const totalNet = Math.max(0, p.amount - (p.advance || 0) + (p.bonus || 0));
    const printData: StaffPayslipPrintData = {
      id: p.id,
      staffName: p.staffName,
      roleTitle: p.roleTitle,
      phone: p.phone,
      branchName: p.branchName,
      month: p.month,
      year: p.year,
      amount: p.amount,
      advance: p.advance || 0,
      bonus: p.bonus || 0,
      totalNet,
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

  // Calculations for KPI summaries
  const totalBaseSalarySum = payrollLogs
    .filter((l) => l.status === "PAID")
    .reduce((sum, l) => sum + l.amount, 0);

  const totalAdvancesDeductedSum = payrollLogs
    .filter((l) => l.status === "PAID")
    .reduce((sum, l) => sum + (l.advance || 0), 0);

  const totalMonthlyStaffPayroll = payrollLogs
    .filter((l) => l.status === "PAID")
    .reduce((sum, l) => sum + Math.max(0, l.amount - (l.advance || 0) + (l.bonus || 0)), 0);

  // Dynamic calculations for Pay Modal Live Preview
  const previewBase = Math.max(0, Number(payrollAmount || 0));
  const previewAdvance = Math.max(0, Number(payrollAdvance || 0));
  const previewBonus = Math.max(0, Number(payrollBonus || 0));
  const previewRest = Math.max(0, previewBase - previewAdvance + previewBonus);
  const isAdvanceExceeded = previewAdvance > (previewBase + previewBonus);

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Top Bar with KPI Metrics & Action Buttons */}
      <Card className="p-4 sm:p-5 border-border/80 shadow-xs bg-surface flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                {t("staffManagement")}
              </h3>
              <p className="text-xs text-muted">
                {staffMembers.length} {locale === "ar" ? "موظف مسجل" : "membres actifs"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 border-t sm:border-t-0 sm:border-l sm:ps-6 border-border pt-3 sm:pt-0">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-muted font-medium block">
                {locale === "ar" ? "الرواتب الأساسية" : "Base brute"}
              </span>
              <strong className="text-xs font-mono font-semibold text-gray-800">
                {totalBaseSalarySum.toLocaleString(numLocale)} {t("currency")}
              </strong>
            </div>

            <div className="text-amber-700">
              <span className="text-[11px] uppercase tracking-wider text-amber-700/80 font-medium block">
                {t("advancesDeducted")}
              </span>
              <strong className="text-xs font-mono font-semibold">
                - {totalAdvancesDeductedSum.toLocaleString(numLocale)} {t("currency")}
              </strong>
            </div>

            <div className="text-primary">
              <span className="text-[11px] uppercase tracking-wider text-primary font-bold block">
                {t("salaryRest")} (Net)
              </span>
              <strong className="text-sm font-mono font-black text-primary">
                {totalMonthlyStaffPayroll.toLocaleString(numLocale)} {t("currency")}
              </strong>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          {/* Add Staff Button */}
          <button
            type="button"
            onClick={() => setIsStaffModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-surface hover:bg-surface-muted text-gray-700 border border-border px-3 py-2 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t("newStaffMember")}</span>
          </button>

          {/* Record Standalone Advance Button */}
          <button
            type="button"
            onClick={() => handleOpenAdvanceModal()}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 px-3 py-2 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95"
          >
            <HandCoins className="w-3.5 h-3.5 text-amber-700" />
            <span>{t("recordStaffAdvance")}</span>
          </button>

          {/* Pay Salary Button */}
          <button
            type="button"
            onClick={() => handleOpenPayModal()}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-hover text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95"
          >
            <DollarSign className="w-4 h-4" />
            <span>{t("recordSalary")}</span>
          </button>
        </div>
      </Card>

      {/* Staff Members Grid */}
      <Card className="p-5 border-border/80 shadow-xs bg-surface">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t("staffMembersCount", { count: staffMembers.length })}
          </h4>
          <span className="text-2xs text-muted">
            {locale === "ar"
              ? "الراتب الأساسي قابل للتعديل لكل موظف"
              : "Salaire de base entièrement configurable"}
          </span>
        </div>

        {staffMembers.length === 0 ? (
          <div className="p-6 text-center text-muted text-sm">
            {t("noStaffMembers")}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3.5">
            {staffMembers.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-xl border border-border/70 bg-surface-muted/30 hover:bg-surface-muted/60 transition-all flex flex-col justify-between shadow-2xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-bold text-gray-900 text-sm block">{s.name}</span>
                      <span className="text-2xs font-medium text-muted mt-0.5 block">
                        {s.branchName || t("allBranchesOpt")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {s.roleTitle}
                      </span>
                      {/* Edit Staff Member Button */}
                      <button
                        type="button"
                        onClick={() => handleOpenEditStaffModal(s)}
                        title={t("editStaffMember")}
                        className="p-1 rounded-md text-muted hover:text-gray-900 hover:bg-surface transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {/* Delete Staff Member Button */}
                      <button
                        type="button"
                        onClick={() => setStaffToDelete(s)}
                        title={locale === "ar" ? "حذف الموظف" : "Supprimer le membre du personnel"}
                        className="p-1 rounded-md text-muted hover:text-danger hover:bg-danger-light transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {s.phone && (
                    <p className="text-2xs text-muted flex items-center gap-1 mt-1 font-mono">
                      <Phone className="w-3 h-3 text-muted" />
                      <span>{s.phone}</span>
                    </p>
                  )}

                  {/* Configurable Base Salary Badge */}
                  <div className="mt-3 p-2 rounded-lg bg-surface border border-border/80 flex items-center justify-between">
                    <span className="text-2xs text-muted font-medium">
                      {t("baseSalary")} :
                    </span>
                    <strong className="text-xs font-mono font-bold text-gray-900">
                      {s.baseSalary.toLocaleString(numLocale)} {t("currency")}
                    </strong>
                  </div>
                </div>

                {/* Card Actions: Pay & Quick Advance */}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAdvanceModal(s)}
                    title={t("recordStaffAdvance")}
                    className="flex-1 py-1.5 px-2 bg-amber-50 hover:bg-amber-100/80 text-amber-900 border border-amber-200/80 rounded-lg text-2xs font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1"
                  >
                    <HandCoins className="w-3 h-3 text-amber-700" />
                    <span>{t("staffAdvancesTitle")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenPayModal(s)}
                    className="flex-2 py-1.5 px-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg text-2xs font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1"
                  >
                    <DollarSign className="w-3 h-3" />
                    <span>{t("payStaffSalary")}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Bottom Card: Tabs for Payroll History and Standalone Advances Log */}
      <Card className="border-border/80 shadow-xs bg-surface overflow-hidden">
        {/* Sub-Tabs Switcher */}
        <div className="p-3.5 border-b border-border bg-surface-muted/40 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveBottomTab("payrolls")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
                activeBottomTab === "payrolls"
                  ? "bg-surface text-gray-900 shadow-xs border border-border"
                  : "text-muted hover:text-gray-900"
              }`}
            >
              <Receipt className="w-3.5 h-3.5 text-primary" />
              <span>{t("payrollHistory")}</span>
              <span className="text-2xs font-mono px-1.5 py-0.2 rounded-full bg-surface-muted text-gray-700 border border-border/60">
                {payrollLogs.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveBottomTab("advances")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
                activeBottomTab === "advances"
                  ? "bg-surface text-amber-950 shadow-xs border border-amber-200"
                  : "text-muted hover:text-gray-900"
              }`}
            >
              <HandCoins className="w-3.5 h-3.5 text-amber-700" />
              <span>{t("staffAdvancesHistory")}</span>
              <span className="text-2xs font-mono px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                {staffAdvances.length}
              </span>
            </button>
          </div>

          <span className="text-2xs text-muted hidden sm:inline">
            {activeBottomTab === "payrolls"
              ? locale === "ar"
                ? "يتم حساب الباقي تلقائياً بعد خصم التسبيقات وإضافة المنح"
                : "Le reste est calculé automatiquement (Salaire de base - Avances + Prime)"
              : locale === "ar"
              ? "سجل التسبيقات المسحوبة قبل تاريخ الصرف"
              : "Historique des acomptes accordés au personnel"}
          </span>
        </div>

        {/* TAB 1: PAYROLL HISTORY */}
        {activeBottomTab === "payrolls" && (
          <div>
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
                      <th className="py-3 px-4">{locale === "ar" ? "الموظف" : "Membre du personnel"}</th>
                      <th className="py-3 px-4">{t("staffRole")}</th>
                      <th className="py-3 px-4 text-right">
                        {locale === "ar" ? "الراتب الأساسي" : "Salaire de base"}
                      </th>
                      <th className="py-3 px-4 text-right text-amber-950 bg-amber-50/50">
                        {t("advancesDeducted")}
                      </th>
                      <th className="py-3 px-4 text-right text-orange-950 bg-orange-100/30">
                        {locale === "ar" ? "المنحة (Prime)" : "Prime / Bonus"}
                      </th>
                      <th className="py-3 px-4 text-right font-black text-blue-900 bg-blue-50/40">
                        {t("salaryRest")} (Net)
                      </th>
                      <th className="py-3 px-4 text-center">{t("statusCol")}</th>
                      <th className="py-3 px-4">{t("date")}</th>
                      <th className="py-3 px-4 text-center">{locale === "ar" ? "إجراءات" : "Actions"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {payrollLogs.map((p) => {
                      const totalRest = Math.max(0, p.amount - (p.advance || 0) + (p.bonus || 0));
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

                          {/* Base Salary (Configurable) */}
                          <td className="py-3 px-4 text-right font-mono font-medium text-gray-700 whitespace-nowrap">
                            {p.amount.toLocaleString(numLocale)} {t("currency")}
                          </td>

                          {/* Avances Deducted Column */}
                          <td className="py-3 px-4 text-right font-mono whitespace-nowrap bg-amber-50/30">
                            {(p.advance || 0) > 0 ? (
                              <span className="inline-flex items-center gap-1 font-bold text-amber-900 bg-amber-100/90 border border-amber-200 px-2 py-0.5 rounded text-xs">
                                - {(p.advance || 0).toLocaleString(numLocale)} {t("currency")}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>

                          {/* Prime / Bonus */}
                          <td className="py-3 px-4 text-right font-mono whitespace-nowrap bg-orange-50/20">
                            {p.bonus > 0 ? (
                              <span className="inline-flex items-center gap-1 font-bold text-orange-800 bg-orange-100 border border-orange-200 px-2 py-0.5 rounded text-xs">
                                + {p.bonus.toLocaleString(numLocale)} {t("currency")}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>

                          {/* Automatic Rest Net Column */}
                          <td className="py-3 px-4 text-right font-mono font-black text-blue-900 whitespace-nowrap text-sm bg-blue-50/30">
                            {totalRest.toLocaleString(numLocale)} {t("currency")}
                          </td>

                          {/* Status */}
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

                          {/* Date */}
                          <td className="py-3 px-4 text-xs text-muted font-mono whitespace-nowrap">
                            {p.paidAt ? new Date(p.paidAt).toLocaleDateString(numLocale) : "-"}
                          </td>

                          {/* Actions */}
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
          </div>
        )}

        {/* TAB 2: STANDALONE ADVANCES LOG */}
        {activeBottomTab === "advances" && (
          <div>
            {staffAdvances.length === 0 ? (
              <div className="p-8 text-center text-muted text-sm flex flex-col items-center gap-2">
                <HandCoins className="w-8 h-8 text-muted/60 mb-1" />
                <p>{t("noStaffAdvances")}</p>
                <button
                  type="button"
                  onClick={() => handleOpenAdvanceModal()}
                  className="mt-2 text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  + {t("recordStaffAdvance")}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-muted border-b border-border text-xs font-semibold text-muted uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">{t("date")}</th>
                      <th className="py-3 px-4">{locale === "ar" ? "الموظف" : "Membre du personnel"}</th>
                      <th className="py-3 px-4">{t("staffRole")}</th>
                      <th className="py-3 px-4 text-center">
                        {locale === "ar" ? "الشهر المعني" : "Période ciblée"}
                      </th>
                      <th className="py-3 px-4 text-right text-amber-950 font-bold">
                        {t("staffAdvanceAmount")}
                      </th>
                      <th className="py-3 px-4">{t("paymentNotes")}</th>
                      <th className="py-3 px-4 text-center">{locale === "ar" ? "إجراءات" : "Actions"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {staffAdvances.map((adv) => (
                      <tr key={adv.id} className="hover:bg-surface-subtle/80 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-gray-900 whitespace-nowrap">
                          {new Date(adv.date).toLocaleDateString(numLocale)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-gray-900">
                          {adv.staffName}
                        </td>
                        <td className="py-3 px-4 text-xs text-muted">
                          {adv.roleTitle || "—"}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-xs whitespace-nowrap">
                          {adv.month ? `${monthNames[adv.month - 1]} ${adv.year || ""}` : "—"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-amber-900 whitespace-nowrap">
                          - {adv.amount.toLocaleString(numLocale)} {t("currency")}
                        </td>
                        <td className="py-3 px-4 text-xs text-muted">
                          {adv.notes || "—"}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleOpenEditAdvanceModal(adv)}
                              title={tModals("update")}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="soft-danger"
                              size="icon-sm"
                              onClick={() => setAdvanceToDelete(adv)}
                              title={tModals("delete")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* MODAL 1: PAY / EDIT STAFF PAYROLL */}
      {isPayrollModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border shadow-xl relative w-full max-w-lg mx-4 p-6">
            <button
              type="button"
              className="absolute top-4 end-4 cursor-pointer p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors"
              onClick={() => setIsPayrollModalOpen(false)}
            >
              <Image src="/close.png" alt={tModals("close")} width={14} height={14} />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              <span>
                {editingPayrollId
                  ? locale === "ar"
                    ? "تعديل سجل راتب الموظف"
                    : "Modifier le règlement de salaire"
                  : t("payStaffSalary")}
              </span>
            </h3>
            <p className="text-xs text-muted mb-4">
              {locale === "ar"
                ? "حدد الراتب الأساسي والتسبيقات، ويتم احتساب الباقي الصافي تلقائياً."
                : "Ajustez le salaire de base et les avances; le reste net est calculé automatiquement."}
            </p>

            <form onSubmit={handleRecordPayroll} className="flex flex-col gap-4">
              {/* Staff Member select */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("selectStaffMember")} *
                </label>
                <select
                  required
                  value={selectedStaffId}
                  onChange={(e) => handleStaffChangeInPayModal(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">{t("selectStaffMember")}...</option>
                  {staffMembers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.roleTitle}) — Base: {s.baseSalary.toLocaleString(numLocale)} {t("currency")}
                    </option>
                  ))}
                </select>
              </div>

              {/* Month and Year */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t("monthLabel")}</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => handleMonthChangeInPayModal(Number(e.target.value))}
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
                  >
                  </input>
                </div>
              </div>

              {/* Base Salary (Configurable / Editable) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                    <span>{t("baseSalary")} ({t("currency")}) *</span>
                  </label>
                  <span className="text-[10px] text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded">
                    {locale === "ar" ? "قابل للتعديل" : "Modifiable / Configurable"}
                  </span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={payrollAmount}
                  onChange={(e) => setPayrollAmount(e.target.value)}
                  placeholder="ex: 35000"
                  className="w-full px-3 py-2 border border-primary/40 bg-primary/5 rounded-lg text-sm font-mono font-semibold focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    type="checkbox"
                    id="updateBaseSalary"
                    checked={updateDefaultBaseSalary}
                    onChange={(e) => setUpdateDefaultBaseSalary(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary/20"
                  />
                  <label htmlFor="updateBaseSalary" className="text-2xs text-muted cursor-pointer">
                    {t("updateDefaultBaseSalary")}
                  </label>
                </div>
              </div>

              {/* Avances & Prime in 2 cols */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Avances input */}
                <div>
                  <label className="block text-xs font-semibold text-amber-950 mb-1 flex items-center justify-between">
                    <span>{t("staffAdvancesTitle")} ({t("currency")})</span>
                    <span className="text-[10px] text-amber-800 font-bold bg-amber-100 px-1.5 py-0.5 rounded">
                      {locale === "ar" ? "خصم" : "Déduction"}
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={payrollAdvance}
                    onChange={(e) => setPayrollAdvance(e.target.value)}
                    placeholder="ex: 5000"
                    className="w-full px-3 py-2 border border-amber-300 bg-amber-50/20 rounded-lg text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-amber-400/20 focus:border-amber-500"
                  />
                </div>

                {/* Prime / Bonus input */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center justify-between">
                    <span>{locale === "ar" ? "المنحة / Prime" : "Prime / Bonus"}</span>
                    <span className="text-[10px] text-orange-700 font-bold bg-orange-100 px-1.5 py-0.5 rounded">
                      {locale === "ar" ? "إضافة" : "Ajout"}
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={payrollBonus}
                    onChange={(e) => setPayrollBonus(e.target.value)}
                    placeholder="ex: 3000"
                    className="w-full px-3 py-2 border border-orange-300 bg-orange-50/20 rounded-lg text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-orange-400/20 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Real-Time Live Rest Calculation Card */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50/80 border border-blue-200/90 p-3.5 rounded-xl flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-gray-600 border-b border-blue-100 pb-2">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span>{t("baseSalary")} :</span>
                    <strong className="font-mono text-gray-900">
                      +{previewBase.toLocaleString(numLocale)} {t("currency")}
                    </strong>
                  </span>

                  {previewAdvance > 0 && (
                    <span className="flex items-center gap-1 text-amber-800 font-medium">
                      <span>{t("advancesDeducted")} :</span>
                      <strong className="font-mono">
                        -{previewAdvance.toLocaleString(numLocale)} {t("currency")}
                      </strong>
                    </span>
                  )}

                  {previewBonus > 0 && (
                    <span className="flex items-center gap-1 text-orange-800 font-medium">
                      <span>Prime :</span>
                      <strong className="font-mono">
                        +{previewBonus.toLocaleString(numLocale)} {t("currency")}
                      </strong>
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-blue-950 font-bold flex items-center gap-1.5 text-xs">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span>{t("salaryRestNet")} :</span>
                  </span>
                  <span className="font-mono text-base font-black text-blue-950">
                    {previewRest.toLocaleString(numLocale)} {t("currency")}
                  </span>
                </div>

                {isAdvanceExceeded && (
                  <div className="flex items-center gap-1.5 text-2xs text-danger font-semibold bg-danger-light/50 p-1.5 rounded border border-danger-soft">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{t("advancesExceedBase")}</span>
                  </div>
                )}
              </div>

              {/* Status & Notes */}
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
                    placeholder="ex: Virement, Espèces, Prime..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              {/* Modal Buttons */}
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

      {/* MODAL 2: STANDALONE ADVANCE MODAL */}
      {isAdvanceModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border shadow-xl relative w-full max-w-md mx-4 p-6">
            <button
              type="button"
              className="absolute top-4 end-4 cursor-pointer p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors"
              onClick={() => setIsAdvanceModalOpen(false)}
            >
              <Image src="/close.png" alt={tModals("close")} width={14} height={14} />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
              <HandCoins className="w-5 h-5 text-amber-700" />
              <span>
                {editingAdvanceId
                  ? (locale === "ar" ? "تعديل التسبيق المالي" : "Modifier l'avance sur salaire")
                  : t("recordStaffAdvance")}
              </span>
            </h3>
            <p className="text-xs text-muted mb-4">
              {locale === "ar"
                ? "تسجيل تسبيق مالي للموظف سيتم خصمه تلقائياً من راتب الشهر المختار."
                : "Enregistrer une avance financière déductible du salaire du mois correspondant."}
            </p>

            <form onSubmit={handleRecordAdvance} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("selectStaffMember")} *
                </label>
                <select
                  required
                  value={advanceStaffId}
                  onChange={(e) => setAdvanceStaffId(e.target.value)}
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

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("staffAdvanceAmount")} ({t("currency")}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  placeholder="ex: 5000"
                  className="w-full px-3 py-2 border border-amber-300 bg-amber-50/20 rounded-lg text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-amber-400/20 focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {locale === "ar" ? "الشهر المعني بالخصم" : "Mois concerné"}
                  </label>
                  <select
                    value={advanceMonth}
                    onChange={(e) => setAdvanceMonth(Number(e.target.value))}
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
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t("expenseDate")}</label>
                  <input
                    type="date"
                    value={advanceDate}
                    onChange={(e) => setAdvanceDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">{t("staffAdvanceNotes")}</label>
                <input
                  type="text"
                  value={advanceNotes}
                  onChange={(e) => setAdvanceNotes(e.target.value)}
                  placeholder="ex: Avance fête de l'aïd, urgence personnelle..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAdvanceModalOpen(false)}
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isLoading}
                >
                  {editingAdvanceId
                    ? (locale === "ar" ? "حفظ التعديلات" : "Enregistrer les modifications")
                    : (locale === "ar" ? "تأكيد تسجيل التسبيق" : "Confirmer l'avance")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT STAFF MEMBER (CONFIGURABLE BASE SALARY) */}
      {isEditStaffModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border shadow-xl relative w-full max-w-md mx-4 p-6">
            <button
              type="button"
              className="absolute top-4 end-4 cursor-pointer p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors"
              onClick={() => setIsEditStaffModalOpen(false)}
            >
              <Image src="/close.png" alt={tModals("close")} width={14} height={14} />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-primary" />
              <span>{t("editStaffMember")}</span>
            </h3>
            <p className="text-xs text-muted mb-4">
              {locale === "ar"
                ? "تعديل بيانات الموظف والراتب الأساسي الافتراضي."
                : "Configurer les coordonnées et le salaire de base habituel du membre."}
            </p>

            <form onSubmit={handleUpdateStaffMember} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">{t("fullName")} *</label>
                <input
                  type="text"
                  required
                  value={editStaffName}
                  onChange={(e) => setEditStaffName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">{t("staffRole")} *</label>
                <input
                  type="text"
                  required
                  value={editRoleTitle}
                  onChange={(e) => setEditRoleTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t("phoneOptional")}</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="0550123456"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{t("expenseBranch")}</label>
                  <select
                    value={editStaffBranchId}
                    onChange={(e) => setEditStaffBranchId(e.target.value)}
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
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("baseSalary")} ({t("currency")})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editBaseSalary}
                  onChange={(e) => setEditBaseSalary(e.target.value)}
                  placeholder="35000"
                  className="w-full px-3 py-2 border border-primary/40 bg-primary/5 rounded-lg text-sm font-mono font-semibold focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="soft-danger"
                  size="sm"
                  onClick={() => {
                    const found = staffMembers.find((s) => s.id === editingStaffId);
                    if (found) {
                      setIsEditStaffModalOpen(false);
                      setStaffToDelete(found);
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{tCommon("delete")}</span>
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditStaffModalOpen(false)}
                  >
                    {tCommon("cancel")}
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={isLoading}
                  >
                    {locale === "ar" ? "حفظ التعديلات" : "Enregistrer"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: CREATE STAFF MEMBER */}
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
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("baseSalary")} ({t("currency")})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                  placeholder="ex: 35000"
                  className="w-full px-3 py-2 border border-primary/40 bg-primary/5 rounded-lg text-sm font-mono font-semibold focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
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

      {/* CONFIRM DELETE PAYROLL MODAL */}
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
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                <Trash2 className="w-6 h-6" />
              </div>
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

      {/* CONFIRM DELETE ADVANCE MODAL */}
      {advanceToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border shadow-xl relative w-full max-w-md mx-4">
            <button
              type="button"
              className="absolute top-4 end-4 cursor-pointer p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors"
              onClick={() => setAdvanceToDelete(null)}
            >
              <Image src="/close.png" alt={tModals("close")} width={14} height={14} />
            </button>

            <div className="p-6 flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                <Trash2 className="w-6 h-6" />
              </div>
              <h2 className="text-section-title font-bold text-gray-900">
                {tModals("deleteConfirmTitle")}
              </h2>
              <p className="text-table-body text-muted">
                {locale === "ar"
                  ? `هل أنت متأكد من حذف تسبيق ${advanceToDelete.staffName} بمبلغ ${advanceToDelete.amount.toLocaleString(numLocale)} دج؟`
                  : `Voulez-vous vraiment supprimer l'avance de ${advanceToDelete.staffName} (${advanceToDelete.amount.toLocaleString(numLocale)} DZD) ?`}
              </p>
              <div className="flex items-center gap-3 mt-4 w-full">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAdvanceToDelete(null)}
                  className="flex-1"
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  isLoading={isDeleting}
                  onClick={handleConfirmDeleteAdvance}
                  className="flex-1"
                >
                  {tCommon("delete")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE STAFF MEMBER MODAL */}
      {staffToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border shadow-xl relative w-full max-w-md mx-4">
            <button
              type="button"
              className="absolute top-4 end-4 cursor-pointer p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors"
              onClick={() => setStaffToDelete(null)}
            >
              <Image src="/close.png" alt={tModals("close")} width={14} height={14} />
            </button>

            <div className="p-6 flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                <Trash2 className="w-6 h-6" />
              </div>
              <h2 className="text-section-title font-bold text-gray-900">
                {tModals("deleteConfirmTitle")}
              </h2>
              <p className="text-table-body text-muted">
                {locale === "ar"
                  ? `هل أنت متأكد من حذف الموظف "${staffToDelete.name}" (${staffToDelete.roleTitle})؟`
                  : `Voulez-vous vraiment supprimer le membre "${staffToDelete.name}" (${staffToDelete.roleTitle}) ?`}
              </p>
              <div className="flex items-center gap-3 mt-4 w-full">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStaffToDelete(null)}
                  className="flex-1"
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  isLoading={isDeleting}
                  onClick={handleConfirmDeleteStaff}
                  className="flex-1"
                >
                  {tCommon("delete")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
