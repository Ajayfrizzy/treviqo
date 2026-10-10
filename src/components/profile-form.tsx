"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./button";
import { ProfileFields } from "./profile-fields";
import { uiRequest } from "./ui-request";
import { profileSchema, type PersonalProfile } from "@/modules/profile/shared";
export function ProfileForm({ initial }: { initial: PersonalProfile }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setMessage("");
    setError("");
    setErrors({});
    const parsed = profileSchema.safeParse(
      Object.fromEntries(new FormData(form)),
    );
    if (!parsed.success) {
      const fields = Object.fromEntries(
        parsed.error.issues.map((issue) => [
          String(issue.path[0]),
          issue.message,
        ]),
      );
      setErrors(fields);
      (
        form.elements.namedItem(Object.keys(fields)[0]!) as HTMLElement
      )?.focus();
      return;
    }
    setBusy(true);
    try {
      const response = await uiRequest("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();
      if (!response.ok) {
        setErrors(result.fields ?? {});
        throw new Error(result.error || "Profile could not be saved.");
      }
      setMessage("Profile saved.");
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Profile could not be saved. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="auth-form profile-form" noValidate onSubmit={submit}>
      <ProfileFields
        initial={initial}
        errors={errors}
        disabled={busy}
        onChange={(name) => {
          setErrors((previous) => ({ ...previous, [name]: "" }));
          setMessage("");
        }}
      />
      <Button type="submit" aria-busy={busy}>
        {busy ? "Saving…" : "Save profile"}
      </Button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
