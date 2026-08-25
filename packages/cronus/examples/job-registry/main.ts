/**
 * Cronus job-registry demo.
 *
 * Registers a couple of jobs, walks through enable()/disable()/isRunning(),
 * fires jobs by hand with trigger() (so this script never waits on a real
 * minute boundary), shows the per-job overlap guard, and finishes with a
 * schedule-syntax footgun: '*,5' and '5,*' parse to the IDENTICAL
 * day-of-month value set but fire on different days, because the
 * star-flag check that decides "is this field restricted?" only reads
 * the field string's first character.
 *
 * Every claim below is exercised against the real @tundralibs/cronus
 * exports — nothing here is asserted, only printed, so you can read the
 * output and see the described behaviour happen.
 *
 * See ./README.md for exact run commands, and
 * docs/Cronus-Jobs.md / docs/Cronus-Schedule-Syntax.md in the package
 * root for the concepts this walks through.
 */

import { Cronus, parseSchedule } from '@tundralibs/cronus';
import type { CronusRunContext } from '@tundralibs/cronus/types';

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const cron = new Cronus();

// --- 1. Register a couple of jobs with different schedules -------------

cron.add('hourly-cleanup', '0 * * * *', (ctx: CronusRunContext) => {
  console.log(
    `  [hourly-cleanup] run #${ctx.runCount} (triggered=${ctx.triggered})`,
  );
});

// Registered disabled — the ticker skips it until enable() is called.
cron.add('beta-sync', '*/5 * * * *', () => {
  console.log('  [beta-sync] syncing...');
}, { enabled: false });

section('Registration');
for (const job of cron.list()) {
  console.log(
    `  ${job.name}  schedule=${job.schedule}  enabled=${job.enabled}`,
  );
}

// --- 2. enable() / disable() / isRunning() ------------------------------

section('enable() / disable() / isRunning()');
console.log('beta-sync.enabled as registered:', cron.get('beta-sync').enabled); // false
cron.enable('beta-sync');
console.log('beta-sync.enabled after enable():', cron.get('beta-sync').enabled); // true
console.log('beta-sync.isRunning():', cron.isRunning('beta-sync')); // false — nothing has run yet
cron.disable('beta-sync');
console.log(
  'beta-sync.enabled after disable():',
  cron.get('beta-sync').enabled,
); // false
// disable() only stops the TICKER from firing it — trigger() still works,
// demonstrated in step 4 below.

// --- 3. start() / active / stop() — lifecycle, no clock wait ------------

section('start() / active / stop()');
console.log('active before start():', cron.active); // false
cron.start();
console.log('active after start():', cron.active); // true
// start() aligns to the NEXT minute boundary, so nothing has ticked yet —
// stop() here just proves the flag round-trips, not that a job ran.
cron.stop();
console.log('active after stop():', cron.active); // false

// --- 4. trigger() — manual firing, bypasses the schedule ----------------

section('trigger() — manual firing (bypasses the schedule)');
const ranHourly = await cron.trigger('hourly-cleanup');
console.log('trigger(hourly-cleanup) resolved:', ranHourly); // true
console.log(
  'hourly-cleanup runCount now:',
  cron.get('hourly-cleanup').runCount,
); // 1

const ranBeta = await cron.trigger('beta-sync');
console.log('trigger(beta-sync) while disabled resolved:', ranBeta); // true — disabled only blocks the ticker

// --- 5. Overlap guard -----------------------------------------------------

section('Overlap guard (trigger() respects it too)');
cron.add(
  'slow',
  '* * * * *',
  () => new Promise<void>((resolve) => setTimeout(resolve, 50)),
);
const first = cron.trigger('slow'); // starts running — NOT awaited yet
console.log(
  'isRunning(slow) right after calling trigger():',
  cron.isRunning('slow'), // true — __run() sets running=true synchronously
);
const second = await cron.trigger('slow'); // sees running===true, backs off
console.log('second overlapping trigger() resolved:', second); // false — no second run started
console.log('first trigger() resolved:', await first); // true — the original run still completes
console.log('isRunning(slow) once both settle:', cron.isRunning('slow')); // false

// --- 6. Footgun: the star-flag check reads only the FIRST CHARACTER -----

section("Footgun: '*,5' vs '5,*' — identical values, different rule");
// See docs/Cronus-Schedule-Syntax.md#day-of-month-vs-day-of-week-posix-or.
// Day-of-week is pinned to Monday (`1`) in both; only the day-of-month
// list's ORDER changes.
const starLeads = '0 0 *,5 * 1'; // '*' is the FIRST token in the dom list
const starTrails = '0 0 5,* * 1'; // '*' is the LAST token — same values

const domA = [...parseSchedule(starLeads).dayOfMonth].sort((a, b) => a - b);
const domB = [...parseSchedule(starTrails).dayOfMonth].sort((a, b) => a - b);
console.log(
  'day-of-month value sets identical:',
  domA.join(',') === domB.join(','), // true — both cover every day, 1-31
);
console.log(
  'starLeads  domRestricted:',
  parseSchedule(starLeads).domRestricted,
); // false — fields[2] starts with '*'
console.log(
  'starTrails domRestricted:',
  parseSchedule(starTrails).domRestricted,
); // true  — fields[2] starts with '5'

const monday = new Date(2026, 7, 3, 0, 0); // 2026-08-03 — a Monday
const wednesday5th = new Date(2026, 7, 5, 0, 0); // 2026-08-05 — a Wednesday, day-of-month 5

// starLeads: day-of-month counts as UNRESTRICTED, so the rule is AND —
// effectively "Mondays only", which is what the expression looks like.
console.log(
  'starLeads  fires Mon 2026-08-03?',
  Cronus.matches(starLeads, monday),
); // true
console.log(
  'starLeads  fires Wed 2026-08-05?',
  Cronus.matches(starLeads, wednesday5th),
); // false

// starTrails: day-of-month is flagged RESTRICTED (despite covering every
// day), so the POSIX OR rule applies. domOk is trivially true every
// single day, so the OR is always satisfied — this fires DAILY, not just
// "the 5th, or Mondays" the way it reads.
console.log(
  'starTrails fires Mon 2026-08-03?',
  Cronus.matches(starTrails, monday),
); // true
console.log(
  'starTrails fires Wed 2026-08-05?',
  Cronus.matches(starTrails, wednesday5th),
); // true — the footgun
