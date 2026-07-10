import { withUserAuth } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { getPendingReminders, logReminderDelivery } from '@/lib/db-users';
import { parseAndValidate } from '@/lib/validation';
import { z } from 'zod';

const markReadSchema = z.object({
  deadlineId: z.string().min(1).optional(),
});

export const GET = withUserAuth(async ({ session }) => {
  const reminders = getPendingReminders(session.user.id);
  return NextResponse.json({ success: true, reminders, count: reminders.length });
});

export const POST = withUserAuth(async ({ session, request }) => {
  const parsed = await parseAndValidate(request, markReadSchema);
  if ('response' in parsed) return parsed.response;

  const { deadlineId } = parsed.data;

  if (deadlineId) {
    logReminderDelivery(deadlineId, session.user.id, 'in_app');
  } else {
    const reminders = getPendingReminders(session.user.id);
    for (const reminder of reminders) {
      logReminderDelivery(reminder.deadline_id, session.user.id, 'in_app');
    }
  }

  return NextResponse.json({ success: true });
});
