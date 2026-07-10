import { NextResponse } from 'next/server';
import { withUserAuthStrict } from '@/lib/api-auth';
import { RATE_LIMIT_WINDOWS } from '@/lib/rate-limit';
import { parseAndValidate } from '@/lib/validation';
import { z } from 'zod';
import { savePushSubscription } from '@/lib/db-users';
import { apiServerError } from '@/lib/api-error';

const pushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url('Invalid subscription endpoint'),
    keys: z.object({
      p256dh: z.string().min(1, 'p256dh key is required'),
      auth: z.string().min(1, 'auth key is required'),
    }),
  }),
});

export const POST = withUserAuthStrict(
  async ({ session, request }) => {
    const result = await parseAndValidate(request, pushSubscribeSchema);
    if ('response' in result) return result.response;

    const { subscription } = result.data;

    try {
      savePushSubscription(session.user.id, {
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      });
    } catch (dbError) {
      return apiServerError('Save push subscription', undefined, dbError);
    }

    return NextResponse.json({ success: true });
  },
  { max: 10, windowMs: RATE_LIMIT_WINDOWS.oneHour },
);
