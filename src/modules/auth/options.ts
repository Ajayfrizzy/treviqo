import "server-only";
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getEnv } from "@/server/config/env";
import { authenticateCredentials } from "./credentials";
import {
  createAuthSession,
  isAuthSessionActive,
  revokeAuthSession,
  SESSION_SECONDS,
} from "./session-store";
export function authConfigured() {
  const env = getEnv();
  return Boolean(
    env.SESSION_SECRET && env.NEXTAUTH_URL && env.DATABASE_URL && env.REDIS_URL,
  );
}
export function getAuthOptions(onSignOutError?: () => void): NextAuthOptions {
  const env = getEnv();
  if (!authConfigured()) throw new Error("Authentication is not configured");
  return {
    secret: env.SESSION_SECRET,
    session: { strategy: "jwt", maxAge: SESSION_SECONDS },
    useSecureCookies:
      env.NODE_ENV === "production" || env.APP_URL.startsWith("https://"),
    pages: { signIn: "/sign-in", error: "/sign-in" },
    providers: [
      Credentials({
        name: "Email and password",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          return authenticateCredentials(credentials);
        },
      }),
    ],
    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          const session = await createAuthSession(user.id);
          return { sub: user.id, sid: session.id };
        }
        return token;
      },
      async session({ session, token }) {
        // Whitelist public fields; never serialize hashes, email or the session ID.
        const active = await isAuthSessionActive(token.sid, token.sub);
        return {
          expires: session.expires,
          user: active && token.sub ? { id: token.sub } : undefined,
        };
      },
    },
    events: {
      async signOut(message) {
        try {
          if ("token" in message) await revokeAuthSession(message.token?.sid);
        } catch (error) {
          onSignOutError?.();
          throw error;
        }
      },
    },
    logger: {
      error: () => console.error("Authentication failed"),
      warn: () => {},
      debug: () => {},
    },
  };
}
