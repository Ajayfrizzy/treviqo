import { z } from "zod";

import { countries } from "./countries";
export { countries };
export const countryCodes: string[] = countries.map((country) => country.code);
export const personalName = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(80, "Use 80 characters or fewer.")
  .refine(
    (value) => !/[\p{Cc}\p{Cf}]/u.test(value),
    "Use a name without control characters.",
  );
const optionalName = z
  .union([z.literal(""), personalName])
  .nullable()
  .optional()
  .transform((value) => value || null);
export const profileSchema = z
  .object({
    firstName: optionalName,
    lastName: optionalName,
    preferredName: optionalName,
    country: z
      .string()
      .refine(
        (value) => value === "" || countryCodes.includes(value),
        "Choose a country from the list.",
      )
      .nullable()
      .optional()
      .transform((value) => value || null),
  })
  .strict();
export type PersonalProfile = z.infer<typeof profileSchema>;
export function displayName(profile: {
  preferredName?: string | null;
  firstName?: string | null;
}) {
  return profile.preferredName?.trim() || profile.firstName?.trim() || null;
}
