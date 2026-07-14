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
    const metric = searchParams.get('metric') || 'LCP';
    const days = parseInt(searchParams.get('days') || '7');
    const page = searchParams.get('page');

    const db = getDb();
    const cutoffDate = Date.now() - days * 24 * 60 * 60 * 1000;

    // Get aggregated stats
    const stats = db
      .prepare(
        `
      SELECT 
        metric_name,
        COUNT(*) as count,
        AVG(value) as avg,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) as p50,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value) as p99,
        MAX(value) as worst,
        SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) as good,
        SUM(CASE WHEN rating = 'needs_improvement' THEN 1 ELSE 0 END) as needsImprovement,
        SUM(CASE WHEN rating = 'poor' THEN 1 ELSE 0 END) as poor
      FROM web_vitals
      WHERE collected_at >= ?
        ${page ? 'AND page = ?' : ''}
      GROUP BY metric_name
      ORDER BY metric_name
    `,
      )
      .all(cutoffDate, page) as PerformanceStats[];

    // Get daily trend
    const trend = db
      .prepare(
        `
      SELECT 
        DATE(collected_at, 'unixepoch', 'start of day') as date,
        AVG(value) as avg,
        COUNT(*) as count
      FROM web_vitals
      WHERE metric_name = ? AND collected_at >= ?
        ${page ? 'AND page = ?' : ''}
      GROUP BY date
      ORDER BY date DESC
      LIMIT ?
    `,
      )
      .all(metric, cutoffDate, page, days) as DailyMetric[];

    // Get worst performing pages
    const worstPages = db
      .prepare(
        `
      SELECT 
        page,
        COUNT(*) as count,
        AVG(value) as avg,
        MAX(value) as worst,
        AVG(CASE WHEN rating = 'good' THEN 1.0 ELSE 0.0 END) as good_rate
      FROM web_vitals
      WHERE metric_name = ? AND collected_at >= ?
      GROUP BY page
      ORDER BY avg DESC
      LIMIT 10
    `,
      )
      .all(metric, cutoffDate) as Array<{
      page: string;
      count: number;
      avg: number;
      worst: number;
      good_rate: number;
    }>;

    // Get device breakdown
    const deviceBreakdown = db
      .prepare(
        `
      SELECT 
        device_type,
        COUNT(*) as count,
        AVG(value) as avg,
        SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) as good
      FROM web_vitals
      WHERE metric_name = ? AND collected_at >= ?
      GROUP BY device_type
      ORDER BY avg DESC
    `,
      )
      .all(metric, cutoffDate) as Array<{
      device_type: string;
      count: number;
      avg: number;
      good: number;
    }>;

    return NextResponse.json({
      success: true,
      stats,
      trend: trend.reverse(),
      worstPages,
      deviceBreakdown,
      period: { metric, days, page },
    });
  } catch (err) {
    return apiServerError('WebVitals Analytics GET', undefined, err);
  }
}
