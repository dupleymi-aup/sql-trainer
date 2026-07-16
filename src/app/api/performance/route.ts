import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMIT_WINDOWS } from '@/lib/rate-limit';
import { apiServerError } from '@/lib/api-error';
import { getDb } from '@/lib/db/connection';

export const dynamic = 'force-dynamic';

interface ExtendedPerformanceMetric {
  type: string;
  name: string;
  value: number;
  rating: string;
  delta: number;
  id: string;
  navigationType: string;
  page: string;
  deviceType: string;
  userAgent: string;
  [key: string]: unknown;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const limitResult = await rateLimit(`performance:${ip}`, { max: 120, windowMs: RATE_LIMIT_WINDOWS.oneMinute });
    if (!limitResult.success) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const metric: ExtendedPerformanceMetric = await request.json();

    if (!metric.name || typeof metric.value !== 'number') {
      return NextResponse.json({ success: false, error: 'Invalid metric' }, { status: 400 });
    }

    // Categorize and log the metric
    const type = metric.type || 'unknown';
    logger.info(
      `[Performance] ${type}: ${metric.name}=${Math.round(metric.value)}ms (${metric.rating}) page=${metric.page}`,
    );

    // Persist to database based on type
    try {
      const db = getDb();

      switch (type) {
        case 'longtask':
          persistLongTask(db, metric);
          break;
        case 'error':
          persistError(db, metric);
          break;
        case 'sql_query':
          persistSqlQuery(db, metric);
          break;
        default:
          // Check if resource type or generic metric
          if (metric.type.startsWith('resource:')) {
            persistResource(db, metric);
          } else {
            persistGenericMetric(db, metric);
          }
          break;
      }
    } catch (dbErr) {
      logger.error('[Performance] Database persistence failed:', dbErr);
      // Don't fail the request if DB is down
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiServerError('Performance POST', undefined, err);
  }
}

function persistLongTask(db: ReturnType<typeof getDb>, metric: ExtendedPerformanceMetric): void {
  db.prepare(
    `INSERT INTO long_tasks (id, metric_name, value, rating, delta, page, device_type, user_agent, containers, collected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    metric.id,
    metric.name,
    metric.value,
    metric.rating,
    metric.delta,
    metric.page,
    metric.deviceType,
    metric.userAgent || null,
    (metric as Record<string, unknown>).containers || 'unknown',
    Date.now(),
  );
}

function persistResource(db: ReturnType<typeof getDb>, metric: ExtendedPerformanceMetric): void {
  db.prepare(
    `INSERT INTO resource_timing (id, resource_type, resource_name, value, rating, delta, page, device_type, user_agent,
     count, total_load_ms, total_size_bytes, avg_connect_ms, avg_dns_ms, avg_ttfb_ms, avg_response_ms, collected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    metric.id,
    metric.type.split(':')[1] || 'other',
    metric.name,
    metric.value,
    metric.rating,
    metric.delta,
    metric.page,
    metric.deviceType,
    metric.userAgent || null,
    (metric as Record<string, unknown>).count || 1,
    (metric as Record<string, unknown>).totalLoadMs || metric.value,
    (metric as Record<string, unknown>).totalSizeBytes || 0,
    (metric as Record<string, unknown>).avgConnectMs || 0,
    (metric as Record<string, unknown>).avgDnsMs || 0,
    (metric as Record<string, unknown>).avgTtfbMs || 0,
    (metric as Record<string, unknown>).avgResponseMs || 0,
    Date.now(),
  );
}

function persistError(db: ReturnType<typeof getDb>, metric: ExtendedPerformanceMetric): void {
  db.prepare(
    `INSERT INTO runtime_errors (id, error_type, message, stack, filename, line, column, page, device_type, user_agent, collected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    metric.id,
    (metric as Record<string, unknown>).type || 'error',
    (metric as Record<string, unknown>).errorMessage || '',
    (metric as Record<string, unknown>).errorStack || null,
    (metric as Record<string, unknown>).errorFile || null,
    (metric as Record<string, unknown>).errorLine || null,
    (metric as Record<string, unknown>).errorColumn || null,
    metric.page,
    metric.deviceType,
    metric.userAgent || null,
    Date.now(),
  );
}

function persistSqlQuery(db: ReturnType<typeof getDb>, metric: ExtendedPerformanceMetric): void {
  db.prepare(
    `INSERT INTO sql_performance (id, query_type, execution_time_ms, rows_returned, has_error, error_message,
     db_type, task_id, user_id, collected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    metric.id,
    (metric as Record<string, unknown>).queryType || 'unknown',
    metric.value,
    (metric as Record<string, unknown>).rowsReturned || 0,
    (metric as Record<string, unknown>).hasError ? 1 : 0,
    (metric as Record<string, unknown>).errorMessage || null,
    (metric as Record<string, unknown>).dbType || 'unknown',
    (metric as Record<string, unknown>).taskId || null,
    (metric as Record<string, unknown>).userId || null,
    Date.now(),
  );
}

function persistGenericMetric(db: ReturnType<typeof getDb>, metric: ExtendedPerformanceMetric): void {
  db.prepare(
    `INSERT INTO web_vitals (id, metric_name, value, rating, delta, page, navigation_type, user_agent, device_type, collected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    metric.id,
    metric.name,
    metric.value,
    metric.rating,
    metric.delta,
    metric.page,
    metric.navigationType,
    metric.userAgent || null,
    metric.deviceType,
    Date.now(),
  );
}
