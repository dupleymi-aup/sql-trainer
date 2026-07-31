import { getDb } from '../connection';
import type { Deadline } from './deadlines';
import { getDeadlineById } from './deadlines';
import { getNotificationPreferences } from './notifications';

export interface PendingReminder {
  id: string;
  deadline_id: string;
  type: 'course' | 'exam' | 'task' | 'inactivity';
  title: string;
  description: string | null;
  task_id: string | null;
  due_at: number;
  is_overdue: boolean;
  hours_until_due: number;
}

export interface ReminderScheduleRow {
  id: string;
  deadline_id: string;
  user_id: string;
  channel: string;
  trigger_at: number;
  status: string;
  sent_at: number | null;
  error: string | null;
}

export function getPendingReminders(userId: string): PendingReminder[] {
  const db = getDb();
  const now = Date.now();

  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
  if (!user) return [];

  let query = `
    SELECT d.* FROM deadlines d
    WHERE d.due_at <= ? + 86400000
    AND d.id NOT IN (
      SELECT deadline_id FROM reminder_log WHERE user_id = ? AND channel = 'in_app'
    )
  `;
  const params: unknown[] = [now, userId];

  if (user.role === 'student') {
    query += ` AND (
      d.target_type = 'all_students'
      OR (d.target_type = 'individual' AND d.target_id = ?)
    )`;
    params.push(userId);
  }

  query += ' ORDER BY d.due_at ASC';

  const deadlines = db.prepare(query).all(...params) as Deadline[];

  const inactivityDeadline = db
    .prepare(
      `
    SELECT d.* FROM deadlines d
    WHERE d.type = 'inactivity' AND d.due_at <= ? + 86400000
    AND d.id NOT IN (
      SELECT deadline_id FROM reminder_log WHERE user_id = ? AND channel = 'inactivity_warning'
    )
    AND (d.target_type = 'all_students' OR (d.target_type = 'individual' AND d.target_id = ?))
    ORDER BY d.due_at ASC
  `,
    )
    .all(now, userId, userId) as Deadline[];

  const allDeadlines = [...deadlines];
  for (const inc of inactivityDeadline) {
    if (!allDeadlines.find((d) => d.id === inc.id)) {
      allDeadlines.push(inc);
    }
  }

  return allDeadlines.map((d) => ({
    id: d.id,
    deadline_id: d.id,
    type: d.type,
    title: d.title,
    description: d.description,
    task_id: d.task_id,
    due_at: d.due_at,
    is_overdue: d.due_at < now,
    hours_until_due: Math.round((d.due_at - now) / 3600000),
  }));
}

export function logReminderDelivery(
  deadlineId: string,
  userId: string,
  channel: string,
  status: string = 'sent',
  error?: string,
): void {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    `
    INSERT OR IGNORE INTO reminder_log (id, deadline_id, user_id, channel, sent_at, status, error)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(id, deadlineId, userId, channel, Date.now(), status, error || null);
}

export function resolveDeadlineTargets(deadline: Deadline): string[] {
  const db = getDb();

  if (deadline.target_type === 'all_students') {
    const rows = db
      .prepare("SELECT id FROM users WHERE role = 'student' AND banned_at IS NULL AND deleted_at IS NULL")
      .all() as { id: string }[];
    return rows.map((r) => r.id);
  }

  if (deadline.target_type === 'individual' && deadline.target_id) {
    return [deadline.target_id];
  }

  if (deadline.target_type === 'group' && deadline.group_id) {
    const rows = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(deadline.group_id) as {
      user_id: string;
    }[];
    return rows.map((r) => r.user_id);
  }

  return [];
}

export function buildReminderSchedule(deadlineId: string): void {
  const db = getDb();
  const deadline = getDeadlineById(deadlineId);
  if (!deadline) return;

  const targets = resolveDeadlineTargets(deadline);
  if (targets.length === 0) return;

  const creatorPrefs = getNotificationPreferences(deadline.creator_id);
  let intervals: number[];
  let channels: string[];
  try {
    intervals = JSON.parse(creatorPrefs.reminder_intervals);
  } catch {
    intervals = [];
  }
  try {
    channels = JSON.parse(creatorPrefs.channels_enabled);
  } catch {
    channels = [];
  }

  const now = Date.now();

  const scheduleTransaction = db.transaction(() => {
    db.prepare('DELETE FROM reminder_schedule WHERE deadline_id = ?').run(deadlineId);

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO reminder_schedule (id, deadline_id, user_id, channel, trigger_at, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `);

    for (const userId of targets) {
      const userPrefs = getNotificationPreferences(userId);
      let userChannels: string[];
      let userIntervals: number[];
      try {
        userChannels = JSON.parse(userPrefs.channels_enabled);
      } catch {
        userChannels = [];
      }
      try {
        userIntervals = JSON.parse(userPrefs.reminder_intervals);
      } catch {
        userIntervals = [];
      }

      const effectiveChannels = channels.filter((c) => userChannels.includes(c));
      const effectiveIntervals = intervals.filter((i) => userIntervals.includes(i));

      for (const intervalMs of effectiveIntervals) {
        const triggerAt = deadline.due_at - intervalMs;
        if (triggerAt < now) continue;

        for (const channel of effectiveChannels) {
          stmt.run(crypto.randomUUID(), deadlineId, userId, channel, triggerAt);
        }
      }
    }
  });

  scheduleTransaction();
}

