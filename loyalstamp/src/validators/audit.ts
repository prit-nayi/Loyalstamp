import { z } from "zod";

/** Query-string input for the audit log page. Anything invalid quietly falls back to a safe default. */
export const auditQuerySchema = z.object({
  action: z.string().regex(/^[A-Z_]{1,64}$/).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
