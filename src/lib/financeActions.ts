"use server";

import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore outside request context
  }
}

// =================================================================
// 1. DÉPENSES QUOTIDIENNES (DAILY EXPENSES)
// =================================================================

export async function createDailyExpenseAction(data: {
  amount: number;
  description: string;
  category?: string;
  branchId?: number | null;
  date?: string | Date;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    if (!data.amount || Number(data.amount) <= 0) {
      return { success: false, error: true, message: "Le montant doit être supérieur à 0 / يجب أن يكون المبلغ أكبر من 0." };
    }
    if (!data.description?.trim()) {
      return { success: false, error: true, message: "La description est obligatoire / البيان أو الوصف إجباري." };
    }

    const expense = await prisma.dailyExpense.create({
      data: {
        amount: new Prisma.Decimal(data.amount),
        description: data.description.trim(),
        category: data.category?.trim() || "GENERAL",
        branchId: data.branchId ? Number(data.branchId) : null,
        date: data.date ? new Date(data.date) : new Date(),
        recordedBy: session.userId || "owner",
      },
    });

    safeRevalidate("/list/finance");
    return { success: true, error: false, message: "Dépense enregistrée avec succès / تم تسجيل النفقة بنجاح.", expense };
  } catch (err: any) {
    console.error("createDailyExpenseAction error:", err);
    return { success: false, error: true, message: err.message || "Erreur lors de l'enregistrement de la dépense." };
  }
}

export async function updateDailyExpenseAction(
  id: number,
  data: {
    amount?: number;
    description?: string;
    category?: string;
    branchId?: number | null;
    date?: string | Date;
  }
) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    const expense = await prisma.dailyExpense.update({
      where: { id },
      data: {
        ...(data.amount !== undefined ? { amount: new Prisma.Decimal(data.amount) } : {}),
        ...(data.description !== undefined ? { description: data.description.trim() } : {}),
        ...(data.category !== undefined ? { category: data.category.trim() } : {}),
        ...(data.branchId !== undefined ? { branchId: data.branchId ? Number(data.branchId) : null } : {}),
        ...(data.date !== undefined ? { date: new Date(data.date) } : {}),
      },
    });

    safeRevalidate("/list/finance");
    return { success: true, error: false, message: "Dépense mise à jour avec succès / تم تحديث النفقة بنجاح.", expense };
  } catch (err: any) {
    console.error("updateDailyExpenseAction error:", err);
    return { success: false, error: true, message: err.message || "Erreur lors de la modification de la dépense." };
  }
}

export async function deleteDailyExpenseAction(id: number) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    await prisma.dailyExpense.delete({ where: { id } });

    safeRevalidate("/list/finance");
    return { success: true, error: false, message: "Dépense supprimée avec succès / تم حذف النفقة بنجاح." };
  } catch (err: any) {
    console.error("deleteDailyExpenseAction error:", err);
    return { success: false, error: true, message: err.message || "Erreur lors de la suppression de la dépense." };
  }
}

// =================================================================
// 2. CAISSE NOIRE (OWNER'S PRIVATE WALLET)
// =================================================================

export async function createCaisseNoireTransactionAction(data: {
  type: "DEPOSIT" | "WITHDRAWAL";
  amount: number;
  description: string;
  date?: string | Date;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    if (!data.amount || Number(data.amount) <= 0) {
      return { success: false, error: true, message: "Le montant doit être supérieur à 0." };
    }
    if (!data.description?.trim()) {
      return { success: false, error: true, message: "La description est obligatoire." };
    }

    const tx = await prisma.caisseNoireTransaction.create({
      data: {
        type: data.type === "WITHDRAWAL" ? "WITHDRAWAL" : "DEPOSIT",
        amount: new Prisma.Decimal(data.amount),
        description: data.description.trim(),
        date: data.date ? new Date(data.date) : new Date(),
        recordedBy: session.userId || "owner",
      },
    });

    safeRevalidate("/list/finance");
    return {
      success: true,
      error: false,
      message: data.type === "DEPOSIT" ? "Fonds ajoutés à la Caisse Noire avec succès." : "Retrait enregistré avec succès.",
      transaction: tx,
    };
  } catch (err: any) {
    console.error("createCaisseNoireTransactionAction error:", err);
    return { success: false, error: true, message: err.message || "Erreur lors de l'enregistrement de l'opération." };
  }
}

