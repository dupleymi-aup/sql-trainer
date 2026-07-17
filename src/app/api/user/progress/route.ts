import { NextResponse } from 'next/server';
import { withUserAuth } from '@/lib/api-auth';
import { getUserProgress, saveUserProgress } from '@/lib/db-users';
import { apiServerError } from '@/lib/api-error';
import { z } from 'zod';
import { parseAndValidate } from '@/lib/validation';

const progressSchema = z.object({
  taskId: z.string().min(1, 'taskId is required'),
  attempts: z.number().int().nonnegative('attempts must be a non-negative integer'),
});

export const GET = withUserAuth(async ({ session }) => {
  try {
    const progress = await getUserProgress(session.user.id);
    return NextResponse.json({ success: true, progress });
  } catch (err) {
    return apiServerError('progress GET', undefined, err);
  }
});

export const POST = withUserAuth(async ({ session, request }) => {
  try {
    const validation = await parseAndValidate(request, progressSchema);
    if ('response' in validation) return validation.response;

    const { taskId, attempts } = validation.data;
    await saveUserProgress(session.user.id, taskId, attempts);
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiServerError('progress POST', undefined, err);
  }
});
