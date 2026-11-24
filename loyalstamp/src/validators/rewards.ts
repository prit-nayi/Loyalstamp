import { z } from "zod";

const name = z.string().trim().min(1, "Name is required").max(120, "Name is too long (max 120)");
const pointsCost = z.number().int("Must be a whole number").min(1, "Must be at least 1").max(1_000_000);
const stock = z.number().int("Must be a whole number").min(0, "Cannot be negative").max(1_000_000);

export const rewardCreateSchema = z.object({
  name,
  description: z.string().trim().max(500, "Description is too long (max 500)").optional(),
  pointsCost,
  stock,
  active: z.boolean().default(true),
});

export const rewardUpdateSchema = z
  .object({
    name: name.optional(),
    description: z.string().trim().max(500, "Description is too long (max 500)").nullable().optional(),
    pointsCost: pointsCost.optional(),
    stock: stock.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const claimActionSchema = z.object({ action: z.enum(["FULFILL", "CANCEL"]) });

export const claimStatusSchema = z.enum(["PENDING", "FULFILLED", "CANCELLED", "ALL"]).catch("PENDING");
