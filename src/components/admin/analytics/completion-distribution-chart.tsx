'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { t } from '@/lib/i18n';
import { useAnalyticsQuery } from '@/hooks/use-analytics-query';
import EmptyState from './empty-state';

interface DistributionBucket {
  range: string;
  min: number;
  max: number;
  student_count: number;
}

export default function CompletionDistributionChart() {
  const { data, loading, error } = useAnalyticsQuery<DistributionBucket[]>({
    endpoint: '/api/admin/analytics/distribution',
    dataKey: 'distribution',
  });

  if (loading) return <p className="text-center py-4">{t('analytics.loading')}</p>;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!data?.length) return <EmptyState />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics.distribution.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="range" />
            <YAxis allowDecimals={false} />
            <Tooltip
              formatter={(value: number) => [value, t('analytics.distribution.students')]}
              labelFormatter={(label) => `${t('analytics.distribution.completions')}: ${label}`}
            />
            <Legend />
            <Bar
              dataKey="student_count"
              name={t('analytics.distribution.students')}
              fill="hsl(var(--primary))"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
