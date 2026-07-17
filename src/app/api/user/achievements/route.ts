import { NextResponse } from 'next/server';
import { withUserAuth } from '@/lib/api-auth';
import { getUserAchievements, checkAndAwardAchievements, getAchievementDetails } from '@/lib/db-users';
import { apiServerError } from '@/lib/api-error';

export const GET = withUserAuth(async ({ request, session }) => {
  try {
    const { searchParams } = new URL(request.url);
    const checkNew = searchParams.get('check') === 'true';

    if (checkNew) {
      const newAchievementIds = await checkAndAwardAchievements(session.user.id);
      if (newAchievementIds.length === 0) {
        return NextResponse.json({ success: true, newAchievements: [] });
      }
      const details = await getAchievementDetails(newAchievementIds);
      return NextResponse.json({ success: true, newAchievements: details });
    }

    const achievements = await getUserAchievements(session.user.id);
    return NextResponse.json({ success: true, achievements });
  } catch (err) {
    return apiServerError('achievements GET', undefined, err);
  }
});