export async function updateCaisseNoireTransactionAction(
  id: number,
  data: {
    type?: "DEPOSIT" | "WITHDRAWAL";
    amount?: number;
    description?: string;
    date?: string | Date;
  }
) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    if (data.amount !== undefined && Number(data.amount) <= 0) {
      return { success: false, error: true, message: "Le montant doit être supérieur à 0 / يجب أن يكون المبلغ أكبر من 0." };
    }
    if (data.description !== undefined && !data.description.trim()) {
      return { success: false, error: true, message: "La description est obligatoire / البيان أو الوصف إجباري." };
    }

    const tx = await prisma.caisseNoireTransaction.update({
      where: { id },
      data: {
        ...(data.type !== undefined ? { type: data.type === "WITHDRAWAL" ? "WITHDRAWAL" : "DEPOSIT" } : {}),
        ...(data.amount !== undefined ? { amount: new Prisma.Decimal(data.amount) } : {}),
        ...(data.description !== undefined ? { description: data.description.trim() } : {}),
        ...(data.date !== undefined ? { date: new Date(data.date) } : {}),
      },
    });

    safeRevalidate("/list/finance");
    return {
      success: true,
      error: false,
      message: "Transaction mise à jour avec succès / تم تحديث المعاملة بنجاح.",
      transaction: tx,
    };
  } catch (err: any) {
    console.error("updateCaisseNoireTransactionAction error:", err);
    return { success: false, error: true, message: err.message || "Erreur lors de la modification de la transaction." };
  }
}

export async function deleteCaisseNoireTransactionAction(id: number) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    await prisma.caisseNoireTransaction.delete({
      where: { id },
    });

    safeRevalidate("/list/finance");
    return {
      success: true,
      error: false,
      message: "Transaction supprimée avec succès / تم حذف المعاملة بنجاح.",
    };
  } catch (err: any) {
    console.error("deleteCaisseNoireTransactionAction error:", err);
    return { success: false, error: true, message: err.message || "Erreur lors de la suppression de la transaction." };
  }
}

export async function getCaisseNoireSummary() {
  const transactions = await prisma.caisseNoireTransaction.findMany({
    orderBy: { date: "desc" },
    take: 50,
  });

  const allTx = await prisma.caisseNoireTransaction.findMany({
    select: { type: true, amount: true },
  });

  let balance = 0;
  let totalDeposited = 0;
  let totalWithdrawn = 0;

  for (const t of allTx) {
    const amt = Number(t.amount);
    if (t.type === "DEPOSIT") {
      balance += amt;
      totalDeposited += amt;
    } else {
      balance -= amt;
      totalWithdrawn += amt;
    }
  }

  return {
    balance,
    totalDeposited,
    totalWithdrawn,
    recentTransactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      description: t.description,
      date: t.date,
      recordedBy: t.recordedBy,
    })),
  };
}

// =================================================================
// 3. STAFF MEMBERS & STAFF MONTHLY PAYROLL
// =================================================================

export async function createStaffMemberAction(data: {
  name: string;
  roleTitle: string;
  phone?: string;
  branchId?: number | null;
  baseSalary?: number;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    if (!data.name?.trim()) {
      return { success: false, error: true, message: "Le nom est obligatoire." };
    }
    if (!data.roleTitle?.trim()) {
      return { success: false, error: true, message: "La fonction ou le poste est obligatoire." };
    }

    const member = await prisma.staffMember.create({
      data: {
        name: data.name.trim(),
        roleTitle: data.roleTitle.trim(),
        phone: data.phone?.trim() || null,
        branchId: data.branchId ? Number(data.branchId) : null,
        baseSalary: new Prisma.Decimal(data.baseSalary || 0),
        isActive: true,
      },
    });

    safeRevalidate("/list/finance");
    return { success: true, error: false, message: "Membre du personnel ajouté avec succès.", member };
  } catch (err: any) {
    console.error("createStaffMemberAction error:", err);
    return { success: false, error: true, message: err.message || "Erreur lors de l'ajout du membre du personnel." };
  }
}

