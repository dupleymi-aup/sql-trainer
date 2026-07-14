'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { t } from '@/lib/i18n';
import { useAnalyticsQuery } from '@/hooks/use-analytics-query';
import EmptyState from './empty-state';

interface StudentGroupEntry {
  group_name: string;
  student_count: number;
  avg_completion_rate: number;
  avg_attempts: number;
  avg_velocity: number;
  avg_engagement: number;
  tasks_completed: number;
  total_students: number;
}

export default function StudentGroupsChart() {
  const { data, loading, error } = useAnalyticsQuery<StudentGroupEntry[]>({
    endpoint: '/api/admin/analytics/groups',
    dataKey: 'groups',
  });

  if (loading) return <div className="flex justify-center py-8">{t('analytics.loading')}</div>;
  if (error) return <div className="text-red-500 py-8">{error}</div>;

  const totalStudents = data?.reduce((sum, g) => sum + g.student_count, 0) ?? 0;
  if (!data || totalStudents === 0) return <EmptyState />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics.groups.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="group_name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="student_count" name="Students" fill="#3b82f6" />
              <Bar dataKey="avg_completion_rate" name="Completion Rate (%)" fill="#22c55e" />
              <Bar dataKey="avg_velocity" name="Velocity (tasks/wk)" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
