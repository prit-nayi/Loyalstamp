"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AdminReward = {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  stock: number;
  active: boolean;
};

async function send(url: string, method: "POST" | "PATCH", body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.error ?? "Something went wrong. Try again.";
  } catch {
    return "Could not reach the server.";
  }
}

function RewardForm({ initial, onDone, submitLabel, endpoint, method }: {
  initial: Omit<AdminReward, "id">;
  onDone: () => void;
  submitLabel: string;
  endpoint: string;
  method: "POST" | "PATCH";
}) {
  const [v, setV] = useState({ ...initial, description: initial.description ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await send(endpoint, method, { ...v, pointsCost: Number(v.pointsCost), stock: Number(v.stock) });
    setBusy(false);
    if (err) return setError(err);
    if (method === "POST") setV({ name: "", description: "", pointsCost: 50, stock: 10, active: true });
    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-6">
      <label className="block text-sm font-medium sm:col-span-3">
        Name
        <input required maxLength={120} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="field" />
      </label>
      <label className="block text-sm font-medium">
        Points
        <input required type="number" min={1} value={v.pointsCost} onChange={(e) => setV({ ...v, pointsCost: Number(e.target.value) })} className="field" />
      </label>
      <label className="block text-sm font-medium">
        Stock
        <input required type="number" min={0} value={v.stock} onChange={(e) => setV({ ...v, stock: Number(e.target.value) })} className="field" />
      </label>
      <label className="flex items-end gap-2 pb-2 text-sm font-medium">
        <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />
        Visible
      </label>
      <label className="block text-sm font-medium sm:col-span-6">
        Description
        <input maxLength={500} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} className="field" />
      </label>
      <div className="sm:col-span-6">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Saving…" : submitLabel}
        </button>
        {error && (
          <span role="alert" className="ml-3 text-sm" style={{ color: "var(--error)" }}>
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

export default function AdminRewards({ rewards }: { rewards: AdminReward[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="space-y-8">
      <section className="rounded-lg border bg-white p-6" style={{ borderColor: "var(--line)" }}>
        <h2 className="font-display text-xl font-bold">Add a reward</h2>
        <div className="mt-4">
          <RewardForm
            initial={{ name: "", description: null, pointsCost: 50, stock: 10, active: true }}
            endpoint="/api/admin/rewards"
            method="POST"
            submitLabel="Add reward"
            onDone={refresh}
          />
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold">Catalog</h2>
        {rewards.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>
            No rewards yet. Add one above.
          </p>
        ) : (
          <ul className="mt-3 space-y-4">
            {rewards.map((r) => (
              <li key={r.id} className="rounded-lg border bg-white p-5" style={{ borderColor: "var(--line)", opacity: r.active ? 1 : 0.7 }}>
                <RewardForm
                  initial={{ name: r.name, description: r.description, pointsCost: r.pointsCost, stock: r.stock, active: r.active }}
                  endpoint={`/api/admin/rewards/${r.id}`}
                  method="PATCH"
                  submitLabel="Save changes"
                  onDone={refresh}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
