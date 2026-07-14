/**
 * SQL Performance Monitor
 * Tracks SQL query execution times and stores metrics in the database.
 */
import { getDb } from './db/connection';
import { logger } from './logger';

export interface SqlPerformanceMetric {
  queryType: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL';
  executionTimeMs: number;
  rowsReturned: number;
  hasError: boolean;
  errorMessage?: string;
  dbType: 'sqlite' | 'postgresql' | 'clickhouse' | 'mysql';
  taskId?: string;
  userId?: string;
}

const MAX_RETENTION_DAYS = 30;
const SLOW_QUERY_THRESHOLD_MS = 1000;
const VERY_SLOW_QUERY_THRESHOLD_MS = 5000;

/**
 * Record SQL query performance metric
 */
export function recordSqlPerformance(metric: SqlPerformanceMetric): void {
  try {
    const db = getDb();
    const collectedAt = Date.now();

    db.prepare(
      `
      INSERT INTO sql_performance (id, query_type, execution_time_ms, rows_returned, has_error, error_message, db_type, task_id, user_id, collected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      crypto.randomUUID(),
      metric.queryType,
      metric.executionTimeMs,
      metric.rowsReturned,
      metric.hasError ? 1 : 0,
      metric.errorMessage || null,
      metric.dbType,
      metric.taskId || null,
      metric.userId || null,
      collectedAt,
    );

    // Log slow queries
    if (metric.executionTimeMs > VERY_SLOW_QUERY_THRESHOLD_MS) {
      logger.warn(
        `[SqlPerformance] VERY SLOW ${metric.queryType} query: ${Math.round(metric.executionTimeMs)}ms (threshold: ${VERY_SLOW_QUERY_THRESHOLD_MS}ms)`,
      );
    } else if (metric.executionTimeMs > SLOW_QUERY_THRESHOLD_MS) {
      logger.info(
        `[SqlPerformance] SLOW ${metric.queryType} query: ${Math.round(metric.executionTimeMs)}ms (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`,
      );
    }

    // Clean up old data periodically (every 1000 inserts)
    const count = db.prepare('SELECT COUNT(*) as c FROM sql_performance').get() as { c: number };
    if (count.c % 1000 === 0) {
      const cutoffDate = Date.now() - MAX_RETENTION_DAYS * 24 * 60 * 60 * 1000;
      db.prepare('DELETE FROM sql_performance WHERE collected_at < ?').run(cutoffDate);
    }
  } catch (err) {
    logger.error('[SqlPerformance] Failed to record metric:', err);
  }
}

/**
 * Get performance statistics for SQL queries
 */
export function getSqlPerformanceStats(days: number = 7): {
  totalQueries: number;
  avgExecutionTime: number;
  p95ExecutionTime: number;
  slowQueries: number;
  errorRate: number;
  byType: Array<{
    queryType: string;
    count: number;
    avgTime: number;
    p95Time: number;
    errorCount: number;
  }>;
  topSlowQueries: Array<{
    queryType: string;
    executionTimeMs: number;
    taskId: string | null;
    dbType: string;
    collectedAt: number;
  }>;
} {
  const db = getDb();
  const cutoffDate = Date.now() - days * 24 * 60 * 60 * 1000;

  const overall = db
    .prepare(
      `
    SELECT 
      COUNT(*) as totalQueries,
      AVG(execution_time_ms) as avgExecutionTime,
      MAX(execution_time_ms) as worstTime,
      SUM(CASE WHEN execution_time_ms > ? THEN 1 ELSE 0 END) as slowQueries,
      SUM(CASE WHEN has_error = 1 THEN 1 ELSE 0 END) as errorCount
    FROM sql_performance
    WHERE collected_at >= ?
  `,
    )
    .all(SLOW_QUERY_THRESHOLD_MS, cutoffDate) as Array<{
    totalQueries: number;
    avgExecutionTime: number;
    worstTime: number;
    slowQueries: number;
    errorCount: number;
  }>[0];

  const byType = db
    .prepare(
      `
    SELECT 
      query_type,
      COUNT(*) as count,
      AVG(execution_time_ms) as avgTime,
      MAX(execution_time_ms) as worstTime,
      SUM(CASE WHEN has_error = 1 THEN 1 ELSE 0 END) as errorCount
    FROM sql_performance
    WHERE collected_at >= ?
    GROUP BY query_type
    ORDER BY avgTime DESC
  `,
    )
    .all(cutoffDate) as Array<{
    queryType: string;
    count: number;
    avgTime: number;
    worstTime: number;
    errorCount: number;
  }>;

  const topSlow = db
    .prepare(
      `
    SELECT 
      query_type,
      execution_time_ms,
      task_id,
      db_type,
      collected_at
    FROM sql_performance
    WHERE collected_at >= ? AND execution_time_ms > ?
    ORDER BY execution_time_ms DESC
    LIMIT 20
  `,
    )
    .all(cutoffDate, SLOW_QUERY_THRESHOLD_MS) as Array<{
    queryType: string;
    executionTimeMs: number;
    taskId: string | null;
    dbType: string;
    collectedAt: number;
  }>;

  // Calculate P95 (simple approximation)
  const allTimes = db
    .prepare(
      `
    SELECT execution_time_ms FROM sql_performance 
    WHERE collected_at >= ? 
    ORDER BY execution_time_ms ASC
  `,
    )
    .all(cutoffDate) as Array<{ execution_time_ms: number }>;

  const p95Index = Math.floor(allTimes.length * 0.95);
  const p95ExecutionTime = allTimes[p95Index]?.execution_time_ms || 0;

  return {
    totalQueries: overall.totalQueries,
    avgExecutionTime: overall.avgExecutionTime || 0,
    p95ExecutionTime: p95ExecutionTime || 0,
    slowQueries: overall.slowQueries,
    errorRate: overall.totalQueries > 0 ? (overall.errorCount / overall.totalQueries) * 100 : 0,
    byType,
    topSlowQueries: topSlow,
  };
}
