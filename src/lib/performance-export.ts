export type ExportFormat = 'csv' | 'json' | 'pdf';

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

interface ErrorStat {
  error_type: string;
  count: number;
  message: string;
  page: string;
  worst: number;
}

interface PerformanceData {
  webVitals: PerformanceStats[];
  longTasks: unknown[];
  resources: unknown[];
  errors: ErrorStat[];
  trend: unknown[];
  period: {
    metric: string;
    days: number;
    page: string | null;
  };
}

export function exportToCSV(data: PerformanceData): string {
  const headers = [
    'Metric',
    'Count',
    'Average (ms)',
    'P50 (ms)',
    'P95 (ms)',
    'P99 (ms)',
    'Worst (ms)',
    'Good',
    'Needs Improvement',
    'Poor',
    'Health Score (%)',
  ];

  const rows = data.webVitals.map((stat: PerformanceStats) => {
    const healthScore = stat.count > 0 ? Math.round((stat.good / stat.count) * 100) : 0;
    return [
      stat.metricName,
      stat.count,
      stat.avg.toFixed(2),
      stat.p50.toFixed(2),
      stat.p95.toFixed(2),
      stat.p99.toFixed(2),
      stat.worst.toFixed(2),
      stat.good,
      stat.needsImprovement,
      stat.poor,
      healthScore,
    ];
  });

  return [headers.join(','), ...rows.map((r: (string | number)[]) => r.join(','))].join('\n');
}

export function exportToJSON(data: PerformanceData): string {
  const exportData = {
    generatedAt: new Date().toISOString(),
    period: data.period,
    summary: {
      totalSessions: data.webVitals.reduce((sum: number, s: PerformanceStats) => sum + s.count, 0),
      avgLcp: data.webVitals.find((s: PerformanceStats) => s.metricName === 'LCP')?.avg || 0,
      avgInp: data.webVitals.find((s: PerformanceStats) => s.metricName === 'INP')?.avg || 0,
      totalErrors: data.errors.reduce((sum: number, e: ErrorStat) => sum + e.count, 0),
    },
    metrics: data.webVitals,
    longTasks: data.longTasks,
    resources: data.resources,
    errors: data.errors,
    trends: data.trend,
  };

  return JSON.stringify(exportData, null, 2);
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateExportFilename(format: ExportFormat) {
  const date = new Date().toISOString().split('T')[0];
  const prefix = format === 'csv' ? 'web-vitals-report' : format === 'json' ? 'web-vitals-data' : 'web-vitals-pdf';
  return `${prefix}-${date}`;
}

export async function exportPerformanceData(data: PerformanceData, options: { format?: ExportFormat } = {}) {
  const { format = 'csv' } = options;

  let content: string;
  let mimeType: string;

  switch (format) {
    case 'csv':
      content = exportToCSV(data);
      mimeType = 'text/csv';
      break;
    case 'json':
      content = exportToJSON(data);
      mimeType = 'application/json';
      break;
    default:
      content = exportToCSV(data);
      mimeType = 'text/csv';
  }

  const filename = `${generateExportFilename(format)}.csv`;
  downloadFile(content, filename, mimeType);

  return { success: true, filename };
}
