import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { auditQuerySchema } from "@/validators/audit";
import { listAuditActions, listAuditLogs } from "@/services/auditService";
import { formatDateTimeUtc } from "@/lib/format";

const shorten = (value: unknown) => {
  if (value == null) return "";
  const text = JSON.stringify(value);
  return text.length > 110 ? text.slice(0, 110) + "…" : text;
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { action, page } = auditQuerySchema.parse(await searchParams);
  const [{ rows, hasNext }, actions] = await Promise.all([listAuditLogs({ action, page }), listAuditActions()]);

  const link = (p: number) => `/admin/audit?${new URLSearchParams({ ...(action ? { action } : {}), page: String(p) })}`;

  return (
    <main className="mx-auto max-w-5xl p-8">
      <Link href="/admin" className="text-sm underline" style={{ color: "var(--stamp-dark)" }}>
        Back to dashboard
      </Link>
      <h1 className="font-display mt-3 text-3xl font-bold">Audit log</h1>
      <p className="mt-2" style={{ color: "var(--ink-soft)" }}>
        Newest first. Coupon codes and passwords are never recorded here.
      </p>

      <form method="get" className="my-6 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">
          Show
          <select name="action" defaultValue={action ?? ""} className="field mt-1 block min-w-56">
            <option value="">All events</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary">
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border bg-white" style={{ borderColor: "var(--line)" }}>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">IP</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center" style={{ color: "var(--ink-soft)" }}>
                  No events found.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top" style={{ borderColor: "var(--line)" }}>
                <td className="whitespace-nowrap px-3 py-2">{formatDateTimeUtc(r.createdAt)}</td>
                <td className="px-3 py-2 font-medium" style={{ color: r.category === "FRAUD_FLAG" ? "var(--postmark)" : undefined }}>
                  {r.action}
                </td>
                <td className="px-3 py-2">{r.email ?? "–"}</td>
                <td className="px-3 py-2">{r.ip ?? "–"}</td>
                <td className="px-3 py-2 font-mono text-xs">{shorten(r.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        {page > 1 ? (
          <Link href={link(page - 1)} className="btn-secondary">
            Newer
          </Link>
        ) : (
          <span />
        )}
        <span style={{ color: "var(--ink-soft)" }}>Page {page}</span>
        {hasNext ? (
          <Link href={link(page + 1)} className="btn-secondary">
            Older
          </Link>
        ) : (
          <span />
        )}
      </div>
    </main>
  );
}
