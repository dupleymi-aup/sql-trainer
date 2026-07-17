import { withTeacherAuth } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { getStudentEngagementMetrics } from '@/lib/db-users';
import { apiServerError } from '@/lib/api-error';

const MAX_LIMIT = 500;

export const GET = withTeacherAuth(async ({ request }) => {
  try {
    const url = new URL(request.url);
    const raw = Number(url.searchParams.get('limit'));
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_LIMIT) : 50;
    const metrics = getStudentEngagementMetrics(limit);
    return NextResponse.json({ success: true, metrics });
  } catch (err) {
    return apiServerError('teacher engagement GET', undefined, err);
  }
});
