import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { registerUser, authenticateUser } from "@/services/authService";

// Integration tests: they use the database in DATABASE_URL and clean up their own rows.
const PREFIX = `authtest-${Date.now()}`;
const email = (n: string) => `${PREFIX}-${n}@example.com`;

afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { details: { path: ["email"], string_starts_with: PREFIX } }] },
  });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

describe("registerUser", () => {
  it("creates a CUSTOMER with a hashed password", async () => {
    const r = await registerUser(email("a"), "password123");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.user.role).toBe("CUSTOMER");

    const row = await db.user.findUniqueOrThrow({ where: { id: r.user.id } });
    expect(row.passwordHash).not.toBe("password123");
    expect(row.passwordHash.startsWith("$2")).toBe(true);
  });

  it("rejects a duplicate email, including different letter case", async () => {
    await registerUser(email("dup"), "password123");
    const again = await registerUser(email("dup").toUpperCase(), "password123");
    expect(again).toEqual({ ok: false, code: "EMAIL_TAKEN" });
  });
});

describe("authenticateUser", () => {
  it("logs in with the right password", async () => {
    await registerUser(email("login"), "password123");
    const r = await authenticateUser(email("login"), "password123");
    expect(r.ok).toBe(true);
  });

  it("fails for a wrong password and for an unknown email, and records the failure", async () => {
    await registerUser(email("wrong"), "password123");
    expect((await authenticateUser(email("wrong"), "badpassword")).ok).toBe(false);
    expect((await authenticateUser(email("nobody"), "password123")).ok).toBe(false);

    const failures = await db.auditLog.count({
      where: { action: "LOGIN_FAILED", details: { path: ["email"], string_starts_with: PREFIX } },
    });
    expect(failures).toBeGreaterThanOrEqual(2);
  });

  it("blocks a banned user", async () => {
    const reg = await registerUser(email("banned"), "password123");
    if (!reg.ok) throw new Error("setup failed");
    await db.user.update({ where: { id: reg.user.id }, data: { status: "BANNED" } });
    expect((await authenticateUser(email("banned"), "password123")).ok).toBe(false);
  });
});
