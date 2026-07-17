/**
 * Analytics module — split from the original 269KB analytics.ts monolith.
 * Organized by domain for better maintainability.
 */

// Core stats and task analytics
export type { DBStats, TaskAnalyticsEntry, CompletionBucket } from './core';
export { getDBStats, getStudentProgressById, getTaskAnalytics, getCompletionDistribution } from './core';

// Activity tracking
export type { DailyActivityEntry, AdminLeaderboardEntry, WeeklyProgressEntry } from './activity';
export {
  getDailyActivity,
  getDailyActivityWithFilters,
  getAdminLeaderboard,
  getActiveUsersCount,
  getAvgAttemptsPerTask,
  getWeeklyProgress,
  getActivityHeatmap,
} from './activity';

// Student and achievement analytics
export type { StudentDetail, AchievementStatsEntry } from './student-analytics';
export { getStudentDetail, getAchievementStats } from './student-analytics';
