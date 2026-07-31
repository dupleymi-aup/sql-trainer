import { getDb } from './connection';
import { TRAINING_TASKS } from '../training-tasks';
import { t } from '../i18n';

export interface StudentRecommendation {
  type: 'next_task' | 'review_weak' | 'practice_goal' | 'streak' | 'advance';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  task_id?: string;
  task_title?: string;
  action_items: string[];
}

export function getStudentRecommendations(userId: string): StudentRecommendation[] {
  const db = getDb();
  const recommendations: StudentRecommendation[] = [];

  const user = db.prepare('SELECT name, streak_current, streak_longest FROM users WHERE id = ?').get(userId) as
    { name: string; streak_current: number; streak_longest: number } | undefined;

  if (!user) return recommendations;

  const progress = db
    .prepare('SELECT task_id, attempts FROM user_progress WHERE user_id = ? ORDER BY completed_at ASC')
    .all(userId) as { task_id: string; attempts: number }[];

  const completedSet = new Set(progress.map((p) => p.task_id));
  const tasksCompleted = progress.length;
  const avgAttempts = progress.length > 0 ? progress.reduce((s, p) => s + p.attempts, 0) / progress.length : 0;

  const struggleTasks = progress.filter((p) => p.attempts > 3);
  const nextTask = TRAINING_TASKS.find((t) => !completedSet.has(t.id));

  if (nextTask) {
    const isFirstTen = tasksCompleted < 10;
    recommendations.push({
      type: 'next_task',
      priority: 'high',
      title: isFirstTen ? t('student.recommendations.startNext') : t('student.recommendations.continueNext'),
      description: nextTask.title || nextTask.id,
      task_id: nextTask.id,
      task_title: nextTask.title,
      action_items: [isFirstTen ? t('student.recommendations.startHint') : t('student.recommendations.continueHint')],
    });
  }

  if (struggleTasks.length > 0) {
    const weakTaskIds = struggleTasks.map((t) => t.task_id);
    const placeholders = weakTaskIds.map(() => '?').join(',');
    const weakTasks = db
      .prepare(
        `SELECT task_id, MAX(attempts) as max_attempts FROM user_progress WHERE user_id = ? AND task_id IN (${placeholders}) GROUP BY task_id ORDER BY max_attempts DESC LIMIT 3`,
      )
      .all(userId, ...weakTaskIds) as { task_id: string; max_attempts: number }[];

    recommendations.push({
      type: 'review_weak',
      priority: 'high',
      title: t('student.recommendations.reviewWeak'),
      description: t('student.recommendations.reviewWeakDesc'),
      action_items: weakTasks
        .slice(0, 3)
        .map(
          (wt) =>
            `${TRAINING_TASKS.find((t) => t.id === wt.task_id)?.title || wt.task_id} (${t('student.recommendations.attempts')}: ${wt.max_attempts})`,
        ),
    });
  }

  if (tasksCompleted < 10) {
    recommendations.push({
      type: 'practice_goal',
      priority: 'medium',
      title: t('student.recommendations.practiceGoal'),
      description: t('student.recommendations.practiceGoalDesc').replace(
        '{count}',
        String(Math.max(0, 10 - tasksCompleted)),
      ),
      action_items: [t('student.recommendations.dailyPractice'), t('student.recommendations.useHints')],
    });
  } else if (tasksCompleted < TRAINING_TASKS.length * 0.5) {
    recommendations.push({
      type: 'practice_goal',
      priority: 'medium',
      title: t('student.recommendations.halfway'),
      description: t('student.recommendations.halfwayDesc')
        .replace('{completed}', String(tasksCompleted))
        .replace('{total}', String(TRAINING_TASKS.length)),
      action_items: [t('student.recommendations.focusIntermediate'), t('student.recommendations.trackProgress')],
    });
  }

  if (user.streak_current >= 3) {
    recommendations.push({
      type: 'streak',
      priority: 'low',
      title: t('student.recommendations.streak'),
      description: t('student.recommendations.streakDesc').replace('{streak}', String(user.streak_current)),
      action_items: [t('student.recommendations.keepStreak')],
    });
  } else if (tasksCompleted > 0 && (!user.streak_current || user.streak_current === 0)) {
    recommendations.push({
      type: 'streak',
      priority: 'low',
      title: t('student.recommendations.startStreak'),
      description: t('student.recommendations.startStreakDesc'),
      action_items: [t('student.recommendations.dailyTask')],
    });
  }

  const completionRate = tasksCompleted / TRAINING_TASKS.length;
  if (completionRate >= 0.8 && avgAttempts < 2.5) {
    recommendations.push({
      type: 'advance',
      priority: 'medium',
      title: t('student.recommendations.advance'),
      description: t('student.recommendations.advanceDesc'),
      action_items: [t('student.recommendations.tryAdvanced'), t('student.recommendations.helpOthers')],
    });
  }

  return recommendations;
}
