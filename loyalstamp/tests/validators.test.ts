import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema } from "@/validators/auth";

describe("registerSchema", () => {
  it("accepts valid input and normalizes the email", () => {
    const r = registerSchema.parse({ email: "  Test@Example.COM ", password: "password123" });
    expect(r.email).toBe("test@example.com");
  });

  it("rejects short passwords, long passwords and bad emails", () => {
    expect(registerSchema.safeParse({ email: "a@b.com", password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "a@b.com", password: "x".repeat(73) }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "not-an-email", password: "password123" }).success).toBe(false);
  });

  it("ignores a role field supplied by the client", () => {
    const r = registerSchema.parse({ email: "a@b.com", password: "password123", role: "ADMIN" });
    expect(r).not.toHaveProperty("role");
  });
});

describe("loginSchema", () => {
  it("requires a password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});
