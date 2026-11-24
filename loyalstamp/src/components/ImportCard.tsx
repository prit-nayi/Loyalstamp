"use client";

import { useState } from "react";

type ImportError = { row: number; field?: string; message: string };
type Result = {
  ok: boolean;
  dryRun: boolean;
  saved: boolean;
  totalRows: number;
  counts: Record<string, number>;
  errorCount: number;
  errors: ImportError[];
};

type Props = {
  title: string;
  description: string;
  endpoint: string;
  columns: string;
  templateHref: string;
  countLabels: Record<string, string>;
};

export default function ImportCard({ title, description, endpoint, columns, templateHref, countLabels }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [checkOnly, setCheckOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setResult(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("dryRun", String(checkOnly));
      const res = await fetch(endpoint, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (data && typeof data.ok === "boolean") setResult(data as Result);
      else setMessage(data.error ?? "Something went wrong. Try again.");
    } catch {
      setMessage("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const summary = result
    ? Object.entries(result.counts)
        .map(([k, v]) => `${v} ${countLabels[k] ?? k}`)
        .join(" and ")
    : "";

  return (
    <section className="rounded-lg border bg-white p-6" style={{ borderColor: "var(--line)" }}>
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
        {description}
      </p>
      <p className="mt-3 text-sm">
        <span className="font-medium">Columns:</span> <code className="text-xs">{columns}</code>
      </p>
      <a href={templateHref} download className="mt-1 inline-block text-sm underline" style={{ color: "var(--stamp-dark)" }}>
        Download a template
      </a>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setMessage(null);
          }}
          className="block w-full text-sm file:mr-3 file:rounded file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5"
          aria-label={`${title} CSV file`}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={checkOnly} onChange={(e) => setCheckOnly(e.target.checked)} />
          Check the file only (nothing is saved)
        </label>
        <button type="submit" disabled={!file || busy} className="btn-primary">
          {busy ? "Working…" : checkOnly ? "Check file" : "Import and save"}
        </button>
      </form>

      {message && (
        <p role="alert" className="mt-4 rounded border-l-4 bg-red-50 px-3 py-2 text-sm" style={{ borderColor: "var(--error)", color: "var(--error)" }}>
          {message}
        </p>
      )}

      {result?.ok && (
        <p role="status" className="mt-4 rounded border-l-4 bg-green-50 px-3 py-2 text-sm" style={{ borderColor: "var(--ok)", color: "var(--ok)" }}>
          {result.saved ? `Saved ${summary}.` : `The file is valid: ${summary} would be saved. Untick "Check the file only" to import.`}
        </p>
      )}

      {result && !result.ok && (
        <div className="mt-4" role="alert">
          <p className="rounded border-l-4 bg-red-50 px-3 py-2 text-sm font-medium" style={{ borderColor: "var(--error)", color: "var(--error)" }}>
            {result.errorCount} {result.errorCount === 1 ? "problem" : "problems"} found. Nothing was saved. Fix the file and upload it again.
          </p>
          <div className="mt-3 max-h-72 overflow-auto rounded border text-sm" style={{ borderColor: "var(--line)" }}>
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Column</th>
                  <th className="px-3 py-2">Problem</th>
                </tr>
              </thead>
              <tbody>
                {result.errors.map((er, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--line)" }}>
                    <td className="px-3 py-2">{er.row}</td>
                    <td className="px-3 py-2">{er.field ?? ""}</td>
                    <td className="px-3 py-2">{er.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.errorCount > result.errors.length && (
            <p className="mt-2 text-xs" style={{ color: "var(--ink-soft)" }}>
              Showing the first {result.errors.length} problems.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
