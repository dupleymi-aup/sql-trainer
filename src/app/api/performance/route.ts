import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMIT_WINDOWS } from '@/lib/rate-limit';
import { apiServerError } from '@/lib/api-error';
import { getDb } from '@/lib/db/connection';

export const dynamic = 'force-dynamic';

const MAX_FIELD_LENGTH = 2048;
const MAX_ID_LENGTH = 128;

const VALID_RATINGS = ['good', 'needs-improvement', 'poor'] as const;

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
  // Long task properties
  containers?: string;
  // Resource timing properties
  count?: number;
  totalLoadMs?: number;
  totalSizeBytes?: number;
  avgConnectMs?: number;
  avgDnsMs?: number;
  avgTtfbMs?: number;
  avgResponseMs?: number;
  // Error properties
  errorMessage?: string;
  errorStack?: string;
  errorFile?: string;
  errorLine?: number;
  errorColumn?: number;
  // SQL query properties
  queryType?: string;
  rowsReturned?: number;
  hasError?: boolean;
  dbType?: string;
  taskId?: string;
  userId?: string;
}

function truncate(str: unknown, max: number): string {
  const s = String(str ?? '');
  return s.length > max ? s.slice(0, max) : s;
}

function validateMetric(raw: unknown): ExtendedPerformanceMetric | string {
  if (!raw || typeof raw !== 'object') return 'Invalid request body';
  const m = raw as Record<string, unknown>;

  if (!m.name || typeof m.name !== 'string') return 'Missing or invalid name';
  if (typeof m.value !== 'number' || !Number.isFinite(m.value)) return 'Missing or invalid value';
  if (typeof m.id !== 'string' || m.id.length === 0) return 'Missing or invalid id';
  if (typeof m.type !== 'string') m.type = 'unknown';
  if (typeof m.rating !== 'string' || !VALID_RATINGS.includes(m.rating as (typeof VALID_RATINGS)[number])) {
    m.rating = 'good';
  }
  if (typeof m.delta !== 'number' || !Number.isFinite(m.delta)) m.delta = 0;
  if (typeof m.navigationType !== 'string') m.navigationType = 'navigate';
  if (typeof m.page !== 'string') m.page = '/';
  if (typeof m.deviceType !== 'string') m.deviceType = 'unknown';
  if (typeof m.userAgent !== 'string') m.userAgent = '';

  // Truncate long fields
  m.id = truncate(m.id, MAX_ID_LENGTH);
  m.page = truncate(m.page, MAX_FIELD_LENGTH);
  m.deviceType = truncate(m.deviceType, 64);
  m.userAgent = truncate(m.userAgent, MAX_FIELD_LENGTH);
  m.name = truncate(m.name, MAX_FIELD_LENGTH);
  m.errorMessage = truncate(m.errorMessage, MAX_FIELD_LENGTH);
  m.errorStack = truncate(m.errorStack, MAX_FIELD_LENGTH);
  m.errorFile = truncate(m.errorFile, MAX_FIELD_LENGTH);

  return m as unknown as ExtendedPerformanceMetric;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const limitResult = await rateLimit(`performance:${ip}`, { max: 120, windowMs: RATE_LIMIT_WINDOWS.oneMinute });
    if (!limitResult.success) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const raw = await request.json();
    const metric = validateMetric(raw);
    if (typeof metric === 'string') {
      return NextResponse.json({ success: false, error: metric }, { status: 400 });
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
    metric.containers || 'unknown',
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
    metric.count || 1,
    metric.totalLoadMs || metric.value,
    metric.totalSizeBytes || 0,
    metric.avgConnectMs || 0,
    metric.avgDnsMs || 0,
    metric.avgTtfbMs || 0,
    metric.avgResponseMs || 0,
    Date.now(),
  );
}

function persistError(db: ReturnType<typeof getDb>, metric: ExtendedPerformanceMetric): void {
  db.prepare(
    `INSERT INTO runtime_errors (id, error_type, message, stack, filename, line, column, page, device_type, user_agent, collected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    metric.id,
    metric.type || 'error',
    metric.errorMessage || '',
    metric.errorStack || null,
    metric.errorFile || null,
    metric.errorLine || null,
    metric.errorColumn || null,
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
    metric.queryType || 'unknown',
    metric.value,
    metric.rowsReturned || 0,
    metric.hasError ? 1 : 0,
    metric.errorMessage || null,
    metric.dbType || 'unknown',
    metric.taskId || null,
    metric.userId || null,
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