export function getDueReminders(): ReminderScheduleRow[] {
  const db = getDb();
  const now = Date.now();
  return db
    .prepare(
      `
    SELECT * FROM reminder_schedule
    WHERE trigger_at <= ? AND status = 'pending'
    ORDER BY trigger_at ASC
  `,
    )
    .all(now) as ReminderScheduleRow[];
}

export function markScheduleSent(id: string): void {
  const db = getDb();
  db.prepare(
    `
    UPDATE reminder_schedule SET status = 'sent', sent_at = ? WHERE id = ?
  `,
  ).run(Date.now(), id);
}

export function markScheduleFailed(id: string, error: string): void {
  const db = getDb();
  db.prepare(
    `
    UPDATE reminder_schedule SET status = 'failed', error = ? WHERE id = ?
  `,
  ).run(error, id);
}

export function getTeacherNotificationDeadlines(
  teacherId: string,
  withinMs: number = 86400000,
): Array<{
  deadline: Deadline;
  target_count: number;
  reminders_sent: number;
  completions: number;
}> {
  const db = getDb();
  const now = Date.now();

  const deadlines = db
    .prepare(
      `
    SELECT * FROM deadlines
    WHERE creator_id = ? AND due_at > ? AND due_at <= ? + ?
    ORDER BY due_at ASC
  `,
    )
    .all(teacherId, now, now, withinMs) as Deadline[];

  if (deadlines.length === 0) return [];

  const deadlineIds = deadlines.map((d) => d.id);
  const placeholders = deadlineIds.map(() => '?').join(',');
  const sentCounts = db
    .prepare(
      `SELECT deadline_id, COUNT(*) as cnt FROM reminder_schedule WHERE deadline_id IN (${placeholders}) AND status = 'sent' GROUP BY deadline_id`,
    )
    .all(...deadlineIds) as Array<{ deadline_id: string; cnt: number }>;
  const sentMap = new Map(sentCounts.map((r) => [r.deadline_id, r.cnt]));

  const completionCounts = db
    .prepare(
      `SELECT d.id as deadline_id, COUNT(up.user_id) as cnt FROM deadlines d LEFT JOIN user_progress up ON up.task_id = d.task_id AND d.task_id IS NOT NULL WHERE d.id IN (${placeholders}) GROUP BY d.id`,
    )
    .all(...deadlineIds) as Array<{ deadline_id: string; cnt: number }>;
  const completionMap = new Map(completionCounts.map((r) => [r.deadline_id, r.cnt]));

  return deadlines.map((d) => {
    const targets = resolveDeadlineTargets(d);

    return {
      deadline: d,
      target_count: targets.length,
      reminders_sent: sentMap.get(d.id) || 0,
      completions: completionMap.get(d.id) || 0,
    };
  });
}
