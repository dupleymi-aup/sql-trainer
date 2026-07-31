import { z } from 'zod';
import { withTeacherAuth, requireGroupOwnership } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import {
  getGroupDeadlines,
  createDeadline,
  updateDeadline,
  deleteDeadline,
  buildReminderSchedule,
  getDeadlineById,
} from '@/lib/db-users';
import { parseAndValidate } from '@/lib/validation';
import { apiServerError } from '@/lib/api-error';

const createDeadlineSchema = z.object({
  type: z.enum(['course', 'exam', 'task', 'inactivity']),
  title: z
    .string()
    .min(1)
    .max(200)
    .refine((s) => !/<[^>]*>/.test(s), 'HTML content is not allowed in title'),
  description: z
    .string()
    .max(1000)
    .optional()
    .refine((s) => !s || !/<[^>]*>/.test(s), 'HTML content is not allowed in description'),
  taskId: z.string().optional().nullable(),
  dueAt: z.number().int().positive(),
});

export const GET = withTeacherAuth(async ({ session, params }) => {
  try {
    const { error, group } = await requireGroupOwnership(params?.id as string | undefined, session.user.id);
    if (error) return error;
    if (!group) return NextResponse.json({ success: false, error: 'Group not found' }, { status: 404 });

    const deadlines = getGroupDeadlines(group.id);
    return NextResponse.json({ success: true, deadlines });
  } catch (err) {
    return apiServerError('Fetch group deadlines', undefined, err);
  }
});

export const POST = withTeacherAuth(async ({ session, request, params }) => {
  try {
    const { error, group } = await requireGroupOwnership(params?.id as string | undefined, session.user.id);
    if (error) return error;
    if (!group) return NextResponse.json({ success: false, error: 'Group not found' }, { status: 404 });

    const validation = await parseAndValidate(request, createDeadlineSchema);
    if ('response' in validation) return validation.response;

    const { type, title, description, taskId, dueAt } = validation.data;

    const deadline = createDeadline(
      {
        creatorId: session.user.id,
        type,
        title,
        description,
        targetType: 'group',
        groupId: group.id,
        taskId: taskId || undefined,
        dueAt,
      },
      session.user.id,
    );

    buildReminderSchedule(deadline.id);

    return NextResponse.json({ success: true, deadline });
  } catch (err) {
    return apiServerError('Create group deadline', undefined, err);
  }
});

export const PATCH = withTeacherAuth(async ({ session, request, params }) => {
  try {
    const { error, group } = await requireGroupOwnership(params?.id as string | undefined, session.user.id);
    if (error) return error;
    if (!group) return NextResponse.json({ success: false, error: 'Group not found' }, { status: 404 });

    const url = new URL(request.url);
    const deadlineId = url.searchParams.get('deadlineId');

    if (!deadlineId) {
      return NextResponse.json({ success: false, error: 'deadlineId is required' }, { status: 400 });
    }

    const deadline = getDeadlineById(deadlineId);
    if (!deadline || deadline.group_id !== group.id) {
      return NextResponse.json({ success: false, error: 'Deadline not found in this group' }, { status: 404 });
    }

    const validation = await parseAndValidate(request, createDeadlineSchema.partial());
    if ('response' in validation) return validation.response;

    const updated = updateDeadline(
      deadlineId,
      {
        type: validation.data.type,
        title: validation.data.title,
        description: validation.data.description,
        taskId: validation.data.taskId || undefined,
        dueAt: validation.data.dueAt,
      },
      session.user.id,
      session.user.id,
    );

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Deadline not found' }, { status: 404 });
    }

    buildReminderSchedule(deadlineId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiServerError('Update group deadline', undefined, err);
  }
});

export const DELETE = withTeacherAuth(async ({ session, request, params }) => {
  try {
    const { error, group } = await requireGroupOwnership(params?.id as string | undefined, session.user.id);
    if (error) return error;
    if (!group) return NextResponse.json({ success: false, error: 'Group not found' }, { status: 404 });

    const url = new URL(request.url);
    const deadlineId = url.searchParams.get('deadlineId');

    if (!deadlineId) {
      return NextResponse.json({ success: false, error: 'deadlineId is required' }, { status: 400 });
    }

    const deadline = getDeadlineById(deadlineId);
    if (!deadline || deadline.group_id !== group.id) {
      return NextResponse.json({ success: false, error: 'Deadline not found in this group' }, { status: 404 });
    }

    deleteDeadline(deadlineId, session.user.id, session.user.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiServerError('Delete group deadline', undefined, err);
  }
});
