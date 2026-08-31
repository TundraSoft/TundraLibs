/**
 * The Board module — every route the page runs on, plus the teammate
 * bot. One data method per REGION: the page (`/board/ui`) composes the
 * same payloads the fragment routes serve, and every route answers JSON
 * to a plain request (`prefer` defaults to `'json'`) — the whole app is
 * curl-able. Mutations go through the injected {@link TaskStore}, whose
 * activity seam is what makes the live channel fire (wired in main.ts).
 *
 * @module
 */

import { Guardian } from '@tundralibs/guardian';
import { inject } from '@tundralibs/doctor';
import {
  GET,
  JOB,
  Module,
  param,
  payload,
  POST,
  query,
} from '../../../decorators/mod.ts';
import { RapidError } from '../../../errors/mod.ts';
import { formState } from '../../../ui/mod.ts';
import { RapidModule } from '../../../modules/mod.ts';
import type {
  RapidContextQuery,
  RapidContextResponse,
} from '../../../types/mod.ts';
import { STORE } from '../store.ts';
import type { Task } from '../types.ts';
import {
  ActivityView,
  AppView,
  BoardView,
  ComposerView,
  Chrome,
  PrintView,
  StatsView,
} from './views.ts';

/** The bot's occasional new cards — ops chatter for the demo. */
const BOT_CARDS = [
  'Investigate the 3am latency blip',
  'Bump the runtime cache headers',
  'Triage the flaky reconnect report',
  'Refresh the on-call runbook',
];

/** What a filed card must look like — validates AND documents the body. */
const TaskBody = Guardian.object({
  title: Guardian.string().trim().minLength(1, 'A card needs a title.'),
  owner: Guardian.string().trim().optional(),
  tag: Guardian.string().test(
    (t) => ['feature', 'bug', 'ops'].includes(t),
    'tag must be feature, bug or ops',
  ).optional(),
});

// `layout` is the module's TIER-2 chrome, nesting inside the app core
// (main.ts's `ui: { core: BoardCore }`); /print below opts out of it.
@Module({ prefix: '/board', layout: Chrome })
export class Board extends RapidModule {
  readonly name = 'Board';
  readonly namespace = 'board';
  protected readonly events = {};
  protected readonly _store = inject(STORE);

  /** `?owner=` as the chips send it (empty string = no filter). */
  private __owner(query?: RapidContextQuery): string | undefined {
    const owner = (query?.filters?.['owner'] as { $eq?: string } | undefined)
      ?.$eq;
    return owner ? owner : undefined;
  }

  private __board(query?: RapidContextQuery) {
    const owner = this.__owner(query);
    return {
      lanes: this._store.lanes(owner),
      owners: this._store.owners(),
      ...(owner !== undefined ? { owner } : {}),
    };
  }

  // The board region — fragment on a swap, JSON otherwise. The chips
  // filter by `?owner=` via withQuery; the move buttons re-request this
  // same shape through their own route below.
  @GET('/', {
    bind: [query()],
    description: 'The board: tasks per lane, owners, active filter.',
    template: BoardView,
  })
  list(query: RapidContextQuery): RapidContextResponse {
    return { content: this.__board(query) };
  }

  // The PAGE — one payload feeding AppView, which composes the fragment
  // templates, all wrapped in the module layout (prefer: 'html').
  @GET('/ui', {
    bind: [query()],
    description: 'The Flightdeck page — the same regions, composed.',
    template: { render: AppView, prefer: 'html' },
  })
  page(query: RapidContextQuery): RapidContextResponse {
    return {
      content: {
        ...this.__board(query),
        counts: this._store.counts(),
        rows: this._store.activity(),
      },
    };
  }

  // The PRINT view: `layout: false` opts this one route out of the
  // module chrome — straight into the core (document + css, no
  // masthead, no composer). Same board data, same ?owner= filter.
  @GET('/print', {
    bind: [query()],
    description: 'A print-friendly board snapshot.',
    template: {
      render: PrintView,
      prefer: 'html',
      layout: false,
      title: 'Flightdeck — print',
    },
  })
  print(query: RapidContextQuery): RapidContextResponse {
    return { content: this.__board(query) };
  }

  @GET('/stats', {
    description: 'Lane tallies (the stats rail).',
    template: StatsView,
  })
  stats(): RapidContextResponse {
    return { content: { counts: this._store.counts() } };
  }

  @GET('/activity', {
    description: 'Newest-first activity feed.',
    template: ActivityView,
  })
  activity(): RapidContextResponse {
    return { content: { rows: this._store.activity() } };
  }

  // The composer POST answers with the COMPOSER fragment: its error
  // union re-renders the form (status 200 — the runtime never swaps a
  // non-2xx, so recoverable input problems are state, not failures);
  // success returns a clean form. app.js then chains the board + stats
  // refreshes off the form's own rapid:swapped.
  // The composer POST answers with the COMPOSER fragment: `formState()`
  // runs the schema and, on failure, hands back the union's error arm
  // ready to render (message + per-field problems + the values kept, as
  // a 200 — the runtime never swaps a non-2xx, so recoverable input
  // problems are state, not failures). Success returns a clean form;
  // app.js chains the board + stats refreshes off rapid:swapped.
  @POST('/tasks', {
    bind: [payload()],
    description: 'File a card. Fields: title, owner, tag.',
    template: ComposerView,
  })
  async addTask(body: unknown): Promise<RapidContextResponse> {
    const form = await formState(TaskBody, body);
    if (!form.ok) return { content: form.error };
    const { title, owner, tag } = form.data;
    this._store.add(
      title,
      owner || 'Unassigned',
      (tag ?? 'feature') as 'feature' | 'bug' | 'ops', // test() proved it
    );
    return { content: { state: 'clean' } };
  }

  // Moves ride the URL entirely (`:dir:` is a param, the filter comes
  // along as `?owner=` via withQuery), so the buttons need no body —
  // and the response is the SAME board payload the GET serves, filter
  // intact, for the button's outer swap of `#board`.
  @POST('/tasks/:id:/move/:dir:', {
    bind: [param('id'), param('dir'), query()],
    description: 'Advance a card one lane (`fwd`) or pull it back.',
    template: BoardView,
  })
  move(id: string, dir: string, query: RapidContextQuery): RapidContextResponse {
    if (dir !== 'fwd' && dir !== 'back') {
      throw new RapidError('RAPID_VALIDATION_FAILED', {
        details: { fields: { dir: "must be 'fwd' or 'back'" } },
      });
    }
    const moved = this._store.move(id, dir);
    if (moved === undefined) {
      throw new RapidError('RAPID_NOT_FOUND', { details: { id } });
    }
    return { content: this.__board(query) };
  }

  // The teammate bot — a real cron job; main.ts also triggers it on a
  // short interval so the demo never sits still. Its store mutations
  // broadcast through the same activity seam as everyone else's.
  @JOB('bot', '* * * * *')
  bot(): RapidContextResponse {
    const candidate = this._store.candidate();
    let task: Task | undefined;
    if (candidate !== undefined && Math.random() < 0.7) {
      task = this._store.move(candidate.id, 'fwd');
    } else {
      task = this._store.add(
        BOT_CARDS[Math.floor(Math.random() * BOT_CARDS.length)]!,
        'Bot',
        'ops',
      );
    }
    return { content: { id: task?.id ?? null } };
  }
}
