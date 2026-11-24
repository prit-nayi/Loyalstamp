"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <button onClick={logout} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
      Log out
    </button>
  );
}
