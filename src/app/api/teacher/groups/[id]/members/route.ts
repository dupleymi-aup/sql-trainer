import { withTeacherAuth, requireGroupOwnership } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { apiServerError } from '@/lib/api-error';
import { addGroupMembers, removeGroupMember, getGroupMembers } from '@/lib/db-users';
import { parseAndValidate } from '@/lib/validation';
import { z } from 'zod';

const addMembersSchema = z.object({
  userIds: z.array(z.string()).min(1, 'userIds array is required'),
});

export const POST = withTeacherAuth(async ({ session, request, params }) => {
  try {
    const { error, group } = await requireGroupOwnership(params?.id as string | undefined, session.user.id);
    if (error) return error;
    if (!group) return NextResponse.json({ success: false, error: 'Group not found' }, { status: 404 });

    const parsed = await parseAndValidate(request, addMembersSchema);
    if ('response' in parsed) return parsed.response;

    const added = addGroupMembers(group.id, parsed.data.userIds, session.user.id);
    const members = getGroupMembers(group.id);

    return NextResponse.json({ success: true, added, members });
  } catch (error) {
    return apiServerError('Add group members', undefined, error);
  }
});

const removeMembersSchema = z.object({
  studentIds: z.array(z.string()).min(1, 'studentIds array is required'),
});

export const DELETE = withTeacherAuth(async ({ session, request, params }) => {
  try {
    const { error, group } = await requireGroupOwnership(params?.id as string | undefined, session.user.id);
    if (error) return error;
    if (!group) return NextResponse.json({ success: false, error: 'Group not found' }, { status: 404 });

    const parsed = await parseAndValidate(request, removeMembersSchema);
    if ('response' in parsed) return parsed.response;

    for (const userId of parsed.data.studentIds) {
      removeGroupMember(group.id, userId, session.user.id);
    }
    const members = getGroupMembers(group.id);

    return NextResponse.json({ success: true, members });
  } catch (error) {
    return apiServerError('Remove group member', undefined, error);
  }
});
