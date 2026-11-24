import { describe, it, expect } from "vitest";
import { claimSchema } from "@/validators/claim";

describe("claimSchema", () => {
  it("trims both fields", () => {
    expect(claimSchema.parse({ invoiceNo: " INV-1 ", couponCode: " ABCD1234 " })).toEqual({ invoiceNo: "INV-1", couponCode: "ABCD1234" });
  });
  it("rejects empty or missing fields and oversized input", () => {
    expect(claimSchema.safeParse({ invoiceNo: "", couponCode: "X" }).success).toBe(false);
    expect(claimSchema.safeParse({ invoiceNo: "INV-1" }).success).toBe(false);
    expect(claimSchema.safeParse({ invoiceNo: "A".repeat(65), couponCode: "X" }).success).toBe(false);
    expect(claimSchema.safeParse({ invoiceNo: "INV-1", couponCode: "X".repeat(101) }).success).toBe(false);
  });
});
