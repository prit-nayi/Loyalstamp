import { describe, it, expect } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/session";

const SECRET = "test-secret-at-least-16-chars";

describe("session token", () => {
  it("round-trips user id and role", async () => {
    const token = await createSessionToken({ userId: "u1", role: "ADMIN" }, SECRET);
    expect(await verifySessionToken(token, SECRET)).toEqual({ userId: "u1", role: "ADMIN" });
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken({ userId: "u1", role: "ADMIN" }, "another-secret-16-chars-x");
    expect(await verifySessionToken(token, SECRET)).toBeNull();
  });

  it("rejects a tampered token (role changed)", async () => {
    const token = await createSessionToken({ userId: "u1", role: "CUSTOMER" }, SECRET);
    const [h, , s] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "u1", role: "ADMIN" })).toString("base64url");
    expect(await verifySessionToken(`${h}.${forgedPayload}.${s}`, SECRET)).toBeNull();
  });

  it("rejects garbage and missing tokens", async () => {
    expect(await verifySessionToken("not-a-token", SECRET)).toBeNull();
    expect(await verifySessionToken(undefined, SECRET)).toBeNull();
  });

  it("fails closed when the secret is too short", async () => {
    await expect(createSessionToken({ userId: "u1", role: "CUSTOMER" }, "short")).rejects.toThrow();
    expect(await verifySessionToken("a.b.c", "short")).toBeNull();
  });
});
