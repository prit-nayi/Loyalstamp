"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Success = { pointsAdded: number; productName: string; balance: number };

export default function ClaimForm() {
  const router = useRouter();
  const [invoiceNo, setInvoiceNo] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceNo, couponCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(data as Success);
      setInvoiceNo("");
      setCouponCode("");
      router.refresh(); // reloads the balance and history shown on the page
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Invoice number
          <input
            required
            maxLength={64}
            autoComplete="off"
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            className="field"
            placeholder="INV-1001"
          />
        </label>
        <label className="block text-sm font-medium">
          Coupon code from the box
          <input
            required
            maxLength={100}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            className="field"
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded border-l-4 bg-red-50 px-3 py-2 text-sm" style={{ borderColor: "var(--error)", color: "var(--error)" }}>
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded border-l-4 bg-green-50 px-3 py-2 text-sm" style={{ borderColor: "var(--ok)", color: "var(--ok)" }}>
          +{success.pointsAdded} points for {success.productName}. Your balance is now {success.balance}.
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? "Checking…" : "Claim points"}
      </button>
    </form>
  );
}
