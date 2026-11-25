import { describe, it, expect } from "vitest";
import { fillDailySeries } from "@/services/statsService";
import { auditQuerySchema } from "@/validators/audit";
import { formatDateTimeUtc } from "@/lib/format";

describe("fillDailySeries", () => {
  const now = new Date("2026-11-25T10:30:00Z");

  it("returns one row per day, oldest first, ending today", () => {
    const out = fillDailySeries([], 30, now);
    expect(out).toHaveLength(30);
    expect(out[0].day).toBe("2026-10-27");
    expect(out[29].day).toBe("2026-11-25");
  });

  it("keeps real values and fills the other days with zeros", () => {
    const out = fillDailySeries([{ day: "2026-11-24", claims: 3, points: 30 }], 3, now);
    expect(out).toEqual([
      { day: "2026-11-23", claims: 0, points: 0 },
      { day: "2026-11-24", claims: 3, points: 30 },
      { day: "2026-11-25", claims: 0, points: 0 },
    ]);
  });

  it("crosses month and year boundaries correctly", () => {
    const out = fillDailySeries([], 3, new Date("2027-01-01T00:10:00Z"));
    expect(out.map((d) => d.day)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });
});

describe("auditQuerySchema", () => {
  it("accepts a valid action and page", () => {
    expect(auditQuerySchema.parse({ action: "CLAIM_FAILED", page: "3" })).toEqual({ action: "CLAIM_FAILED", page: 3 });
  });
  it("falls back safely on junk input", () => {
    expect(auditQuerySchema.parse({ action: "'; DROP TABLE users;--", page: "abc" })).toEqual({ action: undefined, page: 1 });
    expect(auditQuerySchema.parse({ page: "-4" })).toEqual({ action: undefined, page: 1 });
    expect(auditQuerySchema.parse({})).toEqual({ action: undefined, page: 1 });
  });
});

describe("formatDateTimeUtc", () => {
  it("prints the same text anywhere", () => {
    expect(formatDateTimeUtc(new Date("2026-11-25T09:05:59Z"))).toBe("2026-11-25 09:05 UTC");
    expect(formatDateTimeUtc("2026-11-25T09:05:59Z")).toBe("2026-11-25 09:05 UTC");
  });
});
