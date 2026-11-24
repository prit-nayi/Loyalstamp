import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listRewardClaims } from "@/services/rewardService";
import ClaimsQueue, { type QueueClaim } from "@/components/ClaimsQueue";

const toQueue = (rows: Awaited<ReturnType<typeof listRewardClaims>>): QueueClaim[] =>
  rows.map((c) => ({
    id: c.id,
    status: c.status,
    pointsSpent: c.pointsSpent,
    createdAt: c.createdAt.toISOString(),
    fulfilledAt: c.fulfilledAt?.toISOString() ?? null,
    email: c.user.email,
    rewardName: c.reward.name,
  }));

export default async function AdminClaimsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [pending, all] = await Promise.all([listRewardClaims("PENDING"), listRewardClaims("ALL", 30)]);
  const recent = all.filter((c) => c.status !== "PENDING");

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/admin" className="text-sm underline" style={{ color: "var(--stamp-dark)" }}>
        Back to admin
      </Link>
      <h1 className="font-display mt-3 text-3xl font-bold">Reward requests</h1>

      <h2 className="font-display mb-3 mt-8 text-xl font-bold">To fulfil ({pending.length})</h2>
      <ClaimsQueue claims={toQueue(pending)} />

      <h2 className="font-display mb-3 mt-10 text-xl font-bold">Recently handled</h2>
      <ClaimsQueue claims={toQueue(recent)} />
    </main>
  );
}
