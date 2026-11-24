import { describe, it, expect } from "vitest";
import { rewardCreateSchema, rewardUpdateSchema, claimActionSchema, claimStatusSchema } from "@/validators/rewards";

describe("rewardCreateSchema", () => {
  it("accepts a valid reward and defaults active to true", () => {
    const r = rewardCreateSchema.parse({ name: "  Mug ", pointsCost: 80, stock: 5 });
    expect(r).toMatchObject({ name: "Mug", pointsCost: 80, stock: 5, active: true });
  });
  it("rejects bad numbers and empty names", () => {
    expect(rewardCreateSchema.safeParse({ name: "Mug", pointsCost: 0, stock: 5 }).success).toBe(false);
    expect(rewardCreateSchema.safeParse({ name: "Mug", pointsCost: 1.5, stock: 5 }).success).toBe(false);
    expect(rewardCreateSchema.safeParse({ name: "Mug", pointsCost: 10, stock: -1 }).success).toBe(false);
    expect(rewardCreateSchema.safeParse({ name: "   ", pointsCost: 10, stock: 1 }).success).toBe(false);
    expect(rewardCreateSchema.safeParse({ name: "Mug", pointsCost: "10", stock: 1 }).success).toBe(false);
  });
});

describe("rewardUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(rewardUpdateSchema.safeParse({ stock: 0 }).success).toBe(true);
    expect(rewardUpdateSchema.safeParse({ active: false, description: null }).success).toBe(true);
  });
  it("rejects an empty update", () => {
    expect(rewardUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe("claim queue schemas", () => {
  it("only allows FULFILL or CANCEL", () => {
    expect(claimActionSchema.safeParse({ action: "FULFILL" }).success).toBe(true);
    expect(claimActionSchema.safeParse({ action: "DELETE" }).success).toBe(false);
  });
  it("falls back to PENDING for an unknown status filter", () => {
    expect(claimStatusSchema.parse("whatever")).toBe("PENDING");
    expect(claimStatusSchema.parse("ALL")).toBe("ALL");
  });
});
