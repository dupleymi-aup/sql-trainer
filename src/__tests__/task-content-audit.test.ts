/**
 * Task Content Audit — executes every training task's schema, sample solution,
 * and verification query against the real execution engines to catch broken
 * tasks (SQL syntax errors, missing columns, empty results, etc.).
 */

import { describe, it, expect, vi } from 'vitest';
import { TRAINING_TASKS } from '@/lib/training-tasks';
import { executeWithSchema } from '@/lib/sql-engine';
import { executeMongoQuery } from '@/lib/mongodb-engine';

// Check if better-sqlite3 native bindings are available before test collection
const sqliteAvailable = vi.hoisted(() => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.exec('SELECT 1');
    db.close();
    return true;
  } catch {
    return false;
  }
});

const describeIf = sqliteAvailable ? describe : describe.skip;

const SQL_DB_TYPES = ['sqlite', 'postgresql', 'clickhouse', 'mysql'] as const;

describeIf('task content audit', () => {
  const sqlTasks = TRAINING_TASKS.filter((t): t is typeof t & { dbType: (typeof SQL_DB_TYPES)[number] } =>
    (SQL_DB_TYPES as readonly string[]).includes(t.dbType),
  );
  const mongoTasks = TRAINING_TASKS.filter((t) => t.dbType === 'mongodb');

  describe('SQL tasks', () => {
    it('has tasks to audit', () => {
      expect(sqlTasks.length).toBeGreaterThan(0);
    });

    it('schema loads without errors', () => {
      const failures: string[] = [];
      for (const task of sqlTasks) {
        const result = executeWithSchema('SELECT 1', task.schema, task.dbType);
        if (!result.success) {
          failures.push(`${task.id}: ${result.error}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('sampleSolution executes without errors', () => {
      const failures: string[] = [];
      for (const task of sqlTasks) {
        const result = executeWithSchema(task.sampleSolution, task.schema, task.dbType);
        if (!result.success) {
          failures.push(`${task.id}: ${result.error}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('sampleSolution produces rows for SELECT queries', () => {
      const failures: string[] = [];
      for (const task of sqlTasks) {
        const trimmed = task.sampleSolution.trim().toUpperCase();
        const isSelect = trimmed.startsWith('SELECT') || trimmed.includes('; SELECT') || trimmed.includes('\nSELECT');
        if (!isSelect) continue;
        const result = executeWithSchema(task.sampleSolution, task.schema, task.dbType);
        if (result.success && result.rows.length === 0) {
          failures.push(`${task.id}: sample SELECT returned 0 rows`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('verificationQuery executes without errors', () => {
      const failures: string[] = [];
      for (const task of sqlTasks) {
        const result = executeWithSchema(task.verificationQuery, task.schema, task.dbType);
        if (!result.success) {
          failures.push(`${task.id}: ${result.error}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('verificationQuery returns rows', () => {
      const failures: string[] = [];
      for (const task of sqlTasks) {
        const result = executeWithSchema(task.verificationQuery, task.schema, task.dbType);
        if (result.success && result.rows.length === 0) {
          failures.push(`${task.id}: verification query returned 0 rows`);
        }
      }
      expect(failures).toEqual([]);
    });
  });

  describe('MongoDB tasks', () => {
    it('has tasks to audit', () => {
      expect(mongoTasks.length).toBeGreaterThan(0);
    });

    it('schema is valid JSON', () => {
      const failures: string[] = [];
      for (const task of mongoTasks) {
        try {
          JSON.parse(task.schema);
        } catch {
          failures.push(`${task.id}: invalid JSON schema`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('sampleSolution executes without errors', () => {
      const failures: string[] = [];
      for (const task of mongoTasks) {
        const result = executeMongoQuery(task.sampleSolution, JSON.parse(task.schema));
        if (!result.success) {
          failures.push(`${task.id}: ${result.error}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('sampleSolution produces rows for find queries', () => {
      const failures: string[] = [];
      for (const task of mongoTasks) {
        const result = executeMongoQuery(task.sampleSolution, JSON.parse(task.schema));
        if (result.success && result.rows.length === 0) {
          failures.push(`${task.id}: sample find returned 0 rows`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('verificationQuery executes without errors', () => {
      const failures: string[] = [];
      for (const task of mongoTasks) {
        const result = executeMongoQuery(task.verificationQuery, JSON.parse(task.schema));
        if (!result.success) {
          failures.push(`${task.id}: ${result.error}`);
        }
      }
      expect(failures).toEqual([]);
    });
  });
});
