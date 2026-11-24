"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  reward: { id: string; name: string; description: string | null; pointsCost: number; stock: number };
  balance: number;
};

export default function RewardCard({ reward, balance }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const outOfStock = reward.stock <= 0;
  const missing = reward.pointsCost - balance;

  async function claim() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/rewards/${reward.id}/claim`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        router.refresh();
        return;
      }
      setDone("Requested. The factory will arrange delivery.");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col rounded-lg border bg-white p-5" style={{ borderColor: "var(--line)" }}>
      <h3 className="font-display text-lg font-bold">{reward.name}</h3>
      {reward.description && (
        <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
          {reward.description}
        </p>
      )}
      <p className="mt-3 font-display text-2xl font-bold" style={{ color: "var(--stamp)" }}>
        {reward.pointsCost} <span className="text-sm font-normal">points</span>
      </p>
      {!outOfStock && reward.stock <= 5 && (
        <p className="text-xs" style={{ color: "var(--postmark)" }}>
          Only {reward.stock} left
        </p>
      )}

      <div className="mt-4">
        <button onClick={claim} disabled={busy || outOfStock || missing > 0} className="btn-primary w-full">
          {busy ? "Requesting…" : outOfStock ? "Out of stock" : missing > 0 ? `Need ${missing} more points` : "Get this reward"}
        </button>
        {error && (
          <p role="alert" className="mt-2 text-sm" style={{ color: "var(--error)" }}>
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="mt-2 text-sm" style={{ color: "var(--ok)" }}>
            {done}
          </p>
        )}
      </div>
    </li>
  );
}
