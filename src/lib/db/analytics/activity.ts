import { getDb } from '../connection';
import { type TimeRangeFilters } from '../types';
import { TRAINING_TASKS } from '../../training-tasks';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ==================== Activity Analytics ====================

export interface DailyActivityEntry {
  date: string;
  completions: number;
  unique_users: number;
}

function getDailyActivityInternal(
  days: number,
  filters: TimeRangeFilters | undefined,
  fillRange: 'days' | 'filter',
): DailyActivityEntry[] {
  const db = getDb();
  const cutoff = filters?.start_date ?? Date.now() - days * MS_PER_DAY;

  let query = `
    SELECT
      date(completed_at / 1000, 'unixepoch') as day,
      COUNT(*) as completions,
      COUNT(DISTINCT user_id) as unique_users
    FROM user_progress
    WHERE completed_at >= ?
  `;
  const params: unknown[] = [cutoff];

  if (filters?.end_date) {
    query += ' AND completed_at <= ?';
    params.push(filters.end_date);
  }

  query += ' GROUP BY day ORDER BY day';

  const rows = db.prepare(query).all(...params) as { day: string; completions: number; unique_users: number }[];

  // Fill gaps with zero entries
  const result: DailyActivityEntry[] = [];
  if (fillRange === 'days') {
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const existing = rows.find((r) => r.day === dateStr);
      result.push({
        date: dateStr,
        completions: existing?.completions || 0,
        unique_users: existing?.unique_users || 0,
      });
    }
  } else {
    const endDate = filters?.end_date ? new Date(filters.end_date) : new Date();
    const startDate = filters?.start_date ? new Date(filters.start_date) : new Date(cutoff);
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().slice(0, 10);
      const existing = rows.find((r) => r.day === dateStr);
      result.push({
        date: dateStr,
        completions: existing?.completions || 0,
        unique_users: existing?.unique_users || 0,
      });
      current.setDate(current.getDate() + 1);
    }
  }

  return result;
}

export function getDailyActivity(days = 30, filters?: TimeRangeFilters): DailyActivityEntry[] {
  return getDailyActivityInternal(days, filters, 'days');
}

export function getDailyActivityWithFilters(days = 30, filters?: TimeRangeFilters): DailyActivityEntry[] {
  return getDailyActivityInternal(days, filters, 'filter');
}

export interface AdminLeaderboardEntry {
  rank: number;
  user_id: string;
  name: string;
  email: string;
  tasks_completed: number;
  total_attempts: number;
  avg_attempts: number;
  achievements_count: number;
  completion_rate: number;
}

export function getAdminLeaderboard(limit = 50, filters?: TimeRangeFilters): AdminLeaderboardEntry[] {
  const db = getDb();

  let dateCondition = '';
  const dateParams: unknown[] = [];
  if (filters?.start_date) {
    dateCondition += ' AND up.completed_at >= ?';
    dateParams.push(filters.start_date);
  }
  if (filters?.end_date) {
    dateCondition += ' AND up.completed_at <= ?';
    dateParams.push(filters.end_date);
  }

  const rows = db
    .prepare(
      `
    SELECT
      u.id as user_id, u.name, u.email,
      COUNT(up.task_id) as tasks_completed,
      COALESCE(SUM(up.attempts), 0) as total_attempts,
      COALESCE(ROUND(AVG(up.attempts * 1.0), 2), 0) as avg_attempts,
      (SELECT COUNT(*) FROM user_achievements ua WHERE ua.user_id = u.id) as achievements_count
    FROM users u
    LEFT JOIN user_progress up ON u.id = up.user_id
    WHERE u.role = 'student'${dateCondition}
    GROUP BY u.id, u.name, u.email
    ORDER BY tasks_completed DESC, total_attempts ASC
    LIMIT ?
  `,
    )
    .all(...dateParams, limit) as {
    user_id: string;
    name: string;
    email: string;
    tasks_completed: number;
    total_attempts: number;
    avg_attempts: number;
    achievements_count: number;
  }[];

  const totalTasks = TRAINING_TASKS.length;
  return rows.map((r, i) => ({
    ...r,
    rank: i + 1,
    completion_rate: Math.round((r.tasks_completed / totalTasks) * 1000) / 10,
  }));
}

export function getActiveUsersCount(days = 7, filters?: TimeRangeFilters): number {
  const db = getDb();
  const cutoff = Date.now() - days * MS_PER_DAY;

  let query = `
    SELECT COUNT(DISTINCT user_id) as count
    FROM user_progress
    WHERE completed_at >= ?
  `;
  const params: unknown[] = [cutoff];

  if (filters?.start_date && filters.start_date > cutoff) {
    params[0] = filters.start_date;
  }
  if (filters?.end_date) {
    query += ' AND completed_at <= ?';
    params.push(filters.end_date);
  }

  const result = db.prepare(query).get(...params) as { count: number };
  return result.count;
}

export function getAvgAttemptsPerTask(filters?: TimeRangeFilters): number {
  const db = getDb();

  let query = `
    SELECT AVG(attempts * 1.0) as avg_attempts
    FROM user_progress
  `;
  const params: unknown[] = [];

  if (filters?.start_date || filters?.end_date) {
    query += ' WHERE 1=1';
    if (filters.start_date) {
      query += ' AND completed_at >= ?';
      params.push(filters.start_date);
    }
    if (filters.end_date) {
      query += ' AND completed_at <= ?';
      params.push(filters.end_date);
    }
  }

  const result = db.prepare(query).get(...params) as { avg_attempts: number } | undefined;
  return result?.avg_attempts ?? 0;
}

export interface WeeklyProgressEntry {
  week: string;
  completions: number;
  unique_users: number;
}

export function getWeeklyProgress(weeks = 12): WeeklyProgressEntry[] {
  const db = getDb();
  const results: WeeklyProgressEntry[] = [];

  const now = new Date();
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const startStr = weekStart.toISOString().slice(0, 10);
    const endStr = weekEnd.toISOString().slice(0, 10);

    const row = db
      .prepare(
        `
        SELECT
          COUNT(*) as completions,
          COUNT(DISTINCT user_id) as unique_users
        FROM user_progress
        WHERE date(completed_at, 'unixepoch') BETWEEN ? AND ?
      `,
      )
      .get(startStr, endStr) as { completions: number; unique_users: number };

    results.push({
      week: `${startStr} – ${endStr}`,
      completions: row.completions,
      unique_users: row.unique_users,
    });
  }

  return results;
}

export function getActivityHeatmap(days: number = 90): { date: string; count: number }[] {
  const db = getDb();
  const cutoff = Date.now() - days * MS_PER_DAY;

  const rows = db
    .prepare(
      `
      SELECT date(completed_at / 1000, 'unixepoch') as day, COUNT(*) as count
      FROM user_progress
      WHERE completed_at >= ?
      GROUP BY day
      ORDER BY day
    `,
    )
    .all(cutoff) as { day: string; count: number }[];

  return rows.map((r) => ({ date: r.day, count: r.count }));
}
