import { db } from "@/lib/db";

/**
 * Rewards: customers spend ledger points, the owner fulfils requests by hand.
 *
 * Two races are handled on purpose:
 *  - Same user, two requests at once: the user's row is locked (SELECT ... FOR UPDATE) so the balance
 *    check and the spend happen one after the other. Without it both could pass the check and the balance
 *    would go negative.
 *  - Many users, last unit in stock: the stock decrement is conditional (`stock > 0`), so only one wins.
 */

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export async function listActiveRewards() {
  return db.reward.findMany({
    where: { active: true },
    orderBy: [{ pointsCost: "asc" }, { name: "asc" }],
    select: { id: true, name: true, description: true, pointsCost: true, stock: true },
  });
}

export type RewardClaimResult =
  | { ok: true; claimId: string; rewardName: string; pointsSpent: number; balance: number }
  | { ok: false; code: "NOT_AVAILABLE" | "OUT_OF_STOCK" | "INSUFFICIENT_POINTS" };

export async function claimReward(input: { userId: string; rewardId: string }): Promise<RewardClaimResult> {
  const { userId, rewardId } = input;

  return db.$transaction(async (tx): Promise<RewardClaimResult> => {
    // Serialize this user's spending. Other users are not affected.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

    const reward = await tx.reward.findUnique({ where: { id: rewardId } });
    if (!reward || !reward.active) return { ok: false, code: "NOT_AVAILABLE" };

    const agg = await tx.pointsLedgerEntry.aggregate({ where: { userId }, _sum: { delta: true } });
    const balance = agg._sum.delta ?? 0;
    if (balance < reward.pointsCost) return { ok: false, code: "INSUFFICIENT_POINTS" };

    const stock = await tx.reward.updateMany({
      where: { id: rewardId, active: true, stock: { gt: 0 } },
      data: { stock: { decrement: 1 } },
    });
    if (stock.count === 0) return { ok: false, code: "OUT_OF_STOCK" };

    const claim = await tx.rewardClaim.create({ data: { userId, rewardId, pointsSpent: reward.pointsCost } });
    await tx.pointsLedgerEntry.create({
      data: { userId, delta: -reward.pointsCost, reason: "REWARD_SPEND", rewardClaimId: claim.id },
    });
    await tx.auditLog.create({
      data: { actorId: userId, action: "REWARD_CLAIM", details: { claimId: claim.id, rewardId, points: reward.pointsCost } },
    });

    return { ok: true, claimId: claim.id, rewardName: reward.name, pointsSpent: reward.pointsCost, balance: balance - reward.pointsCost };
  });
}

export async function listMyRewardClaims(userId: string, limit = 20) {
  return db.rewardClaim.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, status: true, pointsSpent: true, createdAt: true, fulfilledAt: true, reward: { select: { name: true } } },
  });
}

// ---------------------------------------------------------------------------
// Admin: catalog
// ---------------------------------------------------------------------------

export type RewardInput = { name: string; description?: string | null; pointsCost: number; stock: number; active: boolean };

export async function listAllRewards() {
  return db.reward.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] });
}

export async function createReward(adminId: string, data: RewardInput) {
  const reward = await db.reward.create({
    data: { name: data.name, description: data.description || null, pointsCost: data.pointsCost, stock: data.stock, active: data.active },
  });
  await db.auditLog.create({ data: { actorId: adminId, action: "REWARD_CREATE", details: { rewardId: reward.id, name: reward.name } } });
  return reward;
}

/** Rewards are never deleted (claims refer to them). Hide one by setting active to false. */
export async function updateReward(adminId: string, rewardId: string, data: Partial<RewardInput>) {
  const existing = await db.reward.findUnique({ where: { id: rewardId }, select: { id: true } });
  if (!existing) return null;

  const reward = await db.reward.update({
    where: { id: rewardId },
    data: {
      name: data.name,
      description: data.description === undefined ? undefined : data.description || null,
      pointsCost: data.pointsCost,
      stock: data.stock,
      active: data.active,
    },
  });
  await db.auditLog.create({
    data: { actorId: adminId, action: "REWARD_UPDATE", details: { rewardId, changed: Object.keys(data).filter((k) => (data as Record<string, unknown>)[k] !== undefined) } },
  });
  return reward;
}

// ---------------------------------------------------------------------------
// Admin: fulfilment queue
// ---------------------------------------------------------------------------

export async function listRewardClaims(status: "PENDING" | "FULFILLED" | "CANCELLED" | "ALL" = "PENDING", limit = 100) {
  return db.rewardClaim.findMany({
    where: status === "ALL" ? {} : { status },
    orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" }, // oldest pending first
    take: limit,
    select: {
      id: true,
      status: true,
      pointsSpent: true,
      createdAt: true,
      fulfilledAt: true,
      user: { select: { email: true } },
      reward: { select: { name: true } },
    },
  });
}

export type ClaimActionResult = { ok: true } | { ok: false; code: "NOT_FOUND" | "NOT_PENDING" };

export async function fulfillRewardClaim(adminId: string, claimId: string): Promise<ClaimActionResult> {
  const claim = await db.rewardClaim.findUnique({ where: { id: claimId }, select: { id: true } });
  if (!claim) return { ok: false, code: "NOT_FOUND" };

  // Conditional update: only a PENDING claim can be fulfilled, and only once.
  const updated = await db.rewardClaim.updateMany({
    where: { id: claimId, status: "PENDING" },
    data: { status: "FULFILLED", fulfilledAt: new Date() },
  });
  if (updated.count === 0) return { ok: false, code: "NOT_PENDING" };

  await db.auditLog.create({ data: { actorId: adminId, action: "REWARD_CLAIM_FULFILLED", details: { claimId } } });
  return { ok: true };
}

/**
 * Cancels a pending claim: the points go back to the customer (a new ledger row, the ledger is never
 * edited) and the stock is restored. The conditional PENDING check means it can only be refunded once.
 */
export async function cancelRewardClaim(adminId: string, claimId: string): Promise<ClaimActionResult> {
  const claim = await db.rewardClaim.findUnique({ where: { id: claimId } });
  if (!claim) return { ok: false, code: "NOT_FOUND" };

  return db.$transaction(async (tx): Promise<ClaimActionResult> => {
    const updated = await tx.rewardClaim.updateMany({ where: { id: claimId, status: "PENDING" }, data: { status: "CANCELLED" } });
    if (updated.count === 0) return { ok: false, code: "NOT_PENDING" };

    await tx.pointsLedgerEntry.create({
      data: { userId: claim.userId, delta: claim.pointsSpent, reason: "REWARD_REFUND", note: `Refund for reward claim ${claimId}` },
    });
    await tx.reward.update({ where: { id: claim.rewardId }, data: { stock: { increment: 1 } } });
    await tx.auditLog.create({ data: { actorId: adminId, action: "REWARD_CLAIM_CANCELLED", details: { claimId, refunded: claim.pointsSpent } } });
    return { ok: true };
  });
}
