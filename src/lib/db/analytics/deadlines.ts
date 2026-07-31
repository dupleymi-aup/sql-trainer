import { getDb } from '../connection';
import { logAudit } from '../users';

export interface Deadline {
  id: string;
  creator_id: string;
  type: 'course' | 'exam' | 'task' | 'inactivity';
  title: string;
  description: string | null;
  target_type: 'individual' | 'group' | 'all_students';
  target_id: string | null;
  group_id: string | null;
  task_id: string | null;
  due_at: number;
  created_at: number;
  updated_at: number;
}

export function createDeadline(
  data: {
    creatorId: string;
    type: Deadline['type'];
    title: string;
    description?: string;
    targetType: Deadline['target_type'];
    targetId?: string;
    groupId?: string;
    taskId?: string;
    dueAt: number;
  },
  actorId?: string,
): Deadline {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `
    INSERT INTO deadlines (id, creator_id, type, title, description, target_type, target_id, group_id, task_id, due_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    data.creatorId,
    data.type,
    data.title,
    data.description || null,
    data.targetType,
    data.targetId || null,
    data.groupId || null,
    data.taskId || null,
    data.dueAt,
    now,
    now,
  );
  if (actorId) {
    logAudit(
      actorId,
      'deadline_created',
      'deadline',
      id,
      JSON.stringify({ title: data.title, type: data.type, dueAt: data.dueAt }),
    );
  }
  const deadline = getDeadlineById(id);
  if (!deadline) throw new Error(`Failed to retrieve newly created deadline ${id}`);
  return deadline;
}

export function getDeadlineById(id: string): Deadline | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM deadlines WHERE id = ?').get(id) as Deadline | undefined;
}

export function getDeadlinesForCreator(creatorId: string): Deadline[] {
  const db = getDb();
  return db.prepare('SELECT * FROM deadlines WHERE creator_id = ? ORDER BY due_at ASC').all(creatorId) as Deadline[];
}

export function getAllDeadlines(): Deadline[] {
  const db = getDb();
  return db.prepare('SELECT * FROM deadlines ORDER BY due_at ASC').all() as Deadline[];
}

export function updateDeadline(
  id: string,
  data: {
    title?: string;
    description?: string;
    type?: Deadline['type'];
    targetType?: Deadline['target_type'];
    targetId?: string;
    groupId?: string;
    taskId?: string;
    dueAt?: number;
  },
  creatorId: string,
  actorId?: string,
): boolean {
  const db = getDb();
  const existing = getDeadlineById(id);
  if (!existing) return false;
  if (existing.creator_id !== creatorId) {
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(creatorId) as { role: string } | undefined;
    if (user?.role !== 'admin') return false;
  }
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.title !== undefined) {
    fields.push('title = ?');
    values.push(data.title);
  }
  if (data.description !== undefined) {
    fields.push('description = ?');
    values.push(data.description);
  }
  if (data.type !== undefined) {
    fields.push('type = ?');
    values.push(data.type);
  }
  if (data.targetType !== undefined) {
    fields.push('target_type = ?');
    values.push(data.targetType);
  }
  if (data.targetId !== undefined) {
    fields.push('target_id = ?');
    values.push(data.targetId);
  }
  if (data.groupId !== undefined) {
    fields.push('group_id = ?');
    values.push(data.groupId);
  }
  if (data.taskId !== undefined) {
    fields.push('task_id = ?');
    values.push(data.taskId);
  }
  if (data.dueAt !== undefined) {
    fields.push('due_at = ?');
    values.push(data.dueAt);
  }
  fields.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);
  db.prepare(`UPDATE deadlines SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  if (actorId) {
    logAudit(actorId, 'deadline_updated', 'deadline', id, JSON.stringify(data));
  }
  return true;
}

export function deleteDeadline(id: string, creatorId: string, actorId?: string): boolean {
  const db = getDb();
  const existing = getDeadlineById(id);
  if (!existing) return false;
  if (existing.creator_id !== creatorId) {
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(creatorId) as { role: string } | undefined;
    if (user?.role !== 'admin') return false;
  }
  db.prepare('DELETE FROM deadlines WHERE id = ?').run(id);
  if (actorId) {
    logAudit(actorId, 'deadline_deleted', 'deadline', id, JSON.stringify({ title: existing.title }));
  }
  return true;
}
