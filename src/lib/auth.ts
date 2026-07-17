/**
 * NextAuth.js v5 configuration — Credentials provider with email/password.
 * Sessions use JWT (stateless, stored in encrypted cookie).
 *
 * Split into two parts:
 * - This file: NextAuth config (Edge-compatible, used by proxy)
 * - auth-internal.ts: Full config with DB access (used by API routes)
 */
import NextAuth from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import type { UserRole } from '@/lib/db-users';
import CredentialsProvider from 'next-auth/providers/credentials';

// Minimal config for Edge runtime (proxy)
const nextAuthConfig = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      // In Edge runtime, authorize returns null — real auth happens in API route
      async authorize() {
        return null;
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.phone = user.phone ?? null;
        token.role = user.role;
        token.role_changed_at = user.role_changed_at;
      }
      if (trigger === 'update' && session) {
        token.name = session.name ?? token.name;
        token.phone = session.phone ?? token.phone;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        // Note: Edge runtime cannot access the database, so role_changed_at validation
        // happens in auth-internal.ts (Node.js runtime). The proxy uses this config
        // for route protection, and stale roles are validated on next API request.
        const currentRole = token.role as UserRole | undefined;

        if (currentRole) {
          session.user.id = token.id;
          session.user.name = token.name as string;
          session.user.email = token.email as string;
          session.user.phone = token.phone as string | null;
          session.user.role = currentRole;
        }
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt' as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...nextAuthConfig,
  secret: process.env.AUTH_SECRET,
});
