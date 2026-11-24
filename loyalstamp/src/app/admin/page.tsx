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
        <h1 className="text-2xl font-semibold">Admin</h1>
        <LogoutButton />
      </div>
      <p className="mt-2 text-slate-600">Signed in as {user.email}.</p>
      <p className="mt-6 text-sm text-slate-500">Data import, rewards and monitoring arrive in the next steps.</p>
    </main>
  );
}
