import { z } from "zod";

const HTTPS_URL_REGEX = /^https:\/\/[^\s]+$/i;

export const newAuditSchema = z
  .object({
    target: z
      .string()
      .min(1, "Target URL is required.")
      .regex(HTTPS_URL_REGEX, "Target must start with https://"),
    coverage: z.enum(["quick", "surface", "full"]),
    max_pages: z.number().int().min(1).max(5000),
    depth: z.number().int().min(1).max(20),
    include_patterns: z.array(z.string()),
    exclude_patterns: z.array(z.string()),
    primary_url: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .refine((value) => !value || HTTPS_URL_REGEX.test(value), "Focus URL must start with https://"),
    keyword: z.string().trim().optional().or(z.literal("")),
    goal: z.string().trim().optional().or(z.literal("")),
    constraints: z.array(z.string()),
    recaptchaToken: z.string().min(1, "Complete reCAPTCHA verification."),
  })
  .refine(
    (value) => {
      if (!value.primary_url) {
        return true;
      }

      try {
        return new URL(value.target).origin === new URL(value.primary_url).origin;
      } catch {
        return false;
      }
    },
    {
      message: "Focus URL must share the same origin as target URL.",
      path: ["primary_url"],
    },
  );

export type NewAuditInput = z.infer<typeof newAuditSchema>;
