import { NextResponse } from 'next/server';
import { getStudentLearningTimeline } from '@/lib/db-users';
import { withAdminAuth, isValidUUID } from '@/lib/api-auth';

export const GET = withAdminAuth(async ({ params }) => {
  const id = params?.['id'];
  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ success: false, error: 'Invalid student ID format' }, { status: 400 });
  }
  const data = getStudentLearningTimeline(id);
  if (!data.student) {
    return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
  }
  return NextResponse.json(data);
});
