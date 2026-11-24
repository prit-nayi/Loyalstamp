import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listAllRewards } from "@/services/rewardService";
import AdminRewards from "@/components/AdminRewards";

export default async function AdminRewardsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const rewards = await listAllRewards();

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/admin" className="text-sm underline" style={{ color: "var(--stamp-dark)" }}>
        Back to admin
      </Link>
      <h1 className="font-display mt-3 text-3xl font-bold">Rewards</h1>
      <p className="mb-8 mt-2" style={{ color: "var(--ink-soft)" }}>
        Set what customers can get and how many points it costs. Untick Visible to hide a reward without deleting it.
      </p>
      <AdminRewards
        rewards={rewards.map((r) => ({ id: r.id, name: r.name, description: r.description, pointsCost: r.pointsCost, stock: r.stock, active: r.active }))}
      />
    </main>
  );
}
