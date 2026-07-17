import { withTeacherAuth } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { getCohortAnalysis } from '@/lib/db-users';
import { apiServerError } from '@/lib/api-error';

export const GET = withTeacherAuth(async () => {
  try {
    const data = getCohortAnalysis();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return apiServerError('teacher cohort GET', undefined, err);
  }
});
