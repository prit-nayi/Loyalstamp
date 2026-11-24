"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Wordmark from "./Wordmark";

type Mode = "login" | "register";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isLogin = mode === "login";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      router.push(data.user.role === "ADMIN" ? "/admin" : "/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <Wordmark />

      <div className="stamp-wrap w-full max-w-sm">
        <div className="stamp">
          <div className="stamp-inner">
            <h1 className="font-display text-2xl font-bold">{isLogin ? "Welcome back" : "Create your account"}</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
              {isLogin ? "Log in to see your points and rewards." : "One account holds all the points you collect."}
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate={false}>
              <label className="block text-sm font-medium">
                Email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field"
                />
              </label>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-pressed={showPassword}
                    className="text-sm underline"
                    style={{ color: "var(--stamp-dark)" }}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={isLogin ? 1 : 8}
                  maxLength={72}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field"
                />
                {!isLogin && (
                  <p className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
                    Use 8 to 72 characters.
                  </p>
                )}
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded border-l-4 bg-red-50 px-3 py-2 text-sm"
                  style={{ borderColor: "var(--error)", color: "var(--error)" }}
                >
                  {error}
                </p>
              )}

              <button type="submit" disabled={busy} className="btn-primary w-full">
                {busy ? (isLogin ? "Logging in…" : "Creating account…") : isLogin ? "Log in" : "Create account"}
              </button>
            </form>

            <p className="mt-5 text-sm" style={{ color: "var(--ink-soft)" }}>
              {isLogin ? "New here? " : "Already registered? "}
              <Link href={isLogin ? "/register" : "/login"} className="font-medium underline" style={{ color: "var(--stamp-dark)" }}>
                {isLogin ? "Create an account" : "Log in"}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
