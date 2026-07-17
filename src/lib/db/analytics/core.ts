import fs from 'fs';
import { getDb, DB_PATH } from '../connection';
import { type TimeRangeFilters } from '../types';
import { TRAINING_TASKS } from '../../training-tasks';
import { logger } from '../../logger';

// ==================== Database Stats ====================

export interface DBStats {
  totalUsers: number;
  studentsCount: number;
  teachersCount: number;
  adminsCount: number;
  totalCompletions: number;
  achievementsAwarded: number;
  dbSizeBytes: number;
}

export function getDBStats(): DBStats {
  const db = getDb();
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  const studentsCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student'").get() as {
    count: number;
  };
  const teachersCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'teacher'").get() as {
    count: number;
  };
  const adminsCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };
  const totalCompletions = db.prepare('SELECT COUNT(*) as count FROM user_progress').get() as { count: number };
  const achievementsAwarded = db.prepare('SELECT COUNT(*) as count FROM user_achievements').get() as { count: number };

  let dbSizeBytes = 0;
  try {
    dbSizeBytes = fs.statSync(DB_PATH()).size;
  } catch {
    logger.debug('Database file does not exist yet, size is 0');
  }

  return {
    totalUsers: totalUsers.count,
    studentsCount: studentsCount.count,
    teachersCount: teachersCount.count,
    adminsCount: adminsCount.count,
    totalCompletions: totalCompletions.count,
    achievementsAwarded: achievementsAwarded.count,
    dbSizeBytes,
  };
}

export function getStudentProgressById(userId: string): {
  completion_rate: number;
  last_active: number | null;
  tasks_completed: number;
  avg_attempts: number;
} | null {
  const db = getDb();
  const totalTasks = TRAINING_TASKS.length;
  const row = db
    .prepare(
      `
    SELECT
      COUNT(up.task_id) as tasks_completed,
      COALESCE(ROUND(AVG(up.attempts * 1.0), 2), 0) as avg_attempts,
      MAX(up.completed_at) as last_active
    FROM users u
    LEFT JOIN user_progress up ON u.id = up.user_id
    WHERE u.id = ?
    GROUP BY u.id
  `,
    )
    .get(userId) as { tasks_completed: number; avg_attempts: number; last_active: number | null } | undefined;

  if (!row) return null;
  return {
    tasks_completed: row.tasks_completed,
    avg_attempts: row.avg_attempts,
    last_active: row.last_active,
    completion_rate: Math.round((row.tasks_completed / totalTasks) * 1000) / 10,
  };
}

// ==================== Task Analytics ====================

export interface TaskAnalyticsEntry {
  task_id: string;
  title: string;
  difficulty: string;
  completions: number;
  avg_attempts: number;
  first_attempt_rate: number;
}

export function getTaskAnalytics(filters?: TimeRangeFilters): TaskAnalyticsEntry[] {
  const db = getDb();

  let query = `
    SELECT
      task_id,
      COUNT(*) as completions,
      ROUND(AVG(attempts * 1.0), 2) as avg_attempts,
      ROUND(100.0 * SUM(CASE WHEN attempts = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as first_attempt_rate
    FROM user_progress
  `;
  const params: (number | string)[] = [];

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

  query += `
    GROUP BY task_id
    ORDER BY avg_attempts DESC
  `;

  const rawResults = db.prepare(query).all(...params) as Array<{
    task_id: string;
    completions: number;
    avg_attempts: number;
    first_attempt_rate: number;
  }>;

  // Enrich with title and difficulty from training tasks
  const taskMap = new Map(TRAINING_TASKS.map((t) => [t.id, t]));

  return rawResults.map((row) => {
    const task = taskMap.get(row.task_id);
    return {
      task_id: row.task_id,
      title: task?.title ?? row.task_id,
      difficulty: task?.difficulty ?? 'unknown',
      completions: row.completions,
      avg_attempts: row.avg_attempts,
      first_attempt_rate: row.first_attempt_rate,
    };
  });
}

export interface CompletionBucket {
  range: string;
  min: number;
  max: number;
  student_count: number;
}

export function getCompletionDistribution(filters?: TimeRangeFilters): CompletionBucket[] {
  const db = getDb();
  const buckets = [
    { range: '0-5', min: 0, max: 5 },
    { range: '6-10', min: 6, max: 10 },
    { range: '11-20', min: 11, max: 20 },
    { range: '21-35', min: 21, max: 35 },
    { range: '36-56', min: 36, max: 56 },
  ];

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

  const raw = db
    .prepare(
      `
    SELECT
      CASE
        WHEN tasks_completed BETWEEN 0 AND 5 THEN '0-5'
        WHEN tasks_completed BETWEEN 6 AND 10 THEN '6-10'
        WHEN tasks_completed BETWEEN 11 AND 20 THEN '11-20'
        WHEN tasks_completed BETWEEN 21 AND 35 THEN '21-35'
        WHEN tasks_completed BETWEEN 36 AND 56 THEN '36-56'
        ELSE '56+'
      END as range_label,
      COUNT(*) as student_count
    FROM (
      SELECT u.id, COUNT(up.task_id) as tasks_completed
      FROM users u
      LEFT JOIN user_progress up ON u.id = up.user_id
      WHERE u.role = 'student'${dateCondition}
      GROUP BY u.id
    )
    GROUP BY range_label
  `,
    )
    .all(...dateParams) as { range_label: string; student_count: number }[];

  const map = new Map(raw.map((r) => [r.range_label, r.student_count]));
  return buckets.map((b) => ({
    ...b,
    student_count: map.get(b.range) || 0,
  }));
}
