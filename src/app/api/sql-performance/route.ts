import { NextResponse } from 'next/server';
import { getSqlPerformanceStats } from '@/lib/sql-performance-monitor';
import { withAdminAuth, parseDaysParam } from '@/lib/api-auth';
import { apiServerError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export const GET = withAdminAuth(async ({ request }) => {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseDaysParam(searchParams);

    const stats = getSqlPerformanceStats(days);

    return NextResponse.json({
      ...stats,
    });
  } catch (err) {
    return apiServerError('SQL Performance GET', undefined, err);
  }
});
