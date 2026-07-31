import { it } from 'vitest';
import * as fs from 'fs';
import { TRAINING_TASKS } from '@/lib/training-tasks';

const ids = [
  'intermediate-10',
  'advanced-8',
  'advanced-18',
  'advanced-19',
  'advanced-20',
  'advanced-21',
  'advanced-22',
  'advanced-23',
  'advanced-24',
  'advanced-25',
  'advanced-constraints-1',
  'advanced-constraints-2',
  'advanced-constraints-3',
  'advanced-constraints-4',
  'advanced-datatypes-1',
  'advanced-datatypes-2',
  'ch-32',
  'mysql-12',
  'ch-2',
  'ch-3',
  'ch-5',
  'mongo-1',
  'mongo-2',
  'mongo-5',
  'mongo-10',
  'mongo-17',
  'mongo-18',
];

it('dump texts', () => {
  let out = '';
  for (const id of ids) {
    const task = TRAINING_TASKS.find((t) => t.id === id);
    if (!task) continue;
    out += `\n===== ${id} =====\nTITLE: ${task.title}\nTEXT: ${task.taskText}\nHINT: ${task.hint}\n`;
  }
  fs.writeFileSync(process.env.TEMP + '/tasks-dump.txt', out);
});
