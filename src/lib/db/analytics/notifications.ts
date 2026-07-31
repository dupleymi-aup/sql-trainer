import { getDb } from '../connection';

export interface PushSubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: number;
  last_used: number | null;
}

export interface NotificationPreferences {
  user_id: string;
  channels_enabled: string;
  reminder_intervals: string;
  teacher_notify_students: number;
  updated_at: number;
}

export const DEFAULT_CHANNELS = JSON.stringify(['in_app']);
export const DEFAULT_INTERVALS = JSON.stringify([86400000, 3600000]);

export interface EmailQueueRow {
  id: string;
  user_id: string;
  subject: string;
  body_html: string;
  scheduled_at: number;
  status: string;
  attempts: number;
  max_attempts: number;
  error: string | null;
  created_at: number;
}

export function savePushSubscription(
  userId: string,
  subscription: { endpoint: string; p256dh: string; auth: string },
): void {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `
    INSERT OR REPLACE INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at, last_used)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(id, userId, subscription.endpoint, subscription.p256dh, subscription.auth, now, now);
}

export function getUserPushSubscriptions(userId: string): PushSubRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId) as PushSubRow[];
}

export function deletePushSubscription(userId: string, endpoint: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
  return result.changes > 0;
}

export function getNotificationPreferences(userId: string): NotificationPreferences {
  const db = getDb();
  const prefs = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(userId) as
    NotificationPreferences | undefined;
  if (prefs) return prefs;

  db.prepare(
    `
    INSERT OR IGNORE INTO notification_preferences (user_id, channels_enabled, reminder_intervals, teacher_notify_students, updated_at)
    VALUES (?, ?, ?, 1, ?)
  `,
  ).run(userId, DEFAULT_CHANNELS, DEFAULT_INTERVALS, Date.now());

  const saved = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(userId) as
    NotificationPreferences | undefined;
  if (saved) return saved;

  return {
    user_id: userId,
    channels_enabled: DEFAULT_CHANNELS,
    reminder_intervals: DEFAULT_INTERVALS,
    teacher_notify_students: 1,
    updated_at: Date.now(),
  };
}

export function updateNotificationPreferences(
  userId: string,
  prefs: {
    channels_enabled?: string[];
    reminder_intervals?: number[];
    teacher_notify_students?: boolean;
  },
): void {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(userId) as
    NotificationPreferences | undefined;

  const channels = prefs.channels_enabled || (existing ? JSON.parse(existing.channels_enabled) : ['in_app']);
  const intervals =
    prefs.reminder_intervals || (existing ? JSON.parse(existing.reminder_intervals) : [86400000, 3600000]);
  const notifyStudents =
    prefs.teacher_notify_students !== undefined
      ? prefs.teacher_notify_students
        ? 1
        : 0
      : (existing?.teacher_notify_students ?? 1);

  db.prepare(
    `
    INSERT INTO notification_preferences (user_id, channels_enabled, reminder_intervals, teacher_notify_students, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      channels_enabled = excluded.channels_enabled,
      reminder_intervals = excluded.reminder_intervals,
      teacher_notify_students = excluded.teacher_notify_students,
      updated_at = excluded.updated_at
  `,
  ).run(userId, JSON.stringify(channels), JSON.stringify(intervals), notifyStudents, Date.now());
}

export function queueEmail(
  userId: string,
  subject: string,
  bodyHtml: string,
  scheduledAt: number = Date.now(),
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    `
    INSERT INTO email_queue (id, user_id, subject, body_html, scheduled_at, status, attempts, max_attempts, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', 0, 3, ?)
  `,
  ).run(id, userId, subject, bodyHtml, scheduledAt, Date.now());
  return id;
}

export function getDueEmails(): EmailQueueRow[] {
  const db = getDb();
  const now = Date.now();
  return db
    .prepare(
      `
    SELECT * FROM email_queue
    WHERE scheduled_at <= ? AND status = 'pending' AND attempts < max_attempts
    ORDER BY scheduled_at ASC
    LIMIT 50
  `,
    )
    .all(now) as EmailQueueRow[];
}

export function markEmailSent(id: string): void {
  const db = getDb();
  db.prepare(
    `
    UPDATE email_queue SET status = 'sent', attempts = attempts + 1 WHERE id = ?
  `,
  ).run(id);
}

export function markEmailFailed(id: string, error: string): void {
  const db = getDb();
  db.prepare(
    `
    UPDATE email_queue SET status = 'pending', attempts = attempts + 1, error = ? WHERE id = ?
  `,
  ).run(error, id);
}
