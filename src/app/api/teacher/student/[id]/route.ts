import { withTeacherAuth, isValidUUID } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { getStudentDetail, getUserAchievements, isStudentInTeacherGroup } from '@/lib/db-users';

export const GET = withTeacherAuth(async ({ session, params }) => {
  const id = params?.id as string | undefined;
  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ success: false, error: 'Invalid student ID format' }, { status: 400 });
  }

  // Verify that the student belongs to one of the teacher's groups
  const teacherId = session.user.id;
  if (!isStudentInTeacherGroup(id, teacherId)) {
    return NextResponse.json({ success: false, error: 'Access denied: student not in your groups' }, { status: 403 });
  }

  const student = getStudentDetail(id);
  if (!student) {
    return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
  }
  const achievements = await getUserAchievements(id);
  return NextResponse.json({ success: true, student, achievements });
});
