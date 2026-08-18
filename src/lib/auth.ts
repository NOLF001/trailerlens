// NextAuth (v4) configuration — Google OAuth for the channel-owner Analytics
// mode. JWT sessions; access tokens stay server-side only.

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import type { JWT } from "next-auth/jwt";
import { env } from "@/lib/env";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
].join(" ");

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

async function refreshGoogleToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env().GOOGLE_CLIENT_ID,
        client_secret: env().GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: (token.refreshToken as string) ?? "",
      }),
    });
    if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
    const data = (await res.json()) as GoogleTokenResponse;
    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      refreshToken: data.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  secret: env().NEXTAUTH_SECRET || undefined,
  session: { strategy: "jwt" },
  providers: [
    GoogleProvider({
      clientId: env().GOOGLE_CLIENT_ID,
      clientSecret: env().GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }
      const expiresAt = (token.expiresAt as number | undefined) ?? 0;
      if (Date.now() / 1000 < expiresAt - 60) return token;
      return refreshGoogleToken(token);
    },
    async session({ session, token }) {
      // Never expose tokens to the browser — only auth status + profile.
      if (token.error) {
        (session as unknown as Record<string, unknown>).tokenError = token.error;
      }
      return session;
    },
  },
};
