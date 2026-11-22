# ASSUMPTIONS.md: LoyalStamp

The assignment leaves several gaps in the requirements. This file lists every gap we filled, the option we chose, and why.

## 1. Business and users

| # | Assumption | Why |
|---|---|---|
| A1 | The business is **B2C**: the factory's invoice belongs to the end customer who bought the product. | The requirements do not say B2B or B2C. B2C is the simplest reading of "customer loyalty". The data model itself works for either, but in B2B the invoice would identify a retailer, so that case would need a retailer-account extension (out of scope). |
| A2 | There is **one factory owner** (single tenant). Roles are `CUSTOMER` and `ADMIN`. | The client is one factory owner. Multi-tenant support adds complexity with no benefit here. |
| A3 | Customers **self-register** with email and password (hashed with bcrypt/argon2). No OTP or social login. | Simple and defensible. OTP/phone verification is listed as a future upgrade. |
| A4 | Rewards are **fulfilled manually** by the factory (shipping, voucher, discount). The system only tracks claim status: `PENDING`, `FULFILLED`, `CANCELLED`. | The factory's logistics are unknown, and integrating delivery is out of scope. |

## 2. Products and coupons

| # | Assumption | Why |
|---|---|---|
| A5 | The `products` table holds **one row per physical unit (box)**, not one row per product type. Each row has its own `product_id` and its own unique coupon code. | Keeps the design to a single table: the coupon is a field on the product, so there is no separate coupon table. A product type with 10,000 boxes has 10,000 rows. |
| A6 | The **company creates the coupon codes** and loads them with the product data (CSV import or admin form). LoyalStamp does not generate or print codes. | The client already holds product data and handles production, so this removes code generation and print logistics. |
| A7 | Each coupon code is **globally unique** and used **once**. After a successful claim the unit is marked `CLAIMED` (the coupon is expired). | Single use is the core anti-reuse rule. |
| A8 | The coupon is **hidden inside the box or under a scratch panel**, so it cannot be read in a shop. | Physical protection is the factory's responsibility. The software cannot enforce it. |
| A9 | Coupon codes are **stored as an HMAC-SHA256 hash** (`coupon_hash`) with a server-side secret. The plain code exists only in the company's import file. | A database leak should not expose valid coupons. |
| A10 | Each product row carries `sku`, `name` and `points_value`. These repeat on every unit of the same type. | Accepted duplication to avoid extra tables. Fine at this scale. |
| A11 | Coupons **do not expire** by time. The only way a coupon stops working is by being claimed. | The requirements give no expiry rule. An optional expiry date is a possible extension. |

## 3. Invoices and proof of purchase

| # | Assumption | Why |
|---|---|---|
| A12 | The company **enters sales into the system** when they happen (CSV import or admin form). LoyalStamp has no live link to an external billing system. | The requirements say the company already has invoice details, but not how they are exchanged. CSV import is the simplest option. |
| A13 | Invoice data is split into `invoices` (one row per invoice: `invoice_no`, customer email or phone, date, total) and `invoice_items` (links an invoice to the product units sold on it). | An invoice contains many products, and customer details should be stored once. |
| A14 | `invoice_no` is unique, and in `invoice_items` each `product_id` is **unique**, so a physical unit appears on at most one invoice. | A unit can be sold only once. This prevents the same unit being attached to two invoices. |
| A15 | **Proof of purchase = invoice number + coupon code, matched together.** The coupon must belong to a unit listed on that invoice. | Two factors: the invoice proves a sale exists, the coupon proves the box was physically opened. Neither is enough alone. |
| A16 | The same invoice number can cover **many products** (it simply has many `invoice_items`). A reward can be earned on **each product** of an invoice, one claim per unit. | Matches the client's note that an invoice can include many products and that rewards apply per product. |
| A17 | The customer's account email does **not** have to match the invoice email. Matching is optional and off by default. | Customers often buy with a different email or as a gift. Matching can be enabled later as a third check. |
| A18 | **Returns and refunds are out of scope.** If a sold unit is returned, an admin adjusts points by adding a correcting ledger entry. | Return handling needs business rules the client has not given. |

