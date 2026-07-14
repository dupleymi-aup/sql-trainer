import { rateLimit, getClientIdentifier, RATE_LIMIT_WINDOWS } from '@/lib/rate-limit';
import { GET, POST as nextAuthPost } from '@/lib/auth-internal';
import { getLoginLockStatus } from '@/lib/db-users';
import { logger } from '@/lib/logger';
import { NextResponse, type NextRequest } from 'next/server';

async function POST(request: Request) {
  const clientId = getClientIdentifier(request);

  const limitResult = await rateLimit(`login:${clientId}`, { max: 10, windowMs: RATE_LIMIT_WINDOWS.fifteenMinutes });
  if (!limitResult.success) {
    return NextResponse.json(
      { success: false, error: 'Too many login attempts. Please try again later.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(limitResult.limit),
          'X-RateLimit-Remaining': String(limitResult.remaining),
          'X-RateLimit-Reset': String(Math.ceil(limitResult.resetAt / 1000)),
          'Retry-After': String(limitResult.retryAfter),
        },
      },
    );
  }

  // Check if account is locked before consuming the request body
  const cloned = request.clone();
  const body = await cloned.json().catch((e) => {
    logger.warn('Failed to parse login request body', { error: String(e) });
    return {};
  });
  const email = body?.email as string | undefined;
  if (email) {
    const lockStatus = getLoginLockStatus(email);
    if (lockStatus) {
      return NextResponse.json({ success: false, error: lockStatus.message }, { status: 423 });
    }
  }

  const response = await nextAuthPost(request as NextRequest);
  response.headers.set('X-RateLimit-Limit', String(limitResult.limit));
  response.headers.set('X-RateLimit-Remaining', String(limitResult.remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(limitResult.resetAt / 1000)));
  return response;
}

export { GET, POST };
