import { db } from "@/lib/db";

export const AUDIT_PAGE_SIZE = 50;

export async function listAuditLogs(opts: { action?: string; page: number }) {
  const rows = await db.auditLog.findMany({
    where: opts.action ? { action: opts.action } : {},
    orderBy: { createdAt: "desc" },
    skip: (opts.page - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE + 1, // one extra row tells us whether a next page exists
    include: { actor: { select: { email: true } } },
  });
  return {
    hasNext: rows.length > AUDIT_PAGE_SIZE,
    rows: rows.slice(0, AUDIT_PAGE_SIZE).map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      action: r.action,
      category: r.category,
      email: r.actor?.email ?? null,
      ip: r.ip,
      details: r.details,
    })),
  };
}

export async function listAuditActions(): Promise<string[]> {
  const rows = await db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } });
  return rows.map((r) => r.action);
}
