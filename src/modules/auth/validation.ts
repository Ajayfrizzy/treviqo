import { z } from "zod";

// Shared by the browser and server. Never trim or truncate passwords.
export const passwordRequirements = [
  {
    label: "8–128 characters",
    test: (value: string) => value.length >= 8 && value.length <= 128,
  },
  {
    label: "One uppercase letter (A–Z)",
    test: (value: string) => /[A-Z]/.test(value),
  },
  {
    label: "One lowercase letter (a–z)",
    test: (value: string) => /[a-z]/.test(value),
  },
  { label: "One number (0–9)", test: (value: string) => /[0-9]/.test(value) },
  {
    label: "One special character (such as !, @ or #)",
    test: (value: string) => /[^\p{L}\p{N}\s]/u.test(value),
  },
];
const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(254, "Email must be at most 254 characters.");
export const credentialsSchema = z.object({
  email,
  password: z.string().superRefine((value, ctx) => {
    for (const requirement of passwordRequirements) {
      if (!requirement.test(value))
        ctx.addIssue({ code: "custom", message: requirement.label });
    }
  }),
});
// Existing accounts may predate the registration policy. Verify their original password.
export const signInSchema = z.object({
  email,
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(128, "Password must be at most 128 characters."),
});
