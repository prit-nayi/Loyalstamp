# AI_LOG.md: LoyalStamp

This log records the key interactions with the AI tool (Claude) while building LoyalStamp: what I asked, what it produced, where it was wrong, how the problem was noticed, and what I changed.

## Summary

| # | Phase | Topic | AI wrong? |
|---|---|---|---|
| 1 | Planning | Proof-of-purchase model | No, redirected by me |
| 2 | Planning | My "no fraud" invoice idea | No, the AI pushed back |
| 3 | Data model | Invoice table missing | **Yes** |
| 4 | Auth | Shell script created a wrongly named folder | **Yes** |
| 5 | UI | Stamp-edge CSS hid the form | **Yes** |
| 6 | Setup | Missing setup steps and dependency | **Yes** (incomplete instructions) |
| 7 | Claim service | Atomic claim and race protection | No, verified by tests |
| 8 | Fraud controls | Lockout placement broke existing tests | Caught before delivery |
| 9 | Rewards | Double-spend race on points | No, verified by tests |
| 10 | UI | Hydration warning | No, diagnosed |

---

## 1. Design: choosing the proof-of-purchase model

- **Phase:** Planning
- **Prompt:** Asked the AI to plan a loyalty system for a factory (proof of purchase, fraud prevention, owner dashboard).
- **What the AI did:** Proposed generated unique codes printed on boxes, with batch generation, print export and QR files.
- **Was it wrong?** Not wrong, but I redirected it.
- **How I noticed:** The client already holds product and invoice data, so generating and printing codes was unnecessary work.
- **Fix / decision:** I moved to company-supplied coupon codes. I then pushed the design further: the coupon is a field on the product row, so there is no separate coupon table, and each row is one physical box. I also decided to assume B2C and document it in `ASSUMPTIONS.md`.

## 2. Design: testing my own "no fraud" idea

- **Phase:** Planning
- **Prompt:** I proposed matching a product ID and an invoice number against the company's records, and said this left no case of fraud.
- **What the AI did:** Agreed the idea was good but disagreed with "no fraud". It listed guessable invoice numbers, shared invoices and double claims as remaining risks. It also corrected my later claim that B2B or B2C "has no effect", explaining that who holds the invoice changes.
- **Was it wrong?** No. I was the one overclaiming.
- **How I noticed:** The AI's risk table made me see that an invoice number alone proves little.
- **Fix / decision:** I added a second factor: a coupon inside the box, tied to a specific unit that must appear on that invoice. The docs now say fraud is greatly reduced, not eliminated (ASSUMPTIONS A28).

## 3. Data model: the invoice table was missing

- **Phase:** Data model
- **Prompt:** Asked for the lean data model after I removed the coupon table.
- **What the AI did:** Flattened invoices into a single row per product, with no real invoice table.
- **Was it wrong?** Yes.
- **How I noticed:** I reviewed the table list and saw there was no invoice table, so customer details would repeat on every product row.
- **Fix / decision:** The AI split it into `invoices` and `invoice_items`. `invoice_items.product_id` is the primary key, so one physical unit can appear on only one invoice, and the claim query was rewritten to join the two tables.

## 4. Auth: shell script created a wrongly named folder

- **Phase:** Authentication
- **Prompt:** Asked the AI to build register, login and logout with sessions and role checks.
- **What the AI did:** Its setup script used brace expansion (`{register,login,logout}`) in a shell that does not support it. It created one folder literally named `{register,login,logout}`, and the three auth route files failed to write.
- **Was it wrong?** Yes.
- **How I noticed:** The AI noticed it in the file listing of the zip, which showed a literal folder and missing route files.
- **Fix / decision:** Removed the folder, created the three folders separately, and rewrote the route files. Lesson: check that generated files exist, not just that the command returned success.

## 5. UI: stamp-edge CSS hid the login form

- **Phase:** UI
- **Prompt:** Asked for auth pages with a postage-stamp look to match the LoyalStamp name.
- **What the AI did:** Wrote a CSS mask that punched round holes across the whole card instead of only along its border.
- **Was it wrong?** Yes.
- **How I noticed:** My own screenshot of `/login`. Dots covered the heading, the labels and the button, so the page was hard to read.
- **Fix / decision:** The perforation is now limited to a 10px border zone. A solid mask layer covers the content area, so the holes can never touch text or inputs. I also asked for the register and home pages to be redesigned.

