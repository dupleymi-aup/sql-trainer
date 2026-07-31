import { it } from 'vitest';
import * as fs from 'fs';
import { TRAINING_TASKS } from '@/lib/training-tasks';
import { executeWithSchema } from '@/lib/sql-engine';
import { adaptClickHouseToSQLite } from '@/lib/clickhouse-adapter';
import { adaptPostgreSQLToSQLite } from '@/lib/postgresql-adapter';
import { adaptMySQLToSQLite } from '@/lib/mysql-adapter';

const ids = [
  'ch-6',
  'ch-38',
  'ch-exam-3',
  'pg-24',
  'pg-29',
  'pg-exam-5',
  'pg-18',
  'pg-adv-4',
  'pg-2',
  'pg-3',
  'mysql-18',
];

it('dump adapted', () => {
  let out = '';
  for (const id of ids) {
    const task = TRAINING_TASKS.find((t) => t.id === id);
    if (!task) continue;
    const r = executeWithSchema(
      task.sampleSolution,
      task.schema,
      task.dbType as 'sqlite' | 'postgresql' | 'clickhouse' | 'mysql',
    );
    let adapted = task.sampleSolution;
    if (task.dbType === 'clickhouse') adapted = adaptClickHouseToSQLite(task.sampleSolution);
    if (task.dbType === 'postgresql') adapted = adaptPostgreSQLToSQLite(task.sampleSolution);
    if (task.dbType === 'mysql') adapted = adaptMySQLToSQLite(task.sampleSolution);
    out += `\n===== ${id} error=${r.error} =====\nADAPTED:\n${adapted}\n`;
  }
  fs.writeFileSync(process.env.TEMP + '/adapted-dump.txt', out);
});
