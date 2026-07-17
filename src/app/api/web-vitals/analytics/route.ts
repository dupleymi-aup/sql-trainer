import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { withAdminAuth } from '@/lib/api-auth';
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

export const GET = withAdminAuth(async ({ request }) => {
  try {
    const { searchParams } = new URL(request.url);
    const metric = searchParams.get('metric') || 'LCP';
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '7', 10), 1), 90);
    const page = searchParams.get('page');

    const db = getDb();
    const cutoffDate = Date.now() - days * 24 * 60 * 60 * 1000;

    // Get aggregated stats — SQLite-compatible percentiles via sorted subqueries
    const stats = db
      .prepare(
        `
      SELECT 
        metric_name,
        COUNT(*) as count,
        AVG(value) as avg,
        (SELECT value FROM web_vitals w2 WHERE w2.metric_name = w1.metric_name AND w2.collected_at >= ? ORDER BY value LIMIT 1 OFFSET MAX(0, (SELECT COUNT(*)-1 FROM web_vitals w3 WHERE w3.metric_name = w1.metric_name AND w3.collected_at >= ?) / 2)) as p50,
        (SELECT value FROM web_vitals w2 WHERE w2.metric_name = w1.metric_name AND w2.collected_at >= ? ORDER BY value LIMIT 1 OFFSET MAX(0, (SELECT COUNT(*)-1 FROM web_vitals w3 WHERE w3.metric_name = w1.metric_name AND w3.collected_at >= ?) * 95 / 100)) as p95,
        (SELECT value FROM web_vitals w2 WHERE w2.metric_name = w1.metric_name AND w2.collected_at >= ? ORDER BY value LIMIT 1 OFFSET MAX(0, (SELECT COUNT(*)-1 FROM web_vitals w3 WHERE w3.metric_name = w1.metric_name AND w3.collected_at >= ?) * 99 / 100)) as p99,
        MAX(value) as worst,
        SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) as good,
        SUM(CASE WHEN rating = 'needs_improvement' THEN 1 ELSE 0 END) as needsImprovement,
        SUM(CASE WHEN rating = 'poor' THEN 1 ELSE 0 END) as poor
      FROM web_vitals w1
      WHERE collected_at >= ?
        ${page ? 'AND page = ?' : ''}
      GROUP BY metric_name
      ORDER BY metric_name
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
      stats,
      trend: trend.reverse(),
      worstPages,
      deviceBreakdown,
      period: { metric, days, page },
    });
  } catch (err) {
    return apiServerError('WebVitals Analytics GET', undefined, err);
  }
});
