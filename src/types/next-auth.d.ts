import type { UserRole } from '@/lib/db-users';
import type _NextAuth from 'next-auth';

declare module 'next-auth' {
  interface User {
    id: string;
    phone?: string | null;
    role: UserRole;
    role_changed_at?: number | null;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      phone?: string | null;
      role: UserRole;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    phone?: string | null;
    role: UserRole;
    role_changed_at?: number | null;
  }
}