export async function updateStaffMemberAction(
  id: number,
  data: {
    name?: string;
    roleTitle?: string;
    phone?: string;
    branchId?: number | null;
    baseSalary?: number;
    isActive?: boolean;
  }
) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    const member = await prisma.staffMember.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.roleTitle !== undefined ? { roleTitle: data.roleTitle.trim() } : {}),
        ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
        ...(data.branchId !== undefined ? { branchId: data.branchId ? Number(data.branchId) : null } : {}),
        ...(data.baseSalary !== undefined ? { baseSalary: new Prisma.Decimal(data.baseSalary) } : {}),
        ...(data.isActive !== undefined ? { isActive: Boolean(data.isActive) } : {}),
      },
    });

    safeRevalidate("/list/finance");
    return { success: true, error: false, message: "Informations du membre mises à jour.", member };
  } catch (err: any) {
    console.error("updateStaffMemberAction error:", err);
    return { success: false, error: true, message: err.message || "Erreur lors de la mise à jour." };
  }
}

export async function deleteStaffMemberAction(id: number) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    await prisma.staffMember.delete({
      where: { id },
    });

    safeRevalidate("/list/finance");
    return { success: true, error: false, message: "Membre du personnel supprimé avec succès." };
  } catch (err: any) {
    console.error("deleteStaffMemberAction error:", err);
    return { success: false, error: true, message: err.message || "Erreur lors de la suppression." };
  }
}

export async function recordStaffPayrollAction(data: {
  staffMemberId: number;
  month: number;
  year: number;
  amount: number;
  advance?: number;
  bonus?: number;
  status?: "PAID" | "PENDING";
  notes?: string;
  updateDefaultBaseSalary?: boolean;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    if (!data.staffMemberId) {
      return { success: false, error: true, message: "Veuillez sélectionner un employé." };
    }
    if (!data.amount || Number(data.amount) <= 0) {
      return { success: false, error: true, message: "Le montant du salaire doit être supérieur à 0." };
    }

    const bonusValue = Math.max(0, Number(data.bonus || 0));
    const advanceValue = Math.max(0, Number(data.advance || 0));

    const payroll = await prisma.staffPayroll.upsert({
      where: {
        staffMemberId_month_year: {
          staffMemberId: Number(data.staffMemberId),
          month: Number(data.month),
          year: Number(data.year),
        },
      },
      create: {
        staffMemberId: Number(data.staffMemberId),
        month: Number(data.month),
        year: Number(data.year),
        amount: new Prisma.Decimal(data.amount),
        advance: new Prisma.Decimal(advanceValue),
        bonus: new Prisma.Decimal(bonusValue),
        status: data.status || "PAID",
        notes: data.notes?.trim() || null,
        recordedBy: session.userId || "owner",
        paidAt: data.status === "PENDING" ? null : new Date(),
      },
      update: {
        amount: new Prisma.Decimal(data.amount),
        advance: new Prisma.Decimal(advanceValue),
        bonus: new Prisma.Decimal(bonusValue),
        status: data.status || "PAID",
        notes: data.notes?.trim() || null,
        paidAt: data.status === "PENDING" ? null : new Date(),
      },
    });

    if (data.updateDefaultBaseSalary) {
      await prisma.staffMember.update({
        where: { id: Number(data.staffMemberId) },
        data: { baseSalary: new Prisma.Decimal(data.amount) },
      });
    }

    safeRevalidate("/list/finance");
    return { success: true, error: false, message: "Salaire du personnel enregistré avec succès.", payroll };
  } catch (err: any) {
    console.error("recordStaffPayrollAction error:", err);
    return { success: false, error: true, message: err.message || "Erreur lors de l'enregistrement du salaire." };
  }
}

