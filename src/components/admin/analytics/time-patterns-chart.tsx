'use client';

import { useAnalyticsQuery } from '@/hooks/use-analytics-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { t } from '@/lib/i18n';
import EmptyState from './empty-state';

interface HourlyData {
  hour: number;
  completions: number;
  unique_students: number;
  avg_attempts: number;
  success_rate: number;
}

interface DailyData {
  day: string;
  day_name: string;
  completions: number;
  unique_students: number;
  avg_attempts: number;
}

export default function TimePatternsChart() {
  const { data, loading, error } = useAnalyticsQuery<{
    hourly: HourlyData[];
    daily: DailyData[];
    peak_hour: number;
    peak_day: string;
  }>({
    endpoint: '/api/admin/analytics/time-patterns',
    transform: (json) => ({
      hourly: (json.hourly as HourlyData[]) || [],
      daily: (json.daily as DailyData[]) || [],
      peak_hour: (json.peak_hour as number) || 0,
      peak_day: (json.peak_day as string) || '0',
    }),
  });
  const hourly = data?.hourly ?? [];
  const daily = data?.daily ?? [];
  const peakHour = data?.peak_hour ?? 0;
  const peakDay = data?.peak_day ?? '0';

  if (loading) return <div className="flex justify-center py-8">{t('analytics.loading')}</div>;
  if (error) return <div className="text-red-500 py-8">{error}</div>;

  const totalCompletions = hourly.reduce((sum, h) => sum + h.completions, 0);
  if (totalCompletions === 0) return <EmptyState />;

  const hourlyFormatted = hourly.map((h) => ({
    ...h,
    hour_label: `${String(h.hour).padStart(2, '0')}:00`,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('analytics.timePatterns.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{totalCompletions}</div>
                <p className="text-xs text-muted-foreground">{t('analytics.timePatterns.totalCompletions')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{String(peakHour).padStart(2, '0')}:00</div>
                <p className="text-xs text-muted-foreground">{t('analytics.timePatterns.peakHour')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{daily.find((d) => d.day === peakDay)?.day_name || '\u2014'}</div>
                <p className="text-xs text-muted-foreground">{t('analytics.timePatterns.peakDay')}</p>
              </CardContent>
            </Card>
          </div>

          <h3 className="text-sm font-medium mb-2">{t('analytics.timePatterns.hourly')}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyFormatted}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour_label" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="completions" name="Completions" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('analytics.timePatterns.byDay')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day_name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="completions" name="Completions" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
