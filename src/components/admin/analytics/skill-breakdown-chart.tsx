'use client';

import { useState, useEffect } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { t } from '@/lib/i18n';
import { useAnalyticsQuery } from '@/hooks/use-analytics-query';
import EmptyState from './empty-state';

interface SkillBreakdownChartProps {
  apiEndpoint?: string;
}

interface SkillData {
  skill: string;
  score: number;
  fullMark: number;
}

interface StudentSummary {
  user_id: string;
  name: string;
  overall_score: number;
  skills: Record<string, { completed: number; total: number; score: number }>;
}

export default function SkillBreakdownChart({ apiEndpoint }: SkillBreakdownChartProps) {
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const { data, loading, error } = useAnalyticsQuery<StudentSummary[]>({
    endpoint: apiEndpoint || '/api/admin/analytics/skills',
    dataKey: 'breakdown',
  });

  useEffect(() => {
    if (data && data.length > 0) {
      setSelectedStudent(data[0].user_id);
    }
  }, [data]);

  if (loading) return <p className="text-center py-4 text-muted-foreground">{t('analytics.loading')}</p>;
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  if (!data || data.length === 0) return <EmptyState />;

  const student = selectedStudent ? data.find((s) => s.user_id === selectedStudent) || data[0] : data[0];

  const chartData: SkillData[] = Object.entries(student.skills).map(([skill, info]) => ({
    skill: t(`analytics.skills.category.${skill}`),
    score: info.score,
    fullMark: 100,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle>{t('analytics.skills.title')}</CardTitle>
          <Select value={selectedStudent || undefined} onValueChange={setSelectedStudent}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder={t('analytics.skills.selectStudent')} />
            </SelectTrigger>
            <SelectContent>
              {data.map((s) => (
                <SelectItem key={s.user_id} value={s.user_id}>
                  {s.name} ({s.overall_score}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="skill" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Radar
                  name={student.name}
                  dataKey="score"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.2}
                />
                <Tooltip formatter={(v: number) => [`${v}%`, t('analytics.skills.score')]} />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-4">
            <div className="rounded-lg border p-4 text-center">
              <div className="text-3xl font-bold text-primary">{student.overall_score}%</div>
              <div className="text-sm text-muted-foreground">{t('analytics.skills.avgScore')}</div>
            </div>
            <div className="space-y-2">
              {Object.entries(student.skills).map(([skill, info]) => (
                <div key={skill} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t(`analytics.skills.category.${skill}`)}</span>
                  <span className="font-medium">
                    {info.completed}/{info.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
