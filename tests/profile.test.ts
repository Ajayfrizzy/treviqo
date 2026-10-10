import { expect, it } from "vitest";
import { registrationSchema, signInSchema } from "@/modules/auth/validation";
import {
  displayName,
  profileSchema,
  countries,
} from "@/modules/profile/shared";
const input = {
  firstName: "  Adé  ",
  lastName: "O’Connor",
  email: "Person@Example.test",
  password: "Abcdef1!",
};
it("requires names at registration, preserves Unicode and leaves optional fields unspecified", () => {
  expect(registrationSchema.parse(input)).toEqual({
    ...input,
    firstName: "Adé",
    email: "person@example.test",
    preferredName: null,
    country: null,
  });
  for (const firstName of [undefined, "", " ", "a".repeat(81), "a\nb"])
    expect(registrationSchema.safeParse({ ...input, firstName }).success).toBe(
      false,
    );
  expect(registrationSchema.safeParse({ ...input, lastName: "" }).success).toBe(
    false,
  );
  expect(
    registrationSchema.parse({
      ...input,
      preferredName: " Addy ",
      country: "NG",
    }),
  ).toMatchObject({ preferredName: "Addy", country: "NG" });
});
it("uses preferred name, first name, then no invented name for legacy accounts", () => {
  expect(displayName({ preferredName: " Addy ", firstName: "Adé" })).toBe(
    "Addy",
  );
  expect(displayName({ preferredName: " ", firstName: "Adé" })).toBe("Adé");
  expect(displayName({ firstName: null, preferredName: null })).toBeNull();
  expect(displayName({})).toBeNull();
  expect(
    signInSchema.safeParse({
      email: input.email,
      password: "legacy passphrase",
    }).success,
  ).toBe(true);
});
it("accepts only permitted profile fields and explicit country choices", () => {
  expect(profileSchema.parse({ firstName: "", country: "" })).toMatchObject({
    firstName: null,
    country: null,
  });
  for (const extra of [
    { userId: "other" },
    { email: "other@example.test" },
    { passwordHash: "hash" },
    { deletionScheduledFor: null },
  ])
    expect(profileSchema.safeParse({ ...extra }).success).toBe(false);
  for (const country of ["XX", "Nigeria", "ng"])
    expect(profileSchema.safeParse({ country }).success).toBe(false);
  expect(new Set(countries.map((country) => country.code)).size).toBe(249);
});
