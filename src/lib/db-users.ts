/**
 * User database layer — pure re-export barrel.
 * All functions live in focused modules under ./db/.
 */
export { getDb, DB_PATH } from './db/connection';
export { type UserRole, VALID_ROLES, type TimeRangeFilters } from './db/types';
export {
  createUser,
  findUserByEmail,
  verifyPassword,
  getUserById,
  findUserByIdWithHash,
  updateUser,
  updatePassword,
  createResetCode,
  verifyResetCode,
  getLoginLockStatus,
  logAudit,
} from './db/users';
export {
  saveUserProgress,
  getUserProgress,
  getUserAchievements,
  getAchievementDetails,
  checkAndAwardAchievements,
  getLeaderboard,
  getStudentStreak,
} from './db/progress';
export type { LeaderboardEntry } from './db/progress';
export {
  getAllUsers,
  updateUserRole,
  updateUserDetails,
  softDeleteUser,
  restoreUser,
  banUser,
  unbanUser,
  isUserBanned,
  getBannedUsers,
  getDeletedUsers,
  bulkUpdateRole,
  bulkSoftDelete,
  getAuditTrail,
} from './db/admin';
export type { UserSummary } from './db/admin';
export { getStudentRecommendations } from './db/recommendations';
export type { StudentRecommendation } from './db/recommendations';
export * from './db/analytics';

// Initialize on import (delegated to db/schema.ts)
import { initDatabase } from './db/schema';
initDatabase();
