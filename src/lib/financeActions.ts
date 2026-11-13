"use server";

import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { revalidateFinancialRoutes } from "@/lib/revalidation";
import { getAlgiersDayBounds } from "@/lib/algiersDate";
import { normalizeOutcomeFundingSource } from "@/lib/financeConstants";
import { syncOutcomeWithCaisseNoire, cleanupCaisseNoireLinks } from "@/lib/caisseNoireSync";

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
  fundingSource?: string | null;
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

    const fundingSource = normalizeOutcomeFundingSource(data.fundingSource);
    const expenseDate = data.date ? new Date(data.date) : new Date();
    const amountNum = Number(data.amount);
    const description = data.description.trim();

    const expense = await prisma.$transaction(async (tx) => {
      const cnTxId = await syncOutcomeWithCaisseNoire(tx, {
        fundingSource,
        isDisbursed: true,
        amount: amountNum,
        description: `[Dépense] ${description}`,
        date: expenseDate,
        recordedBy: session.userId || "owner",
      });

      return tx.dailyExpense.create({
        data: {
          amount: new Prisma.Decimal(amountNum),
          description,
          category: data.category?.trim() || "GENERAL",
          fundingSource,
          caisseNoireTxId: cnTxId,
          branchId: data.branchId ? Number(data.branchId) : null,
          date: expenseDate,
          recordedBy: session.userId || "owner",
        },
      });
    });

    await revalidateFinancialRoutes({
      branchId: data.branchId ? Number(data.branchId) : null,
    });
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
    fundingSource?: string | null;
    branchId?: number | null;
    date?: string | Date;
  }
) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    const expense = await prisma.$transaction(async (tx) => {
      const existing = await tx.dailyExpense.findUnique({ where: { id } });
      if (!existing) {
        throw new Error("Dépense introuvable.");
      }

      const nextAmount = data.amount !== undefined ? Number(data.amount) : Number(existing.amount);
      const nextDescription = data.description !== undefined ? data.description.trim() : existing.description;
      const nextCategory = data.category !== undefined ? data.category.trim() : existing.category;
      const nextBranchId = data.branchId !== undefined ? (data.branchId ? Number(data.branchId) : null) : existing.branchId;
      const nextDate = data.date !== undefined ? new Date(data.date) : existing.date;
      const nextFundingSource =
        data.fundingSource !== undefined
          ? normalizeOutcomeFundingSource(data.fundingSource)
          : normalizeOutcomeFundingSource(existing.fundingSource);

      const cnTxId = await syncOutcomeWithCaisseNoire(tx, {
        existingTxId: existing.caisseNoireTxId,
        fundingSource: nextFundingSource,
        isDisbursed: true,
        amount: nextAmount,
        description: `[Dépense] ${nextDescription}`,
        date: nextDate,
        recordedBy: session.userId || "owner",
      });

      return tx.dailyExpense.update({
        where: { id },
        data: {
          amount: new Prisma.Decimal(nextAmount),
          description: nextDescription,
          category: nextCategory,
          fundingSource: nextFundingSource,
          caisseNoireTxId: cnTxId,
          branchId: nextBranchId,
          date: nextDate,
        },
      });
    });

    await revalidateFinancialRoutes({
      branchId: expense.branchId ? Number(expense.branchId) : null,
    });
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

    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.dailyExpense.findUnique({ where: { id } });
      if (!existing) {
        throw new Error("Dépense introuvable.");
      }
      await cleanupCaisseNoireLinks(tx, [existing.caisseNoireTxId]);
      return tx.dailyExpense.delete({ where: { id } });
    });

    await revalidateFinancialRoutes({
      branchId: deleted.branchId ? Number(deleted.branchId) : null,
    });
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

    await revalidateFinancialRoutes();
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

    await revalidateFinancialRoutes();
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

    await revalidateFinancialRoutes();
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
  fundingSource?: string | null;
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
    const statusValue = data.status || "PAID";
    const fundingSource = normalizeOutcomeFundingSource(data.fundingSource);
    const netDisbursed = Math.max(0, Number(data.amount) - advanceValue + bonusValue);
    const paidAtDate = statusValue === "PENDING" ? null : new Date();

    const payroll = await prisma.$transaction(async (tx) => {
      const staffMemberId = Number(data.staffMemberId);
      const month = Number(data.month);
      const year = Number(data.year);
      const [staff, existing] = await Promise.all([
        tx.staffMember.findUnique({ where: { id: staffMemberId }, select: { name: true } }),
        tx.staffPayroll.findUnique({
          where: { staffMemberId_month_year: { staffMemberId, month, year } },
          select: { caisseNoireTxId: true },
        }),
      ]);

      const cnTxId = await syncOutcomeWithCaisseNoire(tx, {
        existingTxId: existing?.caisseNoireTxId,
        fundingSource,
        isDisbursed: statusValue === "PAID",
        amount: netDisbursed,
        description: `[Salaire Personnel] ${staff?.name || `#${staffMemberId}`} (${String(month).padStart(2, "0")}/${year})`,
        date: paidAtDate || new Date(),
        recordedBy: session.userId || "owner",
      });

      const saved = await tx.staffPayroll.upsert({
        where: {
          staffMemberId_month_year: {
            staffMemberId,
            month,
            year,
          },
        },
        create: {
          staffMemberId,
          month,
          year,
          amount: new Prisma.Decimal(data.amount),
          advance: new Prisma.Decimal(advanceValue),
          bonus: new Prisma.Decimal(bonusValue),
          status: statusValue,
          fundingSource,
          caisseNoireTxId: cnTxId,
          notes: data.notes?.trim() || null,
          recordedBy: session.userId || "owner",
          paidAt: paidAtDate,
        },
        update: {
          amount: new Prisma.Decimal(data.amount),
          advance: new Prisma.Decimal(advanceValue),
          bonus: new Prisma.Decimal(bonusValue),
          status: statusValue,
          fundingSource,
          caisseNoireTxId: cnTxId,
          notes: data.notes?.trim() || null,
          paidAt: paidAtDate,
        },
      });

      if (data.updateDefaultBaseSalary) {
        await tx.staffMember.update({
          where: { id: staffMemberId },
          data: { baseSalary: new Prisma.Decimal(data.amount) },
        });
      }

      return saved;
    });

    await revalidateFinancialRoutes();
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
    fundingSource?: string | null;
    notes?: string;
    updateDefaultBaseSalary?: boolean;
  }
) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    const payroll = await prisma.$transaction(async (tx) => {
      const existing = await tx.staffPayroll.findUnique({
        where: { id },
        include: { staffMember: { select: { name: true } } },
      });
      if (!existing) {
        throw new Error("Enregistrement de paie introuvable.");
      }

      const nextAmount = data.amount !== undefined ? Number(data.amount) : Number(existing.amount);
      const nextAdvance = data.advance !== undefined ? Math.max(0, Number(data.advance)) : Number(existing.advance);
      const nextBonus = data.bonus !== undefined ? Math.max(0, Number(data.bonus)) : Number(existing.bonus);
      const nextMonth = data.month !== undefined ? Number(data.month) : existing.month;
      const nextYear = data.year !== undefined ? Number(data.year) : existing.year;
      const nextStatus = data.status !== undefined ? data.status : existing.status;
      const nextFundingSource =
        data.fundingSource !== undefined
          ? normalizeOutcomeFundingSource(data.fundingSource)
          : normalizeOutcomeFundingSource(existing.fundingSource);
      const nextPaidAt =
        data.status !== undefined
          ? data.status === "PENDING"
            ? null
            : existing.paidAt || new Date()
          : existing.paidAt;
      const netDisbursed = Math.max(0, nextAmount - nextAdvance + nextBonus);

      const cnTxId = await syncOutcomeWithCaisseNoire(tx, {
        existingTxId: existing.caisseNoireTxId,
        fundingSource: nextFundingSource,
        isDisbursed: nextStatus === "PAID",
        amount: netDisbursed,
        description: `[Salaire Personnel] ${existing.staffMember?.name || `#${existing.staffMemberId}`} (${String(nextMonth).padStart(2, "0")}/${nextYear})`,
        date: nextPaidAt || new Date(),
        recordedBy: session.userId || "owner",
      });

      const updated = await tx.staffPayroll.update({
        where: { id },
        data: {
          amount: new Prisma.Decimal(nextAmount),
          advance: new Prisma.Decimal(nextAdvance),
          bonus: new Prisma.Decimal(nextBonus),
          month: nextMonth,
          year: nextYear,
          status: nextStatus,
          paidAt: nextPaidAt,
          fundingSource: nextFundingSource,
          caisseNoireTxId: cnTxId,
          ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
        },
      });

      if (data.updateDefaultBaseSalary && data.amount && (data.staffMemberId || updated.staffMemberId)) {
        await tx.staffMember.update({
          where: { id: data.staffMemberId || updated.staffMemberId },
          data: { baseSalary: new Prisma.Decimal(data.amount) },
        });
      }

      return updated;
    });

    await revalidateFinancialRoutes();
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

    await prisma.$transaction(async (tx) => {
      const existing = await tx.staffPayroll.findUnique({ where: { id }, select: { caisseNoireTxId: true } });
      if (existing?.caisseNoireTxId) {
        await cleanupCaisseNoireLinks(tx, [existing.caisseNoireTxId]);
      }
      await tx.staffPayroll.delete({
        where: { id },
      });
    });

    await revalidateFinancialRoutes();
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
  fundingSource?: string | null;
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
    const fundingSource = normalizeOutcomeFundingSource(data.fundingSource);
    const amountNum = Number(data.amount);

    const advance = await prisma.$transaction(async (tx) => {
      const staffMemberId = Number(data.staffMemberId);
      const staff = await tx.staffMember.findUnique({ where: { id: staffMemberId }, select: { name: true } });
      const cnTxId = await syncOutcomeWithCaisseNoire(tx, {
        fundingSource,
        isDisbursed: true,
        amount: amountNum,
        description: `[Avance Personnel] ${staff?.name || `#${staffMemberId}`}${data.notes ? ` — ${data.notes.trim()}` : ""}`,
        date: advanceDate,
        recordedBy: session.userId || "owner",
      });

      return tx.staffAdvance.create({
        data: {
          staffMemberId,
          amount: new Prisma.Decimal(amountNum),
          date: advanceDate,
          month: targetMonth,
          year: targetYear,
          fundingSource,
          caisseNoireTxId: cnTxId,
          notes: data.notes?.trim() || null,
          recordedBy: session.userId || "owner",
        },
      });
    });

    await revalidateFinancialRoutes();
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
    fundingSource?: string | null;
    notes?: string;
  }
) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط." };
    }

    const advance = await prisma.$transaction(async (tx) => {
      const existing = await tx.staffAdvance.findUnique({ where: { id } });
      if (!existing) {
        throw new Error("Avance introuvable.");
      }
      const nextStaffMemberId = data.staffMemberId !== undefined ? Number(data.staffMemberId) : existing.staffMemberId;
      const nextAmount = data.amount !== undefined ? Number(data.amount) : Number(existing.amount);
      const nextDate = data.date !== undefined ? new Date(data.date) : existing.date;
      const nextMonth = data.month !== undefined ? Number(data.month) : existing.month;
      const nextYear = data.year !== undefined ? Number(data.year) : existing.year;
      const nextNotes = data.notes !== undefined ? data.notes?.trim() || null : existing.notes;
      const nextFundingSource =
        data.fundingSource !== undefined
          ? normalizeOutcomeFundingSource(data.fundingSource)
          : normalizeOutcomeFundingSource(existing.fundingSource);

      const staff = await tx.staffMember.findUnique({ where: { id: nextStaffMemberId }, select: { name: true } });
      const cnTxId = await syncOutcomeWithCaisseNoire(tx, {
        existingTxId: existing.caisseNoireTxId,
        fundingSource: nextFundingSource,
        isDisbursed: true,
        amount: nextAmount,
        description: `[Avance Personnel] ${staff?.name || `#${nextStaffMemberId}`}${nextNotes ? ` — ${nextNotes}` : ""}`,
        date: nextDate,
        recordedBy: session.userId || "owner",
      });

      return tx.staffAdvance.update({
        where: { id },
        data: {
          staffMemberId: nextStaffMemberId,
          amount: new Prisma.Decimal(nextAmount),
          date: nextDate,
          month: nextMonth,
          year: nextYear,
          fundingSource: nextFundingSource,
          caisseNoireTxId: cnTxId,
          notes: nextNotes,
        },
      });
    });

    await revalidateFinancialRoutes();
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

    await prisma.$transaction(async (tx) => {
      const existing = await tx.staffAdvance.findUnique({ where: { id }, select: { caisseNoireTxId: true } });
      if (existing?.caisseNoireTxId) {
        await cleanupCaisseNoireLinks(tx, [existing.caisseNoireTxId]);
      }
      await tx.staffAdvance.delete({
        where: { id },
      });
    });

    await revalidateFinancialRoutes();
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

