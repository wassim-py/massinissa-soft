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

export async function recordStaffPayrollAction(data: {
  staffMemberId: number;
  month: number;
  year: number;
  amount: number;
  status?: "PAID" | "PENDING";
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
      return { success: false, error: true, message: "Le montant du salaire doit être supérieur à 0." };
    }

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
        status: data.status || "PAID",
        notes: data.notes?.trim() || null,
        recordedBy: session.userId || "owner",
        paidAt: data.status === "PENDING" ? null : new Date(),
      },
      update: {
        amount: new Prisma.Decimal(data.amount),
        status: data.status || "PAID",
        notes: data.notes?.trim() || null,
        paidAt: data.status === "PENDING" ? null : new Date(),
      },
    });

    safeRevalidate("/list/finance");
    return { success: true, error: false, message: "Salaire du personnel enregistré avec succès.", payroll };
  } catch (err: any) {
    console.error("recordStaffPayrollAction error:", err);
    return { success: false, error: true, message: err.message || "Erreur lors de l'enregistrement du salaire." };
  }
}
