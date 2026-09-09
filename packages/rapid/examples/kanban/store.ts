/**
 * The board's data layer — a seeded IN-MEMORY store behind a doctor
 * label, deliberately database-free: where the blog example shows the
 * full norm/SQLite stack, this one keeps every moving part in the UI
 * story. The module pulls it with an `inject(STORE)` field initializer
 * (stock the label BEFORE `app.modules()`); tests stock a fresh store
 * under the same label.
 *
 * @module
 */
import { Doctor, label } from '@tundralibs/doctor';
import { type Activity, type Lane, LANES, type Task } from './types.ts';

const SEED: [string, string, Task['tag'], Lane][] = [
  ['Wire the burn-rate alert to the pager', 'Ada', 'ops', 'todo'],
  ['Ship the fragment-swap onboarding tour', 'Grace', 'feature', 'todo'],
  ['Login form drops the CSRF cookie on Safari', 'Lin', 'bug', 'todo'],
  ['Rate-limit the export endpoint', 'Ada', 'feature', 'doing'],
  ['Flaky websocket reconnect in the e2e suite', 'Grace', 'bug', 'doing'],
  ['Rotate the staging TLS certificates', 'Lin', 'ops', 'review'],
  ['Dark-mode palette for the settings pane', 'Grace', 'feature', 'review'],
  ['Dashboard 500s on an empty date range', 'Ada', 'bug', 'done'],
  ['Archive last quarter’s audit logs', 'Lin', 'ops', 'done'],
];

/** Board state + an activity ring. One instance per process (or test). */
export class TaskStore {
  private __tasks = new Map<string, Task>();
  private __activity: Activity[] = [];
  private __listeners: ((entry: Activity) => void)[] = [];
  private __seq = 0;

  constructor() {
    for (const [title, owner, tag, lane] of SEED) {
      this.add(title, owner, tag, lane);
    }
    this.__activity = [];
  }

  /**
   * The broadcast seam: module handlers and the bot job all mutate
   * through this store, so the COMPOSITION ROOT (main.ts) taps one
   * callback and forwards every change to `app.publish` — modules never
   * need a handle on the app to make the live channel fire.
   */
  onActivity(listener: (entry: Activity) => void): void {
    this.__listeners.push(listener);
  }

  /** Everyone who owns a card — the filter chips render from this. */
  owners(): string[] {
    return [...new Set([...this.__tasks.values()].map((t) => t.owner))].sort();
  }

  /** Tasks grouped by lane, oldest first; `owner` narrows every lane. */
  lanes(owner?: string): Record<Lane, Task[]> {
    const out: Record<Lane, Task[]> = {
      todo: [],
      doing: [],
      review: [],
      done: [],
    };
    for (const task of this.__tasks.values()) {
      if (owner === undefined || task.owner === owner) out[task.lane].push(task);
    }
    return out;
  }

  /** Card count per lane, unfiltered — the stats rail's numbers. */
  counts(): Record<Lane, number> {
    const out: Record<Lane, number> = { todo: 0, doing: 0, review: 0, done: 0 };
    for (const task of this.__tasks.values()) out[task.lane]++;
    return out;
  }

  add(title: string, owner: string, tag: Task['tag'], lane: Lane = 'todo'): Task {
    const task: Task = {
      id: `t${++this.__seq}`,
      title,
      owner,
      tag,
      lane,
      updatedAt: new Date().toISOString(),
    };
    this.__tasks.set(task.id, task);
    this.__log(`${owner} filed “${title}”`);
    return task;
  }

  /** Walk the card one lane forward/back; undefined = no such move. */
  move(id: string, dir: 'fwd' | 'back'): Task | undefined {
    const task = this.__tasks.get(id);
    if (task === undefined) return undefined;
    const at = LANES.indexOf(task.lane);
    const next = LANES[at + (dir === 'fwd' ? 1 : -1)];
    if (next === undefined) return undefined;
    task.lane = next;
    task.updatedAt = new Date().toISOString();
    this.__log(`${task.owner} moved “${task.title}” to ${next}`);
    return task;
  }

  /** A random task the bot may advance (anything not yet done). */
  candidate(): Task | undefined {
    const open = [...this.__tasks.values()].filter((t) => t.lane !== 'done');
    return open[Math.floor(Math.random() * open.length)];
  }

  /** Newest-first activity, capped at the ring size. */
  activity(): Activity[] {
    return this.__activity;
  }

  private __log(text: string): void {
    const entry = { at: new Date().toISOString(), text };
    this.__activity.unshift(entry);
    this.__activity.length = Math.min(this.__activity.length, 12);
    for (const listener of this.__listeners) listener(entry);
  }
}

/** The shared store, stocked at boot (tests stock their own). */
export const STORE = label<TaskStore>('TaskStore');

/** Bind a store instance to the label the module injects. */
export function registerKanbanServices(store: TaskStore): void {
  Doctor.stock(STORE, store);
}
