import { z } from 'zod';
import { withTeacherAuth, requireGroupOwnership } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { notifyGroupMembers } from '@/lib/db-users';
import { parseAndValidate } from '@/lib/validation';
import { apiServerError } from '@/lib/api-error';

const notifySchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(200),
  message: z.string().min(1, 'Message is required').max(5000),
  channel: z.enum(['email', 'in_app']).default('in_app'),
});

export const POST = withTeacherAuth(async ({ session, request, params }) => {
  try {
    const { error, group } = await requireGroupOwnership(params?.id as string | undefined, session.user.id);
    if (error) return error;
    if (!group) return NextResponse.json({ success: false, error: 'Group not found' }, { status: 404 });

    const validation = await parseAndValidate(request, notifySchema);
    if ('response' in validation) return validation.response;

    const { subject, message, channel } = validation.data;

    const result = notifyGroupMembers(group.id, subject, message, channel, session.user.id);

    return NextResponse.json({ success: true, result });
  } catch (err) {
    return apiServerError('Notify group members', undefined, err);
  }
});
