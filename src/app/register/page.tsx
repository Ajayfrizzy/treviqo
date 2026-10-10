import { CredentialsForm } from "@/components/auth-actions";
import { authConfigured } from "@/modules/auth/options";
import { AuthLayout } from "@/components/auth-layout";
export const dynamic = "force-dynamic";
export default function Register() {
  let configured = false;
  try {
    configured = authConfigured();
  } catch {
    /* Fail closed without exposing configuration. */
  }
  return (
    <AuthLayout
      title="Create your account"
      intro="Keep your employment and benefits history together, wherever work takes you."
    >
      <div>
        {configured ? (
          <CredentialsForm register />
        ) : (
          <p role="status">
            Registration is being prepared. Please check back soon.
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