// =================================================================
// 6. SECTION-TO-SECTION MONEY TRANSFERS (TRANSFERTS INTER-SECTIONS)
// =================================================================

export interface SectionTransferItem {
  id: number;
  fromSection: string;
  toSection: string;
  amount: number;
  date: string;
  reason: string | null;
  recordedBy: string;
  branchId?: number | null;
  caisseNoireTxId?: number | null;
  createdAt: string;
}

import { FINANCE_SECTIONS } from "./financeConstants";

export async function executeSectionTransferAction(data: {
  fromSection: string;
  toSection: string;
  amount: number;
  date?: string | Date;
  reason?: string;
  branchId?: number | null;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / متاح للمالك فقط." };
    }

    const amount = Number(data.amount);
    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: true, message: "Le montant doit être supérieur à 0 / يجب أن يكون المبلغ أكبر من 0." };
    }

    if (!data.fromSection || !data.toSection) {
      return { success: false, error: true, message: "Veuillez sélectionner la section source et destination." };
    }

    if (data.fromSection === data.toSection) {
      return { success: false, error: true, message: "La source et la destination ne peuvent pas être identiques." };
    }

    const transferDate = data.date ? new Date(data.date) : new Date();
    const fromLabel = FINANCE_SECTIONS.find((s) => s.id === data.fromSection)?.labelFr || data.fromSection;
    const toLabel = FINANCE_SECTIONS.find((s) => s.id === data.toSection)?.labelFr || data.toSection;
    const cleanReason = (data.reason || "").trim();

    let createdCaisseNoireTxId: number | null = null;

    // 1. If destination is CAISSE_NOIRE, automatically add a DEPOSIT
    if (data.toSection === "CAISSE_NOIRE") {
      const depositDescription = `[Transfert depuis ${fromLabel}] ${cleanReason}`.trim();
      const cnDeposit = await prisma.caisseNoireTransaction.create({
        data: {
          type: "DEPOSIT",
          amount: new Prisma.Decimal(amount),
          description: depositDescription,
          date: transferDate,
          recordedBy: session.userId || "owner",
        },
      });
      createdCaisseNoireTxId = cnDeposit.id;
    }

    // 2. If source is CAISSE_NOIRE, automatically add a WITHDRAWAL
    if (data.fromSection === "CAISSE_NOIRE") {
      const withdrawalDescription = `[Transfert vers ${toLabel}] ${cleanReason}`.trim();
      const cnWithdrawal = await prisma.caisseNoireTransaction.create({
        data: {
          type: "WITHDRAWAL",
          amount: new Prisma.Decimal(amount),
          description: withdrawalDescription,
          date: transferDate,
          recordedBy: session.userId || "owner",
        },
      });
      createdCaisseNoireTxId = cnWithdrawal.id;
    }

    // 3. Record the SectionTransfer audit entry
    const transfer = await prisma.sectionTransfer.create({
      data: {
        fromSection: data.fromSection,
        toSection: data.toSection,
        amount: new Prisma.Decimal(amount),
        date: transferDate,
        reason: cleanReason || null,
        recordedBy: session.userId || "owner",
        branchId: data.branchId ? Number(data.branchId) : null,
        caisseNoireTxId: createdCaisseNoireTxId,
      },
    });

    safeRevalidate("/list/finance");
    safeRevalidate("/list/daily-ledger");
    revalidateFinancialRoutes();

    return {
      success: true,
      error: false,
      message: `Transfert de ${amount.toLocaleString()} DZD effectué avec succès de [${fromLabel}] vers [${toLabel}].`,
      transferId: transfer.id,
      caisseNoireTxId: createdCaisseNoireTxId,
    };
  } catch (error: any) {
    console.error("executeSectionTransferAction error:", error);
    return {
      success: false,
      error: true,
      message: error?.message || "Erreur lors de l'exécution du transfert de fonds.",
    };
  }
}

