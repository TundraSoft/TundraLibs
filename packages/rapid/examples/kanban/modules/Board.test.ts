/**
 * The Board module in isolation — a fresh in-memory store stubbed under
 * the label the module injects, driven as plain method calls through the
 * `@tundralibs/rapid/testing` harness. No HTTP, no timers.
 *
 * @module
 */
import { describe, harness, it } from '../../../testing/mod.ts';
import * as asserts from '@std/asserts';
import { RapidError } from '../../../errors/mod.ts';
import type { RapidContextQuery } from '../../../types/mod.ts';
import { STORE, TaskStore } from '../store.ts';
import type { BoardData, ComposerData } from './views.ts';
import { Board } from './Board.ts';

const boot = () =>
  harness({
    modules: [{ Board }],
    stub: [[STORE, new TaskStore()]],
    context: { name: 'kanban-test', logger: { handlers: [] } },
  });

describe('kanban.Board (unit — fresh store via the testing harness)', () => {
  it('list() groups by lane; ?owner= narrows lanes but not the chip roster', async () => {
      await using h = await boot();
      const all = h.modules.Board.list({} as RapidContextQuery)
        .content as BoardData;
      asserts.assertEquals(all.owners, ['Ada', 'Grace', 'Lin']);
      asserts.assertEquals(all.lanes.todo.length, 3);
      const filtered = h.modules.Board.list(
        { filters: { owner: { $eq: 'Ada' } } } as unknown as RapidContextQuery,
      ).content as BoardData;
      asserts.assertEquals(filtered.owner, 'Ada');
      asserts.assert(
        Object.values(filtered.lanes).flat().every((t) => t.owner === 'Ada'),
      );
      // The chips must keep rendering EVERY owner while filtered.
      asserts.assertEquals(filtered.owners, ['Ada', 'Grace', 'Lin']);
  });

  it('move() walks the lane order, keeps the filter, and 404s/400s loudly', async () => {
      await using h = await boot();
      const start = h.modules.Board.list({} as RapidContextQuery)
        .content as BoardData;
      const task = start.lanes.todo[0]!;
      const after = h.modules.Board.move(task.id, 'fwd', {} as RapidContextQuery)
        .content as BoardData;
      asserts.assert(after.lanes.doing.some((t) => t.id === task.id));
      asserts.assertThrows(
        () => h.modules.Board.move('nope', 'fwd', {} as RapidContextQuery),
        RapidError,
        'Not found',
      );
      asserts.assertThrows(
        () => h.modules.Board.move(task.id, 'sideways', {} as RapidContextQuery),
        RapidError,
      );
  });

  it('addTask() answers the composer union: error keeps values, success lands in todo', async () => {
      await using h = await boot();
      const rejected = h.modules.Board.addTask({ title: '  ', owner: 'Ada' })
        .content as ComposerData;
      asserts.assertEquals(rejected.state, 'error');
      asserts.assertEquals(
        (rejected as { values: { owner: string } }).values.owner,
        'Ada',
      );
      const accepted = h.modules.Board.addTask({
        title: 'Ship it',
        owner: 'Ada',
        tag: 'bug',
      }).content as ComposerData;
      asserts.assertEquals(accepted.state, 'clean');
      const board = h.modules.Board.list({} as RapidContextQuery)
        .content as BoardData;
      const added = board.lanes.todo.find((t) => t.title === 'Ship it');
      asserts.assertEquals(added?.tag, 'bug');
  });
});
