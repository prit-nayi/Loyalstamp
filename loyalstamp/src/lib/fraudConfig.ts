export type FraudConfig = {
  /** Failed attempts allowed inside the lockout window before a lock starts. */
  maxFailedAttempts: number;
  /** Length of the sliding window, and so of the lock, in minutes. */
  lockoutMinutes: number;
  /** Distinct accounts using claims from one IP in 24 hours before a flag is raised. */
  maxAccountsPerIp: number;
  /** Successful claims by one account in an hour before a flag is raised. */
  maxClaimsPerHour: number;
};

/** One IP may be many people (shared office or mobile network), so its failure limit is a multiple of the per-user limit. */
export const IP_FAILURE_MULTIPLIER = 4;

const positiveInt = (value: string | undefined, fallback: number) => {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function loadFraudConfig(env: Record<string, string | undefined> = process.env): FraudConfig {
  return {
    maxFailedAttempts: positiveInt(env.CLAIM_MAX_FAILED_ATTEMPTS, 5),
    lockoutMinutes: positiveInt(env.CLAIM_LOCKOUT_MINUTES, 15),
    maxAccountsPerIp: positiveInt(env.FRAUD_MAX_ACCOUNTS_PER_IP, 5),
    maxClaimsPerHour: positiveInt(env.FRAUD_MAX_CLAIMS_PER_HOUR, 10),
  };
}
