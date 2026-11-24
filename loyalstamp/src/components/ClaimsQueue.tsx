"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type QueueClaim = {
  id: string;
  status: "PENDING" | "FULFILLED" | "CANCELLED";
  pointsSpent: number;
  createdAt: string;
  fulfilledAt: string | null;
  email: string;
  rewardName: string;
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const COLOR = { PENDING: "var(--ink-soft)", FULFILLED: "var(--ok)", CANCELLED: "var(--error)" };

export default function ClaimsQueue({ claims }: { claims: QueueClaim[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: "FULFILL" | "CANCEL") {
    if (action === "CANCEL" && !window.confirm("Cancel this request? The points go back to the customer.")) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reward-claims/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Something went wrong.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusyId(null);
      router.refresh();
    }
  }

  if (claims.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        Nothing here.
      </p>
    );
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 rounded border-l-4 bg-red-50 px-3 py-2 text-sm" style={{ borderColor: "var(--error)", color: "var(--error)" }}>
          {error}
        </p>
      )}
      <ul className="divide-y rounded-lg border bg-white" style={{ borderColor: "var(--line)" }}>
        {claims.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <p className="font-medium">{c.rewardName}</p>
              <p style={{ color: "var(--ink-soft)" }}>
                {c.email} · {formatDate(c.createdAt)} · {c.pointsSpent} points
              </p>
            </div>
            {c.status === "PENDING" ? (
              <div className="flex gap-2">
                <button onClick={() => act(c.id, "FULFILL")} disabled={busyId === c.id} className="btn-primary">
                  Mark fulfilled
                </button>
                <button onClick={() => act(c.id, "CANCEL")} disabled={busyId === c.id} className="btn-secondary">
                  Cancel and refund
                </button>
              </div>
            ) : (
              <span className="font-medium" style={{ color: COLOR[c.status] }}>
                {c.status === "FULFILLED" ? `Fulfilled ${c.fulfilledAt ? formatDate(c.fulfilledAt) : ""}` : "Cancelled"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
