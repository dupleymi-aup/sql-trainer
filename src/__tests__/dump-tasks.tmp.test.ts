import { it } from 'vitest';
import { TRAINING_TASKS } from '@/lib/training-tasks';

const ids = [
  'intermediate-10',
  'intermediate-17',
  'intermediate-18',
  'intermediate-20',
  'intermediate-21',
  'intermediate-22',
  'mysql-5',
  'mysql-6',
  'mysql-7',
  'mysql-12',
  'mysql-13',
  'mysql-16',
  'mysql-17',
  'mysql-18',
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
  'advanced-json-2',
  'advanced-json-3',
  'exam-a5',
  'analytics-b2',
  'analytics-i1',
  'analytics-i4',
  'analytics-i5',
  'analytics-a2',
  'analytics-a4',
  'analytics-a5',
  'ch-2',
  'ch-3',
  'ch-4',
  'ch-5',
  'ch-6',
  'ch-32',
  'ch-33',
  'ch-38',
  'ch-39',
  'ch-42',
  'ch-44',
  'ch-45',
  'ch-46',
  'ch-exam-3',
  'ch-beginner-3',
  'ch-intermediate-1',
  'ch-intermediate-2',
  'ch-intermediate-4',
  'ch-advanced-1',
  'ch-advanced-2',
  'pg-2',
  'pg-3',
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
];

it('dump', () => {
  for (const id of ids) {
    const task = TRAINING_TASKS.find((t) => t.id === id);
    if (!task) {
      console.log(`\n===== ${id}: NOT FOUND =====`);
      continue;
    }
    console.log(`\n===== ${id} [${task.dbType}/${task.difficulty}] ${task.title} =====`);
    console.log(`SCHEMA: ${task.schema.replace(/\s+/g, ' ').slice(0, 200)}`);
    console.log(`SAMPLE: ${task.sampleSolution.replace(/\s+/g, ' ')}`);
    console.log(`VERIFY: ${task.verificationQuery.replace(/\s+/g, ' ')}`);
  }
});
