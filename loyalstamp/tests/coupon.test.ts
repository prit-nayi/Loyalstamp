import { describe, it, expect } from "vitest";
import { hashCoupon, normalizeCoupon } from "@/lib/coupon";

const SECRET = "test-secret-at-least-16-chars";

describe("normalizeCoupon", () => {
  it("removes spaces and hyphens and uppercases", () => {
    expect(normalizeCoupon(" ab-12 cd ")).toBe("AB12CD");
  });
});

describe("hashCoupon", () => {
  it("is deterministic", () => {
    expect(hashCoupon("ABC123", SECRET)).toBe(hashCoupon("ABC123", SECRET));
  });

  it("gives the same hash for different formatting of the same code", () => {
    expect(hashCoupon("abc-123", SECRET)).toBe(hashCoupon(" ABC123 ", SECRET));
  });

  it("gives different hashes for different codes", () => {
    expect(hashCoupon("ABC123", SECRET)).not.toBe(hashCoupon("ABC124", SECRET));
  });

  it("gives different hashes for different secrets", () => {
    expect(hashCoupon("ABC123", SECRET)).not.toBe(hashCoupon("ABC123", "another-secret-16-chars-x"));
  });

  it("never contains the plain code", () => {
    expect(hashCoupon("ABC123", SECRET)).not.toContain("ABC123");
  });

  it("throws when the secret is missing or too short", () => {
    expect(() => hashCoupon("ABC123", "")).toThrow();
    expect(() => hashCoupon("ABC123", "short")).toThrow();
  });
});
