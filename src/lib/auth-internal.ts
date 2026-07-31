/**
 * Internal NextAuth config with full DB access.
 * Used only by the API route handler (Node.js runtime).
 * The main auth.ts is Edge-compatible for proxy.
 */
import NextAuth from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import type { User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { verifyPassword, type UserRole } from '@/lib/db-users';

const nextAuth = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await verifyPassword(credentials.email as string, credentials.password as string);

        if (!user) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          role_changed_at: user.role_changed_at,
        };
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({
      token,
      user,
      trigger,
      session,
    }: {
      token: JWT;
      user?: User;
      trigger?: 'signIn' | 'signUp' | 'update';
      session?: { name?: string; phone?: string | null };
    }) {
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
        token.phone = (session.phone as string | null) ?? token.phone;
      }
      return token;
    },
    async session({ session, token }: { session: import('next-auth').Session; token: JWT }) {
      const currentRole = token.role as UserRole | undefined;

      if (currentRole) {
        const db = (await import('@/lib/db-users')).getDb();
        const dbUser = db.prepare('SELECT role, role_changed_at, banned_at FROM users WHERE id = ?').get(token.id) as
          { role: string; role_changed_at: number | null; banned_at: number | null } | undefined;

        if (dbUser && dbUser.banned_at) {
          session.user.id = '';
          session.user.name = '';
          session.user.email = '';
          session.user.phone = null;
          session.user.role = 'student';
          return session;
        }

        if (
          dbUser &&
          dbUser.role_changed_at &&
          token.role_changed_at &&
          dbUser.role_changed_at > token.role_changed_at
        ) {
          session.user.id = '';
          session.user.name = '';
          session.user.email = '';
          session.user.phone = null;
          session.user.role = 'student';
          return session;
        }

        session.user.id = token.id as string;
        session.user.name = token.name as string;
        session.user.email = token.email as string;
        session.user.phone = (token.phone as string | null) ?? null;
        session.user.role = currentRole;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.AUTH_SECRET,
});

export const { auth, signIn, signOut } = nextAuth;
export const { GET, POST } = nextAuth.handlers;
