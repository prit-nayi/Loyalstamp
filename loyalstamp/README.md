# LoyalStamp

A customer loyalty rewards system for a factory that sells boxed products.
A customer proves a purchase with an **invoice number + the coupon code inside the box**,
earns points, and exchanges points for rewards. The factory owner manages everything
from an admin dashboard.

> Status: project setup (Phase 0). Sections marked TODO are filled in as features land.

## How it works

1. The company loads products (one row per physical box, each with a unique hashed coupon) and invoices.
2. A customer registers, then enters the invoice number and the coupon code.
3. The system checks, in one atomic transaction, that the coupon belongs to a unit on that invoice and is unused, then marks it claimed and credits points.
4. Customers spend points on rewards. The admin tracks claims, fraud flags and stats.

## Tech stack

Next.js (TypeScript), PostgreSQL, Prisma, Zod, Tailwind CSS, Vitest, GitHub Actions, Vercel + Neon.
Reasons are in `ARCHITECTURE.md` (TODO).

## Setup

```bash
git clone <repo-url> && cd loyalstamp
npm install
cp .env.example .env     # then fill in real values
npm run db:migrate       # TODO: available after Phase 2
npm run db:seed          # TODO: available after Phase 2
npm run dev
```

Open http://localhost:3000.

## Tests

```bash
npm test
```

## Deployed link

TODO

## Demo credentials

TODO (admin and customer accounts, added after seeding)

## Documentation

- [ASSUMPTIONS.md](ASSUMPTIONS.md)
- ARCHITECTURE.md (TODO)
- [AI_LOG.md](AI_LOG.md)

