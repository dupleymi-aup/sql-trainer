import { getDb } from '../connection';
import { type UserRole, type TimeRangeFilters } from '../types';

// ==================== Student Detail Analytics ====================

export interface StudentDetail {
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: number;
  tasks_completed: number;
  total_attempts: number;
  avg_attempts: number;
  beginner_completed: number;
  intermediate_completed: number;
  advanced_completed: number;
  achievements_count: number;
  last_active: number | null;
}

export function getStudentDetail(userId: string): StudentDetail | null {
  const db = getDb();
  const user = db
    .prepare(
      `
    SELECT
      u.id as user_id, u.name, u.email, u.role, u.created_at,
      COUNT(up.task_id) as tasks_completed,
      COALESCE(SUM(up.attempts), 0) as total_attempts,
      COALESCE(ROUND(AVG(up.attempts * 1.0), 2), 0) as avg_attempts,
      COALESCE(SUM(CASE WHEN up.task_id LIKE 'beginner-%' THEN 1 ELSE 0 END), 0) as beginner_completed,
      COALESCE(SUM(CASE WHEN up.task_id LIKE 'intermediate-%' THEN 1 ELSE 0 END), 0) as intermediate_completed,
      COALESCE(SUM(CASE WHEN up.task_id LIKE 'advanced-%' THEN 1 ELSE 0 END), 0) as advanced_completed,
      MAX(up.completed_at) as last_active
    FROM users u
    LEFT JOIN user_progress up ON u.id = up.user_id
    WHERE u.id = ?
    GROUP BY u.id
  `,
    )
    .get(userId) as StudentDetail | undefined;

  if (!user) return null;

  const ach = db.prepare('SELECT COUNT(*) as count FROM user_achievements WHERE user_id = ?').get(userId) as {
    count: number;
  };
  user.achievements_count = ach.count;

  return user;
}

// ==================== Achievement Stats ====================

export interface AchievementStatsEntry {
  id: string;
  title: string;
  description: string;
  icon: string;
  earned_count: number;
  total_students: number;
  earn_rate: number;
  recent_earners: { user_id: string; name: string; earned_at: number }[];
}

export function getAchievementStats(filters?: TimeRangeFilters): AchievementStatsEntry[] {
  const db = getDb();
  const totalStudents = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student'").get() as {
    count: number;
  };

  let dateCondition = '';
  const dateParams: unknown[] = [];
  if (filters?.start_date) {
    dateCondition += ' AND ua.earned_at >= ?';
    dateParams.push(filters.start_date);
  }
  if (filters?.end_date) {
    dateCondition += ' AND ua.earned_at <= ?';
    dateParams.push(filters.end_date);
  }

  const achievements = db
    .prepare(
      `
    SELECT a.id, a.title, a.description, a.icon,
           COUNT(ua.user_id) as earned_count
    FROM achievements a
    LEFT JOIN user_achievements ua ON a.id = ua.achievement_id${dateCondition ? ' WHERE 1=1' + dateCondition : ''}
    GROUP BY a.id, a.title, a.description, a.icon
    ORDER BY a.id
  `,
    )
    .all(...dateParams) as {
    id: string;
    title: string;
    description: string;
    icon: string;
    earned_count: number;
  }[];

  // Single query for all recent earners (avoids N+1 per achievement)
  const allEarners = db
    .prepare(
      `
    SELECT ua.achievement_id, ua.user_id, u.name, ua.earned_at
    FROM user_achievements ua
    JOIN users u ON ua.user_id = u.id
    ORDER BY ua.earned_at DESC
  `,
    )
    .all() as { achievement_id: string; user_id: string; name: string; earned_at: number }[];

  // Group by achievement_id, keep top 5 per achievement
  const earnersByAchievement = new Map<string, { user_id: string; name: string; earned_at: number }[]>();
  for (const earner of allEarners) {
    const list = earnersByAchievement.get(earner.achievement_id);
    if (!list) {
      earnersByAchievement.set(earner.achievement_id, [
        { user_id: earner.user_id, name: earner.name, earned_at: earner.earned_at },
      ]);
    } else if (list.length < 5) {
      list.push({ user_id: earner.user_id, name: earner.name, earned_at: earner.earned_at });
    }
  }

  return achievements.map((a) => ({
    ...a,
    total_students: totalStudents.count,
    earn_rate: totalStudents.count > 0 ? Math.round((a.earned_count / totalStudents.count) * 1000) / 10 : 0,
    recent_earners: earnersByAchievement.get(a.id) ?? [],
  }));
}