## 4. Points and rewards

| # | Assumption | Why |
|---|---|---|
| A19 | **Points per product** are set by the owner in `products.points_value`. | The requirements say rewards can apply to more than one product. A per-product value is the simplest way. |
| A20 | Points are stored in an **append-only `points_ledger`**. The balance is the **sum** of ledger rows. Rows are never edited or deleted. | Prevents a stored balance from drifting and gives a full audit trail. |
| A21 | A customer can **claim a reward** only if they have enough points and the reward is active and in stock. Points are deducted via a negative ledger row. | Basic correctness. Insufficient points and no stock are enforced in one transaction. |
| A22 | Points **do not expire**. | No rule given. Expiry is a possible extension. |
| A23 | Bundle or bonus rules (for example "buy A and B together") are **not implemented**. | Kept as a documented future extension to limit scope. |

## 5. Fraud prevention

| # | Assumption | Why |
|---|---|---|
| A24 | A claim is done in **one atomic database transaction**: mark the unit `CLAIMED` (only if still `UNUSED` and on the given invoice), then write the ledger row. If anything fails, everything rolls back. | Stops double claims and race conditions, including two simultaneous requests. |
| A25 | All failures (wrong coupon, wrong invoice, coupon not on the invoice, already used) return the **same generic "No match" error**. | Stops attackers learning which input was valid. |
| A26 | **Rate limiting** per user and per IP, plus a temporary lockout after repeated failed attempts. | Reduces brute-force guessing of coupons and invoice numbers. |
| A27 | Suspicious activity (many failed attempts, many accounts from one IP, unusually high claim volume) creates a **flag for admin review**. It does not silently block. Flags are stored in `audit_logs` with a `type`, not in a separate table. | Keeps the schema small and lets the owner decide. |
| A28 | We claim fraud is **greatly reduced, not eliminated**. A person who has both the invoice number and the coupon from the same box is treated as the legitimate buyer. | An honest limit. The software cannot tell a buyer from someone given both items. |

## 6. Admin and monitoring

| # | Assumption | Why |
|---|---|---|
| A29 | The owner uses a **web admin dashboard** to import products and invoices, manage rewards, see claims, review fraud flags, and view the audit log. | Covers the requirement that the owner can view, manage and monitor rewards. |
| A30 | Dashboard metrics are: coupons claimed vs unclaimed, points issued vs spent, active customers, reward claims by status, and a claims trend over time. | Enough for the owner to monitor the program. |
| A31 | Every admin action and every claim is written to `audit_logs`. | Accountability and later investigation. |
| A32 | CSV imports are **validated**: reject duplicate `coupon_hash`, duplicate `invoice_no`, unknown `product_id`, and a `product_id` already linked to another invoice. | The company enters data by hand, so bad data is likely. |

## 7. Technical and scope

| # | Assumption | Why |
|---|---|---|
| A33 | Stack: **Next.js (TypeScript), PostgreSQL, Prisma, Zod, Tailwind**, hosted on **Vercel + Neon**. Reasons are in `ARCHITECTURE.md`. | One codebase and one deployment. Postgres gives the transactions and unique constraints that fraud prevention needs. |
| A34 | Scale is a **small to mid-sized factory** (tens of thousands of units). No special performance engineering is needed. | Indexed lookups on `coupon_hash` and `invoice_no` are enough. |
| A35 | The app is a **web app only** (mobile-friendly). Coupon codes are typed in. QR scanning is not included. | Keeps scope manageable. QR scanning can be added later. |
| A36 | One currency-free **points system**. No money handling or payments. | The program rewards loyalty with points, not cash. |
| A37 | Secrets (`DATABASE_URL`, `CODE_HMAC_SECRET`, `AUTH_SECRET`) live in environment variables. Only `.env.example` with placeholders is committed. | Required by the assignment and basic security practice. |

## 8. Out of scope (possible future work)

- B2B retailer accounts
- OTP or phone verification
- Coupon or points expiry dates
- Bundle and promotion rules
- QR code scanning
- Live integration with the company's billing system
- Email notifications
