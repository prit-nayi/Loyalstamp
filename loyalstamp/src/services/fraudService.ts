import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { IP_FAILURE_MULTIPLIER, loadFraudConfig, type FraudConfig } from "@/lib/fraudConfig";
import { claimCoupon, type ClaimResult } from "./claimService";

/**
 * Brute-force protection and fraud flags. State lives in the audit_logs table (no extra tables),
 * which also works on serverless hosting where an in-memory rate limiter would not be shared.
 *
 * Lock rule: a sliding window. If there are `limit` failures inside the last `lockoutMinutes`,
 * the key is locked until the oldest of those failures leaves the window.
 * Blocked attempts are NOT counted as failures, so an attacker cannot extend a lock by hammering it.
 */

export type Lock = { locked: false } | { locked: true; retryAfterSeconds: number };
const UNLOCKED: Lock = { locked: false };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const FLAG_TYPES = {
  REPEATED_FAILURES: "REPEATED_FAILURES",
  MANY_ACCOUNTS_ONE_IP: "MANY_ACCOUNTS_ONE_IP",
  HIGH_CLAIM_VOLUME: "HIGH_CLAIM_VOLUME",
} as const;

async function lockFromFailures(where: Prisma.AuditLogWhereInput, limit: number, windowMs: number, now: Date): Promise<Lock> {
  const since = new Date(now.getTime() - windowMs);
  const recent = await db.auditLog.findMany({
    where: { ...where, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { createdAt: true },
  });
  if (recent.length < limit) return UNLOCKED;

  // The lock ends when the limit-th most recent failure leaves the window.
  const endsAt = recent[limit - 1].createdAt.getTime() + windowMs;
  return { locked: true, retryAfterSeconds: Math.max(1, Math.ceil((endsAt - now.getTime()) / 1000)) };
}

function longest(a: Lock, b: Lock): Lock {
  if (!a.locked) return b;
  if (!b.locked) return a;
  return a.retryAfterSeconds >= b.retryAfterSeconds ? a : b;
}

/** Is this user (or this IP) locked out of claiming? */
export async function getClaimLock(
  who: { userId: string; ip?: string },
  config: FraudConfig = loadFraudConfig(),
  now = new Date(),
): Promise<Lock> {
  const windowMs = config.lockoutMinutes * 60_000;
  const byUser = await lockFromFailures({ action: "CLAIM_FAILED", actorId: who.userId }, config.maxFailedAttempts, windowMs, now);
  const byIp = who.ip
    ? await lockFromFailures({ action: "CLAIM_FAILED", ip: who.ip }, config.maxFailedAttempts * IP_FAILURE_MULTIPLIER, windowMs, now)
    : UNLOCKED;
  return longest(byUser, byIp);
}

/**
 * Is this email (or this IP) locked out of logging in?
 * Trade-off: a per-email lock stops password guessing, but someone could also lock a victim's
 * account for a few minutes by failing on purpose. The lock is short and temporary.
 */
export async function getLoginLock(
  who: { email: string; ip?: string },
  config: FraudConfig = loadFraudConfig(),
  now = new Date(),
): Promise<Lock> {
  const windowMs = config.lockoutMinutes * 60_000;
  const byEmail = await lockFromFailures(
    { action: "LOGIN_FAILED", details: { path: ["email"], equals: who.email.trim().toLowerCase() } },
    config.maxFailedAttempts,
    windowMs,
    now,
  );
  const byIp = who.ip
    ? await lockFromFailures({ action: "LOGIN_FAILED", ip: who.ip }, config.maxFailedAttempts * IP_FAILURE_MULTIPLIER, windowMs, now)
    : UNLOCKED;
  return longest(byEmail, byIp);
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

/** Creates an OPEN flag unless an identical one is already open (so one problem is one flag). */
async function raiseFlag(
  type: string,
  target: { actorId?: string; ip?: string },
  details: Prisma.InputJsonObject,
  now = new Date(),
): Promise<boolean> {
  const duplicate = await db.auditLog.findFirst({
    where: {
      category: "FRAUD_FLAG",
      action: type,
      flagStatus: "OPEN",
      createdAt: { gte: new Date(now.getTime() - DAY_MS) },
      ...(target.actorId ? { actorId: target.actorId } : { actorId: null, ip: target.ip }),
    },
    select: { id: true },
  });
  if (duplicate) return false;

  await db.auditLog.create({
    data: { category: "FRAUD_FLAG", action: type, flagStatus: "OPEN", actorId: target.actorId, ip: target.ip, details },
  });
  return true;
}

async function checkRepeatedFailures(userId: string, ip: string | undefined, config: FraudConfig, now: Date) {
  const since = new Date(now.getTime() - config.lockoutMinutes * 60_000);
  const failures = await db.auditLog.count({ where: { action: "CLAIM_FAILED", actorId: userId, createdAt: { gte: since } } });
  if (failures >= config.maxFailedAttempts) {
    await raiseFlag(FLAG_TYPES.REPEATED_FAILURES, { actorId: userId, ip }, { failures, windowMinutes: config.lockoutMinutes }, now);
  }
}

async function checkAccountsPerIp(ip: string, config: FraudConfig, now: Date) {
  const rows = await db.auditLog.findMany({
    where: {
      ip,
      actorId: { not: null },
      action: { in: ["CLAIM_SUCCESS", "CLAIM_FAILED"] },
      createdAt: { gte: new Date(now.getTime() - DAY_MS) },
    },
    distinct: ["actorId"],
    select: { actorId: true },
  });
  if (rows.length >= config.maxAccountsPerIp) {
    await raiseFlag(FLAG_TYPES.MANY_ACCOUNTS_ONE_IP, { ip }, { accounts: rows.length, windowHours: 24 }, now);
  }
}

async function checkClaimVolume(userId: string, ip: string | undefined, config: FraudConfig, now: Date) {
  const claims = await db.pointsLedgerEntry.count({
    where: { userId, reason: "PURCHASE_CLAIM", createdAt: { gte: new Date(now.getTime() - HOUR_MS) } },
  });
  if (claims >= config.maxClaimsPerHour) {
    await raiseFlag(FLAG_TYPES.HIGH_CLAIM_VOLUME, { actorId: userId, ip }, { claims, windowHours: 1 }, now);
  }
}

// ---------------------------------------------------------------------------
// Protected claim: the function the API route uses
// ---------------------------------------------------------------------------

export type GuardedClaimResult =
  | Extract<ClaimResult, { ok: true }>
  | { ok: false; blocked: false }
  | { ok: false; blocked: true; retryAfterSeconds: number };

/**
 * Lock check, then the atomic claim, then fraud rules.
 * While locked, the coupon is not even looked at, so guessing during a lock learns nothing.
 */
export async function claimWithProtection(
  input: { userId: string; invoiceNo: string; couponCode: string; ip?: string },
  config: FraudConfig = loadFraudConfig(),
): Promise<GuardedClaimResult> {
  const lock = await getClaimLock({ userId: input.userId, ip: input.ip }, config);
  if (lock.locked) {
    await db.auditLog.create({ data: { actorId: input.userId, action: "CLAIM_BLOCKED", ip: input.ip } });
    return { ok: false, blocked: true, retryAfterSeconds: lock.retryAfterSeconds };
  }

  const result = await claimCoupon(input);

  // Flag rules must never break a claim, so failures here are logged and swallowed.
  try {
    const now = new Date();
    if (result.ok) await checkClaimVolume(input.userId, input.ip, config, now);
    else await checkRepeatedFailures(input.userId, input.ip, config, now);
    if (input.ip) await checkAccountsPerIp(input.ip, config, now);
  } catch (e) {
    console.error("Fraud rule evaluation failed", e);
  }

  return result.ok ? result : { ok: false, blocked: false };
}

// ---------------------------------------------------------------------------
// Admin review
// ---------------------------------------------------------------------------

export type FlagStatusFilter = "OPEN" | "DISMISSED" | "CONFIRMED" | "ALL";

export async function listFlags(status: FlagStatusFilter = "OPEN", limit = 100) {
  const rows = await db.auditLog.findMany({
    where: { category: "FRAUD_FLAG", ...(status === "ALL" ? {} : { flagStatus: status }) },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { id: true, email: true, status: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.action,
    status: r.flagStatus,
    ip: r.ip,
    details: r.details,
    createdAt: r.createdAt,
    user: r.actor,
  }));
}

export type ResolveResult =
  | { ok: true; banned: boolean }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_RESOLVED" | "NO_USER_TO_BAN" | "CANNOT_BAN_ADMIN" };

/** Admin decision on one flag. Optionally bans the flagged customer. Every decision is audited. */
export async function resolveFlag(input: {
  flagId: string;
  adminId: string;
  decision: "DISMISSED" | "CONFIRMED";
  banUser?: boolean;
}): Promise<ResolveResult> {
  const flag = await db.auditLog.findFirst({
    where: { id: input.flagId, category: "FRAUD_FLAG" },
    include: { actor: { select: { id: true, role: true } } },
  });
  if (!flag) return { ok: false, code: "NOT_FOUND" };
  if (flag.flagStatus !== "OPEN") return { ok: false, code: "ALREADY_RESOLVED" };

  const banUser = !!input.banUser;
  if (banUser) {
    if (!flag.actor) return { ok: false, code: "NO_USER_TO_BAN" };
    if (flag.actor.role === "ADMIN") return { ok: false, code: "CANNOT_BAN_ADMIN" };
  }

  const outcome = await db.$transaction(async (tx) => {
    // Conditional update: if two admins resolve at once, only one succeeds.
    const updated = await tx.auditLog.updateMany({
      where: { id: flag.id, flagStatus: "OPEN" },
      data: { flagStatus: input.decision },
    });
    if (updated.count === 0) return "ALREADY_RESOLVED" as const;

    if (banUser && flag.actor) await tx.user.update({ where: { id: flag.actor.id }, data: { status: "BANNED" } });
    await tx.auditLog.create({
      data: {
        actorId: input.adminId,
        action: "ADMIN_RESOLVE_FLAG",
        details: { flagId: flag.id, flagType: flag.action, decision: input.decision, banned: banUser },
      },
    });
    return "OK" as const;
  });

  return outcome === "OK" ? { ok: true, banned: banUser } : { ok: false, code: "ALREADY_RESOLVED" };
}
