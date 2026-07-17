import { NextResponse } from 'next/server';
import { getSqlPerformanceStats } from '@/lib/sql-performance-monitor';
import { withAdminAuth } from '@/lib/api-auth';
import { apiServerError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export const GET = withAdminAuth(async ({ request }) => {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '7', 10), 1), 90);

    const stats = getSqlPerformanceStats(days);

    return NextResponse.json({
      ...stats,
    });
  } catch (err) {
    return apiServerError('SQL Performance GET', undefined, err);
  }
});