export async function getSectionTransfersAction(filters?: {
  fromSection?: string;
  toSection?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const session = await getAuthSession();
    if (!session.can("view", "finance") || !session.isOwner) {
      return { success: false, error: true, message: "Accès refusé", transfers: [] };
    }

    const where: Prisma.SectionTransferWhereInput = {};
    if (filters?.fromSection && filters.fromSection !== "ALL") {
      where.fromSection = filters.fromSection;
    }
    if (filters?.toSection && filters.toSection !== "ALL") {
      where.toSection = filters.toSection;
    }
    if (filters?.dateFrom || filters?.dateTo) {
      where.date = {};
      if (filters.dateFrom) where.date.gte = new Date(filters.dateFrom);
      if (filters.dateTo) {
        const dTo = new Date(filters.dateTo);
        dTo.setUTCHours(23, 59, 59, 999);
        where.date.lte = dTo;
      }
    }

    const rawTransfers = await prisma.sectionTransfer.findMany({
      where,
      orderBy: { date: "desc" },
      take: 200,
    });

    const transfers: SectionTransferItem[] = rawTransfers.map((t) => ({
      id: t.id,
      fromSection: t.fromSection,
      toSection: t.toSection,
      amount: Number(t.amount),
      date: t.date.toISOString(),
      reason: t.reason,
      recordedBy: t.recordedBy,
      branchId: t.branchId,
      caisseNoireTxId: t.caisseNoireTxId,
      createdAt: t.createdAt.toISOString(),
    }));

    return { success: true, transfers };
  } catch (error: any) {
    console.error("getSectionTransfersAction error:", error);
    return { success: false, error: true, message: error?.message, transfers: [] };
  }
}