export async function updateStaffPayrollAction(
  id: number,
  data: {
    staffMemberId?: number;
    month?: number;
    year?: number;
    amount?: number;
    advance?: number;
    bonus?: number;
    status?: "PAID" | "PENDING";
    notes?: string;
    updateDefaultBaseSalary?: boolean;
  }
) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    const updatePayload: any = {};
    if (data.amount !== undefined) updatePayload.amount = new Prisma.Decimal(data.amount);
    if (data.advance !== undefined) updatePayload.advance = new Prisma.Decimal(Math.max(0, Number(data.advance)));
    if (data.bonus !== undefined) updatePayload.bonus = new Prisma.Decimal(Math.max(0, Number(data.bonus)));
    if (data.month !== undefined) updatePayload.month = Number(data.month);
    if (data.year !== undefined) updatePayload.year = Number(data.year);
    if (data.status !== undefined) {
      updatePayload.status = data.status;
      updatePayload.paidAt = data.status === "PENDING" ? null : new Date();
    }
    if (data.notes !== undefined) updatePayload.notes = data.notes?.trim() || null;

    const payroll = await prisma.staffPayroll.update({
      where: { id },
      data: updatePayload,
    });

    if (data.updateDefaultBaseSalary && data.amount && (data.staffMemberId || payroll.staffMemberId)) {
      await prisma.staffMember.update({
        where: { id: data.staffMemberId || payroll.staffMemberId },
        data: { baseSalary: new Prisma.Decimal(data.amount) },
      });
    }

    safeRevalidate("/list/finance");
    return { success: true, error: false, message: "Règlement du salaire mis à jour avec succès.", payroll };
  } catch (err: any) {
    console.error("updateStaffPayrollAction error:", err);
    return { success: false, error: true, message: err.message || "Erreur lors de la modification du salaire." };
  }
}

export async function deleteStaffPayrollAction(id: number) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    await prisma.staffPayroll.delete({
      where: { id },
    });

    safeRevalidate("/list/finance");
    return { success: true, error: false, message: "Règlement de salaire supprimé avec succès." };
  } catch (err: any) {
    console.error("deleteStaffPayrollAction error:", err);
    return { success: false, error: true, message: err.message || "Erreur lors de la suppression." };
  }
}

// =================================================================
// 4. STAFF SALARY ADVANCES (AVANCES SUR SALAIRE DU PERSONNEL)
// =================================================================

export async function recordStaffAdvanceAction(data: {
  staffMemberId: number;
  amount: number;
  date?: string | Date;
  month?: number;
  year?: number;
  notes?: string;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    if (!data.staffMemberId) {
      return { success: false, error: true, message: "Veuillez sélectionner un employé." };
    }
    if (!data.amount || Number(data.amount) <= 0) {
      return { success: false, error: true, message: "Le montant de l'avance doit être supérieur à 0." };
    }

    const advanceDate = data.date ? new Date(data.date) : new Date();
    const targetMonth = data.month ? Number(data.month) : advanceDate.getMonth() + 1;
    const targetYear = data.year ? Number(data.year) : advanceDate.getFullYear();

    const advance = await prisma.staffAdvance.create({
      data: {
        staffMemberId: Number(data.staffMemberId),
        amount: new Prisma.Decimal(data.amount),
        date: advanceDate,
        month: targetMonth,
        year: targetYear,
        notes: data.notes?.trim() || null,
        recordedBy: session.userId || "owner",
      },
    });

    safeRevalidate("/list/finance");
    return { success: true, error: false, message: "Avance sur salaire enregistrée avec succès.", advance };
  } catch (err: any) {
    console.error("recordStaffAdvanceAction error:", err);
    return { success: false, error: true, message: err.message || "Erreur lors de l'enregistrement de l'avance." };
  }
}

export async function updateStaffAdvanceAction(
  id: number,
  data: {
    staffMemberId?: number;
    amount?: number;
    date?: string | Date;
    month?: number;
    year?: number;
    notes?: string;
  }
) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    const updatePayload: any = {};
    if (data.staffMemberId !== undefined) updatePayload.staffMemberId = Number(data.staffMemberId);
    if (data.amount !== undefined) updatePayload.amount = new Prisma.Decimal(data.amount);
    if (data.date !== undefined) updatePayload.date = new Date(data.date);
    if (data.month !== undefined) updatePayload.month = Number(data.month);
    if (data.year !== undefined) updatePayload.year = Number(data.year);
    if (data.notes !== undefined) updatePayload.notes = data.notes?.trim() || null;

    const advance = await prisma.staffAdvance.update({
      where: { id },
      data: updatePayload,
    });

    safeRevalidate("/list/finance");
    return { success: true, error: false, message: "Avance mise à jour avec succès.", advance };
  } catch (err: any) {
    console.error("updateStaffAdvanceAction error:", err);
    return { success: false, error: true, message: err.message || "Erreur lors de la modification de l'avance." };
  }
}

