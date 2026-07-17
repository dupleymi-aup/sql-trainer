import { withUserAuth } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { getStudentSkillGap } from '@/lib/db-users';
import { apiServerError } from '@/lib/api-error';

export const GET = withUserAuth(async ({ session }) => {
  try {
    const skillGaps = getStudentSkillGap(session.user.id);
    return NextResponse.json({ success: true, skills: skillGaps });
  } catch (err) {
    return apiServerError('skill-gap GET', undefined, err);
  }
});
