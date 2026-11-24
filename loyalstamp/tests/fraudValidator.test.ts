import { describe, it, expect } from "vitest";
import { resolveFlagSchema, flagStatusSchema } from "@/validators/fraud";

describe("resolveFlagSchema", () => {
  it("accepts a dismissal and a confirmation with a ban", () => {
    expect(resolveFlagSchema.safeParse({ decision: "DISMISSED" }).success).toBe(true);
    expect(resolveFlagSchema.safeParse({ decision: "CONFIRMED", banUser: true }).success).toBe(true);
  });
  it("does not allow banning on a dismissal", () => {
    expect(resolveFlagSchema.safeParse({ decision: "DISMISSED", banUser: true }).success).toBe(false);
  });
  it("rejects unknown decisions", () => {
    expect(resolveFlagSchema.safeParse({ decision: "MAYBE" }).success).toBe(false);
  });
});

describe("flagStatusSchema", () => {
  it("falls back to OPEN for anything unknown", () => {
    expect(flagStatusSchema.parse("nonsense")).toBe("OPEN");
    expect(flagStatusSchema.parse("ALL")).toBe("ALL");
  });
});
