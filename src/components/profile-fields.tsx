import { countries, type PersonalProfile } from "@/modules/profile/shared";
export function ProfileFields({
  initial,
  errors,
  requiredNames = false,
  disabled = false,
  onChange,
}: {
  initial?: Partial<PersonalProfile>;
  errors: Record<string, string>;
  requiredNames?: boolean;
  disabled?: boolean;
  onChange?: (name: string) => void;
}) {
  return (
    <>
      {(
        [
          ["firstName", "First name", "given-name"],
          ["lastName", "Last name", "family-name"],
          ["preferredName", "Preferred name", "nickname"],
        ] as const
      ).map(([name, label, autocomplete]) => (
        <div className="form-field" key={name}>
          <label htmlFor={name}>
            {label}
            {(!requiredNames || name === "preferredName") && (
              <span className="optional"> (optional)</span>
            )}
          </label>
          <input
            onChange={() => onChange?.(name)}
            id={name}
            name={name}
            autoComplete={autocomplete}
            maxLength={80}
            defaultValue={initial?.[name] ?? ""}
            required={requiredNames && name !== "preferredName"}
            disabled={disabled}
            aria-invalid={!!errors[name]}
            aria-describedby={errors[name] ? `${name}-error` : undefined}
          />
          {errors[name] && (
            <p className="field-error" id={`${name}-error`}>
              {errors[name]}
            </p>
          )}
        </div>
      ))}
      <div className="form-field">
        <label htmlFor="country">
          Country or territory <span className="optional">(optional)</span>
        </label>
        <select
          onChange={() => onChange?.("country")}
          id="country"
          name="country"
          autoComplete="country"
          defaultValue={initial?.country ?? ""}
          disabled={disabled}
          aria-invalid={!!errors.country}
          aria-describedby={errors.country ? "country-error" : undefined}
        >
          <option value="">Not specified</option>
          {countries.map(({ code, label }) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        {errors.country && (
          <p className="field-error" id="country-error">
            {errors.country}
          </p>
        )}
      </div>
    </>
  );
}
