'use client';

import { useState, useEffect, useCallback } from 'react';
import { Activity, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WebVitalMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  unit: string;
}

function getThreshold(metric: string, type: 'good' | 'poor'): number {
  switch (metric) {
    case 'LCP':
      return type === 'good' ? 2500 : 4000;
    case 'INP':
      return type === 'good' ? 200 : 500;
    case 'CLS':
      return type === 'good' ? 0.1 : 0.25;
    case 'FCP':
      return type === 'good' ? 1800 : 3000;
    case 'TTFB':
      return type === 'good' ? 800 : 1800;
    default:
      return 0;
  }
}

export default function WebVitalsIndicator() {
  const [metrics, setMetrics] = useState<WebVitalMetric[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    try {
      const response = await fetch('/api/web-vitals/analytics?metric=LCP&days=1');
      const data = await response.json();

      if (data.success && data.stats) {
        const formattedMetrics: WebVitalMetric[] = data.stats.map((stat: { metricName: string; avg: number }) => ({
          name: stat.metricName,
          value: stat.avg,
          rating:
            stat.avg <= getThreshold(stat.metricName, 'good')
              ? 'good'
              : stat.avg <= getThreshold(stat.metricName, 'poor')
                ? 'needs-improvement'
                : 'poor',
          unit: stat.metricName === 'CLS' ? '' : 'ms',
        }));
        setMetrics(formattedMetrics);
      }
    } catch {
      // Silently handle fetch errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  if (loading && metrics.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs text-muted-foreground">Loading metrics...</span>
      </div>
    );
  }

  if (metrics.length === 0) return null;

  const overallRating = metrics.every((m) => m.rating === 'good')
    ? 'good'
    : metrics.some((m) => m.rating === 'poor')
      ? 'poor'
      : 'needs-improvement';

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/50"
      role="status"
      aria-label="Web Vitals status"
    >
      <Activity
        className={cn(
          'h-4 w-4',
          overallRating === 'good' ? 'text-emerald-500' : overallRating === 'poor' ? 'text-red-500' : 'text-amber-500',
        )}
      />

      <div className="flex items-center gap-2">
        {overallRating === 'good' ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : overallRating === 'poor' ? (
          <AlertCircle className="h-4 w-4 text-red-500" />
        ) : (
          <AlertCircle className="h-4 w-4 text-amber-500" />
        )}

        <div className="flex items-center gap-2 text-xs">
          {metrics.slice(0, 3).map((metric) => (
            <div key={metric.name} className="flex items-center gap-1">
              <span className="font-medium">{metric.name}</span>
              <span
                className={cn(
                  metric.rating === 'good'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : metric.rating === 'poor'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-amber-600 dark:text-amber-400',
                )}
              >
                {metric.value.toFixed(metric.unit === '' ? 2 : 0)}
                {metric.unit}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
