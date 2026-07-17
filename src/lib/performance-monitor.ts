/**
 * Extended Performance Monitor
 *
 * Provides custom performance metrics beyond standard Web Vitals:
 * - Long Tasks API
 * - Resource Timing (JS, CSS, Images, Fonts, Fetch/XHR)
 * - Custom Performance Marks/Metrics
 * - Network Information API
 * - Memory API (Chrome/Edge)
 * - Error tracking
 * - SQL Query performance
 */

export interface PerformanceMetric {
  type: string;
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
  navigationType: string;
  page: string;
  deviceType: string;
  userAgent: string;
  [key: string]: unknown;
}

// ============ DEVICE & NETWORK DETECTION ============

export function getDeviceType(): string {
  try {
    const ua = navigator.userAgent;
    if (/Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
      return /Tablet|iPad/i.test(ua) ? 'tablet' : 'mobile';
    }
    return 'desktop';
  } catch {
    return 'unknown';
  }
}

export function getConnectionInfo(): Record<string, string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!conn) return { type: 'unknown', downlink: null, rtt: null, saveData: null };
  return {
    type: conn.effectiveType || null,
    downlink: String(conn.downlink ?? null),
    rtt: String(conn.rtt ?? null),
    saveData: conn.saveData ? 'true' : null,
  };
}

// ============ LONG TASKS ============

export function observeLongTasks(onMetric: (metric: PerformanceMetric) => void): void {
  if (!('PerformanceObserver' in window)) return;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry instanceof PerformanceEntry && entry.entryType === 'longtask') {
          const metric: PerformanceMetric = {
            type: 'longtask',
            name: 'LongTask',
            value: entry.duration,
            rating: entry.duration > 5000 ? 'poor' : entry.duration > 2500 ? 'needs-improvement' : 'good',
            delta: entry.duration,
            id: `lt-${entry.startTime}-${Math.random().toString(36).slice(2, 8)}`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            navigationType: (performance as any).navigation?.type ? 'navigate' : 'reload',
            page: window.location.pathname,
            deviceType: getDeviceType(),
            userAgent: navigator.userAgent,
            blockDuration: entry.duration,
            // PerformanceLongTaskTiming.at is not in standard lib types yet
            containers:
              (entry as unknown as { at?: Array<{ containers?: string[] }> })?.at?.[0]?.containers?.[0] ?? 'unknown',
          };
          onMetric(metric);
        }
      }
    });

    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    // Long Tasks API not supported
  }
}

// ============ RESOURCE TIMING ============

export function observeResources(onMetric: (metric: PerformanceMetric) => void): void {
  if (!('PerformanceObserver' in window)) return;

  const resourceTypes = ['script', 'css', 'img', 'font', 'fetch', 'xmlhttprequest'];

  resourceTypes.forEach((type) => {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries() as PerformanceResourceTiming[];
        const groupByName = new Map<string, PerformanceResourceTiming[]>();

        entries.forEach((entry) => {
          const domain = entry.initiatorType || 'other';
          const name = entry.name.includes('//') ? entry.name.split('/')[2]?.split('/')[0] || entry.name : entry.name;
          const key = `${domain}:${name}`;
          if (!groupByName.has(key)) groupByName.set(key, []);
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          groupByName.get(key)!.push(entry);
        });

        groupByName.forEach((entries, key) => {
          const totalLoad = entries.reduce((sum: number, e: PerformanceResourceTiming) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anyE = e as any;
            return sum + (anyE.loadEnd || anyE.responseEnd) - e.startTime;
          }, 0);
          const totalSize = entries.reduce((sum, e) => sum + (e.transferSize || 0), 0);
          const avgConnect =
            entries.reduce((sum, e) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const anyE = e as any;
              return sum + (anyE.connectEnd || 0) - (anyE.connectStart || 0);
            }, 0) / entries.length;
          const avgDns =
            entries.reduce((sum, e) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const anyE = e as any;
              return sum + ((anyE.domainLookupEnd || 0) - (anyE.domainLookupStart || 0));
            }, 0) / entries.length;
          const avgTtfb =
            entries.reduce((sum, e) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const anyE = e as any;
              return sum + (anyE.responseStart || 0) - (anyE.requestStart || 0);
            }, 0) / entries.length;
          const avgResponse =
            entries.reduce((sum, e) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const anyE = e as any;
              return sum + (anyE.responseEnd || 0) - (anyE.responseStart || 0);
            }, 0) / entries.length;

          const rating = totalLoad > 5000 ? 'poor' : totalLoad > 2000 ? 'needs-improvement' : 'good';

          const metric: PerformanceMetric = {
            type: `resource:${type}`,
            name: `Resource:${key}`,
            value: totalLoad,
            rating,
            delta: totalLoad,
            id: `res-${key}-${Math.random().toString(36).slice(2, 8)}`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            navigationType: (performance as any).navigation?.type ? 'navigate' : 'reload',
            page: window.location.pathname,
            deviceType: getDeviceType(),
            userAgent: navigator.userAgent,
            count: entries.length,
            totalLoadMs: totalLoad,
            totalSizeBytes: totalSize,
            avgConnectMs: avgConnect,
            avgDnsMs: avgDns,
            avgTtfbMs: avgTtfb,
            avgResponseMs: avgResponse,
          };
          onMetric(metric);
        });
      });

      observer.observe({ entryTypes: ['resource'], type });
    } catch {
      // Resource type not supported for observation
    }
  });
}

