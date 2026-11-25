import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardStats } from "@/services/statsService";
import LogoutButton from "@/components/LogoutButton";
import StatCard from "@/components/StatCard";
import ClaimsChart from "@/components/ClaimsChart";

const LINKS = [
  { href: "/admin/import", title: "Import data", text: "Products with coupons, and invoices, from CSV." },
  { href: "/admin/rewards", title: "Rewards", text: "Create rewards, set cost and stock." },
  { href: "/admin/claims", title: "Reward requests", text: "Fulfil or cancel what customers asked for." },
  { href: "/admin/fraud", title: "Fraud flags", text: "Review suspicious activity." },
  { href: "/admin/audit", title: "Audit log", text: "Every login, claim and admin action." },
];

const n = (v: number) => v.toLocaleString("en-GB");

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const s = await getDashboardStats();
  const rate = Math.round(s.units.redemptionRate * 100);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Admin dashboard</h1>
        <LogoutButton />
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
        Signed in as {user.email}
      </p>

      <section aria-label="Key numbers" className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Coupons claimed" value={n(s.units.claimed)} note={`${rate}% of ${n(s.units.total)} boxes · ${n(s.units.unclaimed)} unclaimed`} />
        <StatCard label="Points issued" value={n(s.points.issued)} note="From claimed coupons" />
        <StatCard label="Points spent" value={n(s.points.spent)} note="On rewards, after refunds" />
        <StatCard label="Points outstanding" value={n(s.points.outstanding)} note="Owed to customers" />
        <StatCard label="Active customers" value={n(s.customers.active30d)} note={`Claimed in 30 days · ${n(s.customers.total)} registered`} />
        <StatCard
          label="Reward requests to fulfil"
          value={n(s.rewardRequests.pending)}
          note={`${n(s.rewardRequests.fulfilled)} fulfilled · ${n(s.rewardRequests.cancelled)} cancelled`}
          href="/admin/claims"
          tone={s.rewardRequests.pending > 0 ? "alert" : "normal"}
        />
        <StatCard
          label="Open fraud flags"
          value={n(s.security.openFlags)}
          note="Waiting for your review"
          href="/admin/fraud"
          tone={s.security.openFlags > 0 ? "alert" : "normal"}
        />
        <StatCard label="Failed claims, 24h" value={n(s.security.failedClaims24h)} note={`${n(s.security.blockedClaims24h)} blocked by lockout`} href="/admin/audit" />
      </section>

      <section className="mt-8 rounded-lg border bg-white p-6" style={{ borderColor: "var(--line)" }}>
        <h2 className="font-display text-xl font-bold">Claims per day</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--ink-soft)" }}>
          Last 30 days, in UTC.
        </p>
        <ClaimsChart data={s.trend} />
      </section>

      <nav aria-label="Admin sections" className="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-lg border bg-white p-4 hover:shadow-sm" style={{ borderColor: "var(--line)" }}>
            <h2 className="font-display text-lg font-bold">{l.title}</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
              {l.text}
            </p>
          </Link>
        ))}
      </nav>
    </main>
  );
}
