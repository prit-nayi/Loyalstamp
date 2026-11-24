import { z } from "zod";

export const claimSchema = z.object({
  invoiceNo: z.string({ required_error: "Required" }).trim().min(1, "Required").max(64),
  couponCode: z.string({ required_error: "Required" }).trim().min(1, "Required").max(100),
});

export type ClaimInput = z.infer<typeof claimSchema>;
