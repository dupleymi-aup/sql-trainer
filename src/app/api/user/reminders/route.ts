import { withUserAuth } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { getPendingReminders, logReminderDelivery } from '@/lib/db-users';

export const GET = withUserAuth(async ({ session }) => {
  const reminders = getPendingReminders(session.user.id);
  return NextResponse.json({ success: true, reminders, count: reminders.length });
});

export const POST = withUserAuth(async ({ session, request }) => {
  try {
    const body = await request.json();
    const { deadlineId } = body as { deadlineId?: string };

    if (deadlineId) {
      logReminderDelivery(deadlineId, session.user.id, 'in_app');
    } else {
      const reminders = getPendingReminders(session.user.id);
      for (const reminder of reminders) {
        logReminderDelivery(reminder.deadline_id, session.user.id, 'in_app');
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
});
