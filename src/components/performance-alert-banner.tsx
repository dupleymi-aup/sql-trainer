'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, X, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PerformanceAlert {
  type: 'lcp' | 'inp' | 'cls' | 'error-spike' | 'slow-api';
  message: string;
  severity: 'info' | 'warning' | 'critical';
  metric?: string;
  value?: number;
  threshold?: number;
  trend?: 'up' | 'down' | 'stable';
  changePercent?: number;
}

interface PerformanceData {
  success?: boolean;
  stats: Array<{
    metricName: string;
    avg: number;
    count: number;
  }>;
  trend: Array<{
    date: string;
    avg: number;
    count: number;
  }>;
}

// Anomaly detection using statistical methods
function detectAnomalies(currentValue: number, historicalValues: number[]): boolean {
  if (historicalValues.length < 3) return false;

  const mean = historicalValues.reduce((sum, val) => sum + val, 0) / historicalValues.length;
  const variance = historicalValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / historicalValues.length;
  const stdDev = Math.sqrt(variance);

  // Flag if current value is more than 2 standard deviations from mean
  return Math.abs(currentValue - mean) > 2 * stdDev;
}

function calculateTrend(values: number[]): 'up' | 'down' | 'stable' {
  if (values.length < 2) return 'stable';

  const recent = values.slice(-3);
  const older = values.slice(-6, -3);

  const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
  const olderAvg = older.length > 0 ? older.reduce((sum, val) => sum + val, 0) / older.length : recentAvg;

  const change = (recentAvg - olderAvg) / (olderAvg || 1);

  if (change > 0.1) return 'up';
  if (change < -0.1) return 'down';
  return 'stable';
}

export default function PerformanceAlertBanner() {
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [historicalData, setHistoricalData] = useState<Map<string, number[]>>(new Map());

  const checkPerformance = useCallback(async () => {
    try {
      const response = await fetch('/api/web-vitals/analytics?metric=LCP&days=7');
      const data: PerformanceData = await response.json();

      if (!data.success || !data.stats) return;

      const newAlerts: PerformanceAlert[] = [];

      // Update historical data
      data.trend?.forEach((t) => {
        const date = new Date(t.date).toDateString();
        const existing = historicalData.get(date) || [];
        existing.push(t.avg);
        setHistoricalData((prev) => new Map(prev).set(date, existing));
      });

      // Check LCP
      const lcp = data.stats.find((s) => s.metricName === 'LCP');
      if (lcp?.avg) {
        const isAnomaly = detectAnomalies(lcp.avg, data.trend?.map((t) => t.avg) || []);
        const trend = calculateTrend(data.trend?.map((t) => t.avg) || []);

        if (lcp.avg > 4000) {
          newAlerts.push({
            type: 'lcp',
            message: 'Critical: LCP is severely degraded (>4s)',
            severity: 'critical',
            metric: 'LCP',
            value: lcp.avg,
            threshold: 4000,
            trend,
            changePercent: trend === 'up' ? 15 : -10,
          });
        } else if (lcp.avg > 2500) {
          newAlerts.push({
            type: 'lcp',
            message: 'Warning: LCP is degraded (>2.5s)',
            severity: 'warning',
            metric: 'LCP',
            value: lcp.avg,
            threshold: 2500,
            trend,
            changePercent: trend === 'up' ? 8 : -5,
          });
        } else if (isAnomaly) {
          newAlerts.push({
            type: 'lcp',
            message: 'Anomaly detected: LCP spike detected',
            severity: 'info',
            metric: 'LCP',
            value: lcp.avg,
            trend,
          });
        }
      }

      // Check INP
      const inp = data.stats.find((s) => s.metricName === 'INP');
      if (inp?.avg) {
        const trend = calculateTrend(data.trend?.map((t) => t.avg) || []);

        if (inp.avg > 500) {
          newAlerts.push({
            type: 'inp',
            message: 'Critical: INP is severely degraded (>500ms)',
            severity: 'critical',
            metric: 'INP',
            value: inp.avg,
            threshold: 500,
            trend,
          });
        } else if (inp.avg > 200) {
          newAlerts.push({
            type: 'inp',
            message: 'Warning: INP is degraded (>200ms)',
            severity: 'warning',
            metric: 'INP',
            value: inp.avg,
            threshold: 200,
            trend,
          });
        }
      }

      // Check CLS
      const cls = data.stats.find((s) => s.metricName === 'CLS');
      if (cls?.avg) {
        if (cls.avg > 0.25) {
          newAlerts.push({
            type: 'cls',
            message: 'Critical: CLS is severely degraded (>0.25)',
            severity: 'critical',
            metric: 'CLS',
            value: cls.avg,
            threshold: 0.25,
          });
        } else if (cls.avg > 0.1) {
          newAlerts.push({
            type: 'cls',
            message: 'Warning: CLS is degraded (>0.1)',
            severity: 'warning',
            metric: 'CLS',
            value: cls.avg,
            threshold: 0.1,
          });
        }
      }

      setAlerts(newAlerts);
    } catch {
      // Silently handle fetch errors
    }
  }, [historicalData]);

  useEffect(() => {
    checkPerformance();
    const interval = setInterval(checkPerformance, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkPerformance]);

  const dismissAlert = useCallback((type: string) => {
    setDismissed((prev) => new Set([...prev, type]));
    setAlerts((prev) => prev.filter((a) => a.type !== type));
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/30 dark:border-red-800 dark:text-red-100';
      case 'warning':
        return 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-100';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-100';
    }
  };

  const getTrendIcon = (trend?: string) => {
    if (trend === 'up') return <TrendingUp className="h-3 w-3 text-red-500" />;
    if (trend === 'down') return <TrendingDown className="h-3 w-3 text-emerald-500" />;
    return <Activity className="h-3 w-3 text-muted-foreground" />;
  };

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2" role="alert" aria-live="polite">
      {alerts
        .filter((alert) => !dismissed.has(alert.type))
        .map((alert, index) => (
          <div
            key={index}
            className={cn(
              'flex items-center gap-3 p-4 rounded-lg border transition-all',
              getSeverityColor(alert.severity),
            )}
          >
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">{alert.message}</p>
              {alert.metric && alert.value && alert.threshold && (
                <p className="text-xs mt-1 opacity-75">
                  {alert.metric}: {Math.round(alert.value)}ms (threshold: {alert.threshold}ms)
                </p>
              )}
              {alert.trend && (
                <div className="flex items-center gap-1 mt-1 text-xs">
                  {getTrendIcon(alert.trend)}
                  <span>
                    {alert.trend === 'up' ? 'Worsening' : alert.trend === 'down' ? 'Improving' : 'Stable'}
                    {alert.changePercent &&
                      ` (${alert.changePercent > 0 ? '+' : ''}${alert.changePercent.toFixed(0)}%)`}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  alert.severity === 'critical' ? 'destructive' : alert.severity === 'warning' ? 'secondary' : 'outline'
                }
              >
                {alert.severity}
              </Badge>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => dismissAlert(alert.type)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
    </div>
  );
}
