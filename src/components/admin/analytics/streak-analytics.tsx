'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Flame, TrendingUp, Users } from 'lucide-react';
import { t } from '@/lib/i18n';
import { useAnalyticsQuery } from '@/hooks/use-analytics-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from './empty-state';

interface StreakAnalyticsData {
  distribution: Array<{ range: string; student_count: number }>;
  top_streaks: Array<{
    user_id: string;
    name: string;
    streak_current: number;
    streak_longest: number;
    tasks_completed: number;
  }>;
  streak_completion_correlation: Array<{
    streak_bucket: string;
    avg_tasks_completed: number;
    avg_completion_rate: number;
    student_count: number;
  }>;
  summary: {
    avg_current_streak: number;
    avg_longest_streak: number;
    max_streak: number;
    students_with_streak: number;
    total_students: number;
  };
}

export default function StreakAnalytics() {
  const { data, loading, error } = useAnalyticsQuery<StreakAnalyticsData>({
    endpoint: '/api/admin/analytics/streaks',
    transform: (json) => ({
      distribution: (json.distribution ?? []) as StreakAnalyticsData['distribution'],
      top_streaks: (json.top_streaks ?? []) as StreakAnalyticsData['top_streaks'],
      streak_completion_correlation: (json.streak_completion_correlation ??
        []) as StreakAnalyticsData['streak_completion_correlation'],
      summary: json.summary as StreakAnalyticsData['summary'],
    }),
  });

  const distribution = data?.distribution ?? [];
  const topStreaks = data?.top_streaks ?? [];
  const correlation = data?.streak_completion_correlation ?? [];
  const summary = data?.summary ?? null;

  if (loading) return <p className="text-center py-4">{t('analytics.loading')}</p>;
  if (error)
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  if (!summary) return <EmptyState />;

  const stats = [
    {
      label: t('analytics.streaks.avgCurrent'),
      value: summary.avg_current_streak,
      icon: Flame,
      color: 'text-orange-600',
    },
    {
      label: t('analytics.streaks.avgLongest'),
      value: summary.avg_longest_streak,
      icon: TrendingUp,
      color: 'text-blue-600',
    },
    { label: t('analytics.streaks.maxStreak'), value: summary.max_streak, icon: Flame, color: 'text-red-600' },
    {
      label: t('analytics.streaks.withStreak'),
      value: `${summary.students_with_streak}/${summary.total_students}`,
      icon: Users,
      color: 'text-emerald-600',
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{t('analytics.streaks.title')}</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon className={`h-8 w-8 ${stat.color}`} />
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('analytics.streaks.distribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={distribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="student_count" fill="#f97316" name={t('analytics.streaks.students')} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('analytics.streaks.correlation')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={correlation}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="streak_bucket" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="avg_tasks_completed" fill="#3b82f6" name={t('analytics.streaks.tasksCompleted')} />
                <Bar dataKey="avg_completion_rate" fill="#10b981" name={t('analytics.streaks.completionRate')} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {topStreaks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('analytics.streaks.topStreaks')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t('analytics.deadlineCompliance.student')}</TableHead>
                  <TableHead>{t('analytics.streaks.avgCurrent')}</TableHead>
                  <TableHead>{t('analytics.streaks.avgLongest')}</TableHead>
                  <TableHead>{t('analytics.streaks.tasksCompleted')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topStreaks.map((s, i) => (
                  <TableRow key={s.user_id}>
                    <TableCell>
                      <Badge className="bg-orange-100 text-orange-800">#{i + 1}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <Badge>{s.streak_current}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-blue-100 text-blue-800">{s.streak_longest}</Badge>
                    </TableCell>
                    <TableCell>{s.tasks_completed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
