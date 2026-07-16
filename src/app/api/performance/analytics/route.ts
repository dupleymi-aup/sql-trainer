import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { auth } from '@/lib/auth-internal';
import { apiServerError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

interface PerformanceStats {
  metricName: string;
  count: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  worst: number;
  good: number;
  needsImprovement: number;
  poor: number;
}

interface DailyMetric {
  date: string;
  avg: number;
  count: number;
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.role || !['admin', 'teacher'].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'longtask';
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '7', 10), 1), 90);
    const page = searchParams.get('page');

    const db = getDb();
    const cutoffDate = Date.now() - days * 24 * 60 * 60 * 1000;

    switch (type) {
      case 'longtask': {
        // SQLite-compatible percentiles via sorted subqueries
        const stats = db
          .prepare(
            `
            SELECT 
              metric_name,
              COUNT(*) as count,
              AVG(value) as avg,
              (SELECT value FROM long_tasks t2 WHERE t2.metric_name = t1.metric_name AND t2.collected_at >= ? ORDER BY value LIMIT 1 OFFSET MAX(0, (SELECT COUNT(*)-1 FROM long_tasks t3 WHERE t3.metric_name = t1.metric_name AND t3.collected_at >= ?) / 2)) as p50,
              (SELECT value FROM long_tasks t2 WHERE t2.metric_name = t1.metric_name AND t2.collected_at >= ? ORDER BY value LIMIT 1 OFFSET MAX(0, (SELECT COUNT(*)-1 FROM long_tasks t3 WHERE t3.metric_name = t1.metric_name AND t3.collected_at >= ?) * 95 / 100)) as p95,
              (SELECT value FROM long_tasks t2 WHERE t2.metric_name = t1.metric_name AND t2.collected_at >= ? ORDER BY value LIMIT 1 OFFSET MAX(0, (SELECT COUNT(*)-1 FROM long_tasks t3 WHERE t3.metric_name = t1.metric_name AND t3.collected_at >= ?) * 99 / 100)) as p99,
              MAX(value) as worst,
              SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) as good,
              SUM(CASE WHEN rating = 'needs_improvement' THEN 1 ELSE 0 END) as needsImprovement,
              SUM(CASE WHEN rating = 'poor' THEN 1 ELSE 0 END) as poor
            FROM long_tasks t1
            WHERE collected_at >= ?
              ${page ? 'AND page = ?' : ''}
            GROUP BY metric_name
            ORDER BY avg DESC
          `,
          )
          .all(
            cutoffDate,
            cutoffDate,
            cutoffDate,
            cutoffDate,
            cutoffDate,
            cutoffDate,
            cutoffDate,
            page,
          ) as PerformanceStats[];

        const trend = db
          .prepare(
            `
            SELECT 
              DATE(collected_at, 'unixepoch', 'start of day') as date,
              AVG(value) as avg,
              COUNT(*) as count
            FROM long_tasks
            WHERE collected_at >= ?
              ${page ? 'AND page = ?' : ''}
            GROUP BY date
            ORDER BY date DESC
            LIMIT ?
          `,
          )
          .all(cutoffDate, page, days) as DailyMetric[];

        return NextResponse.json({
          success: true,
          stats,
          trend: trend.reverse(),
          period: { type, days, page },
        });
      }

      case 'resource': {
        const stats = db
          .prepare(
            `
            SELECT 
              resource_type,
              COUNT(*) as count,
              AVG(total_load_ms) as avg_load_ms,
              SUM(total_size_bytes) / 1024 as total_size_kb,
              AVG(avg_ttfb_ms) as avg_ttfb_ms,
              SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) as good,
              SUM(CASE WHEN rating = 'poor' THEN 1 ELSE 0 END) as poor
            FROM resource_timing
            WHERE collected_at >= ?
              ${page ? 'AND page = ?' : ''}
            GROUP BY resource_type
            ORDER BY avg_load_ms DESC
          `,
          )
          .all(cutoffDate, page) as Array<{
          resource_type: string;
          count: number;
          avg_load_ms: number;
          total_size_kb: number;
          avg_ttfb_ms: number;
          good: number;
          poor: number;
        }>;

        return NextResponse.json({
          success: true,
          stats,
          period: { type, days, page },
        });
      }

      case 'error': {
        const stats = db
          .prepare(
            `
            SELECT 
              error_type,
              message,
              page,
              COUNT(*) as count,
              MAX(collected_at) as worst
            FROM runtime_errors
            WHERE collected_at >= ?
              ${page ? 'AND page = ?' : ''}
            GROUP BY error_type, message, page
            ORDER BY count DESC
            LIMIT 50
          `,
          )
          .all(cutoffDate, page) as ErrorStat[];

        return NextResponse.json({
          success: true,
          stats,
          period: { type, days, page },
        });
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch (err) {
    return apiServerError('Performance Analytics GET', undefined, err);
  }
}

interface ErrorStat {
  error_type: string;
  message: string;
  page: string;
  count: number;
  worst: number;
}
