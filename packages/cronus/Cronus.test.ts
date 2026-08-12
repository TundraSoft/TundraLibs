/**
 * @fileoverview The scheduler: registration + validation, run-now
 * (`trigger`), the overlap guard (a job in flight is not re-entered),
 * one-shot auto-removal, the event lifecycle, and error isolation.
 * Firing logic is tested via `trigger` and the pure matcher — no test
 * waits a real minute.
 * @module
 */

import * as asserts from '@std/asserts';
import { afterEach, describe, it } from '@tundralibs/compat/test';
import { Cronus } from './mod.ts';
import {
  DuplicateJobError,
  InvalidActionError,
  InvalidScheduleError,
  JobNotFoundError,
} from './errors/mod.ts';

const defer = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('cronus.Cronus', () => {
  let cron: Cronus;
  afterEach(() => {
    cron?.stop();
  });

  describe('registration', () => {
    it('adds, reads, lists, and removes jobs', () => {
      cron = new Cronus();
      cron.add('a', '* * * * *', () => {});
      cron.add('b', '0 6 * * *', () => {});
      asserts.assertEquals(cron.size, 2);
      asserts.assert(cron.has('a'));
      asserts.assertEquals(cron.get('a').schedule, '* * * * *');
      asserts.assertEquals(cron.list().map((j) => j.name).sort(), ['a', 'b']);
      cron.remove('a');
      asserts.assert(!cron.has('a'));
      asserts.assertEquals(cron.size, 1);
    });

    it('validates loudly', () => {
      cron = new Cronus();
      cron.add('dup', '* * * * *', () => {});
      asserts.assertThrows(
        () => cron.add('dup', '* * * * *', () => {}),
        DuplicateJobError,
      );
      asserts.assertThrows(
        () => cron.add('bad', 'not a cron', () => {}),
        InvalidScheduleError,
      );
      asserts.assertThrows(
        () => cron.add('nofn', '* * * * *', 'x' as unknown as () => void),
        InvalidActionError,
      );
      asserts.assertThrows(() => cron.get('missing'), JobNotFoundError);
      asserts.assertThrows(() => cron.remove('missing'), JobNotFoundError);
      asserts.assertThrows(() => cron.enable('missing'), JobNotFoundError);
    });

    it('enable/disable toggles the flag', () => {
      cron = new Cronus();
      cron.add('a', '* * * * *', () => {}, { enabled: false });
      asserts.assertEquals(cron.get('a').enabled, false);
      cron.enable('a');
      asserts.assertEquals(cron.get('a').enabled, true);
      cron.disable('a');
      asserts.assertEquals(cron.get('a').enabled, false);
    });
  });

  describe('trigger (run-now)', () => {
    it('runs a job immediately, bypassing the schedule', async () => {
      cron = new Cronus();
      let ran = 0;
      cron.add('now', '0 0 1 1 *', () => { // Jan 1 — would rarely fire
        ran++;
      });
      const fired = await cron.trigger('now');
      asserts.assertEquals(fired, true);
      asserts.assertEquals(ran, 1);
      asserts.assertEquals(cron.get('now').runCount, 1);
    });

    it('runs even a DISABLED job', async () => {
      cron = new Cronus();
      let ran = false;
      cron.add('d', '* * * * *', () => {
        ran = true;
      }, { enabled: false });
      asserts.assertEquals(await cron.trigger('d'), true);
      asserts.assert(ran);
    });

    it('marks the run as triggered in the context', async () => {
      cron = new Cronus();
      let sawTriggered: boolean | undefined;
      cron.add('t', '* * * * *', (ctx) => {
        sawTriggered = ctx.triggered;
      });
      await cron.trigger('t');
      asserts.assertEquals(sawTriggered, true);
    });

    it('throws for an unknown job', async () => {
      cron = new Cronus();
      await asserts.assertRejects(
        () => cron.trigger('ghost'),
        JobNotFoundError,
      );
    });
  });

  describe('overlap prevention', () => {
    it('does not re-enter a job already running (trigger resolves false)', async () => {
      cron = new Cronus();
      let concurrent = 0;
      let maxConcurrent = 0;
      cron.add('slow', '* * * * *', async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await defer(60);
        concurrent--;
      });
      const first = cron.trigger('slow'); // in flight
      await defer(10);
      const second = await cron.trigger('slow'); // should be skipped
      asserts.assertEquals(second, false);
      asserts.assert(cron.isRunning('slow'));
      await first;
      asserts.assertEquals(maxConcurrent, 1); // never concurrent
      asserts.assertEquals(cron.get('slow').runCount, 1); // the skip did not count
    });
  });

  describe('one-shot', () => {
    it('runs once then auto-removes', async () => {
      cron = new Cronus();
      let ran = 0;
      cron.addOnce('once', '* * * * *', () => {
        ran++;
      });
      asserts.assert(cron.has('once'));
      await cron.trigger('once');
      asserts.assertEquals(ran, 1);
      asserts.assert(!cron.has('once')); // gone after its single run
    });

    it('removes even when the single run throws', async () => {
      cron = new Cronus();
      cron.addOnce('boom', '* * * * *', () => {
        throw new Error('once-and-done');
      });
      cron.on('error', () => {}); // swallow
      await cron.trigger('boom');
      asserts.assert(!cron.has('boom'));
    });
  });

  describe('events & error isolation', () => {
    it('emits run → success → finish with timing and result', async () => {
      cron = new Cronus();
      const seen: string[] = [];
      let result: unknown;
      cron.on('run', () => seen.push('run'));
      cron.on('success', (_id, _n, _at, _ms, r) => {
        seen.push('success');
        result = r;
      });
      cron.on('finish', () => seen.push('finish'));
      cron.add('ok', '* * * * *', () => 42);
      await cron.trigger('ok');
      asserts.assertEquals(seen, ['run', 'success', 'finish']);
      asserts.assertEquals(result, 42);
    });

    it('routes a throwing action to error (never escapes) then finish', async () => {
      cron = new Cronus();
      const seen: string[] = [];
      let normalized: unknown;
      cron.on('error', (_id, _n, _at, _ms, err) => {
        seen.push('error');
        normalized = err;
      });
      cron.on('finish', () => seen.push('finish'));
      cron.add('bad', '* * * * *', () => {
        throw new Error('kaput');
      });
      // trigger must NOT reject — the error is an event, not a throw.
      const fired = await cron.trigger('bad');
      asserts.assertEquals(fired, true);
      asserts.assertEquals(seen, ['error', 'finish']);
      asserts.assertEquals((normalized as Error).message, 'kaput');
    });
  });

  describe('listener containment', () => {
    // Silence the containment report and count invocations.
    const muteConsole = () => {
      const original = console.error;
      let calls = 0;
      console.error = () => {
        calls++;
      };
      return { restore: () => (console.error = original), calls: () => calls };
    };

    it('a throwing run listener cannot wedge the job', async () => {
      const mute = muteConsole();
      try {
        cron = new Cronus();
        let ran = 0;
        cron.on('run', () => {
          throw new Error('bad listener');
        });
        cron.add('victim', '* * * * *', () => {
          ran++;
        });
        // trigger resolves (never rejects), the action RAN, and the
        // job is not stuck running.
        asserts.assertEquals(await cron.trigger('victim'), true);
        asserts.assertEquals(ran, 1);
        asserts.assertEquals(cron.isRunning('victim'), false);
        asserts.assertEquals(await cron.trigger('victim'), true);
        asserts.assertEquals(ran, 2);
        asserts.assert(mute.calls() >= 2); // contained + reported
      } finally {
        mute.restore();
      }
    });

    it('a throwing success listener is not misclassified as job failure', async () => {
      const mute = muteConsole();
      try {
        cron = new Cronus();
        let errorEvent = false;
        cron.on('success', () => {
          throw new Error('listener bug');
        });
        cron.on('error', () => {
          errorEvent = true;
        });
        cron.add('ok', '* * * * *', () => 42);
        asserts.assertEquals(await cron.trigger('ok'), true);
        asserts.assertEquals(errorEvent, false);
      } finally {
        mute.restore();
      }
    });

    it('a throwing finish listener cannot block once-cleanup', async () => {
      const mute = muteConsole();
      try {
        cron = new Cronus();
        cron.on('finish', () => {
          throw new Error('finish bug');
        });
        cron.addOnce('once', '* * * * *', () => {});
        await cron.trigger('once');
        asserts.assert(!cron.has('once'));
      } finally {
        mute.restore();
      }
    });

    it('a throwing error listener leaves trigger resolved', async () => {
      const mute = muteConsole();
      try {
        cron = new Cronus();
        cron.on('error', () => {
          throw new Error('error-listener bug');
        });
        cron.add('bad', '* * * * *', () => {
          throw new Error('job failure');
        });
        asserts.assertEquals(await cron.trigger('bad'), true);
        asserts.assertEquals(cron.isRunning('bad'), false);
      } finally {
        mute.restore();
      }
    });
  });

  describe('round-2 hardening', () => {
    const mute = () => {
      const original = console.error;
      let calls = 0;
      console.error = () => {
        calls++;
      };
      return { restore: () => (console.error = original), calls: () => calls };
    };

    it('an ASYNC rejecting listener is contained (no unhandled rejection)', async () => {
      const m = mute();
      try {
        cron = new Cronus();
        cron.on('success', async () => {
          throw new Error('async listener boom');
        });
        cron.add('j', '* * * * *', () => 42);
        asserts.assertEquals(await cron.trigger('j'), true);
        await defer(5); // let the rejection land in the isolation wrapper
        asserts.assert(m.calls() >= 1); // reported, not fatal
      } finally {
        m.restore();
      }
    });

    it('a re-entrant trigger from a success listener hits the guard', async () => {
      cron = new Cronus();
      let runs = 0;
      let reentrant: boolean | undefined;
      cron.add('j', '* * * * *', () => {
        runs++;
      });
      cron.on('success', () => {
        void cron.trigger('j').then((fired) => {
          reentrant ??= fired;
        });
      });
      await cron.trigger('j');
      await defer(5);
      asserts.assertEquals(reentrant, false); // guard held through emits
      asserts.assertEquals(runs, 1);
    });

    it('a finish listener re-triggering a ONCE job cannot crash', async () => {
      cron = new Cronus();
      let outcome: unknown = 'pending';
      cron.addOnce('o', '* * * * *', () => {});
      cron.on('finish', () => {
        void cron.trigger('o').then(
          (fired) => (outcome = fired),
          (err) => (outcome = err),
        );
      });
      await cron.trigger('o');
      await defer(5);
      // Still registered during finish → guard says false; no rejection.
      asserts.assertEquals(outcome, false);
      asserts.assert(!cron.has('o')); // cleanup still happened after
    });

    it('a job mutating its scheduledAt cannot corrupt sibling matching', async () => {
      class ManualCronus extends Cronus {
        public tick(at: Date): void {
          this._tick(at);
        }
      }
      const manual = new ManualCronus();
      let victimRan = false;
      manual.add('evil', '30 10 * * *', (ctx) => {
        ctx.scheduledAt.setMinutes(31);
      });
      manual.add('victim', '30 10 * * *', () => {
        victimRan = true;
      });
      manual.tick(new Date(2026, 0, 1, 10, 30));
      await defer(5);
      asserts.assert(victimRan);
    });

    it('a job added DURING a tick does not run in that tick', () => {
      class ManualCronus extends Cronus {
        public tick(at: Date): void {
          this._tick(at);
        }
      }
      const manual = new ManualCronus();
      let lateRan = false;
      manual.add('first', '* * * * *', () => {
        manual.add('late', '* * * * *', () => {
          lateRan = true;
        });
      });
      manual.tick(new Date(2026, 0, 1, 0, 0));
      asserts.assertEquals(lateRan, false); // waits for the next minute
      asserts.assert(manual.has('late'));
    });

    it('a forward-poisoned watermark self-heals (clock-change resync)', async () => {
      class ManualCronus extends Cronus {
        public tick(at: Date): void {
          this._tick(at);
        }
      }
      const manual = new ManualCronus();
      let runs = 0;
      manual.add('j', '* * * * *', () => {
        runs++;
      });
      manual.tick(new Date(Date.now() + 365 * 24 * 3600 * 1000)); // +1 year
      await defer(5);
      asserts.assertEquals(runs, 1);
      manual.tick(new Date()); // NOW — a year "behind" → resync, not wedge
      await defer(5);
      asserts.assertEquals(runs, 2);
    });

    it('off(original) removes a once listener (wrapper translation)', async () => {
      cron = new Cronus();
      let fired = 0;
      const listener = () => {
        fired++;
      };
      cron.once('success', listener);
      cron.off('success', listener);
      cron.add('j', '* * * * *', () => {});
      await cron.trigger('j');
      asserts.assertEquals(fired, 0);
    });

    it('a throwing listener does not stop OTHER listeners (isolation)', async () => {
      const m = mute();
      try {
        cron = new Cronus();
        let secondRan = false;
        cron.on('success', () => {
          throw new Error('first listener');
        });
        cron.on('success', () => {
          secondRan = true;
        });
        cron.add('j', '* * * * *', () => {});
        await cron.trigger('j');
        asserts.assertEquals(secondRan, true);
      } finally {
        m.restore();
      }
    });
  });

  describe('registration identity', () => {
    it('a stale once-run cannot delete a NEW same-name job', async () => {
      cron = new Cronus();
      cron.addOnce('x', '* * * * *', async () => {
        await defer(60);
      });
      const inflight = cron.trigger('x');
      await defer(10);
      cron.remove('x'); // replace mid-flight
      cron.add('x', '0 6 * * *', () => {});
      await inflight; // old once-run settles
      asserts.assert(cron.has('x')); // the NEW registration survives
      asserts.assertEquals(cron.get('x').schedule, '0 6 * * *');
    });
  });

  describe('snapshots', () => {
    it('get() returns copies — mutating lastRun cannot corrupt state', async () => {
      cron = new Cronus();
      cron.add('j', '* * * * *', () => {});
      await cron.trigger('j');
      const info = cron.get('j');
      const original = info.lastRun!.getTime();
      info.lastRun!.setTime(0);
      asserts.assertEquals(cron.get('j').lastRun!.getTime(), original);
    });

    it('lastRun/runCount stamp at run START (documented semantics)', async () => {
      cron = new Cronus();
      let during: { runCount: number; lastRun: Date | null } | undefined;
      cron.add('j', '* * * * *', () => {
        during = cron.get('j');
      });
      await cron.trigger('j');
      asserts.assertEquals(during!.runCount, 1);
      asserts.assert(during!.lastRun !== null);
    });
  });

  describe('ticker', () => {
    /** Drive the protected _tick seam from a controlled clock. */
    class ManualCronus extends Cronus {
      public tick(at: Date): void {
        this._tick(at);
      }
    }
    const minute = (n: number) => new Date(n * 60_000);
    /**
     * A Date whose EPOCH is offset but whose wall-clock reading is
     * cloned from `src` — how a DST fall-back looks to the matcher.
     */
    const wallClone = (src: Date, epochOffsetMs: number): Date => {
      const d = new Date(src.getTime() + epochOffsetMs);
      const methods = [
        'getFullYear',
        'getMonth',
        'getDate',
        'getDay',
        'getHours',
        'getMinutes',
      ] as const;
      for (const m of methods) {
        // deno-lint-ignore no-explicit-any
        (d as any)[m] = () => (src as any)[m]();
      }
      return d;
    };

    it('fires matching jobs and honours enabled', () => {
      const manual = new ManualCronus();
      let ran = 0;
      manual.add('a', '* * * * *', () => {
        ran++;
      });
      manual.add('b', '* * * * *', () => {
        ran += 100;
      }, { enabled: false });
      manual.tick(minute(1000));
      asserts.assertEquals(ran, 1); // a fired, disabled b did not
    });

    it('never evaluates the same minute twice (double-fire guard)', () => {
      const manual = new ManualCronus();
      let ran = 0;
      manual.add('a', '* * * * *', () => {
        ran++;
      });
      manual.tick(minute(1000));
      manual.tick(minute(1000)); // duplicate boundary
      manual.tick(new Date(1000 * 60_000 + 30_000)); // same minute, +30s
      asserts.assertEquals(ran, 1);
    });

    it('never re-fires after a wall-clock step backwards', async () => {
      const manual = new ManualCronus();
      let ran = 0;
      manual.add('a', '* * * * *', () => {
        ran++;
      });
      manual.tick(minute(1000));
      await defer(1); // let the sync run settle (running=false)
      manual.tick(minute(998)); // NTP stepped back — must not re-fire
      asserts.assertEquals(ran, 1);
      manual.tick(minute(1001));
      asserts.assertEquals(ran, 2);
    });

    it('skips a still-running job and resumes after it finishes', async () => {
      const manual = new ManualCronus();
      const skips: string[] = [];
      manual.on('skip', (name) => skips.push(name));
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      let runs = 0;
      manual.add('slow', '* * * * *', async () => {
        runs++;
        await gate;
      });
      manual.tick(minute(1)); // starts the slow run
      manual.tick(minute(2)); // still running → skip
      manual.tick(minute(3)); // still running → skip
      asserts.assertEquals(runs, 1);
      asserts.assertEquals(skips, ['slow', 'slow']);
      release();
      await defer(1);
      manual.tick(minute(4)); // finished → resumes
      asserts.assertEquals(runs, 2);
    });

    it('a throwing skip listener cannot kill the tick loop', async () => {
      const original = console.error;
      console.error = () => {};
      try {
        const manual = new ManualCronus();
        let laterJobRan = false;
        manual.on('skip', () => {
          throw new Error('skip bug');
        });
        manual.add('slow', '* * * * *', async () => {
          await defer(200);
        });
        manual.add('later', '* * * * *', () => {
          laterJobRan = true;
        });
        manual.tick(minute(1)); // starts slow AND later
        await defer(1); // later (sync) settles; slow stays in flight
        laterJobRan = false;
        manual.tick(minute(2)); // slow skips (listener throws), later must still run
        asserts.assertEquals(laterJobRan, true);
      } finally {
        console.error = original;
      }
    });

    it('DST fall-back: a fixed-time job fires ONCE in the repeated hour', async () => {
      const manual = new ManualCronus();
      let runs = 0;
      manual.add('nightly', '30 1 * * *', () => {
        runs++;
      });
      const firstPass = new Date(2026, 10, 1, 1, 30); // 01:30, first time
      manual.tick(firstPass);
      await defer(1);
      asserts.assertEquals(runs, 1);
      // One physical hour later the wall clock reads 01:30 AGAIN.
      manual.tick(wallClone(firstPass, 3_600_000));
      await defer(1);
      asserts.assertEquals(runs, 1); // no double-fire
      // Next day's 01:30 is a different local key — fires normally.
      manual.tick(new Date(2026, 10, 2, 1, 30));
      await defer(1);
      asserts.assertEquals(runs, 2);
    });

    it('DST fall-back: wildcard jobs keep firing every physical minute', async () => {
      const manual = new ManualCronus();
      let every = 0;
      let hourly = 0;
      manual.add('heartbeat', '* * * * *', () => {
        every++;
      });
      manual.add('on-the-half', '30 * * * *', () => {
        hourly++; // minute fixed, hour WILDCARD → not a fixed-time job
      });
      const firstPass = new Date(2026, 10, 1, 1, 30);
      manual.tick(firstPass);
      await defer(1);
      manual.tick(wallClone(firstPass, 3_600_000)); // repeated 01:30
      await defer(1);
      asserts.assertEquals(every, 2); // Vixie parity: wildcards run through
      asserts.assertEquals(hourly, 2);
    });

    it('a stale timer chain dies after stop()/start() (no double ticker)', () => {
      const realSetTimeout = globalThis.setTimeout;
      const arms: Array<() => void> = [];
      // deno-lint-ignore no-explicit-any
      (globalThis as any).setTimeout = (cb: () => void, _ms?: number) => {
        arms.push(cb);
        return 0;
      };
      try {
        cron = new Cronus();
        cron.add('a', '* * * * *', () => {});
        cron.start();
        asserts.assertEquals(arms.length, 1); // chain A armed
        cron.stop();
        cron.start();
        asserts.assertEquals(arms.length, 2); // chain B armed
        const before = arms.length;
        arms[0]!(); // stale chain A fires — must NOT re-arm
        asserts.assertEquals(arms.length, before);
        arms[1]!(); // current chain B fires — re-arms exactly once
        asserts.assertEquals(arms.length, before + 1);
      } finally {
        globalThis.setTimeout = realSetTimeout;
      }
    });
  });

  describe('lifecycle', () => {
    it('start()/stop() toggle active and are idempotent', () => {
      cron = new Cronus();
      asserts.assertEquals(cron.active, false);
      cron.start().start();
      asserts.assertEquals(cron.active, true);
      cron.stop().stop();
      asserts.assertEquals(cron.active, false);
    });

    it('static validators', () => {
      asserts.assertEquals(Cronus.isValid('*/5 * * * *'), true);
      asserts.assertEquals(Cronus.isValid('nope'), false);
      asserts.assertEquals(
        Cronus.matches('30 6 * * *', new Date(2026, 0, 1, 6, 30)),
        true,
      );
    });
  });
});
