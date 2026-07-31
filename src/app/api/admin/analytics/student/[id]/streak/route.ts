import { NextResponse } from 'next/server';
import { getStudentStreak } from '@/lib/db-users';
import { withAdminAuth, isValidUUID } from '@/lib/api-auth';

export const GET = withAdminAuth(async ({ params }) => {
  const id = params?.['id'];
  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ success: false, error: 'Invalid student ID format' }, { status: 400 });
  }
  const streak = getStudentStreak(id);
  return NextResponse.json({ streak });
});