// ============ PERFORMANCE MARKS/METRICS ============

export function mark(name: string, metadata?: Record<string, unknown>): void {
  try {
    performance.mark(name, { detail: metadata });
  } catch {
    // mark() not available
  }
}

export function measure(name: string, startMark?: string, endMark?: string): void {
  try {
    if (startMark && endMark) {
      performance.measure(name, startMark, endMark);
    } else {
      performance.measure(name);
    }
  } catch {
    // measure() not available
  }
}

export function getMeasurements(): Array<{ name: string; duration: number }> {
  try {
    const entries = performance.getEntriesByType('measure') as PerformanceMeasure[];
    return entries.map((m) => ({
      name: m.name,
      duration: m.duration,
    }));
  } catch {
    return [];
  }
}

// ============ MEMORY API (Chrome/Edge only) ============

export function getMemoryInfo(): { usedHeap: number; totalHeap: number | null; ratio: number } | null {
  // performance.memory is Chrome-only, not in standard lib types
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
  if (!mem) return null;
  return {
    usedHeap: mem.usedJSHeapSize,
    totalHeap: mem.totalJSHeapSize,
    ratio: mem.usedJSHeapSize / mem.totalJSHeapSize,
  };
}

// ============ ERROR TRACKING ============

export interface ErrorReport {
  type: 'error' | 'unhandledrejection';
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  page: string;
  deviceType: string;
  userAgent: string;
  collectedAt: number;
}

export function sendErrorReport(error: ErrorReport, onMetric: (metric: PerformanceMetric) => void): void {
  const metric: PerformanceMetric = {
    type: 'error',
    name: 'RuntimeError',
    value: 1,
    rating: 'poor',
    delta: 0,
    id: `err-${error.collectedAt}-${Math.random().toString(36).slice(2, 8)}`,
    navigationType: 'navigate',
    page: error.page,
    deviceType: error.deviceType,
    userAgent: error.userAgent,
    errorMessage: error.message,
    errorStack: error.stack,
    errorFile: error.filename,
    errorLine: error.lineno,
    errorColumn: error.colno,
  };
  onMetric(metric);
}

// ============ SQL QUERY TRACKING ============

export interface SqlQueryMetric {
  queryType: string;
  executionTimeMs: number;
  rowsReturned: number;
  hasError: boolean;
  errorMessage?: string;
  dbType: string;
  taskId?: string;
  userId?: string;
}

let sqlQueryCount = 0;

export function trackSqlQuery(metric: SqlQueryMetric): void {
  sqlQueryCount++;
  const id = `sql-${sqlQueryCount}`;

  const perfMetric: PerformanceMetric = {
    type: 'sql_query',
    name: `SQL:${metric.queryType}`,
    value: metric.executionTimeMs,
    rating: metric.executionTimeMs < 50 ? 'good' : metric.executionTimeMs < 200 ? 'needs-improvement' : 'poor',
    delta: metric.executionTimeMs,
    id,
    navigationType: 'navigate',
    page: window.location.pathname,
    deviceType: getDeviceType(),
    userAgent: navigator.userAgent,
    queryType: metric.queryType,
    rowsReturned: metric.rowsReturned,
    hasError: metric.hasError,
    errorMessage: metric.errorMessage,
    dbType: metric.dbType,
    taskId: metric.taskId,
    userId: metric.userId,
  };

  sendToApi(perfMetric);
}

// ============ API TRANSPORT ============

function sendToApi(metric: PerformanceMetric): void {
  const body = JSON.stringify(metric);

  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/performance', new Blob([body], { type: 'application/json' }));
  } else {
    fetch('/api/performance', {
      body,
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {
      // Silently fail
    });
  }
}

// ============ INITIALIZATION ============

export function initPerformanceMonitor(onMetric?: (metric: PerformanceMetric) => void): void {
  const transport = onMetric || sendToApi;

  // Standard Web Vitals are handled by WebVitals component
  // This module handles extended metrics

  // Long Tasks
  observeLongTasks(transport);

  // Resource Timing
  observeResources(transport);

  // Error tracking
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => {
      sendErrorReport(
        {
          type: 'error',
          message: e.message,
          stack: e.error?.stack,
          filename: e.filename,
          lineno: e.lineno,
          colno: e.colno,
          page: window.location.pathname,
          deviceType: getDeviceType(),
          userAgent: navigator.userAgent,
          collectedAt: Date.now(),
        },
        transport,
      );
    });

    window.addEventListener('unhandledrejection', (e) => {
      sendErrorReport(
        {
          type: 'unhandledrejection',
          message: (e.reason as Error)?.message || String(e.reason),
          stack: (e.reason as Error)?.stack,
          page: window.location.pathname,
          deviceType: getDeviceType(),
          userAgent: navigator.userAgent,
          collectedAt: Date.now(),
        },
        transport,
      );
    });
  }
}

// Auto-initialize when module loads (only on client)
if (typeof window !== 'undefined') {
  initPerformanceMonitor();
}
