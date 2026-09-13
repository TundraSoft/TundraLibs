/**
 * Entity definitions for the project-tracker example.
 *
 * Members (assignees) and Tasks — a SELF-referential entity
 * (`ParentTaskId` points at another row in the same table, giving
 * every task an optional list of subtasks), with a Guardian-validated
 * `Metadata` JSON column, a per-entity read cache, and a blanket-
 * delete guard. See `main.ts` for the runnable scenarios.
 *
 * @module
 */
import { Column, Entity, Schema } from '@tundralibs/norm';
import { Guardian } from '@tundralibs/guardian';

export const Members = Entity('members', {
  Id: Column.uuid().default({ $$_expression: 'UUID' }),
  Name: Column.varchar(80),
  Email: Column.varchar(255),
}, {
  pk: ['Id'],
  unique: { Email: ['Email'] },
});

/** The shape `Metadata` validates against on the way IN — free-form
 * enough to be a real "extra fields" column, strict enough that a
 * typo doesn't silently store garbage. SQLite has no native JSON
 * type, so what comes back on read is the stored JSON TEXT, not a
 * parsed object — `JSON.parse()` it yourself (main.ts scenario 3). */
const TaskMetadata = Guardian.object({
  labels: Guardian.array(Guardian.string()).optional(),
  estimateHours: Guardian.number().min(0).optional(),
});

export const Tasks = Entity('tasks', {
  Id: Column.uuid().default({ $$_expression: 'UUID' }),
  // Self-referential: `model: 'Tasks'` is THIS entity's own registry
  // key. Nullable + SET_NULL — deleting a parent promotes its
  // children to top-level tasks rather than taking them down with it.
  ParentTaskId: Column.uuid().nullable(),
  Title: Column.varchar(160),
  Status: Column.enum(['todo', 'in_progress', 'done']).default('todo'),
  AssigneeId: Column.uuid().nullable(),
  Metadata: Column.json(TaskMetadata).nullable(),
  CreatedAt: Column.timestamp().default(() => new Date()),
}, {
  pk: ['Id'],
  // Read caching: a find()/findOne() on Tasks is served from cache for
  // up to 5 minutes before re-querying the database. Any write through
  // THIS repo invalidates it immediately — the cache is a performance
  // seam, never a staleness risk from norm's own writes.
  cache: 5,
  fk: {
    Parent: {
      model: 'Tasks',
      on: { ParentTaskId: 'Id' },
      reverseAs: 'Subtasks',
      onDelete: 'SET_NULL',
    },
    Assignee: {
      model: 'Members',
      on: { AssigneeId: 'Id' },
      reverseAs: 'AssignedTasks',
      onDelete: 'SET_NULL',
    },
  },
  hooks: {
    // beforeDelete sees the caller's FILTER, never rows (a delete
    // never fetches first) — the one thing it CAN enforce is "was a
    // filter even supplied", which is exactly the guard a task board
    // needs: refuse the "wipe every task" footgun, every per-row
    // delete still goes through untouched.
    beforeDelete: (filter) => {
      if (filter === undefined) {
        throw new Error(
          'refusing delete() with no filter — pass one, or use truncate() ' +
            'if you really mean every row',
        );
      }
    },
  },
});

export const ProjectTrackerSchema = Schema('ProjectTracker', {
  Members,
  Tasks,
});