export async function getPhotocopyTransferPoolAction(dateFrom?: string, dateTo?: string) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, totalCollected: 0, totalTransferred: 0, available: 0 };
    }

    const whereCharge: Prisma.PhotocopyChargeWhereInput = {};
    const whereTransfer: Prisma.SectionTransferWhereInput = {
      fromSection: "PHOTOCOPY_DEDUCTIONS",
    };

    if (dateFrom || dateTo) {
      whereCharge.date = {};
      whereTransfer.date = {};
      if (dateFrom) {
        whereCharge.date.gte = new Date(dateFrom);
        whereTransfer.date.gte = new Date(dateFrom);
      }
      if (dateTo) {
        const dTo = new Date(dateTo);
        dTo.setUTCHours(23, 59, 59, 999);
        whereCharge.date.lte = dTo;
        whereTransfer.date.lte = dTo;
      }
    }

    const [charges, transfers, payslips] = await Promise.all([
      prisma.photocopyCharge.findMany({
        where: whereCharge,
        select: { costAmount: true },
      }),
      prisma.sectionTransfer.findMany({
        where: whereTransfer,
        select: { amount: true },
      }),
      prisma.payslip.findMany({
        where: {
          photocopyDeductions: { gt: 0 },
        },
        select: { photocopyDeductions: true },
      }),
    ]);

    const totalFromCharges = charges.reduce((s, c) => s + Number(c.costAmount), 0);
    const totalFromPayslips = payslips.reduce((s, p) => s + Number(p.photocopyDeductions), 0);
    const totalCollected = Math.max(totalFromCharges, totalFromPayslips);
    const totalTransferred = transfers.reduce((s, t) => s + Number(t.amount), 0);
    const available = Math.max(0, totalCollected - totalTransferred);

    return {
      success: true,
      totalCollected,
      totalTransferred,
      available,
    };
  } catch (error: any) {
    console.error("getPhotocopyTransferPoolAction error:", error);
    return { success: false, error: true, totalCollected: 0, totalTransferred: 0, available: 0 };
  }
}

