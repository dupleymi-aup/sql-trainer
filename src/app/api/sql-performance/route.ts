import { NextResponse } from 'next/server';
import { getSqlPerformanceStats } from '@/lib/sql-performance-monitor';
import { auth } from '@/lib/auth-internal';
import { apiServerError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.role || !['admin', 'teacher'].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7');

    const stats = getSqlPerformanceStats(days);

    return NextResponse.json({
      success: true,
      ...stats,
    });
  } catch (err) {
    return apiServerError('SQL Performance GET', undefined, err);
  }
}
