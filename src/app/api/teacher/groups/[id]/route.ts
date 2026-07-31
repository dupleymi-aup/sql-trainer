import { withTeacherAuth, requireGroupOwnership } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { apiServerError } from '@/lib/api-error';
import { updateGroup, deleteGroup, getGroupMembers } from '@/lib/db-users';
import { parseAndValidate } from '@/lib/validation';
import { z } from 'zod';

const updateGroupSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .refine((s) => !s || !/<[^>]*>/.test(s), 'HTML content is not allowed in name'),
  description: z
    .string()
    .max(500)
    .optional()
    .refine((s) => !s || !/<[^>]*>/.test(s), 'HTML content is not allowed in description'),
});

export const GET = withTeacherAuth(async ({ session, params }) => {
  try {
    const { error, group } = await requireGroupOwnership(params?.id as string | undefined, session.user.id);
    if (error) return error;
    if (!group) return NextResponse.json({ success: false, error: 'Group not found' }, { status: 404 });

    const members = getGroupMembers(group.id);
    return NextResponse.json({ success: true, group: { ...group, members } });
  } catch (error) {
    return apiServerError('Fetch group', undefined, error);
  }
});

export const PATCH = withTeacherAuth(async ({ session, request, params }) => {
  try {
    const { error, group } = await requireGroupOwnership(params?.id as string | undefined, session.user.id);
    if (error) return error;
    if (!group) return NextResponse.json({ success: false, error: 'Group not found' }, { status: 404 });

    const parsed = await parseAndValidate(request, updateGroupSchema);
    if ('response' in parsed) return parsed.response;

    const updatedGroup = updateGroup(
      group.id,
      {
        name: parsed.data.name?.trim(),
        description: parsed.data.description?.trim(),
      },
      session.user.id,
    );

    return NextResponse.json({ success: true, group: updatedGroup });
  } catch (error) {
    return apiServerError('Update group', undefined, error);
  }
});

export const DELETE = withTeacherAuth(async ({ session, params }) => {
  try {
    const { error, group } = await requireGroupOwnership(params?.id as string | undefined, session.user.id);
    if (error) return error;
    if (!group) return NextResponse.json({ success: false, error: 'Group not found' }, { status: 404 });

    deleteGroup(group.id, session.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiServerError('Delete group', undefined, error);
  }
});