export async function deleteStaffAdvanceAction(id: number) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    await prisma.staffAdvance.delete({
      where: { id },
    });

    safeRevalidate("/list/finance");
    return { success: true, error: false, message: "Avance supprimée avec succès." };
  } catch (err: any) {
    console.error("deleteStaffAdvanceAction error:", err);
    return { success: false, error: true, message: err.message || "Erreur lors de la suppression." };
  }
}

// =================================================================
// 5. SUIVI DES MANUELS SCOLAIRES (BOOKS FINANCE OVERVIEW)
// =================================================================

export interface BookDropDetail {
  id: number;
  branchId: number;
  branchName: string;
  quantity: number;
  dropDate: string;
  recordedBy: string;
}

export interface BookStudentDetail {
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  globalNumber: number;
  hasPaid: boolean;
  voucherNumber: number | null;
  voucherAmount: number | null;
  voucherDate: string | null;
  hasReceived: boolean;
  receivedAt: string | null;
  receivedBy: string | null;
  className: string | null;
  branchName: string | null;
}

export interface BookItemFinance {
  id: number;
  title: string;
  levelId: number;
  levelName: string;
  trimesterId: number | null;
  trimesterLabel: string | null;
  trimesterName: string | null;
  createdAt: string;
  studentsPaidCount: number;
  studentsReceivedCount: number;
  totalCopiesDeposited: number;
  remainingStock: number;
  drops: BookDropDetail[];
  students: BookStudentDetail[];
}

export interface ClassWithoutBookFinance {
  classId: number;
  className: string;
  levelId: number | null;
  branchName: string;
  vouchersCount: number;
  uniqueStudentsPaidCount: number;
  students: BookStudentDetail[];
}

export interface TeacherBooksFinance {
  teacherId: string;
  teacherName: string;
  teacherPhone: string | null;
  books: BookItemFinance[];
  classesWithoutBook: ClassWithoutBookFinance[];
  totalBooksCount: number;
  totalStudentsPaid: number;
  totalCopiesReceived: number;
  totalCopiesDeposited: number;
  totalRevenue: number;
}

export interface BooksFinanceOverviewResponse {
  success: boolean;
  error?: boolean;
  message?: string;
  data?: {
    totalRevenue: number;
    totalTeachersCount: number;
    totalBooksCount: number;
    totalStudentsPaidCount: number;
    totalCopiesReceivedCount: number;
    totalCopiesDepositedCount: number;
    teachers: TeacherBooksFinance[];
    allBranches: Array<{ id: number; name: string }>;
    allTrimesters: Array<{ id: number; label: string; name: string; status: string }>;
  };
}

