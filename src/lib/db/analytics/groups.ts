import { getDb } from '../connection';
import { logAudit } from '../users';
import { logReminderDelivery } from './reminders';
import { queueEmail } from './notifications';
import type { Deadline } from './deadlines';

export interface Group {
  id: string;
  name: string;
  description: string | null;
  teacher_id: string;
  teacher_name: string | null;
  member_count: number;
  created_at: number;
  updated_at: number;
}

export interface GroupMember {
  user_id: string;
  user_name: string;
  user_email: string;
  joined_at: number;
}

export interface GroupWithMembers extends Group {
  members: GroupMember[];
}

export interface GroupNotificationResult {
  total: number;
  queued: number;
  failed: number;
  errors: string[];
}

export function createGroup(
  data: {
    name: string;
    description?: string;
    teacherId: string;
    memberIds?: string[];
  },
  actorId?: string,
): Group {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `
    INSERT INTO "groups" (id, name, description, teacher_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(id, data.name, data.description || null, data.teacherId, now, now);

  if (data.memberIds && data.memberIds.length > 0) {
    const insertMember = db.prepare('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)');
    const insertMany = db.transaction((groupId: string, userIds: string[]) => {
      for (const userId of userIds) {
        insertMember.run(groupId, userId, now);
      }
    });
    insertMany(id, data.memberIds);
  }

  if (actorId) {
    logAudit(
      actorId,
      'group_create',
      'group',
      id,
      JSON.stringify({ name: data.name, memberCount: data.memberIds?.length || 0 }),
    );
  }

  const group = getGroupById(id);
  if (!group) throw new Error(`Group not found: ${id}`);
  return group;
}

export function getGroupById(id: string): Group | null {
  const db = getDb();
  const row = db
    .prepare(
      `
    SELECT g.id, g.name, g.description, g.teacher_id, u.name as teacher_name,
           (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count,
           g.created_at, g.updated_at
    FROM "groups" g
    LEFT JOIN users u ON g.teacher_id = u.id
    WHERE g.id = ?
  `,
    )
    .get(id) as (Group & { member_count: number }) | undefined;

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    teacher_id: row.teacher_id,
    teacher_name: row.teacher_name,
    member_count: row.member_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function isStudentInTeacherGroup(studentId: string, teacherId: string): boolean {
  const db = getDb();
  const result = db
    .prepare(
      `
    SELECT COUNT(*) as count
    FROM group_members gm
    INNER JOIN "groups" g ON gm.group_id = g.id
    WHERE gm.user_id = ? AND g.teacher_id = ?
  `,
    )
    .get(studentId, teacherId) as { count: number };

  return result.count > 0;
}

export function getGroupsByTeacherId(teacherId: string): Group[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
    SELECT g.id, g.name, g.description, g.teacher_id, u.name as teacher_name,
           (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count,
           g.created_at, g.updated_at
    FROM "groups" g
    LEFT JOIN users u ON g.teacher_id = u.id
    WHERE g.teacher_id = ?
    ORDER BY g.created_at DESC
  `,
    )
    .all(teacherId) as (Group & { member_count: number })[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    teacher_id: row.teacher_id,
    teacher_name: row.teacher_name,
    member_count: row.member_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export function getAllGroupsForAdmin(): Group[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
    SELECT g.id, g.name, g.description, g.teacher_id, u.name as teacher_name,
           (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count,
           g.created_at, g.updated_at
    FROM "groups" g
    LEFT JOIN users u ON g.teacher_id = u.id
    ORDER BY g.created_at DESC
  `,
    )
    .all() as (Group & { member_count: number })[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    teacher_id: row.teacher_id,
    teacher_name: row.teacher_name,
    member_count: row.member_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export function updateGroup(id: string, data: { name?: string; description?: string }, actorId?: string): Group | null {
  const db = getDb();
  const now = Date.now();
  const parts: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    parts.push('name = ?');
    values.push(data.name);
  }
  if (data.description !== undefined) {
    parts.push('description = ?');
    values.push(data.description);
  }
  if (parts.length === 0) return getGroupById(id);

  parts.push('updated_at = ?');
  values.push(now);
  values.push(id);

  const result = db.prepare(`UPDATE "groups" SET ${parts.join(', ')} WHERE id = ?`).run(...values);
  if (result.changes === 0) return null;

  if (actorId) {
    logAudit(actorId, 'group_update', 'group', id, JSON.stringify(data));
  }

  return getGroupById(id);
}

export function deleteGroup(id: string, actorId?: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM "groups" WHERE id = ?').run(id);
  if (result.changes === 0) return false;

  if (actorId) {
    logAudit(actorId, 'group_delete', 'group', id);
  }

  return true;
}

export function addGroupMembers(groupId: string, userIds: string[], actorId?: string): number {
  const db = getDb();
  const now = Date.now();
  const insertMember = db.prepare(
    'INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)',
  );
  let added = 0;
  for (const userId of userIds) {
    const result = insertMember.run(groupId, userId, now);
    added += result.changes;
  }

  if (actorId && added > 0) {
    logAudit(actorId, 'group_add_members', 'group', groupId, JSON.stringify({ addedCount: added }));
  }

  return added;
}

export function removeGroupMember(groupId: string, userId: string, actorId?: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);

  if (result.changes > 0 && actorId) {
    logAudit(actorId, 'group_remove_member', 'group', groupId, JSON.stringify({ removedUserId: userId }));
  }

  return result.changes > 0;
}

export function getGroupMembers(groupId: string): GroupMember[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
    SELECT u.id as user_id, u.name as user_name, u.email as user_email, gm.joined_at
    FROM group_members gm
    JOIN users u ON gm.user_id = u.id
    WHERE gm.group_id = ?
    ORDER BY u.name
  `,
    )
    .all(groupId) as GroupMember[];

  return rows;
}

export function notifyGroupMembers(
  groupId: string,
  subject: string,
  message: string,
  channel: 'email' | 'in_app',
  actorId: string,
): GroupNotificationResult {
  const members = getGroupMembers(groupId);
  const result: GroupNotificationResult = { total: members.length, queued: 0, failed: 0, errors: [] };

  if (members.length === 0) return result;

  if (channel === 'in_app') {
    for (const member of members) {
      try {
        logReminderDelivery(groupId, member.user_id, 'teacher_notification');
        result.queued++;
      } catch (err) {
        result.failed++;
        result.errors.push(`Failed for ${member.user_email}: ${err}`);
      }
    }
  } else if (channel === 'email') {
    for (const member of members) {
      try {
        queueEmail(member.user_id, subject, message, Date.now());
        result.queued++;
      } catch (err) {
        result.failed++;
        result.errors.push(`Failed for ${member.user_email}: ${err}`);
      }
    }
  }

  logAudit(
    actorId,
    'group_notify',
    'group',
    groupId,
    JSON.stringify({
      subject,
      channel,
      total: result.total,
      queued: result.queued,
      failed: result.failed,
    }),
  );

  return result;
}

export function getGroupDeadlines(groupId: string): Deadline[] {
  const db = getDb();
  return db.prepare('SELECT * FROM deadlines WHERE group_id = ? ORDER BY due_at ASC').all(groupId) as Deadline[];
}

export function getUserGroups(userId: string): Group[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
    SELECT g.id, g.name, g.description, g.teacher_id, u.name as teacher_name,
           (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) as member_count,
           g.created_at, g.updated_at
    FROM group_members gm
    JOIN "groups" g ON gm.group_id = g.id
    LEFT JOIN users u ON g.teacher_id = u.id
    WHERE gm.user_id = ?
    ORDER BY g.created_at DESC
  `,
    )
    .all(userId) as (Group & { member_count: number })[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    teacher_id: row.teacher_id,
    teacher_name: row.teacher_name,
    member_count: row.member_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export function getUserGroup(userId: string): Group | null {
  const groups = getUserGroups(userId);
  return groups.length > 0 ? groups[0] : null;
}
