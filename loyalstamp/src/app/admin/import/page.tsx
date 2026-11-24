import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ImportCard from "@/components/ImportCard";

export default async function ImportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/admin" className="text-sm underline" style={{ color: "var(--stamp-dark)" }}>
        Back to admin
      </Link>
      <h1 className="font-display mt-3 text-3xl font-bold">Import data</h1>
      <p className="mt-2" style={{ color: "var(--ink-soft)" }}>
        Import products first, then invoices. If any row has a problem, nothing is saved and you see every problem at once.
      </p>

      <div className="mt-8 space-y-6">
        <ImportCard
          title="1. Products and coupons"
          description="One row per physical box. Each box has its own coupon code. Codes are stored as hashes and cannot be read back."
          endpoint="/api/admin/import/products"
          columns="product_id, sku, name, points_value, coupon_code"
          templateHref="/templates/products-template.csv"
          countLabels={{ products: "products" }}
        />
        <ImportCard
          title="2. Invoices"
          description="One row per box sold. Rows with the same invoice_no form one invoice. The product_id must already be imported."
          endpoint="/api/admin/import/invoices"
          columns="invoice_no, invoice_date, product_id, customer_email, customer_phone, total_amount"
          templateHref="/templates/invoices-template.csv"
          countLabels={{ invoices: "invoices", items: "products on those invoices" }}
        />
      </div>
    </main>
  );
}
