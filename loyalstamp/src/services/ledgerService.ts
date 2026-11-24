import { db } from "@/lib/db";

/** Balance = sum of the append-only ledger. There is no stored balance column to drift. */
export async function getBalance(userId: string): Promise<number> {
  const agg = await db.pointsLedgerEntry.aggregate({ where: { userId }, _sum: { delta: true } });
  return agg._sum.delta ?? 0;
}

export type HistoryItem = {
  id: string;
  delta: number;
  reason: string;
  productName: string | null;
  createdAt: Date;
};

export async function getHistory(userId: string, limit = 10): Promise<HistoryItem[]> {
  const rows = await db.pointsLedgerEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { product: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    delta: r.delta,
    reason: r.reason,
    productName: r.product?.name ?? null,
    createdAt: r.createdAt,
  }));
}
