import { z } from "zod";

export const resolveFlagSchema = z
  .object({
    decision: z.enum(["DISMISSED", "CONFIRMED"]),
    banUser: z.boolean().optional(),
  })
  .refine((v) => !v.banUser || v.decision === "CONFIRMED", {
    message: "A user can only be banned when the flag is confirmed",
    path: ["banUser"],
  });

export const flagStatusSchema = z.enum(["OPEN", "DISMISSED", "CONFIRMED", "ALL"]).catch("OPEN");
