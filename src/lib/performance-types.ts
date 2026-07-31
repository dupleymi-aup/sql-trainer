/**
 * Shared types for performance monitoring and analytics.
 * Consolidates duplicate interfaces from multiple route handlers and components.
 */

export interface PerformanceStats {
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

export interface DailyMetric {
  date: string;
  avg: number;
  count: number;
}

export interface ErrorStat {
  error_type: string;
  count: number;
  message: string;
  page: string;
  worst: number;
}
