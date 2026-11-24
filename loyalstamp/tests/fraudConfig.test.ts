import { describe, it, expect } from "vitest";
import { loadFraudConfig } from "@/lib/fraudConfig";

describe("loadFraudConfig", () => {
  it("uses safe defaults", () => {
    expect(loadFraudConfig({})).toEqual({ maxFailedAttempts: 5, lockoutMinutes: 15, maxAccountsPerIp: 5, maxClaimsPerHour: 10 });
  });
  it("reads valid numbers from the environment", () => {
    const c = loadFraudConfig({ CLAIM_MAX_FAILED_ATTEMPTS: "3", CLAIM_LOCKOUT_MINUTES: "30" });
    expect(c.maxFailedAttempts).toBe(3);
    expect(c.lockoutMinutes).toBe(30);
  });
  it("falls back to defaults for zero, negative or non-numeric values", () => {
    const c = loadFraudConfig({ CLAIM_MAX_FAILED_ATTEMPTS: "0", CLAIM_LOCKOUT_MINUTES: "abc", FRAUD_MAX_CLAIMS_PER_HOUR: "-4" });
    expect(c).toMatchObject({ maxFailedAttempts: 5, lockoutMinutes: 15, maxClaimsPerHour: 10 });
  });
});
