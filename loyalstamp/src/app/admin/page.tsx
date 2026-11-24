import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

const CARDS = [
  { href: "/admin/import", title: "Import data", text: "Upload products with coupons and invoices from CSV files." },
  { href: "/admin/rewards", title: "Rewards", text: "Create rewards, set their points cost and stock." },
  { href: "/admin/claims", title: "Reward requests", text: "See what customers asked for and mark it fulfilled." },
];

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Admin</h1>
        <LogoutButton />
      </div>
      <p className="mt-2" style={{ color: "var(--ink-soft)" }}>
        Signed in as {user.email}.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="rounded-lg border bg-white p-5 hover:shadow-sm" style={{ borderColor: "var(--line)" }}>
            <h2 className="font-display text-lg font-bold">{c.title}</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
              {c.text}
            </p>
          </Link>
        ))}
      </div>
      <p className="mt-8 text-sm" style={{ color: "var(--ink-soft)" }}>
        The monitoring dashboard and fraud review screen arrive in the next step.
      </p>
    </main>
  );
}
