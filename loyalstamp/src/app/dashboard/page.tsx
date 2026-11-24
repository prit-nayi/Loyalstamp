import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBalance, getHistory } from "@/services/ledgerService";
import LogoutButton from "@/components/LogoutButton";
import Wordmark from "@/components/Wordmark";
import ClaimForm from "@/components/ClaimForm";

const REASON_LABEL: Record<string, string> = {
  PURCHASE_CLAIM: "Claimed",
  REWARD_SPEND: "Reward redeemed",
  REWARD_REFUND: "Reward refunded",
  ADJUSTMENT: "Adjustment",
};

const formatDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [balance, history] = await Promise.all([getBalance(user.id), getHistory(user.id, 10)]);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Wordmark />
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden sm:inline" style={{ color: "var(--ink-soft)" }}>
            {user.email}
          </span>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 pb-16">
        <section className="rounded-lg border bg-white p-6" style={{ borderColor: "var(--line)" }}>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Your points
          </p>
          <p className="font-display text-5xl font-bold" style={{ color: "var(--stamp)" }}>
            {balance}
          </p>
          <Link href="/dashboard/rewards" className="btn-secondary mt-4 inline-block">
            Browse rewards
          </Link>
        </section>

        <section className="rounded-lg border bg-white p-6" style={{ borderColor: "var(--line)" }}>
          <h2 className="font-display text-xl font-bold">Claim points</h2>
          <p className="mb-4 mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
            Enter the invoice number and the coupon code found inside the box. Each coupon works once.
          </p>
          <ClaimForm />
        </section>

        <section className="rounded-lg border bg-white p-6" style={{ borderColor: "var(--line)" }}>
          <h2 className="font-display text-xl font-bold">Recent activity</h2>
          {history.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>
              Nothing yet. Claim your first coupon above.
            </p>
          ) : (
            <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {REASON_LABEL[h.reason] ?? h.reason}
                      {h.productName ? `: ${h.productName}` : ""}
                    </p>
                    <p style={{ color: "var(--ink-soft)" }}>{formatDate(h.createdAt)}</p>
                  </div>
                  <span className="font-semibold" style={{ color: h.delta >= 0 ? "var(--ok)" : "var(--error)" }}>
                    {h.delta > 0 ? "+" : ""}
                    {h.delta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
