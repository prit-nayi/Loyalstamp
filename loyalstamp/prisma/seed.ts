/**
 * Demo seed. Safe to run more than once: it never resets claimed coupons.
 * Run with: npm run db:seed   (needs DATABASE_URL and CODE_HMAC_SECRET in .env)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { hashCoupon } from "../src/lib/coupon";

const prisma = new PrismaClient();

const PRODUCT_TYPES = [
  { sku: "TEA-250", name: "Green Tea 250g", pointsValue: 10 },
  { sku: "COF-500", name: "Coffee Beans 500g", pointsValue: 20 },
  { sku: "BIS-100", name: "Butter Biscuits 100g", pointsValue: 5 },
];
const UNITS_PER_TYPE = 6;

// Units sold on each demo invoice (productId values).
const INVOICES = [
  { invoiceNo: "INV-1001", date: "2026-11-01", total: "540.00", units: ["TEA-250-0001", "TEA-250-0002", "COF-500-0001"] },
  { invoiceNo: "INV-1002", date: "2026-11-05", total: "120.00", units: ["BIS-100-0001", "BIS-100-0002"] },
];

const REWARDS = [
  { name: "Free Tea Sample Pack", description: "Three assorted tea sachets", pointsCost: 30, stock: 50 },
  { name: "Steel Coffee Mug", description: "Branded 350ml mug", pointsCost: 80, stock: 20 },
  { name: "10% Discount Voucher", description: "Valid on the next order", pointsCost: 120, stock: 100 },
];

const pad = (n: number) => String(n).padStart(4, "0");
const demoCoupon = (sku: string, n: number) => `DEMO-${sku}-${pad(n)}`;

async function main() {
  // Users
  const adminHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "Admin@12345", 10);
  const customerHash = await bcrypt.hash(process.env.SEED_CUSTOMER_PASSWORD ?? "Customer@12345", 10);

  await prisma.user.upsert({
    where: { email: "admin@loyalstamp.test" },
    update: {},
    create: { email: "admin@loyalstamp.test", passwordHash: adminHash, role: "ADMIN" },
  });
  await prisma.user.upsert({
    where: { email: "customer@loyalstamp.test" },
    update: {},
    create: { email: "customer@loyalstamp.test", passwordHash: customerHash, role: "CUSTOMER" },
  });

  // Products: one row per physical box, coupon stored hashed
  for (const type of PRODUCT_TYPES) {
    for (let n = 1; n <= UNITS_PER_TYPE; n++) {
      const productId = `${type.sku}-${pad(n)}`;
      await prisma.product.upsert({
        where: { productId },
        update: {},
        create: {
          productId,
          sku: type.sku,
          name: type.name,
          pointsValue: type.pointsValue,
          couponHash: hashCoupon(demoCoupon(type.sku, n)),
        },
      });
    }
  }

  // Invoices and the units sold on them
  for (const inv of INVOICES) {
    const invoice = await prisma.invoice.upsert({
      where: { invoiceNo: inv.invoiceNo },
      update: {},
      create: {
        invoiceNo: inv.invoiceNo,
        customerEmail: "customer@loyalstamp.test",
        invoiceDate: new Date(inv.date),
        totalAmount: inv.total,
      },
    });
    for (const productId of inv.units) {
      await prisma.invoiceItem.upsert({
        where: { productId },
        update: {},
        create: { productId, invoiceId: invoice.invoiceId },
      });
    }
  }

  // Rewards
  for (const r of REWARDS) {
    const exists = await prisma.reward.findFirst({ where: { name: r.name } });
    if (!exists) await prisma.reward.create({ data: r });
  }

  console.log("\nSeed complete.\n");
  console.log("Accounts:");
  console.log("  admin    admin@loyalstamp.test");
  console.log("  customer customer@loyalstamp.test");
  console.log("  (passwords: see SEED_*_PASSWORD in .env, or the defaults in .env.example)\n");
  console.log("Demo claims to try (invoice number + coupon):");
  for (const inv of INVOICES) {
    for (const productId of inv.units) {
      const [sku, num] = [productId.slice(0, productId.lastIndexOf("-")), Number(productId.slice(-4))];
      console.log(`  ${inv.invoiceNo}  ${demoCoupon(sku, num)}`);
    }
  }
  console.log("\nUnsold units (no invoice) exist too: a claim with them must fail.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