export async function deleteSectionTransferAction(id: number) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire." };
    }

    const transfer = await prisma.sectionTransfer.findUnique({
      where: { id },
    });

    if (!transfer) {
      return { success: false, error: true, message: "Transfert introuvable." };
    }

    // If it was linked to CaisseNoireTransaction, delete that too to keep balances pure
    if (transfer.caisseNoireTxId) {
      await prisma.caisseNoireTransaction.deleteMany({
        where: { id: transfer.caisseNoireTxId },
      });
    }

    await prisma.sectionTransfer.delete({
      where: { id },
    });

    safeRevalidate("/list/finance");
    safeRevalidate("/list/daily-ledger");
    revalidateFinancialRoutes();

    return { success: true, error: false, message: "Transfert annulé et supprimé." };
  } catch (error: any) {
    console.error("deleteSectionTransferAction error:", error);
    return { success: false, error: true, message: error?.message || "Erreur lors de la suppression." };
  }
}

// =================================================================
// 7. SELECTIVE TEACHER REPORT DATA FETCHER
// =================================================================

export interface TeacherSelectiveReportData {
  teacher: {
    id: string;
    name: string;
    phone: string | null;
  };
  periodStart: string;
  periodEnd: string;
  regularLessons: {
    groups: Array<{
      className: string;
      branchName?: string;
      payableLessonsCount: number;
      teacherAmount: number;
      schoolAmount: number;
      tuitionGross: number;
    }>;
    totalLessonsCount: number;
    totalTeacherCut: number;
    totalSchoolCut: number;
  };
  formationCourses: {
    groups: Array<{
      className: string;
      branchName?: string;
      payableLessonsCount: number;
      teacherAmount: number;
      schoolAmount: number;
      tuitionGross: number;
    }>;
    totalLessonsCount: number;
    totalTeacherCut: number;
    totalSchoolCut: number;
  };
  booksFinance: {
    books: Array<{
      bookId?: number;
      title: string;
      levelName?: string;
      copiesSold: number;
      totalRevenue: number;
    }>;
    totalCopiesSold: number;
    totalBooksFees: number;
  };
  salaryAdvances: {
    total: number;
    details: Array<{
      amount: number;
      date: string;
      remarque?: string | null;
    }>;
  };
  photocopyDeductions: {
    total: number;
    pages: number;
  };
  bonus: number;
}

