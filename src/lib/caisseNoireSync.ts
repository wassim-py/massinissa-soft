import { Prisma } from "@prisma/client";
import { OutcomeFundingSource, normalizeOutcomeFundingSource } from "./financeConstants";

type PrismaTx = Prisma.TransactionClient;

/**
 * Synchronizes an outcome record funded from Caisse Noire with a matching
 * CaisseNoireTransaction WITHDRAWAL so the Caisse Noire balance and ledger
 * remain consistent across create, edit, and delete operations.
 */
export async function syncOutcomeWithCaisseNoire(
  tx: PrismaTx,
  params: {
    existingTxId?: number | null;
    fundingSource?: string | null;
    isDisbursed?: boolean;
    amount: number;
    description: string;
    date: Date;
    recordedBy: string;
  }
): Promise<number | null> {
  const source: OutcomeFundingSource = normalizeOutcomeFundingSource(params.fundingSource);
  const shouldLink = source === "CAISSE_NOIRE" && (params.isDisbursed ?? true) && params.amount > 0;
  const existingTxId = params.existingTxId ?? null;

  if (shouldLink) {
    if (existingTxId) {
      const updated = await tx.caisseNoireTransaction.updateMany({
        where: { id: existingTxId },
        data: {
          type: "WITHDRAWAL",
          amount: new Prisma.Decimal(params.amount),
          description: params.description,
          date: params.date,
        },
      });
      if (updated.count > 0) {
        return existingTxId;
      }
    }

    const created = await tx.caisseNoireTransaction.create({
      data: {
        type: "WITHDRAWAL",
        amount: new Prisma.Decimal(params.amount),
        description: params.description,
        date: params.date,
        recordedBy: params.recordedBy,
      },
    });
    return created.id;
  }

  if (existingTxId) {
    await tx.caisseNoireTransaction.deleteMany({
      where: { id: existingTxId },
    });
  }

  return null;
}

/**
 * Removes any CaisseNoireTransaction records linked to one or more outcome tx IDs.
 */
export async function cleanupCaisseNoireLinks(
  tx: PrismaTx,
  txIds: Array<number | null | undefined>
): Promise<void> {
  const ids = Array.from(new Set(txIds.filter((id): id is number => typeof id === "number" && id > 0)));
  if (ids.length === 0) return;
  await tx.caisseNoireTransaction.deleteMany({
    where: { id: { in: ids } },
  });
}
