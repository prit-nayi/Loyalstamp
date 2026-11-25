import { describe, it, expect } from "vitest";
import { checkAccess } from "@/lib/access";

describe("checkAccess", () => {
  it("lets anyone see public pages", () => {
    expect(checkAccess("/", null)).toBe("allow");
    expect(checkAccess("/login", null)).toBe("allow");
    expect(checkAccess("/api/auth/login", null)).toBe("allow");
  });

  it("requires login for customer areas", () => {
    expect(checkAccess("/dashboard", null)).toBe("unauthenticated");
    expect(checkAccess("/api/claim", null)).toBe("unauthenticated");
    expect(checkAccess("/dashboard", { role: "CUSTOMER" })).toBe("allow");
  });

  it("blocks a customer from admin pages and admin APIs", () => {
    expect(checkAccess("/admin", { role: "CUSTOMER" })).toBe("forbidden");
    expect(checkAccess("/admin/products", { role: "CUSTOMER" })).toBe("forbidden");
    expect(checkAccess("/api/admin/import", { role: "CUSTOMER" })).toBe("forbidden");
  });

  it("asks anonymous visitors to log in for admin areas", () => {
    expect(checkAccess("/admin", null)).toBe("unauthenticated");
    expect(checkAccess("/api/admin/import", null)).toBe("unauthenticated");
  });

  it("allows admins into admin areas", () => {
    expect(checkAccess("/admin", { role: "ADMIN" })).toBe("allow");
    expect(checkAccess("/api/admin/import", { role: "ADMIN" })).toBe("allow");
  });

  it("does not treat look-alike paths as admin paths", () => {
    expect(checkAccess("/administrator", null)).toBe("allow");
  });
});

describe("admin import endpoints", () => {
  it("are closed to customers and anonymous visitors", () => {
    expect(checkAccess("/api/admin/import/products", { role: "CUSTOMER" })).toBe("forbidden");
    expect(checkAccess("/api/admin/import/invoices", null)).toBe("unauthenticated");
    expect(checkAccess("/admin/import", { role: "CUSTOMER" })).toBe("forbidden");
  });
});

describe("claim endpoint", () => {
  it("requires login", () => {
    expect(checkAccess("/api/claim", null)).toBe("unauthenticated");
    expect(checkAccess("/api/claim", { role: "CUSTOMER" })).toBe("allow");
  });
});

describe("fraud flag endpoints", () => {
  it("are admin only", () => {
    expect(checkAccess("/api/admin/fraud-flags", { role: "CUSTOMER" })).toBe("forbidden");
    expect(checkAccess("/api/admin/fraud-flags/abc123", null)).toBe("unauthenticated");
    expect(checkAccess("/api/admin/fraud-flags", { role: "ADMIN" })).toBe("allow");
  });
});

describe("reward endpoints and pages", () => {
  it("customer reward routes need login", () => {
    expect(checkAccess("/api/rewards", null)).toBe("unauthenticated");
    expect(checkAccess("/api/rewards/abc/claim", null)).toBe("unauthenticated");
    expect(checkAccess("/dashboard/rewards", null)).toBe("unauthenticated");
    expect(checkAccess("/api/rewards/abc/claim", { role: "CUSTOMER" })).toBe("allow");
  });
  it("reward management is admin only", () => {
    expect(checkAccess("/api/admin/rewards", { role: "CUSTOMER" })).toBe("forbidden");
    expect(checkAccess("/api/admin/reward-claims/abc", { role: "CUSTOMER" })).toBe("forbidden");
    expect(checkAccess("/admin/rewards", { role: "CUSTOMER" })).toBe("forbidden");
    expect(checkAccess("/admin/claims", null)).toBe("unauthenticated");
    expect(checkAccess("/admin/claims", { role: "ADMIN" })).toBe("allow");
  });
});

describe("monitoring pages", () => {
  it("dashboard, fraud and audit pages are admin only", () => {
    for (const path of ["/admin", "/admin/fraud", "/admin/audit"]) {
      expect(checkAccess(path, { role: "CUSTOMER" })).toBe("forbidden");
      expect(checkAccess(path, null)).toBe("unauthenticated");
      expect(checkAccess(path, { role: "ADMIN" })).toBe("allow");
    }
  });
});
