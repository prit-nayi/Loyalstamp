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