export async function getBooksFinanceOverviewAction(): Promise<BooksFinanceOverviewResponse> {
  try {
    const session = await getAuthSession();
    if (!session.can("view", "finance") || !session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط.",
      };
    }

    const [rawBooks, rawBookVouchers, allBranches, allTrimesters, allTeachers] = await Promise.all([
      prisma.book.findMany({
        include: {
          teacher: { select: { id: true, name: true, phone: true } },
          level: { select: { id: true, name: true } },
          trimester: { select: { id: true, name: true, label: true, status: true } },
          drops: {
            include: { branch: { select: { id: true, name: true } } },
            orderBy: { dropDate: "desc" },
          },
          receipts: {
            include: { student: { select: { id: true, name: true, phone: true, globalNumber: true } } },
            orderBy: { receivedAt: "desc" },
          },
        },
        orderBy: [{ teacher: { name: "asc" } }, { createdAt: "desc" }],
      }),
      prisma.voucher.findMany({
        where: {
          paymentType: "BOOK",
          isVoided: false,
        },
        include: {
          student: { select: { id: true, name: true, phone: true, globalNumber: true } },
          class: {
            select: {
              id: true,
              name: true,
              teacherId: true,
              levelId: true,
              formationLevelId: true,
              isFormation: true,
              branchId: true,
              branch: { select: { id: true, name: true } },
            },
          },
          trimester: { select: { id: true, label: true, name: true } },
        },
        orderBy: { issuedAt: "desc" },
      }),
      prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
      prisma.trimester.findMany({
        select: { id: true, label: true, name: true, status: true },
        orderBy: { startDate: "desc" },
      }),
      prisma.teacher.findMany({ select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } }),
    ]);

    const teacherMap = new Map<string, TeacherBooksFinance>();

    function getOrCreateTeacher(tId: string, tName?: string | null, tPhone?: string | null): TeacherBooksFinance {
      if (!teacherMap.has(tId)) {
        teacherMap.set(tId, {
          teacherId: tId,
          teacherName: tName || "Enseignant inconnu",
          teacherPhone: tPhone || null,
          books: [],
          classesWithoutBook: [],
          totalBooksCount: 0,
          totalStudentsPaid: 0,
          totalCopiesReceived: 0,
          totalCopiesDeposited: 0,
          totalRevenue: 0,
        });
      }
      return teacherMap.get(tId)!;
    }

    // Process each book
    for (const book of rawBooks) {
      const tData = getOrCreateTeacher(book.teacherId, book.teacher?.name, book.teacher?.phone);

      const studentReceiptIds = new Set(book.receipts.map((r) => r.studentId));

      // Match vouchers belonging to this book
      const matchedVouchers = rawBookVouchers.filter((v) => {
        if (!v.class || v.class.teacherId !== book.teacherId) return false;
        if (studentReceiptIds.has(v.studentId)) return true;
        if (book.levelId && v.class.levelId && v.class.levelId === book.levelId) {
          if (!book.trimesterId || !v.trimesterId || book.trimesterId === v.trimesterId) return true;
        }
        if (v.class.levelId === null) {
          // Formation class without standard levelId
          if (!book.trimesterId || !v.trimesterId || book.trimesterId === v.trimesterId) return true;
        }
        return false;
      });

      // Deduplicate paid vouchers per student
      const uniquePaidMap = new Map<string, typeof matchedVouchers[0]>();
      let bookRevenue = 0;
      for (const v of matchedVouchers) {
        bookRevenue += Number(v.amount);
        if (!uniquePaidMap.has(v.studentId)) {
          uniquePaidMap.set(v.studentId, v);
        }
      }

      // Receipts map
      const receiptsMap = new Map<string, typeof book.receipts[0]>();
      for (const r of book.receipts) {
        receiptsMap.set(r.studentId, r);
      }

      // Combine students list
      const combinedStudentIds = new Set([
        ...Array.from(uniquePaidMap.keys()),
        ...Array.from(receiptsMap.keys()),
      ]);

      const studentDetails: BookStudentDetail[] = Array.from(combinedStudentIds).map((sId) => {
        const v = uniquePaidMap.get(sId);
        const r = receiptsMap.get(sId);
        return {
          studentId: sId,
          studentName: v?.student.name || r?.student.name || "Élève",
          studentPhone: v?.student.phone || r?.student.phone || null,
          globalNumber: v?.student.globalNumber || r?.student.globalNumber || 0,
          hasPaid: !!v,
          voucherNumber: v?.number || null,
          voucherAmount: v ? Number(v.amount) : null,
          voucherDate: v?.issuedAt.toISOString() || null,
          hasReceived: !!r,
          receivedAt: r?.receivedAt.toISOString() || null,
          receivedBy: r?.receivedBy || null,
          className: v?.class?.name || null,
          branchName: v?.class?.branch?.name || null,
        };
      });

      studentDetails.sort((a, b) => a.studentName.localeCompare(b.studentName, "ar"));

      const totalDeposited = book.drops.reduce((sum, d) => sum + d.quantity, 0);

      const bookItem: BookItemFinance = {
        id: book.id,
        title: book.title,
        levelId: book.levelId,
        levelName: book.level?.name || "—",
        trimesterId: book.trimesterId,
        trimesterLabel: book.trimester?.label || null,
        trimesterName: book.trimester?.name || null,
        createdAt: book.createdAt.toISOString(),
        studentsPaidCount: uniquePaidMap.size,
        studentsReceivedCount: book.receipts.length,
        totalCopiesDeposited: totalDeposited,
        remainingStock: totalDeposited - book.receipts.length,
        drops: book.drops.map((d) => ({
          id: d.id,
          branchId: d.branchId,
          branchName: d.branch?.name || "—",
          quantity: d.quantity,
          dropDate: d.dropDate.toISOString(),
          recordedBy: d.recordedBy,
        })),
        students: studentDetails,
      };

      tData.books.push(bookItem);
      tData.totalBooksCount += 1;
      tData.totalCopiesDeposited += totalDeposited;
      tData.totalCopiesReceived += book.receipts.length;
      tData.totalRevenue += bookRevenue;
    }

    // Check vouchers for teachers without formal books or classes not yet covered
    for (const v of rawBookVouchers) {
      if (v.class?.teacherId) {
        const teacherMeta = allTeachers.find((item) => item.id === v.class!.teacherId);
        const tData = getOrCreateTeacher(v.class.teacherId, teacherMeta?.name, teacherMeta?.phone);

        const isCovered = tData.books.some((b) =>
          b.students.some((s) => s.studentId === v.studentId && s.voucherNumber === v.number)
        );

        if (!isCovered) {
          let grp = tData.classesWithoutBook.find((g) => g.classId === v.class!.id);
          if (!grp) {
            grp = {
              classId: v.class.id,
              className: v.class.name,
              levelId: v.class.levelId,
              branchName: v.class.branch?.name || "—",
              vouchersCount: 0,
              uniqueStudentsPaidCount: 0,
              students: [],
            };
            tData.classesWithoutBook.push(grp);
          }
          grp.vouchersCount += 1;
          grp.students.push({
            studentId: v.studentId,
            studentName: v.student.name,
            studentPhone: v.student.phone,
            globalNumber: v.student.globalNumber,
            hasPaid: true,
            voucherNumber: v.number,
            voucherAmount: Number(v.amount),
            voucherDate: v.issuedAt.toISOString(),
            hasReceived: false,
            receivedAt: null,
            receivedBy: null,
            className: v.class.name,
            branchName: v.class.branch?.name || null,
          });
          tData.totalRevenue += Number(v.amount);
        }
      }
    }

    // Recalculate unique students paid for each teacher
    for (const t of teacherMap.values()) {
      const allUniqueStudentIds = new Set<string>();
      for (const b of t.books) {
        for (const s of b.students) {
          if (s.hasPaid) allUniqueStudentIds.add(s.studentId);
        }
      }
      for (const g of t.classesWithoutBook) {
        const grpStudentIds = new Set(g.students.map((s) => s.studentId));
        g.uniqueStudentsPaidCount = grpStudentIds.size;
        for (const sId of grpStudentIds) allUniqueStudentIds.add(sId);
      }
      t.totalStudentsPaid = allUniqueStudentIds.size;
    }

    const teachers = Array.from(teacherMap.values()).sort((a, b) =>
      a.teacherName.localeCompare(b.teacherName, "ar")
    );

    // Global counts
    const globalPaidStudentIds = new Set(rawBookVouchers.map((v) => v.studentId));
    const globalTotalRevenue = rawBookVouchers.reduce((s, v) => s + Number(v.amount), 0);
    const globalTotalCopiesDeposited = rawBooks.reduce(
      (s, b) => s + b.drops.reduce((ds, d) => ds + d.quantity, 0),
      0
    );
    const globalTotalCopiesReceived = rawBooks.reduce((s, b) => s + b.receipts.length, 0);

    return {
      success: true,
      data: {
        totalRevenue: globalTotalRevenue,
        totalTeachersCount: teachers.length,
        totalBooksCount: rawBooks.length,
        totalStudentsPaidCount: globalPaidStudentIds.size,
        totalCopiesReceivedCount: globalTotalCopiesReceived,
        totalCopiesDepositedCount: globalTotalCopiesDeposited,
        teachers,
        allBranches,
        allTrimesters,
      },
    };
  } catch (error: any) {
    console.error("getBooksFinanceOverviewAction error:", error);
    return {
      success: false,
      error: true,
      message: error?.message || "Erreur lors de la récupération des détails des manuels scolaires.",
    };
  }
}
