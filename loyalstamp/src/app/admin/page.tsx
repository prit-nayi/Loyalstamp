import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Admin</h1>
        <LogoutButton />
      </div>
      <p className="mt-2" style={{ color: "var(--ink-soft)" }}>
        Signed in as {user.email}.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link href="/admin/import" className="rounded-lg border bg-white p-5 hover:shadow-sm" style={{ borderColor: "var(--line)" }}>
          <h2 className="font-display text-lg font-bold">Import data</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
            Upload products with coupons and invoices from CSV files.
          </p>
        </Link>
      </div>
      <p className="mt-8 text-sm" style={{ color: "var(--ink-soft)" }}>
        Rewards and monitoring arrive in the next steps.
      </p>
    </main>
  );
}
