import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMIT_WINDOWS } from '@/lib/rate-limit';
import { apiServerError } from '@/lib/api-error';
import { getDb } from '@/lib/db/connection';

export const dynamic = 'force-dynamic';

interface WebVitalMetric {
  name: string;
  value: number;
  rating: string;
  delta: number;
  id: string;
  navigationType: string;
  page: string;
  userAgent?: string;
  deviceType?: string;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const limitResult = await rateLimit(`web-vitals:${ip}`, { max: 60, windowMs: RATE_LIMIT_WINDOWS.oneMinute });
    if (!limitResult.success) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const metric: WebVitalMetric = await request.json();

    if (!metric.name || typeof metric.value !== 'number') {
      return NextResponse.json({ success: false, error: 'Invalid metric' }, { status: 400 });
    }

    // Log the metric
    logger.info(`[WebVitals] ${metric.name}=${Math.round(metric.value)} (${metric.rating}) page=${metric.page}`);

    // Persist to database
    try {
      const db = getDb();
      const deviceType = metric.deviceType || detectDeviceType(metric.userAgent);
      const collectedAt = Date.now();

      db.prepare(
        `
        INSERT INTO web_vitals (id, metric_name, value, rating, delta, page, navigation_type, user_agent, country, device_type, collected_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        metric.id,
        metric.name,
        metric.value,
        metric.rating,
        metric.delta,
        metric.page,
        metric.navigationType,
        metric.userAgent || null,
        null, // country - could be added later with geo IP
        deviceType,
        collectedAt,
      );

      // Clean up old data (keep last 30 days)
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      db.prepare('DELETE FROM web_vitals WHERE collected_at < ?').run(thirtyDaysAgo);
    } catch (dbErr) {
      logger.error('[WebVitals] Database persistence failed:', dbErr);
      // Don't fail the request if DB is down
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
