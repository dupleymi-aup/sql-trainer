import { describe, it, expect } from 'vitest';
import { exportToCSV, exportToJSON, generateExportFilename } from '@/lib/performance-export';

describe('performance-export', () => {
  describe('exportToCSV', () => {
    it('generates CSV with correct headers', () => {
      const data = {
        webVitals: [
          {
            metricName: 'LCP',
            count: 100,
            avg: 1500,
            p50: 1400,
            p95: 2500,
            p99: 3500,
            worst: 5000,
            good: 80,
            needsImprovement: 15,
            poor: 5,
          },
        ],
        longTasks: [],
        resources: [],
        errors: [],
        trend: [],
        period: { metric: 'LCP', days: 7, page: null },
      };

      const csv = exportToCSV(data);
      const headers = csv.split('\n')[0];

      expect(headers).toContain('Metric');
      expect(headers).toContain('Count');
      expect(headers).toContain('Average (ms)');
      expect(headers).toContain('P95 (ms)');
      expect(headers).toContain('Health Score (%)');
    });

    it('includes health score in CSV', () => {
      const data = {
        webVitals: [
          {
            metricName: 'LCP',
            count: 100,
            avg: 1500,
            p50: 1400,
            p95: 2500,
            p99: 3500,
            worst: 5000,
            good: 80,
            needsImprovement: 15,
            poor: 5,
          },
        ],
        longTasks: [],
        resources: [],
        errors: [],
        trend: [],
        period: { metric: 'LCP', days: 7, page: null },
      };

      const csv = exportToCSV(data);
      const rows = csv.split('\n').slice(1);

      expect(rows.length).toBe(1);
      const columns = rows[0].split(',');
      expect(columns[columns.length - 1]).toBe('80'); // 80% health score
    });
  });

  describe('exportToJSON', () => {
    it('generates JSON with summary', () => {
      const data = {
        webVitals: [
          {
            metricName: 'LCP',
            count: 100,
            avg: 1500,
            p50: 1400,
            p95: 2500,
            p99: 3500,
            worst: 5000,
            good: 80,
            needsImprovement: 15,
            poor: 5,
          },
        ],
        longTasks: [],
        resources: [],
        errors: [],
        trend: [],
        period: { metric: 'LCP', days: 7, page: null },
      };

      const json = exportToJSON(data);
      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty('generatedAt');
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('metrics');
      expect(parsed.summary).toHaveProperty('totalSessions');
      expect(parsed.summary).toHaveProperty('avgLcp');
      expect(parsed.summary.totalSessions).toBe(100);
      expect(parsed.summary.avgLcp).toBe(1500);
    });
  });

  describe('generateExportFilename', () => {
    it('generates CSV filename', () => {
      const filename = generateExportFilename('csv');
      const today = new Date().toISOString().slice(0, 10);
      expect(filename).toMatch(/^web-vitals-report-/);
      expect(filename).toMatch(new RegExp(`${today}$`));
    });

    it('generates JSON filename', () => {
      const filename = generateExportFilename('json');
      expect(filename).toMatch(/^web-vitals-data-/);
    });
  });
});
