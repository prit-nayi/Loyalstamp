import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listFlags } from "@/services/fraudService";
import { flagStatusSchema } from "@/validators/fraud";
import FlagList, { type FlagItem } from "@/components/FlagList";

const TABS = [
  { status: "OPEN", label: "Open" },
  { status: "CONFIRMED", label: "Confirmed" },
  { status: "DISMISSED", label: "Dismissed" },
] as const;

export default async function FraudPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const status = flagStatusSchema.parse((await searchParams).status ?? "OPEN");
  const flags = await listFlags(status);

  const items: FlagItem[] = flags.map((f) => ({
    id: f.id,
    type: f.type,
    status: f.status,
    ip: f.ip,
    details: f.details,
    createdAt: f.createdAt.toISOString(),
    user: f.user ? { email: f.user.email, status: f.user.status, role: f.user.role } : null,
  }));

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/admin" className="text-sm underline" style={{ color: "var(--stamp-dark)" }}>
        Back to dashboard
      </Link>
      <h1 className="font-display mt-3 text-3xl font-bold">Fraud flags</h1>
      <p className="mt-2" style={{ color: "var(--ink-soft)" }}>
        The system raises a flag when behaviour looks unusual. A flag never blocks anyone by itself. You decide.
      </p>

      <nav aria-label="Flag status" className="mb-6 mt-6 flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.status}
            href={`/admin/fraud?status=${t.status}`}
            aria-current={status === t.status ? "page" : undefined}
            className={status === t.status ? "btn-primary" : "btn-secondary"}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <FlagList flags={items} />
    </main>
  );
}
