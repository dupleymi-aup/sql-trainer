import { it } from 'vitest';
import * as fs from 'fs';
import { TRAINING_TASKS } from '@/lib/training-tasks';
import { executeWithSchema } from '@/lib/sql-engine';

const ids = [
  'ch-44',
  'ch-exam-3',
  'ch-38',
  'ch-6',
  'ch-33',
  'ch-4',
  'ch-39',
  'ch-42',
  'ch-45',
  'ch-46',
  'ch-32',
  'analytics-i4',
  'analytics-i5',
  'ch-intermediate-2',
  'ch-intermediate-4',
  'ch-advanced-2',
  'pg-10',
  'pg-12',
  'pg-18',
  'pg-23',
  'pg-24',
  'pg-26',
  'pg-27',
  'pg-28',
  'pg-29',
  'pg-adv-4',
  'pg-exam-5',
  'pg-exam-9',
  'mysql-5',
  'mysql-6',
  'mysql-13',
  'mysql-16',
  'mysql-17',
  'advanced-18',
  'advanced-19',
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
    out += `\n===== ${id} error=${r.error} =====\n${task.sampleSolution}\n`;
  }
  fs.writeFileSync(process.env.TEMP + '/adapted-dump.txt', out);
});
