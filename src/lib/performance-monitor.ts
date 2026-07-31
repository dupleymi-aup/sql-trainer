/**
 * Extended Performance Monitor
 *
 * Provides custom performance metrics beyond standard Web Vitals:
 * - Long Tasks API
 * - Resource Timing (JS, CSS, Images, Fonts, Fetch/XHR)
 * - Custom Performance Marks/Metrics
 * - Network Information API
 * - Error tracking
 */

// ============ NON-STANDARD BROWSER API TYPES ============

/** Network Information API — https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation */
interface NetworkInformation extends EventTarget {
  readonly effectiveType: 'slow-2g' | '2g' | '3g' | '4g';
  readonly downlink: number;
  readonly rtt: number;
  readonly saveData: boolean;
  readonly type: 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown';
}

interface NavigatorWithNetworkInformation extends Navigator {
  readonly connection?: NetworkInformation;
  readonly mozConnection?: NetworkInformation;
  readonly webkitConnection?: NetworkInformation;
}

/** Performance Navigation Timing — deprecated `type` field */
interface PerformanceNavigationTimingWithType {
  readonly type: 'navigate' | 'reload' | 'back_forward' | 'prerender';
}

// ============ INTERFACES ============

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
  const nav = navigator as NavigatorWithNetworkInformation;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (!conn) return { type: 'unknown', downlink: null, rtt: null, saveData: null };
  return {
    type: conn.effectiveType || null,
    downlink: String(conn.downlink ?? null),
    rtt: String(conn.rtt ?? null),
    saveData: conn.saveData ? 'true' : null,
  };
}

// ============ CLEANUP TRACKING ============

const activeObservers: PerformanceObserver[] = [];
const activeListeners: Array<{ target: EventTarget; type: string; listener: EventListener }> = [];

// ============ LONG TASKS ============

export function observeLongTasks(onMetric: (metric: PerformanceMetric) => void): void {
  if (!('PerformanceObserver' in window)) return;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry instanceof PerformanceEntry && entry.entryType === 'longtask') {
          const navEntry = performance.getEntriesByType('navigation')[0] as
            PerformanceNavigationTimingWithType | undefined;
          const metric: PerformanceMetric = {
            type: 'longtask',
            name: 'LongTask',
            value: entry.duration,
            rating: entry.duration > 5000 ? 'poor' : entry.duration > 2500 ? 'needs-improvement' : 'good',
            delta: entry.duration,
            id: `lt-${entry.startTime}-${Math.random().toString(36).slice(2, 8)}`,
            navigationType: navEntry?.type === 'navigate' ? 'navigate' : 'reload',
            page: window.location.pathname,
            deviceType: getDeviceType(),
            userAgent: navigator.userAgent,
            blockDuration: entry.duration,
            containers:
              (entry as unknown as { at?: Array<{ containers?: string[] }> })?.at?.[0]?.containers?.[0] ?? 'unknown',
          };
          onMetric(metric);
        }
      }
    });

    observer.observe({ entryTypes: ['longtask'] });
    activeObservers.push(observer);
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
          groupByName.get(key)?.push(entry);
        });

        groupByName.forEach((entries, key) => {
          const totalLoad = entries.reduce((sum: number, e: PerformanceResourceTiming) => {
            return (
              sum + ((e as PerformanceResourceTiming & { loadEnd?: number }).loadEnd || e.responseEnd) - e.startTime
            );
          }, 0);
          const totalSize = entries.reduce((sum, e) => sum + (e.transferSize || 0), 0);
          const avgConnect =
            entries.reduce((sum, e) => {
              return sum + (e.connectEnd || 0) - (e.connectStart || 0);
            }, 0) / entries.length;
          const avgDns =
            entries.reduce((sum, e) => {
              return sum + ((e.domainLookupEnd || 0) - (e.domainLookupStart || 0));
            }, 0) / entries.length;
          const avgTtfb =
            entries.reduce((sum, e) => {
              return sum + (e.responseStart || 0) - (e.requestStart || 0);
            }, 0) / entries.length;
          const avgResponse =
            entries.reduce((sum, e) => {
              return sum + (e.responseEnd || 0) - (e.responseStart || 0);
            }, 0) / entries.length;

          const rating = totalLoad > 5000 ? 'poor' : totalLoad > 2000 ? 'needs-improvement' : 'good';
          const navEntry = performance.getEntriesByType('navigation')[0] as
            PerformanceNavigationTimingWithType | undefined;

          const metric: PerformanceMetric = {
            type: `resource:${type}`,
            name: `Resource:${key}`,
            value: totalLoad,
            rating,
            delta: totalLoad,
            id: `res-${key}-${Math.random().toString(36).slice(2, 8)}`,
            navigationType: navEntry?.type === 'navigate' ? 'navigate' : 'reload',
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
      activeObservers.push(observer);
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

// ============ ERROR TRACKING ============

interface ErrorReport {
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

function sendErrorReport(error: ErrorReport, onMetric: (metric: PerformanceMetric) => void): void {
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
    const errorHandler = (e: ErrorEvent) => {
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
    };

    const rejectionHandler = (e: PromiseRejectionEvent) => {
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
    };

    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', rejectionHandler);
    activeListeners.push(
      { target: window, type: 'error', listener: errorHandler as EventListener },
      { target: window, type: 'unhandledrejection', listener: rejectionHandler as EventListener },
    );
  }
}

/**
 * Destroy the performance monitor: disconnect all observers and remove event listeners.
 * Call this during cleanup to prevent memory leaks.
 */
export function destroyPerformanceMonitor(): void {
  for (const observer of activeObservers) {
    try {
      observer.disconnect();
    } catch {
      // already disconnected
    }
  }
  activeObservers.length = 0;

  for (const { target, type, listener } of activeListeners) {
    try {
      target.removeEventListener(type, listener);
    } catch {
      // already removed
    }
  }
  activeListeners.length = 0;
}

// Auto-initialize when module loads (only on client)
if (typeof window !== 'undefined') {
  initPerformanceMonitor();
}
