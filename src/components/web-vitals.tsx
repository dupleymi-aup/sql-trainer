'use client';

import { useEffect, useRef } from 'react';
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';
import type { Metric } from 'web-vitals';
import { initPerformanceMonitor, mark, measure } from '@/lib/performance-monitor';
import { logger } from '@/lib/logger';

function getDeviceType(): string {
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

function sendMetric(metric: Metric & Partial<{ page: string; deviceType: string; userAgent: string }>) {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
    page: metric.page || window.location.pathname,
    deviceType: metric.deviceType || getDeviceType(),
    userAgent: metric.userAgent || navigator.userAgent,
    distributionLatency: (metric as Metric & { distributionLatency?: number }).distributionLatency,
  });

  try {
    if (navigator.sendBeacon) {
      const success = navigator.sendBeacon('/api/web-vitals', new Blob([body], { type: 'application/json' }));
      if (!success) {
        // Fallback to fetch if sendBeacon fails
        fetch('/api/web-vitals', {
          body,
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
        }).catch((err) => {
          logger.error('[WebVitals] sendBeacon fallback failed:', err);
        });
      }
    } else {
      fetch('/api/web-vitals', {
        body,
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
      }).catch((err) => {
        logger.error('[WebVitals] fetch failed:', err);
      });
    }
  } catch (err) {
    logger.error('[WebVitals] Failed to send metric:', err);
  }
}

export default function WebVitals() {
  const isMounted = useRef(false);

  useEffect(() => {
    if (isMounted.current) return;
    isMounted.current = true;

    // Standard Web Vitals
    try {
      onCLS(sendMetric);
      onFCP(sendMetric);
      onINP(sendMetric);
      onLCP(sendMetric);
      onTTFB(sendMetric);
    } catch (err) {
      logger.error('[WebVitals] Failed to register web-vitals observers:', err);
    }

    // Extended performance monitoring (Long Tasks, Resources, Errors)
    try {
      initPerformanceMonitor();
    } catch (err) {
      logger.error('[WebVitals] Failed to initialize extended performance monitor:', err);
    }

    // Performance marks for page lifecycle
    mark('page-init');
    window.addEventListener('load', () => {
      measure('window-load', 'page-init');
    });
  }, []);

  return null;
}
