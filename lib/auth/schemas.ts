import { z } from "zod";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().regex(EMAIL_REGEX, "Provide a valid email address."),
  password: z
    .string()
    .min(8, "Password must have at least 8 characters.")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
    .regex(/[0-9]/, "Password must contain at least one number."),
  recaptchaToken: z.string().min(1, "Complete reCAPTCHA verification."),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().regex(EMAIL_REGEX, "Provide a valid email address."),
  password: z.string().min(1, "Password is required."),
  recaptchaToken: z.string().optional().or(z.literal("")),
  registerTicket: z.string().uuid("Invalid register ticket.").optional(),
}).refine(
  (value) => Boolean(value.registerTicket) || Boolean(value.recaptchaToken && value.recaptchaToken.length > 0),
  {
    message: "Complete reCAPTCHA verification.",
    path: ["recaptchaToken"],
  },
);

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
