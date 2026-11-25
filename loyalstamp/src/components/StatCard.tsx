import Link from "next/link";
import type { ReactNode } from "react";

type Props = { label: string; value: ReactNode; note?: string; href?: string; tone?: "normal" | "alert" };

export default function StatCard({ label, value, note, href, tone = "normal" }: Props) {
  const body = (
    <div
      className="h-full rounded-lg border bg-white p-4"
      style={{ borderColor: tone === "alert" ? "var(--postmark)" : "var(--line)", borderWidth: tone === "alert" ? 2 : 1 }}
    >
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        {label}
      </p>
      <p className="font-display mt-1 text-3xl font-bold" style={{ color: tone === "alert" ? "var(--postmark)" : "var(--ink)" }}>
        {value}
      </p>
      {note && (
        <p className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
          {note}
        </p>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
      {body}
    </Link>
  ) : (
    body
  );
}
