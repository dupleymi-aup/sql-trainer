import { withTeacherAuth } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { apiServerError } from '@/lib/api-error';
import { getGroupById, addGroupMembers, removeGroupMember, getGroupMembers } from '@/lib/db-users';
import { parseAndValidate } from '@/lib/validation';
import { z } from 'zod';

const addMembersSchema = z.object({
  userIds: z.array(z.string()).min(1, 'userIds array is required'),
});

export const POST = withTeacherAuth(async ({ session, request, params }) => {
  try {
    const groupId = params?.id;

    if (!groupId) {
      return NextResponse.json({ success: false, error: 'Group ID is required' }, { status: 400 });
    }

    const group = getGroupById(groupId);
    if (!group) {
      return NextResponse.json({ success: false, error: 'Group not found' }, { status: 404 });
    }

    if (group.teacher_id !== session.user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const parsed = await parseAndValidate(request, addMembersSchema);
    if ('response' in parsed) return parsed.response;

    const added = addGroupMembers(groupId, parsed.data.userIds, session.user.id);
    const members = getGroupMembers(groupId);

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
    const groupId = params?.id;
    if (!groupId) {
      return NextResponse.json({ success: false, error: 'Group ID is required' }, { status: 400 });
    }

    const group = getGroupById(groupId);
    if (!group) {
      return NextResponse.json({ success: false, error: 'Group not found' }, { status: 404 });
    }

    if (group.teacher_id !== session.user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const parsed = await parseAndValidate(request, removeMembersSchema);
    if ('response' in parsed) return parsed.response;

    for (const userId of parsed.data.studentIds) {
      removeGroupMember(groupId, userId, session.user.id);
    }
    const members = getGroupMembers(groupId);

    return NextResponse.json({ success: true, members });
  } catch (error) {
    return apiServerError('Remove group member', undefined, error);
  }
});
