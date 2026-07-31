'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  BarChart3,
  Clock,
  AlertTriangle,
  Database,
  Globe,
  Zap,
  Activity,
  Loader2,
  ArrowUpDown,
  Eye,
  TrendingUp,
  TrendingDown,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { exportPerformanceData, type ExportFormat } from '@/lib/performance-export';
import type { PerformanceStats, DailyMetric, ErrorStat } from '@/lib/performance-types';

interface LongTaskStat {
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

interface ResourceStat {
  resource_type: string;
  count: number;
  avg_load_ms: number;
  total_size_kb: number;
  avg_ttfb_ms: number;
  good: number;
  poor: number;
}

export interface PerformanceData {
  webVitals: PerformanceStats[];
  longTasks: LongTaskStat[];
  resources: ResourceStat[];
  errors: ErrorStat[];
  trend: DailyMetric[];
  prevPeriod?: {
    avgLcp: number;
    avgInp: number;
    totalErrors: number;
  };
  period: { metric: string; days: number; page: string | null };
}

const RATING_BG = {
  good: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  'needs-improvement': 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  poor: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

export default function ExtendedPerformanceDashboard() {
  const [selectedDays, setSelectedDays] = useState(7);
  const [selectedMetric, setSelectedMetric] = useState('LCP');
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const [vitalsRes, longTasksRes, resourcesRes, errorsRes] = await Promise.all([
          fetch(`/api/web-vitals/analytics?metric=${selectedMetric}&days=${selectedDays}`, { signal }),
          fetch(`/api/performance/analytics?type=longtask&days=${selectedDays}`, { signal }),
          fetch(`/api/performance/analytics?type=resource&days=${selectedDays}`, { signal }),
          fetch(`/api/performance/analytics?type=error&days=${selectedDays}`, { signal }),
        ]);

        const [vitals, longTasks, resources, errors] = await Promise.all([
          vitalsRes.json(),
          longTasksRes.json(),
          resourcesRes.json(),
          errorsRes.json(),
        ]);

        // Fetch previous period data for comparison
        const prevDays = selectedDays > 7 ? selectedDays - 7 : selectedDays;
        const prevVitalsPromise =
          prevDays > 0
            ? fetch(`/api/web-vitals/analytics?metric=${selectedMetric}&days=${prevDays}`, { signal }).then((res) =>
                res.json(),
              )
            : Promise.resolve({ stats: [] });

        const [prevData] = await Promise.all([prevVitalsPromise]);

        const prevLcp = prevData?.stats?.find((s: PerformanceStats) => s.metricName === 'LCP')?.avg || 0;
        const prevInp = prevData?.stats?.find((s: PerformanceStats) => s.metricName === 'INP')?.avg || 0;
        const prevErrors = errors?.stats?.reduce((sum: number, e: ErrorStat) => sum + e.count, 0) || 0;

        setData({
          webVitals: vitals.stats || [],
          longTasks: longTasks.stats || [],
          resources: resources.stats || [],
          errors: errors.stats || [],
          trend: vitals.trend || [],
          prevPeriod: {
            avgLcp: prevLcp,
            avgInp: prevInp,
            totalErrors: prevErrors,
          },
          period: vitals.period,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load performance data');
      } finally {
        setLoading(false);
      }
    },
    [selectedDays, selectedMetric],
  );

  useEffect(() => {
    const abortController = new AbortController();
    fetchData(abortController.signal);
    return () => abortController.abort();
  }, [fetchData]);

  // Summary cards
  const totalSessions = data?.webVitals.reduce((sum, s) => sum + s.count, 0) || 0;
  const avgLcp = data?.webVitals.find((s) => s.metricName === 'LCP')?.avg || 0;
  const avgInp = data?.webVitals.find((s) => s.metricName === 'INP')?.avg || 0;
  const totalErrors = data?.errors.reduce((sum, e) => sum + e.count, 0) || 0;

  // Calculate changes from previous period
  const lcpChange = data?.prevPeriod ? ((avgLcp - data.prevPeriod.avgLcp) / (data.prevPeriod.avgLcp || 1)) * 100 : 0;
  const inpChange = data?.prevPeriod ? ((avgInp - data.prevPeriod.avgInp) / (data.prevPeriod.avgInp || 1)) * 100 : 0;
  const errorChange = data?.prevPeriod
    ? ((totalErrors - data.prevPeriod.totalErrors) / (data.prevPeriod.totalErrors || 1)) * 100
    : 0;

  const formatDuration = (ms: number): string => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getChangeIcon = (change: number) => {
    if (change > 10) return <TrendingUp className="h-4 w-4 text-red-500" />;
    if (change < -10) return <TrendingDown className="h-4 w-4 text-emerald-500" />;
    return null;
  };

  const getChangeColor = (change: number) => {
    if (change > 10) return 'text-red-500';
    if (change < -10) return 'text-emerald-500';
    return 'text-muted-foreground';
  };

  const handleExport = async (format: ExportFormat) => {
    try {
      await exportPerformanceData(
        data ?? {
          webVitals: [],
          longTasks: [],
          resources: [],
          errors: [],
          trend: [],
          period: { metric: 'LCP', days: selectedDays, page: null },
        },
        { format },
      );
    } catch {
      // Export failed - silently handle
    }
  };

  const exportToCSV = () => handleExport('csv');
  const exportToJSON = () => handleExport('json');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading performance data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center gap-2 text-red-500">
            <AlertTriangle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <Select value={String(selectedDays)} onValueChange={(v) => setSelectedDays(parseInt(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LCP">LCP</SelectItem>
              <SelectItem value="INP">INP</SelectItem>
              <SelectItem value="CLS">CLS</SelectItem>
              <SelectItem value="FCP">FCP</SelectItem>
              <SelectItem value="TTFB">TTFB</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={exportToJSON}>
            <Download className="h-4 w-4 mr-1" />
            JSON
          </Button>
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-1" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchData(new AbortController().signal)}>
            <ArrowUpDown className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSessions.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Page views with metrics</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">LCP</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{formatDuration(avgLcp)}</div>
              {getChangeIcon(lcpChange)}
            </div>
            <p className={`text-xs ${getChangeColor(lcpChange)}`}>
              {lcpChange !== 0 && `${lcpChange > 0 ? '+' : ''}${lcpChange.toFixed(1)}% vs prev period`}
            </p>
            <Progress value={getHealthScoreFromLcp(avgLcp)} className="mt-2 h-1" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">INP</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{formatDuration(avgInp)}</div>
              {getChangeIcon(inpChange)}
            </div>
            <p className={`text-xs ${getChangeColor(inpChange)}`}>
              {inpChange !== 0 && `${inpChange > 0 ? '+' : ''}${inpChange.toFixed(1)}% vs prev period`}
            </p>
            <Progress value={getHealthScoreFromInp(avgInp)} className="mt-2 h-1" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-red-500">{totalErrors.toLocaleString()}</div>
              {getChangeIcon(errorChange)}
            </div>
            <p className={`text-xs ${getChangeColor(errorChange)}`}>
              {errorChange !== 0 && `${errorChange > 0 ? '+' : ''}${errorChange.toFixed(1)}% vs prev period`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Runtime errors & rejections</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="webvitals">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="webvitals">
            <BarChart3 className="h-4 w-4 mr-1" />
            Web Vitals
          </TabsTrigger>
          <TabsTrigger value="longtasks">
            <Clock className="h-4 w-4 mr-1" />
            Long Tasks
          </TabsTrigger>
          <TabsTrigger value="resources">
            <Database className="h-4 w-4 mr-1" />
            Resources
          </TabsTrigger>
          <TabsTrigger value="errors">
            <AlertTriangle className="h-4 w-4 mr-1" />
            Errors
          </TabsTrigger>
        </TabsList>

        {/* Web Vitals Tab */}
        <TabsContent value="webvitals" className="space-y-4">
          {/* Daily Trend Chart */}
          {data?.trend && data.trend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-muted-foreground" />
                  Daily Trend — {selectedMetric}
                </CardTitle>
                <CardDescription>Average {selectedMetric} values over the selected period</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.trend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      className="text-xs"
                      tickFormatter={(value) => {
                        try {
                          return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        } catch {
                          return String(value);
                        }
                      }}
                    />
                    <YAxis label={{ value: 'ms', angle: -90, position: 'insideLeft' }} className="text-xs" />
                    <Tooltip
                      labelFormatter={(label) => {
                        try {
                          return new Date(label).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          });
                        } catch {
                          return String(label);
                        }
                      }}
                      formatter={(value: number) => [`${Math.round(value)}ms`, `${selectedMetric} Avg`]}
                      contentStyle={{ fontSize: '12px' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="avg"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ fill: '#10b981' }}
                      name={`${selectedMetric} Avg`}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Web Vital Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {data?.webVitals.map((stat) => (
              <Card key={stat.metricName}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{stat.metricName}</CardTitle>
                    {getRatingBadge(getRatingFromAvg(stat.avg, stat.metricName))}
                  </div>
                  <CardDescription>{stat.count} measurements</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Avg:</span>{' '}
                      <span className="font-medium">{formatDuration(stat.avg)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">p50:</span>{' '}
                      <span className="font-medium">{formatDuration(stat.p50)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">p95:</span>{' '}
                      <span className="font-medium">{formatDuration(stat.p95)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">p99:</span>{' '}
                      <span className="font-medium">{formatDuration(stat.p99)}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-emerald-500">Good: {stat.good}</span>
                      <span className="text-amber-500">Need Improvement: {stat.needsImprovement}</span>
                      <span className="text-red-500">Poor: {stat.poor}</span>
                    </div>
                    <Progress value={getHealthScore(stat.good, stat.count)} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Long Tasks Tab */}
        <TabsContent value="longtasks" className="space-y-4">
          {/* Long Tasks Chart */}
          {data?.trend && data.trend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  Long Tasks Trend
                </CardTitle>
                <CardDescription>Daily count of long tasks blocking the main thread</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.trend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      className="text-xs"
                      tickFormatter={(value) => {
                        try {
                          return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        } catch {
                          return String(value);
                        }
                      }}
                    />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Long Tasks" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Long Tasks Summary
              </CardTitle>
              <CardDescription>Tasks exceeding 50ms that block the main thread</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.longTasks.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No long tasks recorded</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {data?.longTasks.map((stat) => (
                    <div key={stat.metricName} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{stat.metricName}</span>
                        {getRatingBadge(getRatingFromAvg(stat.avg, stat.metricName))}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Count:</span>{' '}
                          <span className="font-medium">{stat.count}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Avg:</span>{' '}
                          <span className="font-medium">{formatDuration(stat.avg)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">p95:</span>{' '}
                          <span className="font-medium">{formatDuration(stat.p95)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Worst:</span>{' '}
                          <span className="font-medium">{formatDuration(stat.worst)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Resources Tab */}
        <TabsContent value="resources" className="space-y-4">
          {/* Resources Chart */}
          {data?.resources && data.resources.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  Resource Load Times
                </CardTitle>
                <CardDescription>Average load times by resource type</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.resources}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="resource_type" className="text-xs" />
                    <YAxis label={{ value: 'ms', angle: -90, position: 'insideLeft' }} className="text-xs" />
                    <Tooltip
                      formatter={(value: number) => [`${Math.round(value)}ms`, 'Avg Load']}
                      contentStyle={{ fontSize: '12px' }}
                    />
                    <Bar dataKey="avg_load_ms" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Avg Load" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Resource Timing Analysis
              </CardTitle>
              <CardDescription>Load times and sizes for different resource types</CardDescription>
            </CardHeader>
            <CardContent>
              {!data?.resources || data.resources.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No resource data recorded</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium">Type</th>
                        <th className="text-left py-2 font-medium">Count</th>
                        <th className="text-left py-2 font-medium">Avg Load</th>
                        <th className="text-left py-2 font-medium">Avg TTFB</th>
                        <th className="text-left py-2 font-medium">Total Size</th>
                        <th className="text-left py-2 font-medium">Health</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.resources.map((res, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 capitalize">{res.resource_type}</td>
                          <td>{res.count}</td>
                          <td>{formatDuration(res.avg_load_ms)}</td>
                          <td>{formatDuration(res.avg_ttfb_ms)}</td>
                          <td>{(res.total_size_kb / 1024).toFixed(1)} KB</td>
                          <td>
                            <Badge
                              variant="outline"
                              className={cn(
                                res.count > 0
                                  ? getHealthScore(res.good, res.count) > 80
                                    ? 'text-emerald-500'
                                    : 'text-amber-500'
                                  : 'text-muted-foreground',
                              )}
                            >
                              {res.count > 0 ? `${getHealthScore(res.good, res.count)}%` : 'N/A'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Errors Tab */}
        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Runtime Errors
              </CardTitle>
              <CardDescription>Unhandled errors and promise rejections</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.errors.length === 0 ? (
                <div className="text-center py-8">
                  <Eye className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
                  <p className="text-muted-foreground">No errors recorded — great job! 🎉</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data?.errors.map((err, i) => (
                    <div key={i} className="p-3 rounded-lg border bg-destructive/5">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-red-500">
                              {err.error_type}
                            </Badge>
                            <span className="text-sm text-muted-foreground">{err.count}x</span>
                          </div>
                          <p className="text-sm">{err.message || 'Unknown error'}</p>
                          <p className="text-xs text-muted-foreground">Page: {err.page}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============ HELPERS ============

function getHealthScoreFromLcp(ms: number): number {
  if (ms <= 2500) return 100;
  if (ms <= 4000) return 60;
  return 20;
}

function getHealthScoreFromInp(ms: number): number {
  if (ms <= 200) return 100;
  if (ms <= 500) return 60;
  return 20;
}

function getRatingBadge(rating: string) {
  return (
    <Badge className={cn('text-xs px-1.5 py-0', RATING_BG[rating as keyof typeof RATING_BG] || 'bg-gray-500/10')}>
      {rating}
    </Badge>
  );
}

function getHealthScore(good: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((good / total) * 100);
}

function getRatingFromAvg(value: number, metric: string): string {
  switch (metric) {
    case 'LCP':
      return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor';
    case 'INP':
      return value <= 200 ? 'good' : value <= 500 ? 'needs-improvement' : 'poor';
    case 'CLS':
      return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor';
    case 'FCP':
      return value <= 1800 ? 'good' : value <= 3000 ? 'needs-improvement' : 'poor';
    case 'TTFB':
      return value <= 800 ? 'good' : value <= 1800 ? 'needs-improvement' : 'poor';
    default:
      return 'good';
  }
}
