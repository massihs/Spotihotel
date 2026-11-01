import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/password";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(320));

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH, { message: "password_too_short" }).max(200);

export const signupSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: emailSchema,
  password: passwordSchema,
  restaurantName: z.string().trim().min(2).max(160),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;
