import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMIT_WINDOWS } from '@/lib/rate-limit';
import { apiServerError } from '@/lib/api-error';
import { getDb } from '@/lib/db/connection';

export const dynamic = 'force-dynamic';

const VALID_RATINGS = ['good', 'needs-improvement', 'poor'];
const MAX_STRING_LENGTH = 2048;

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const limitResult = await rateLimit(`web-vitals:${ip}`, { max: 60, windowMs: RATE_LIMIT_WINDOWS.oneMinute });
    if (!limitResult.success) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const raw: Record<string, unknown> = await request.json();

    // Validate required fields
    const name = typeof raw.name === 'string' ? raw.name : '';
    const value = typeof raw.value === 'number' && Number.isFinite(raw.value) ? raw.value : NaN;
    if (!name || !Number.isFinite(value)) {
      return NextResponse.json(
        { success: false, error: 'Invalid metric: name and finite value required' },
        { status: 400 },
      );
    }

    // Sanitize and validate optional fields
    const rating = VALID_RATINGS.includes(raw.rating as string) ? (raw.rating as string) : 'unknown';
    const page = typeof raw.page === 'string' ? raw.page.slice(0, MAX_STRING_LENGTH) : '/';
    const userAgent = typeof raw.userAgent === 'string' ? raw.userAgent.slice(0, MAX_STRING_LENGTH) : null;
    const id =
      typeof raw.id === 'string' ? raw.id.slice(0, 128) : `wv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const delta = typeof raw.delta === 'number' && Number.isFinite(raw.delta) ? raw.delta : 0;
    const navigationType = typeof raw.navigationType === 'string' ? raw.navigationType.slice(0, 64) : 'unknown';
    const deviceType =
      typeof raw.deviceType === 'string' ? raw.deviceType.slice(0, 32) : detectDeviceType(userAgent || undefined);

    // Log the metric
    logger.info(`[WebVitals] ${name}=${Math.round(value)} (${rating}) page=${page}`);

    // Persist to database
    try {
      const db = getDb();
      const collectedAt = Date.now();

      db.prepare(
        `
        INSERT INTO web_vitals (id, metric_name, value, rating, delta, page, navigation_type, user_agent, country, device_type, collected_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(id, name, value, rating, delta, page, navigationType, userAgent, null, deviceType, collectedAt);

      // Clean up old data (keep last 30 days)
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      db.prepare('DELETE FROM web_vitals WHERE collected_at < ?').run(thirtyDaysAgo);
    } catch (dbErr) {
      logger.error('[WebVitals] Database persistence failed:', dbErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiServerError('WebVitals POST', undefined, err);
  }
}

function detectDeviceType(userAgent?: string): string {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile')) return 'mobile';
  if (ua.includes('tablet')) return 'tablet';
  if (ua.includes('ipad')) return 'tablet';
  return 'desktop';
}