## 6. Setup: missing steps and a missing dependency

- **Phase:** Setup and database
- **Prompt:** Ran the seed script, the migration and the tests from the AI's instructions.
- **What the AI did:** Its instructions skipped steps. The seed failed with "@prisma/client did not initialize" because `prisma generate` had not been run. The migration failed with P1001 (`HOST:5432`) because `.env` still held the placeholder URL. After I switched to a local database it failed with P1011 because `sslmode=require` was copied from the example. Three test files failed to load because `papaparse` was never added to `package.json`.
- **Was it wrong?** Yes, the instructions were incomplete.
- **How I noticed:** The error messages in my terminal.
- **Fix / decision:** Ran `npx prisma generate`, put a real connection string in `.env`, removed `sslmode=require` for the local database, and ran `npm install papaparse @types/papaparse`. After that all test files passed.

## 7. Claim service: one atomic query

- **Phase:** Coupon claim
- **Prompt:** Asked the AI to build the claim service that matches an invoice number and a coupon.
- **What the AI did:** Wrote one SQL `UPDATE ... FROM invoice_items JOIN invoices ... RETURNING` that checks the coupon hash, the `UNUSED` status and the invoice in a single statement. The ledger credit and audit entry go in the same transaction. A unique index on the ledger's `product_id` is a second guard.
- **Was it wrong?** No. It avoided the common mistake of reading the coupon and then updating it, which has a race condition.
- **How I noticed:** I asked for proof rather than trusting it. Tests cover 10 parallel claims of one coupon with exactly 1 winner, a rollback when the ledger insert fails, identical errors for wrong coupon and wrong invoice, and balance equal to the ledger sum.
- **Fix / decision:** All 10 claim service tests passed against my real database.

## 8. Fraud controls: where to put the lockout

- **Phase:** Fraud controls
- **Prompt:** Asked for rate limiting, lockout and fraud flags.
- **What the AI did:** It first planned to put the lockout inside `claimCoupon`. It then noticed that the existing claim tests deliberately fail about eight times for one user, so the lockout would have broken them. It moved the protection into a wrapper, `claimWithProtection`, and kept `claimCoupon` pure. It also rewrote a messy first draft of the "many accounts per IP" test that had leftover placeholder code.
- **Was it wrong?** Caught before delivery.
- **How I noticed:** The AI checked its design against the tests that already existed.
- **Fix / decision:** The lockout uses a sliding window stored in `audit_logs`, so it works on serverless hosting. A blocked attempt is not counted as a failure, so hammering a lock does not extend it. Flags are advisory and only an admin decision changes an account. The tests are in `tests/fraudService.test.ts`.

## 9. Rewards: preventing double-spend

- **Phase:** Rewards
- **Prompt:** Asked for rewards that customers buy with points, with stock and an admin queue.
- **What the AI did:** Pointed out that a simple "check the balance, then spend" lets five parallel requests all pass the check. It locked the user's row (`SELECT ... FOR UPDATE`) before checking the balance, and made the stock decrement conditional (`stock > 0`). The ledger's `reward_claim_id` is unique, so a refund cannot reuse it. The refund is a new ledger row with a note, with no schema change.
- **Was it wrong?** No.
- **How I noticed:** I asked for tests of both races: 5 parallel requests with 100 points against an 80-point reward, and 5 users competing for the last unit.
- **Fix / decision:** Cancels refund only once because the PENDING to CANCELLED change is a conditional update. The tests are in `tests/rewardService.test.ts`.

## 10. UI: hydration warning in the browser console

- **Phase:** UI
- **Prompt:** Pasted a Next.js "hydration mismatch" error that mentioned `fdprocessedid`.
- **What the AI did:** Explained that the attribute is added by a browser extension such as a password manager, not by my code.
- **Was it wrong?** No.
- **How I noticed:** The error listed attributes I never wrote.
- **Fix / decision:** No code change. The warning disappears in an incognito window with extensions off, and it does not appear in production.

---

## What I learned about directing the AI

- Ask for proof, not promises: the concurrency tests settled the race-condition questions better than any explanation.
- Read generated structure as well as code: the missing invoice table and the wrongly named folder both survived until I looked at the listing.
- Challenge claims early: both "no case of fraud" and "no effect for B2B" were corrected before they reached the documents.