export async function getTeacherSelectiveReportDataAction(
  teacherId: string,
  startDateStr: string,
  endDateStr: string
): Promise<{ success: boolean; error?: boolean; message?: string; data?: TeacherSelectiveReportData }> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire." };
    }

    const { calculateTeacherPayroll } = await import("./payroll");
    const startDate = new Date(startDateStr);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(endDateStr);
    endDate.setUTCHours(23, 59, 59, 999);

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, name: true, phone: true },
    });

    if (!teacher) {
      return { success: false, error: true, message: "Enseignant introuvable." };
    }

    // 1. Calculate payroll for normal and formation scopes independently
    const [normalCalc, formationCalc] = await Promise.all([
      calculateTeacherPayroll(teacherId, startDate, endDate, "normal"),
      calculateTeacherPayroll(teacherId, startDate, endDate, "formation"),
    ]);

    const regularGroupItems = (normalCalc?.groupBreakdown || []).map((g) => ({
      className: g.className,
      branchName: g.branchName,
      payableLessonsCount: Number(g.payableLessonsCount || 0),
      teacherAmount: Number(g.amount || 0),
      schoolAmount: Number(g.schoolAmount || 0),
      tuitionGross: Number(g.tuitionGross || 0),
    }));

    const formationGroupItems = (formationCalc?.groupBreakdown || []).map((g) => ({
      className: g.className,
      branchName: g.branchName,
      payableLessonsCount: Number(g.payableLessonsCount || 0),
      teacherAmount: Number(g.amount || 0),
      schoolAmount: Number(g.schoolAmount || 0),
      tuitionGross: Number(g.tuitionGross || 0),
    }));

    const regularLessons = {
      groups: regularGroupItems,
      totalLessonsCount: regularGroupItems.reduce((s, g) => s + g.payableLessonsCount, 0),
      totalTeacherCut: regularGroupItems.reduce((s, g) => s + g.teacherAmount, 0),
      totalSchoolCut: regularGroupItems.reduce((s, g) => s + g.schoolAmount, 0),
    };

    const formationCourses = {
      groups: formationGroupItems,
      totalLessonsCount: formationGroupItems.reduce((s, g) => s + g.payableLessonsCount, 0),
      totalTeacherCut: formationGroupItems.reduce((s, g) => s + g.teacherAmount, 0),
      totalSchoolCut: formationGroupItems.reduce((s, g) => s + g.schoolAmount, 0),
    };

    // 2. Fetch Books fees for this teacher in the selected period
    const rawBookVouchers = await prisma.voucher.findMany({
      where: {
        paymentType: "BOOK",
        isVoided: false,
        issuedAt: { gte: startDate, lte: endDate },
        class: { teacherId: teacher.id },
      },
      include: {
        class: { select: { id: true, name: true, isFormation: true } },
      },
    });

    const teacherBooks = await prisma.book.findMany({
      where: { teacherId: teacher.id },
      include: {
        level: { select: { name: true } },
        receipts: {
          where: { receivedAt: { gte: startDate, lte: endDate } },
        },
      },
    });

    // Group vouchers by class/book
    const bookMap = new Map<string, { title: string; levelName?: string; copiesSold: number; totalRevenue: number }>();

    rawBookVouchers.forEach((v) => {
      const title = v.class?.name ? `Manuel - ${v.class.name}` : "Manuel Scolaire";
      const existing = bookMap.get(title) || { title, levelName: v.class?.isFormation ? "Formation" : "Régulier", copiesSold: 0, totalRevenue: 0 };
      existing.copiesSold += 1;
      existing.totalRevenue += Number(v.amount);
      bookMap.set(title, existing);
    });

    teacherBooks.forEach((b) => {
      if (b.receipts.length > 0 && !bookMap.has(b.title)) {
        bookMap.set(b.title, {
          title: b.title,
          levelName: b.level?.name,
          copiesSold: b.receipts.length,
          totalRevenue: 0,
        });
      }
    });

    const bookItems = Array.from(bookMap.values());
    const totalCopiesSold = bookItems.reduce((s, b) => s + b.copiesSold, 0);
    const totalBooksFees = bookItems.reduce((s, b) => s + b.totalRevenue, 0);

    const booksFinance = {
      books: bookItems,
      totalCopiesSold,
      totalBooksFees,
    };

    // 3. Salary advances
    const rawAdvances = await prisma.salaryAdvance.findMany({
      where: {
        personId: teacher.id,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: "asc" },
    });

    const salaryAdvances = {
      total: rawAdvances.reduce((s, a) => s + Number(a.amount), 0),
      details: rawAdvances.map((a) => ({
        amount: Number(a.amount),
        date: a.date.toISOString(),
        remarque: a.remarque,
      })),
    };

    // 4. Photocopy charges
    const rawPhotocopy = await prisma.photocopyCharge.findMany({
      where: {
        teacherId: teacher.id,
        date: { gte: startDate, lte: endDate },
      },
    });

    const photocopyDeductions = {
      total: rawPhotocopy.reduce((s, p) => s + Number(p.costAmount), 0),
      pages: rawPhotocopy.reduce((s, p) => s + Number(p.pages), 0),
    };

    return {
      success: true,
      data: {
        teacher: {
          id: teacher.id,
          name: teacher.name,
          phone: teacher.phone,
        },
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString(),
        regularLessons,
        formationCourses,
        booksFinance,
        salaryAdvances,
        photocopyDeductions,
        bonus: 0,
      },
    };
  } catch (error: any) {
    console.error("getTeacherSelectiveReportDataAction error:", error);
    return {
      success: false,
      error: true,
      message: error?.message || "Erreur lors de la récupération des données de l'enseignant.",
    };
  }
}

// =================================================================
// 8. GLOBAL FINANCIAL REPORT DATA FETCHER (FOR THE 5 SELECTIVE STREAMS)
// =================================================================

