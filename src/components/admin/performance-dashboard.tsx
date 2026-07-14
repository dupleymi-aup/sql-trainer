'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Activity, Zap, Clock, Database, TrendingUp } from 'lucide-react';
import { t } from '@/lib/i18n';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { logger } from '@/lib/logger';

interface WebVitalStats {
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

interface DailyMetric {
  date: string;
  avg: number;
  count: number;
}

interface PerformanceData {
  success: boolean;
  stats: WebVitalStats[];
  trend: DailyMetric[];
  worstPages: Array<{
    page: string;
    count: number;
    avg: number;
    worst: number;
    good_rate: number;
  }>;
  deviceBreakdown: Array<{
    device_type: string;
    count: number;
    avg: number;
    good: number;
  }>;
  period: {
    metric: string;
    days: number;
    page: string | null;
  };
}

interface SqlPerfStats {
  totalQueries: number;
  avgExecutionTime: number;
  p95ExecutionTime: number;
  slowQueries: number;
  errorRate: number;
  byType: Array<{
    queryType: string;
    count: number;
    avgTime: number;
    worstTime: number;
    errorCount: number;
  }>;
  topSlowQueries: Array<{
    queryType: string;
    executionTimeMs: number;
    taskId: string | null;
    dbType: string;
    collectedAt: number;
  }>;
}

function getRatingColor(rating: string): string {
  switch (rating) {
    case 'good':
      return 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30';
    case 'needs_improvement':
      return 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30';
    case 'poor':
      return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
    default:
      return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/30';
  }
}

function getMetricLabel(name: string): string {
  const labels: Record<string, string> = {
    LCP: 'LCP (Largest Contentful Paint)',
    FCP: 'FCP (First Contentful Paint)',
    CLS: 'CLS (Cumulative Layout Shift)',
    INP: 'INP (Interaction to Next Paint)',
    TTFB: 'TTFB (Time to First Byte)',
  };
  return labels[name] || name;
}

function getMetricThresholds(name: string) {
  switch (name) {
    case 'LCP':
      return { good: 2500, poor: 4000 };
    case 'FCP':
      return { good: 1800, poor: 3000 };
    case 'CLS':
      return { good: 0.1, poor: 0.25 };
    case 'INP':
      return { good: 200, poor: 500 };
    case 'TTFB':
      return { good: 800, poor: 1800 };
    default:
      return { good: 0, poor: 0 };
  }
}

export default function PerformanceDashboard() {
  const [selectedMetric, setSelectedMetric] = useState('LCP');
  const [selectedDays, setSelectedDays] = useState('7');
  const [webVitalData, setWebVitalData] = useState<PerformanceData | null>(null);
  const [sqlPerfData, setSqlPerfData] = useState<SqlPerfStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Load Web Vitals data
        const vitalsRes = await fetch(`/api/web-vitals/analytics?metric=${selectedMetric}&days=${selectedDays}`);
        const vitalsJson = await vitalsRes.json();
        if (vitalsJson.success) {
          setWebVitalData(vitalsJson);
        }

        // Load SQL performance data
        const sqlRes = await fetch(`/api/sql-performance?days=${selectedDays}`);
        const sqlJson = await sqlRes.json();
        if (sqlJson.success) {
          setSqlPerfData(sqlJson);
        }
      } catch (err) {
        logger.error('[PerformanceDashboard] Failed to load performance data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [selectedMetric, selectedDays]);

  if (loading) {
    return <div className="flex items-center justify-center h-64">{t('admin.analytics.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('admin.performance.title')}</h2>
          <p className="text-muted-foreground">{t('admin.performance.description')}</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LCP">LCP</SelectItem>
              <SelectItem value="FCP">FCP</SelectItem>
              <SelectItem value="CLS">CLS</SelectItem>
              <SelectItem value="INP">INP</SelectItem>
              <SelectItem value="TTFB">TTFB</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedDays} onValueChange={setSelectedDays}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 day</SelectItem>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="webvitals">
        <TabsList>
          <TabsTrigger value="webvitals">
            <Activity className="h-4 w-4 mr-2" />
            Web Vitals
          </TabsTrigger>
          <TabsTrigger value="sql">
            <Database className="h-4 w-4 mr-2" />
            SQL Performance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="webvitals" className="space-y-6">
          {webVitalData?.stats.map((stat) => {
            const thresholds = getMetricThresholds(stat.metricName);
            const goodPercent = (stat.good / stat.count) * 100;
            const poorPercent = (stat.poor / stat.count) * 100;

            return (
              <Card key={stat.metricName}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{getMetricLabel(stat.metricName)}</span>
                    <Badge
                      className={getRatingColor(
                        stat.count > 0
                          ? goodPercent > 75
                            ? 'good'
                            : poorPercent > 25
                              ? 'poor'
                              : 'needs_improvement'
                          : 'good',
                      )}
                    >
                      {stat.count} measurements
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Thresholds: Good &lt; {thresholds.good}ms, Poor &gt; {thresholds.poor}ms
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Average</div>
                      <div className="text-2xl font-bold">{Math.round(stat.avg)}ms</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">P50</div>
                      <div className="text-2xl font-bold">{Math.round(stat.p50)}ms</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">P95</div>
                      <div className="text-2xl font-bold">{Math.round(stat.p95)}ms</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Worst</div>
                      <div className="text-2xl font-bold text-red-600">{Math.round(stat.worst)}ms</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-emerald-600">✓ Good</span>
                      <span className="font-medium">{Math.round(goodPercent)}%</span>
                    </div>
                    <Progress value={goodPercent} className="h-2 bg-emerald-100 dark:bg-emerald-900/30" />

                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="text-red-600">✗ Poor</span>
                      <span className="font-medium">{Math.round(poorPercent)}%</span>
                    </div>
                    <Progress value={poorPercent} className="h-2 bg-red-100 dark:bg-red-900/30" />
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {webVitalData?.worstPages && webVitalData.worstPages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Worst Performing Pages</CardTitle>
                <CardDescription>Pages with highest {selectedMetric} values</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Page</TableHead>
                      <TableHead>Avg {selectedMetric}</TableHead>
                      <TableHead>Worst</TableHead>
                      <TableHead>Measurements</TableHead>
                      <TableHead>Good Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {webVitalData.worstPages.map((page, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm">{page.page}</TableCell>
                        <TableCell>{Math.round(page.avg)}ms</TableCell>
                        <TableCell className="text-red-600">{Math.round(page.worst)}ms</TableCell>
                        <TableCell>{page.count}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              page.good_rate > 0.75 ? 'default' : page.good_rate > 0.5 ? 'secondary' : 'destructive'
                            }
                          >
                            {Math.round(page.good_rate * 100)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="sql" className="space-y-6">
          {sqlPerfData && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Queries</CardTitle>
                    <Zap className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{sqlPerfData.totalQueries.toLocaleString()}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Execution</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{Math.round(sqlPerfData.avgExecutionTime)}ms</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">P95 Execution</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{Math.round(sqlPerfData.p95ExecutionTime)}ms</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`text-2xl font-bold ${sqlPerfData.errorRate > 5 ? 'text-red-600' : 'text-emerald-600'}`}
                    >
                      {sqlPerfData.errorRate.toFixed(1)}%
                    </div>
                  </CardContent>
                </Card>
              </div>

              {sqlPerfData.byType.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Performance by Query Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Count</TableHead>
                          <TableHead>Avg Time</TableHead>
                          <TableHead>Worst</TableHead>
                          <TableHead>Errors</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sqlPerfData.byType.map((type) => (
                          <TableRow key={type.queryType}>
                            <TableCell className="font-medium">{type.queryType}</TableCell>
                            <TableCell>{type.count}</TableCell>
                            <TableCell>{Math.round(type.avgTime)}ms</TableCell>
                            <TableCell>{Math.round(type.worstTime)}ms</TableCell>
                            <TableCell>
                              {type.errorCount > 0 ? (
                                <Badge variant="destructive">{type.errorCount}</Badge>
                              ) : (
                                <Badge variant="outline">0</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {sqlPerfData.topSlowQueries.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-red-600" />
                      Slowest Queries (last {selectedDays} days)
                    </CardTitle>
                    <CardDescription>Queries that took longer than 1000ms</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>DB</TableHead>
                          <TableHead>Task</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sqlPerfData.topSlowQueries.slice(0, 10).map((query, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono font-bold text-red-600">
                              {Math.round(query.executionTimeMs)}ms
                            </TableCell>
                            <TableCell>{query.queryType}</TableCell>
                            <TableCell>{query.dbType}</TableCell>
                            <TableCell className="font-mono text-sm">{query.taskId || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
