/**
 * Integration tests for admin API routes.
 * Tests user management, system health, audit trail, and user mutations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Mock db-users
const mockDb = {
  getAllUsers: vi.fn().mockReturnValue([]),
  getBannedUsers: vi.fn().mockReturnValue([]),
  getSystemHealth: vi.fn().mockReturnValue({ status: 'ok' }),
  getAuditTrail: vi.fn().mockReturnValue([]),
  createUser: vi.fn().mockReturnValue(null),
  softDeleteUser: vi.fn().mockReturnValue(true),
  restoreUser: vi.fn().mockReturnValue(true),
  banUser: vi.fn().mockReturnValue(true),
  unbanUser: vi.fn().mockReturnValue(true),
  isUserBanned: vi.fn().mockReturnValue(false),
  updateUserRole: vi.fn().mockReturnValue(true),
  updateUserDetails: vi.fn().mockReturnValue(true),
};

vi.mock('@/lib/db-users', () => mockDb);

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Mock i18n
vi.mock('@/lib/i18n', () => ({
  t: (key: string) => key,
}));

// Mock withAdminAuth
vi.mock('@/lib/api-auth', () => ({
  withAdminAuth: (
    handler: (ctx: {
      session: { user: { id: string; name: string; role: string } };
      request: NextRequest;
      params?: Record<string, string>;
    }) => Promise<Response>,
  ) => {
    return async (req: NextRequest, ctx?: { params?: Record<string, string> }) => {
      return handler({
        session: { user: { id: '00000000-0000-4000-8000-000000000000', name: 'Test Admin', role: 'admin' } },
        request: req,
        params: ctx?.params,
      });
    };
  },
  isValidUUID: (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  positiveIntParam: (searchParams: URLSearchParams, key: string, max?: number) => {
    const val = searchParams.get(key);
    if (!val) return null;
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 0) return null;
    return max ? Math.min(n, max) : n;
  },
}));

// Mock validation
vi.mock('@/lib/validation', () => ({
  parseAndValidate: async (request: Request, _schema: unknown) => {
    try {
      const body = await request.json();
      return { data: body };
    } catch {
      return { response: new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }) };
    }
  },
}));

// Mock sanitization
vi.mock('@/lib/sanitization', () => ({
  sanitizeName: (name: string) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return { error: 'Name cannot be empty' };
    return { value: trimmed };
  },
  sanitizePhone: (phone: string) => {
    const cleaned = phone.replace(/[^\d+\-() ]/g, '').trim();
    return { value: cleaned };
  },
}));

function makeRequest(url: string, method = 'GET', body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as NextRequest;
}

describe('Admin API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/admin/users', () => {
    it('returns all users', async () => {
      const users = [
        { id: 'u1', name: 'Alice' },
        { id: 'u2', name: 'Bob' },
      ];
      mockDb.getAllUsers.mockReturnValue(users);

      const { GET } = await import('@/app/api/admin/users/route');
      const res = await GET(makeRequest('http://localhost/api/admin/users'));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.users).toEqual(users);
      expect(mockDb.getAllUsers).toHaveBeenCalledOnce();
    });

    it('returns empty list when no users', async () => {
      mockDb.getAllUsers.mockReturnValue([]);

      const { GET } = await import('@/app/api/admin/users/route');
      const res = await GET(makeRequest('http://localhost/api/admin/users'));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.users).toEqual([]);
    });
  });

  describe('GET /api/admin/users/banned', () => {
    it('returns banned users', async () => {
      const banned = [{ id: 'u3', name: 'Charlie', banned: true }];
      mockDb.getBannedUsers.mockReturnValue(banned);

      const { GET } = await import('@/app/api/admin/users/banned/route');
      const res = await GET(makeRequest('http://localhost/api/admin/users/banned'));
      const data = await res.json();

      expect(data.users).toEqual(banned);
      expect(mockDb.getBannedUsers).toHaveBeenCalledOnce();
    });
  });

  describe('GET /api/admin/system', () => {
    it('returns system health', async () => {
      const health = { status: 'ok', uptime: 12345 };
      mockDb.getSystemHealth.mockReturnValue(health);

      const { GET } = await import('@/app/api/admin/system/route');
      const res = await GET(makeRequest('http://localhost/api/admin/system'));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.health).toEqual(health);
    });
  });

  describe('GET /api/admin/audit', () => {
    it('returns audit trail with defaults', async () => {
      const logs = [{ action: 'login', user_id: 'u1' }];
      mockDb.getAuditTrail.mockReturnValue(logs);

      const { GET } = await import('@/app/api/admin/audit/route');
      const res = await GET(makeRequest('http://localhost/api/admin/audit'));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.logs).toEqual(logs);
      expect(mockDb.getAuditTrail).toHaveBeenCalledWith(100, 0);
    });

    it('respects limit and offset params', async () => {
      const { GET } = await import('@/app/api/admin/audit/route');
      await GET(makeRequest('http://localhost/api/admin/audit?limit=50&offset=10'));

      expect(mockDb.getAuditTrail).toHaveBeenCalledWith(50, 10);
    });

    it('caps limit at 500', async () => {
      const { GET } = await import('@/app/api/admin/audit/route');
      await GET(makeRequest('http://localhost/api/admin/audit?limit=9999'));

      expect(mockDb.getAuditTrail).toHaveBeenCalledWith(500, 0);
    });
  });

  describe('POST /api/admin/users/create', () => {
    it('creates a user successfully', async () => {
      const newUser = { id: 'u-new', email: 'test@example.com', name: 'Test User', role: 'student' };
      mockDb.createUser.mockResolvedValue(newUser);

      const { POST } = await import('@/app/api/admin/users/create/route');
      const res = await POST(
        makeRequest('http://localhost/api/admin/users/create', 'POST', {
          email: 'test@example.com',
          name: 'Test User',
          password: 'password123',
          role: 'student',
        }),
      );
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.user).toEqual({ id: 'u-new', email: 'test@example.com', name: 'Test User', role: 'student' });
      expect(mockDb.createUser).toHaveBeenCalledOnce();
    });

    it('returns 409 when email already exists', async () => {
      mockDb.createUser.mockResolvedValue(null);

      const { POST } = await import('@/app/api/admin/users/create/route');
      const res = await POST(
        makeRequest('http://localhost/api/admin/users/create', 'POST', {
          email: 'existing@example.com',
          name: 'Existing',
          password: 'password123',
        }),
      );
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error).toBe('User with this email already exists');
    });

    it('returns 400 when name is empty after sanitization', async () => {
      const { POST } = await import('@/app/api/admin/users/create/route');
      const res = await POST(
        makeRequest('http://localhost/api/admin/users/create', 'POST', {
          email: 'test@example.com',
          name: '   ',
          password: 'password123',
        }),
      );
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Name cannot be empty');
    });
  });

  describe('DELETE /api/admin/users/[id]', () => {
    const VALID_UUID = '11111111-1111-4111-8111-111111111111';

    it('soft deletes a user', async () => {
      mockDb.softDeleteUser.mockReturnValue(true);

      const { DELETE } = await import('@/app/api/admin/users/[id]/route');
      const res = await DELETE(makeRequest(`http://localhost/api/admin/users/${VALID_UUID}`, 'DELETE'), {
        params: { id: VALID_UUID },
      });
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(mockDb.softDeleteUser).toHaveBeenCalledWith(VALID_UUID, '00000000-0000-4000-8000-000000000000');
    });

    it('returns 400 for invalid UUID', async () => {
      const { DELETE } = await import('@/app/api/admin/users/[id]/route');
      const res = await DELETE(makeRequest('http://localhost/api/admin/users/bad-id', 'DELETE'), {
        params: { id: 'bad-id' },
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 when deleting own account', async () => {
      const ADMIN_ID = '00000000-0000-4000-8000-000000000000';
      const { DELETE } = await import('@/app/api/admin/users/[id]/route');
      const res = await DELETE(makeRequest(`http://localhost/api/admin/users/${ADMIN_ID}`, 'DELETE'), {
        params: { id: ADMIN_ID },
      });

      expect(res.status).toBe(400);
    });

    it('returns 404 when user not found', async () => {
      mockDb.softDeleteUser.mockReturnValue(false);

      const { DELETE } = await import('@/app/api/admin/users/[id]/route');
      const res = await DELETE(makeRequest(`http://localhost/api/admin/users/${VALID_UUID}`, 'DELETE'), {
        params: { id: VALID_UUID },
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('User not found');
    });
  });

  describe('POST /api/admin/users/[id]/ban', () => {
    const VALID_UUID = '22222222-2222-4222-8222-222222222222';

    it('bans a user', async () => {
      mockDb.isUserBanned.mockReturnValue(false);
      mockDb.banUser.mockReturnValue(true);

      const { POST } = await import('@/app/api/admin/users/[id]/ban/route');
      const res = await POST(
        makeRequest(`http://localhost/api/admin/users/${VALID_UUID}/ban`, 'POST', { reason: 'Spam' }),
        { params: { id: VALID_UUID } },
      );
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(mockDb.banUser).toHaveBeenCalledWith(VALID_UUID, 'Spam', '00000000-0000-4000-8000-000000000000');
    });

    it('returns 400 when banning own account', async () => {
      const ADMIN_ID = '00000000-0000-4000-8000-000000000000';
      const { POST } = await import('@/app/api/admin/users/[id]/ban/route');
      const res = await POST(makeRequest(`http://localhost/api/admin/users/${ADMIN_ID}/ban`, 'POST', {}), {
        params: { id: ADMIN_ID },
      });

      expect(res.status).toBe(400);
    });

    it('returns 409 when user already banned', async () => {
      mockDb.isUserBanned.mockReturnValue(true);

      const { POST } = await import('@/app/api/admin/users/[id]/ban/route');
      const res = await POST(makeRequest(`http://localhost/api/admin/users/${VALID_UUID}/ban`, 'POST', {}), {
        params: { id: VALID_UUID },
      });
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error).toBe('User is already banned');
    });

    it('returns 404 when user not found', async () => {
      mockDb.isUserBanned.mockReturnValue(false);
      mockDb.banUser.mockReturnValue(false);

      const { POST } = await import('@/app/api/admin/users/[id]/ban/route');
      const res = await POST(makeRequest(`http://localhost/api/admin/users/${VALID_UUID}/ban`, 'POST', {}), {
        params: { id: VALID_UUID },
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('User not found');
    });
  });

  describe('POST /api/admin/users/[id]/unban', () => {
    const VALID_UUID = '33333333-3333-4333-8333-333333333333';

    it('unbans a user', async () => {
      mockDb.unbanUser.mockReturnValue(true);

      const { POST } = await import('@/app/api/admin/users/[id]/unban/route');
      const res = await POST(makeRequest(`http://localhost/api/admin/users/${VALID_UUID}/unban`, 'POST'), {
        params: { id: VALID_UUID },
      });
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(mockDb.unbanUser).toHaveBeenCalledWith(VALID_UUID, '00000000-0000-4000-8000-000000000000');
    });

    it('returns 404 when user not banned', async () => {
      mockDb.unbanUser.mockReturnValue(false);

      const { POST } = await import('@/app/api/admin/users/[id]/unban/route');
      const res = await POST(makeRequest(`http://localhost/api/admin/users/${VALID_UUID}/unban`, 'POST'), {
        params: { id: VALID_UUID },
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('User not found or not banned');
    });
  });

  describe('PUT /api/admin/users/[id]/role', () => {
    const VALID_UUID = '44444444-4444-4444-8444-444444444444';

    it('updates user role', async () => {
      mockDb.updateUserRole.mockReturnValue(true);

      const { PUT } = await import('@/app/api/admin/users/[id]/role/route');
      const res = await PUT(
        makeRequest(`http://localhost/api/admin/users/${VALID_UUID}/role`, 'PUT', { role: 'teacher' }),
        { params: { id: VALID_UUID } },
      );
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.role).toBe('teacher');
      expect(mockDb.updateUserRole).toHaveBeenCalledWith(VALID_UUID, 'teacher', '00000000-0000-4000-8000-000000000000');
    });

    it('returns 404 when user not found', async () => {
      mockDb.updateUserRole.mockReturnValue(false);

      const { PUT } = await import('@/app/api/admin/users/[id]/role/route');
      const res = await PUT(
        makeRequest(`http://localhost/api/admin/users/${VALID_UUID}/role`, 'PUT', { role: 'teacher' }),
        { params: { id: VALID_UUID } },
      );
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('User not found');
    });
  });

  describe('PUT /api/admin/users/[id]', () => {
    const VALID_UUID = '55555555-5555-4555-8555-555555555555';

    it('updates user details', async () => {
      mockDb.updateUserDetails.mockReturnValue(true);

      const { PUT } = await import('@/app/api/admin/users/[id]/route');
      const res = await PUT(
        makeRequest(`http://localhost/api/admin/users/${VALID_UUID}`, 'PUT', {
          name: 'Updated Name',
          email: 'new@example.com',
        }),
        { params: { id: VALID_UUID } },
      );
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(mockDb.updateUserDetails).toHaveBeenCalledWith(
        VALID_UUID,
        { name: 'Updated Name', email: 'new@example.com', phone: undefined },
        '00000000-0000-4000-8000-000000000000',
      );
    });

    it('returns 400 when changing own email', async () => {
      const ADMIN_ID = '00000000-0000-4000-8000-000000000000';
      const { PUT } = await import('@/app/api/admin/users/[id]/route');
      const res = await PUT(
        makeRequest(`http://localhost/api/admin/users/${ADMIN_ID}`, 'PUT', { email: 'hacker@example.com' }),
        { params: { id: ADMIN_ID } },
      );
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Cannot change your own email');
    });

    it('returns 404 when user not found', async () => {
      mockDb.updateUserDetails.mockReturnValue(false);

      const { PUT } = await import('@/app/api/admin/users/[id]/route');
      const res = await PUT(makeRequest(`http://localhost/api/admin/users/${VALID_UUID}`, 'PUT', { name: 'Nobody' }), {
        params: { id: VALID_UUID },
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('User not found');
    });
  });

  describe('POST /api/admin/users/[id]/restore', () => {
    const VALID_UUID = '66666666-6666-4666-8666-666666666666';

    it('restores a deleted user', async () => {
      mockDb.restoreUser.mockReturnValue(true);

      const { POST } = await import('@/app/api/admin/users/[id]/restore/route');
      const res = await POST(makeRequest(`http://localhost/api/admin/users/${VALID_UUID}/restore`, 'POST'), {
        params: { id: VALID_UUID },
      });
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(mockDb.restoreUser).toHaveBeenCalledWith(VALID_UUID, '00000000-0000-4000-8000-000000000000');
    });

    it('returns 404 when user not found or not deleted', async () => {
      mockDb.restoreUser.mockReturnValue(false);

      const { POST } = await import('@/app/api/admin/users/[id]/restore/route');
      const res = await POST(makeRequest(`http://localhost/api/admin/users/${VALID_UUID}/restore`, 'POST'), {
        params: { id: VALID_UUID },
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('User not found or not deleted');
    });
  });
});