export interface GlobalFinanceReportData {
  periodStart: string;
  periodEnd: string;
  branchName: string;
  generatedAt: string;
  formationIncomes: {
    total: number;
    vouchersCount: number;
    items: Array<{
      title: string;
      type: "CLASS" | "WORKSHOP";
      branchName?: string;
      studentsCount: number;
      totalAmount: number;
    }>;
  };
  inscriptionFees: {
    total: number;
    vouchersCount: number;
    byBranch: Array<{
      branchName: string;
      count: number;
      amount: number;
    }>;
  };
  caisseNoire: {
    initialBalance: number;
    totalDeposited: number;
    totalWithdrawn: number;
    netChange: number;
    endingBalance: number;
    transactions: Array<{
      id: number;
      date: string;
      type: string;
      amount: number;
      description: string;
      recordedBy: string;
    }>;
  };
  photocopyDeductions: {
    totalAmount: number;
    totalPages: number;
    teachersCount: number;
    teachers: Array<{
      teacherName: string;
      pages: number;
      amount: number;
    }>;
  };
  formationBooks: {
    totalAmount: number;
    totalCopies: number;
    items: Array<{
      title: string;
      branchName?: string;
      copies: number;
      amount: number;
    }>;
  };
}

export async function getGlobalFinanceReportDataAction(options: {
  dateFrom: string;
  dateTo: string;
  branchId?: number | "all";
}): Promise<{ success: boolean; error?: boolean; message?: string; data?: GlobalFinanceReportData }> {
  try {
    const session = await getAuthSession();
    if (!session.can("view", "finance") || !session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire." };
    }

    // Africa/Algiers business day query bounds
    const startDate = options.dateFrom
      ? getAlgiersDayBounds(options.dateFrom).startUtc
      : new Date(0);
    const endDate = options.dateTo
      ? getAlgiersDayBounds(options.dateTo).endUtc
      : new Date();

    const isAllBranches = !options.branchId || options.branchId === "all";
    const branchFilterNum = isAllBranches ? null : Number(options.branchId);

    const allBranchesList = await prisma.branch.findMany({
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    const branchNameMap = new Map<number, string>(allBranchesList.map((b) => [b.id, b.name]));

    // Branch name lookup
    let branchName = "Toutes les branches (Siège consolidé)";
    if (!isAllBranches && branchFilterNum) {
      branchName = branchNameMap.get(branchFilterNum) || `Branche #${branchFilterNum}`;
    }

    // Branch filters for queries
    const branchTargetFilter = isAllBranches
      ? {}
      : { OR: [{ issuingBranchId: branchFilterNum! }, { targetBranchId: branchFilterNum! }] };
    const branchIdFilter = isAllBranches ? {} : { branchId: branchFilterNum! };

    // 1. FORMATION INCOMES
    // Look for vouchers with TUITION where class.isFormation is true or workshopId != null
    const formationVouchers = await prisma.voucher.findMany({
      where: {
        isVoided: false,
        issuedAt: { gte: startDate, lte: endDate },
        ...branchTargetFilter,
        OR: [
          { class: { isFormation: true } },
          { workshopId: { not: null } },
        ],
      },
      include: {
        class: { include: { branch: { select: { name: true } } } },
        workshop: { include: { Branch: { select: { name: true } } } },
      },
    });

    const formationMap = new Map<string, { title: string; type: "CLASS" | "WORKSHOP"; branchName?: string; studentsCount: number; totalAmount: number }>();
    let totalFormationIncomes = 0;

    formationVouchers.forEach((v) => {
      const amt = Number(v.amount);
      totalFormationIncomes += amt;
      const isW = !!v.workshopId;
      const title = isW
        ? (v.workshop?.title || `Atelier #${v.workshopId}`)
        : (v.class?.name || `Formation #${v.classId}`);
      const bName = isW ? v.workshop?.Branch?.name : v.class?.branch?.name;
      const key = `${isW ? "W" : "C"}-${title}-${bName || ""}`;

      const existing = formationMap.get(key) || {
        title,
        type: isW ? "WORKSHOP" : "CLASS",
        branchName: bName,
        studentsCount: 0,
        totalAmount: 0,
      };
      existing.studentsCount += 1;
      existing.totalAmount += amt;
      formationMap.set(key, existing);
    });

    const formationIncomes = {
      total: totalFormationIncomes,
      vouchersCount: formationVouchers.length,
      items: Array.from(formationMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
    };

    // 2. INSCRIPTION FEES
    const inscriptionVouchers = await prisma.voucher.findMany({
      where: {
        paymentType: "INSCRIPTION",
        isVoided: false,
        issuedAt: { gte: startDate, lte: endDate },
        ...branchTargetFilter,
      },
      include: {
        class: { include: { branch: { select: { name: true } } } },
      },
    });

    const inscriptionBranchMap = new Map<string, { branchName: string; count: number; amount: number }>();
    let totalInscription = 0;

    inscriptionVouchers.forEach((v) => {
      const amt = Number(v.amount);
      totalInscription += amt;
      const bName =
        v.class?.branch?.name ||
        branchNameMap.get(v.targetBranchId) ||
        branchNameMap.get(v.issuingBranchId) ||
        `Branche #${v.targetBranchId || v.issuingBranchId}`;
      const existing = inscriptionBranchMap.get(bName) || { branchName: bName, count: 0, amount: 0 };
      existing.count += 1;
      existing.amount += amt;
      inscriptionBranchMap.set(bName, existing);
    });

    const inscriptionFees = {
      total: totalInscription,
      vouchersCount: inscriptionVouchers.length,
      byBranch: Array.from(inscriptionBranchMap.values()),
    };

    // 3. CAISSE NOIRE
    // Initial balance before startDate
    const priorCnTxs = await prisma.caisseNoireTransaction.findMany({
      where: { date: { lt: startDate } },
      select: { type: true, amount: true },
    });
    let initialCnBalance = 0;
    priorCnTxs.forEach((tx) => {
      const a = Number(tx.amount);
      if (tx.type === "DEPOSIT") initialCnBalance += a;
      else initialCnBalance -= a;
    });

    // Period transactions
    const periodCnTxs = await prisma.caisseNoireTransaction.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: "asc" },
    });

    let totalCnDeposits = 0;
    let totalCnWithdrawals = 0;
    periodCnTxs.forEach((tx) => {
      const a = Number(tx.amount);
      if (tx.type === "DEPOSIT") totalCnDeposits += a;
      else totalCnWithdrawals += a;
    });

    const caisseNoire = {
      initialBalance: initialCnBalance,
      totalDeposited: totalCnDeposits,
      totalWithdrawn: totalCnWithdrawals,
      netChange: totalCnDeposits - totalCnWithdrawals,
      endingBalance: initialCnBalance + totalCnDeposits - totalCnWithdrawals,
      transactions: periodCnTxs.map((t) => ({
        id: t.id,
        date: t.date.toISOString(),
        type: t.type,
        amount: Number(t.amount),
        description: t.description,
        recordedBy: t.recordedBy,
      })),
    };

    // 4. PHOTOCOPY DEDUCTIONS
    const rawPhotocopyCharges = await prisma.photocopyCharge.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        ...branchIdFilter,
      },
      include: {
        Teacher: { select: { id: true, name: true } },
      },
    });

    const photocopyTeacherMap = new Map<string, { teacherName: string; pages: number; amount: number }>();
    let totalPhotocopyAmount = 0;
    let totalPhotocopyPages = 0;

    rawPhotocopyCharges.forEach((pc) => {
      const amt = Number(pc.costAmount);
      const pages = Number(pc.pages || 0);
      totalPhotocopyAmount += amt;
      totalPhotocopyPages += pages;
      const tName = pc.Teacher?.name || `Enseignant #${pc.teacherId}`;

      const existing = photocopyTeacherMap.get(tName) || { teacherName: tName, pages: 0, amount: 0 };
      existing.pages += pages;
      existing.amount += amt;
      photocopyTeacherMap.set(tName, existing);
    });

    const photocopyDeductions = {
      totalAmount: totalPhotocopyAmount,
      totalPages: totalPhotocopyPages,
      teachersCount: photocopyTeacherMap.size,
      teachers: Array.from(photocopyTeacherMap.values()).sort((a, b) => b.amount - a.amount),
    };

    // 5. FORMATION BOOKS
    const bookVouchers = await prisma.voucher.findMany({
      where: {
        paymentType: "BOOK",
        isVoided: false,
        issuedAt: { gte: startDate, lte: endDate },
        ...branchTargetFilter,
      },
      include: {
        class: {
          include: {
            branch: { select: { name: true } },
          },
        },
      },
    });

    const booksMap = new Map<string, { title: string; branchName?: string; copies: number; amount: number }>();
    let totalBooksAmount = 0;
    let totalBooksCopies = 0;

    bookVouchers.forEach((bv) => {
      const amt = Number(bv.amount);
      totalBooksAmount += amt;
      totalBooksCopies += 1;
      const title = bv.class?.name ? `Livre - ${bv.class.name}` : "Manuel de Formation";
      const bName = bv.class?.branch?.name;
      const key = `${title}-${bName || ""}`;

      const existing = booksMap.get(key) || { title, branchName: bName, copies: 0, amount: 0 };
      existing.copies += 1;
      existing.amount += amt;
      booksMap.set(key, existing);
    });

    const formationBooks = {
      totalAmount: totalBooksAmount,
      totalCopies: totalBooksCopies,
      items: Array.from(booksMap.values()).sort((a, b) => b.amount - a.amount),
    };

    return {
      success: true,
      data: {
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString(),
        branchName,
        generatedAt: new Date().toISOString(),
        formationIncomes,
        inscriptionFees,
        caisseNoire,
        photocopyDeductions,
        formationBooks,
      },
    };
  } catch (error: any) {
    console.error("getGlobalFinanceReportDataAction error:", error);
    return {
      success: false,
      error: true,
      message: error?.message || "Erreur lors de la génération des données du rapport financier global.",
    };
  }
}
