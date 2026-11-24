import { z } from "zod";

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const registerSchema = z.object({
  email,
  // bcrypt only uses the first 72 bytes, so longer passwords are rejected instead of silently truncated.
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(72),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
