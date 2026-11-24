import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBalance } from "@/services/ledgerService";
import { listActiveRewards, listMyRewardClaims } from "@/services/rewardService";
import Wordmark from "@/components/Wordmark";
import LogoutButton from "@/components/LogoutButton";
import RewardCard from "@/components/RewardCard";

const STATUS_LABEL: Record<string, string> = { PENDING: "Being prepared", FULFILLED: "Sent", CANCELLED: "Cancelled, points returned" };
const STATUS_COLOR: Record<string, string> = { PENDING: "var(--ink-soft)", FULFILLED: "var(--ok)", CANCELLED: "var(--error)" };
const formatDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function RewardsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [balance, rewards, claims] = await Promise.all([getBalance(user.id), listActiveRewards(), listMyRewardClaims(user.id)]);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Wordmark />
        <LogoutButton />
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-6 pb-16">
        <div>
          <Link href="/dashboard" className="text-sm underline" style={{ color: "var(--stamp-dark)" }}>
            Back to my points
          </Link>
          <h1 className="font-display mt-2 text-3xl font-bold">Rewards</h1>
          <p className="mt-1" style={{ color: "var(--ink-soft)" }}>
            You have <strong style={{ color: "var(--stamp)" }}>{balance}</strong> points.
          </p>
        </div>

        {rewards.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>No rewards are available right now. Please check back soon.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {rewards.map((r) => (
              <RewardCard key={r.id} reward={r} balance={balance} />
            ))}
          </ul>
        )}

        <section className="rounded-lg border bg-white p-6" style={{ borderColor: "var(--line)" }}>
          <h2 className="font-display text-xl font-bold">My reward requests</h2>
          {claims.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>
              You have not requested a reward yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y">
              {claims.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{c.reward.name}</p>
                    <p style={{ color: "var(--ink-soft)" }}>
                      {formatDate(c.createdAt)} · {c.pointsSpent} points
                    </p>
                  </div>
                  <span className="font-medium" style={{ color: STATUS_COLOR[c.status] }}>
                    {STATUS_LABEL[c.status] ?? c.status}
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
