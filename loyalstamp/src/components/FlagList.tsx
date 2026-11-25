"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTimeUtc } from "@/lib/format";

export type FlagItem = {
  id: string;
  type: string;
  status: "OPEN" | "DISMISSED" | "CONFIRMED" | null;
  ip: string | null;
  details: unknown;
  createdAt: string;
  user: { email: string; status: "ACTIVE" | "BANNED"; role: "CUSTOMER" | "ADMIN" } | null;
};

const TITLE: Record<string, string> = {
  REPEATED_FAILURES: "Repeated failed claims",
  MANY_ACCOUNTS_ONE_IP: "Many accounts from one IP address",
  HIGH_CLAIM_VOLUME: "Unusually many claims in an hour",
};

function describe(type: string, details: unknown): string {
  const d = (details ?? {}) as Record<string, number>;
  if (type === "REPEATED_FAILURES") return `${d.failures} failed claims within ${d.windowMinutes} minutes.`;
  if (type === "MANY_ACCOUNTS_ONE_IP") return `${d.accounts} different accounts made claim attempts from this IP in ${d.windowHours} hours. This can be a shared network, so check before acting.`;
  if (type === "HIGH_CLAIM_VOLUME") return `${d.claims} successful claims within ${d.windowHours} hour.`;
  return JSON.stringify(details ?? {});
}

export default function FlagList({ flags }: { flags: FlagItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(flag: FlagItem, decision: "DISMISSED" | "CONFIRMED", banUser = false) {
    if (banUser && !window.confirm(`Ban ${flag.user?.email}? They will be logged out and unable to log in.`)) return;
    setBusyId(flag.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/fraud-flags/${flag.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, banUser }),
      });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Something went wrong.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusyId(null);
      router.refresh();
    }
  }

  if (flags.length === 0) {
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
      <ul className="space-y-3">
        {flags.map((f) => {
          const canBan = f.user && f.user.role === "CUSTOMER" && f.user.status === "ACTIVE";
          return (
            <li key={f.id} className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--line)" }}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{TITLE[f.type] ?? f.type}</p>
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {formatDateTimeUtc(f.createdAt)}
                    {f.user ? ` · ${f.user.email}${f.user.status === "BANNED" ? " (banned)" : ""}` : ""}
                    {f.ip ? ` · IP ${f.ip}` : ""}
                  </p>
                </div>
                {f.status !== "OPEN" && (
                  <span className="text-sm font-medium" style={{ color: f.status === "CONFIRMED" ? "var(--error)" : "var(--ink-soft)" }}>
                    {f.status === "CONFIRMED" ? "Confirmed" : "Dismissed"}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm">{describe(f.type, f.details)}</p>

              {f.status === "OPEN" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => decide(f, "DISMISSED")} disabled={busyId === f.id} className="btn-secondary">
                    Dismiss (false alarm)
                  </button>
                  <button onClick={() => decide(f, "CONFIRMED")} disabled={busyId === f.id} className="btn-secondary">
                    Confirm
                  </button>
                  {canBan && (
                    <button onClick={() => decide(f, "CONFIRMED", true)} disabled={busyId === f.id} className="btn-primary" style={{ background: "var(--error)" }}>
                      Confirm and ban user
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
