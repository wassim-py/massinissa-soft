import { Prisma } from "@prisma/client";
import prisma from "./prisma";

export type LedgerVoucherCategory =
  | "TUITION"
  | "INSCRIPTION"
  | "BOOK"
  | "ATELIER_FORMATION"
  | "REFUND";

/**
 * Normalizes any timestamp to midnight UTC for clean calendar-day ledger aggregation.
 */
export function normalizeDateToStartOfDay(date: Date | string): Date {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Maps voucher payment type + class formation flag to the exact Ledger Category.
 * Extra sessions carry no separate fee and fold into TUITION (§7.6).
 */
export function resolveLedgerType(
  paymentType: string,
  isFormation: boolean = false
): LedgerVoucherCategory {
  if (isFormation || paymentType === "WORKSHOP") {
    return "ATELIER_FORMATION";
  }
  switch (paymentType) {
    case "TUITION_4SESSION":
    case "CATCHUP":
    case "EXTRA_SESSION":
      return "TUITION";
    case "INSCRIPTION":
      return "INSCRIPTION";
    case "BOOK":
      return "BOOK";
    default:
      return "TUITION";
  }
}

/**
 * Atomically upserts a daily ledger record for (branchId, date, type).
 * Uses Prisma transaction if passed in, otherwise root prisma instance.
 */
export async function upsertDailyLedger(
  client: Prisma.TransactionClient | typeof prisma,
  params: {
    branchId: number;
    date: Date | string;
    type: LedgerVoucherCategory;
    amount: number;
  }
) {
  const normalizedDate = normalizeDateToStartOfDay(params.date);
  const decimalAmount = new Prisma.Decimal(params.amount);

  return await client.dailyLedger.upsert({
    where: {
      branchId_date_type: {
        branchId: params.branchId,
        date: normalizedDate,
        type: params.type,
      },
    },
    create: {
      branchId: params.branchId,
      date: normalizedDate,
      type: params.type,
      amount: decimalAmount,
    },
    update: {
      amount: {
        increment: decimalAmount,
      },
    },
  });
}

/**
 * Re-synchronizes the DailyLedger table from all existing active vouchers and refunds.
 * Guarantees zero drift between raw vouchers and DailyLedger summaries.
 */
export async function syncDailyLedgerFromVouchers() {
  const [vouchers, refunds] = await Promise.all([
    prisma.voucher.findMany({
      where: { isVoided: false },
      include: { class: true },
    }),
    prisma.refund.findMany({
      include: { voucher: true },
    }),
  ]);

  // Aggregate by (branchId, dateKey, type)
  const ledgerMap = new Map<string, { branchId: number; date: Date; type: LedgerVoucherCategory; amount: number }>();

  for (const v of vouchers) {
    const amount = Number(v.amount);
    if (amount <= 0) continue;

    const normalizedDate = normalizeDateToStartOfDay(v.issuedAt);
    const dateKey = normalizedDate.toISOString();
    const type = resolveLedgerType(v.paymentType, v.class?.isFormation ?? false);
    const branchId = v.targetBranchId; // §1.1 Cross-branch lands on TARGET branch
    const mapKey = `${branchId}|${dateKey}|${type}`;

    const current = ledgerMap.get(mapKey);
    if (current) {
      current.amount += amount;
    } else {
      ledgerMap.set(mapKey, { branchId, date: normalizedDate, type, amount });
    }
  }

  for (const r of refunds) {
    const amount = Number(r.amount);
    if (amount <= 0) continue;

    const normalizedDate = normalizeDateToStartOfDay(r.refundedAt);
    const dateKey = normalizedDate.toISOString();
    const type: LedgerVoucherCategory = "REFUND";
    const branchId = r.voucher.targetBranchId;
    const mapKey = `${branchId}|${dateKey}|${type}`;

    const current = ledgerMap.get(mapKey);
    if (current) {
      current.amount += amount;
    } else {
      ledgerMap.set(mapKey, { branchId, date: normalizedDate, type, amount });
    }
  }

  // Clear and repopulate inside transaction
  await prisma.$transaction(async (tx) => {
    await tx.dailyLedger.deleteMany({});

    const items = Array.from(ledgerMap.values()).map((item) => ({
      branchId: item.branchId,
      date: item.date,
      type: item.type,
      amount: new Prisma.Decimal(item.amount),
    }));

    if (items.length > 0) {
      await tx.dailyLedger.createMany({
        data: items,
      });
    }
  });

  // Ensure VoucherSeries currentNumber counters never lag behind existing vouchers
  const allSeries = await prisma.voucherSeries.findMany({ select: { id: true, currentNumber: true } });
  for (const s of allSeries) {
    const agg = await prisma.voucher.aggregate({
      where: { seriesId: s.id },
      _max: { number: true },
    });
    const maxNum = agg._max.number ?? 0;
    if (maxNum > s.currentNumber) {
      await prisma.voucherSeries.update({
        where: { id: s.id },
        data: { currentNumber: maxNum },
      });
    }
  }

  return { success: true, count: ledgerMap.size };
}
