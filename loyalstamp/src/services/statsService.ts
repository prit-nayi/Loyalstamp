import { db } from "@/lib/db";

/** Numbers for the owner's monitoring dashboard. Everything is computed from the source tables, nothing is cached. */

export type DailyPoint = { day: string; claims: number; points: number };

export type DashboardStats = {
  units: { total: number; claimed: number; unclaimed: number; redemptionRate: number }; // rate is 0 to 1
  points: { issued: number; spent: number; adjustments: number; outstanding: number };
  customers: { total: number; active30d: number };
  rewardRequests: { pending: number; fulfilled: number; cancelled: number };
  security: { openFlags: number; failedClaims24h: number; blockedClaims24h: number };
  trend: DailyPoint[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const TREND_DAYS = 30;

/** Turns sparse per-day rows into one row for each of the last `days` days (UTC), with zeros where nothing happened. */
export function fillDailySeries(rows: DailyPoint[], days: number, now: Date = new Date()): DailyPoint[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)).toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { day, claims: 0, points: 0 });
  }
  return out;
}

export async function getDashboardStats(now: Date = new Date()): Promise<DashboardStats> {
  const since24h = new Date(now.getTime() - DAY_MS);
  const since30d = new Date(now.getTime() - 30 * DAY_MS);
  const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (TREND_DAYS - 1)));

  const [unitGroups, pointGroups, totalCustomers, activeRows, requestGroups, openFlags, failed, blocked, trendRows] = await Promise.all([
    db.product.groupBy({ by: ["status"], _count: { _all: true } }),
    db.pointsLedgerEntry.groupBy({ by: ["reason"], _sum: { delta: true } }),
    db.user.count({ where: { role: "CUSTOMER", status: "ACTIVE" } }),
    db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT user_id)::int AS n FROM points_ledger
      WHERE reason = 'PURCHASE_CLAIM' AND created_at >= ${since30d}`,
    db.rewardClaim.groupBy({ by: ["status"], _count: { _all: true } }),
    db.auditLog.count({ where: { category: "FRAUD_FLAG", flagStatus: "OPEN" } }),
    db.auditLog.count({ where: { action: "CLAIM_FAILED", createdAt: { gte: since24h } } }),
    db.auditLog.count({ where: { action: "CLAIM_BLOCKED", createdAt: { gte: since24h } } }),
    db.$queryRaw<DailyPoint[]>`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS claims,
             COALESCE(SUM(delta), 0)::int AS points
      FROM points_ledger
      WHERE reason = 'PURCHASE_CLAIM' AND created_at >= ${trendStart}
      GROUP BY 1 ORDER BY 1`,
  ]);

  const unitCount = (s: string) => unitGroups.find((g) => g.status === s)?._count._all ?? 0;
  const claimed = unitCount("CLAIMED");
  const unclaimed = unitCount("UNUSED");
  const total = claimed + unclaimed;

  const sum = (reason: string) => pointGroups.find((g) => g.reason === reason)?._sum.delta ?? 0;
  const requestCount = (s: string) => requestGroups.find((g) => g.status === s)?._count._all ?? 0;

  return {
    units: { total, claimed, unclaimed, redemptionRate: total === 0 ? 0 : claimed / total },
    points: {
      issued: sum("PURCHASE_CLAIM"),
      spent: -(sum("REWARD_SPEND") + sum("REWARD_REFUND")), // refunds reduce what was spent
      adjustments: sum("ADJUSTMENT"),
      outstanding: pointGroups.reduce((s, g) => s + (g._sum.delta ?? 0), 0),
    },
    customers: { total: totalCustomers, active30d: activeRows[0]?.n ?? 0 },
    rewardRequests: { pending: requestCount("PENDING"), fulfilled: requestCount("FULFILLED"), cancelled: requestCount("CANCELLED") },
    security: { openFlags, failedClaims24h: failed, blockedClaims24h: blocked },
    trend: fillDailySeries(trendRows, TREND_DAYS, now),
  };
}
