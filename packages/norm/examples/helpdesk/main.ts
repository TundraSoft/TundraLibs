/**
 * Helpdesk — support-ticket backend, over an in-memory SQLite database.
 *
 *   schema.ts   Agents (salted PBKDF2 login credential), Tickets (SLA
 *               due date from a hook, idempotent webhook ingestion),
 *               TicketNotes (one-to-many, two independent FKs).
 *   seed.ts     two agent credentials.
 *   main.ts     this file — numbered scenarios, run top to bottom.
 *
 * Run on any runtime:
 *
 * ```bash
 * deno run --allow-all packages/norm/examples/helpdesk/main.ts
 * bun run packages/norm/examples/helpdesk/main.ts
 * node --import tsx packages/norm/examples/helpdesk/main.ts
 * ```
 *
 * Zero external infra — SQLite runs in-process (`:memory:`).
 *
 * @module
 */
import '@tundralibs/norm/engines/sqlite';
import { Norm, pbkdf2Verify } from '@tundralibs/norm';
import { Migrator } from '@tundralibs/norm/migrations';
import { AGENTS } from './seed.ts';
import { HelpdeskSchema } from './schema.ts';
// Needs a separate install: deno add @tundralibs/compat
import { makeTempDir, removeDir } from '@tundralibs/compat/file';

const say = (title: string, value: unknown) =>
  console.log(`\n▶ ${title}\n${JSON.stringify(value, null, 2)}`);

const migDir = await makeTempDir({ prefix: 'norm-helpdesk-' });
const norm = new Norm({ database: { dialect: 'sqlite', path: ':memory:' } });

try {
  // ─── 1. Migrator: create the schema ────────────────────────────────
  const db = norm.use(HelpdeskSchema);
  const mig = new Migrator(db, { dir: migDir });
  const snap = await mig.snapshot();
  const applied = await mig.apply();
  say('1. Migrator: schema created', {
    snapshot: { version: snap.version, written: snap.written },
    applied: applied.applied,
  });

  // ─── 2. Agents: a salted login credential ──────────────────────────
  // The caller inserts the PLAINTEXT password; the column digests it
  // on the way in (same mechanism as Column.hash(), just salted). A
  // salted hash can't be matched by an equality filter, so "log in" is
  // read-the-row-then-verify, not find-by-hash.
  const agents = [];
  for (const a of AGENTS) {
    agents.push((await db.repo('Agents').insert({
      Name: a.Name,
      Email: a.Email,
      PasswordHash: a.password,
    })).data[0]!);
  }
  const [priya, sam] = agents;
  const loggedIn = await db.repo('Agents').findOne({ '@Email': priya!.Email });
  const rightPassword = await pbkdf2Verify(
    AGENTS[0].password,
    loggedIn.data!.PasswordHash,
  );
  const wrongPassword = await pbkdf2Verify(
    'not-the-password',
    loggedIn.data!.PasswordHash,
  );
  say('2. Agents: salted PBKDF2 credential, verified by re-hashing', {
    storedHashLooksSalted: loggedIn.data!.PasswordHash !==
      AGENTS[0].password,
    rightPasswordVerifies: rightPassword,
    wrongPasswordFails: !wrongPassword,
  });

  // ─── 3. Batch insert + a hook-computed SLA clock ───────────────────
  // One insert() call, one row per priority; DueAt is never supplied —
  // beforeInsert (which runs BEFORE validation) derives it from
  // Priority, so it never appears in the insert pick-list at all.
  const tickets = db.repo('Tickets');
  const batch = (await tickets.insert([
    {
      ExternalRef: 'zd-1001',
      CustomerEmail: 'a@customer.dev',
      Subject: 'Checkout button does nothing',
      Priority: 'urgent',
    },
    {
      ExternalRef: 'zd-1002',
      CustomerEmail: 'b@customer.dev',
      Subject: 'Typo on invoice PDF',
      Priority: 'low',
    },
    {
      ExternalRef: 'zd-1003',
      CustomerEmail: 'c@customer.dev',
      Subject: 'Export is slow for large accounts',
      Priority: 'normal',
    },
  ])).data;
  say('3. Batch insert: one row per priority, DueAt from the SLA hook', {
    dueDates: batch.map((t) => ({
      priority: t.Priority,
      hoursFromNow: Math.round(
        (t.DueAt!.getTime() - Date.now()) / 3_600_000,
      ),
    })),
  });

  // ─── 4. upsert(): idempotent webhook ingestion ─────────────────────
  // A support-desk webhook delivers "ticket created", then later
  // redelivers the SAME event (at-least-once delivery is normal) — the
  // unique ExternalRef makes replaying it a no-op instead of a
  // duplicate ticket. The second call also DEMONSTRATES the update
  // half: Subject arrives corrected on redelivery.
  const firstDelivery = await tickets.upsert({
    ExternalRef: 'zd-2001',
    CustomerEmail: 'd@customer.dev',
    Subject: 'App crashes on lgoin', // webhook's own typo
    Priority: 'high',
  }, { conflictKeys: ['ExternalRef'] });
  const redelivery = await tickets.upsert({
    ExternalRef: 'zd-2001',
    CustomerEmail: 'd@customer.dev',
    Subject: 'App crashes on login', // corrected redelivery
    Priority: 'high',
  }, { conflictKeys: ['ExternalRef'], updateOnConflict: ['Subject'] });
  const matching = await tickets.find({ '@ExternalRef': 'zd-2001' });
  say('4. upsert(): a replayed webhook updates in place, no duplicate', {
    firstDeliveryId: firstDelivery.data[0]!.Id,
    redeliveryId: redelivery.data[0]!.Id,
    sameRow: firstDelivery.data[0]!.Id === redelivery.data[0]!.Id,
    rowCountForExternalRef: matching.count,
    subjectAfterRedelivery: matching.data[0]!.Subject,
  });

  // ─── 5. Referential actions: SET_NULL vs CASCADE ───────────────────
  // Tickets.AssignedAgent is SET_NULL (losing an agent shouldn't lose
  // the ticket); TicketNotes.Ticket is CASCADE (a note without its
  // ticket is meaningless). Same schema, two different answers to
  // "what happens downstream", chosen per relationship.
  const urgent = batch[0]!;
  await tickets.update({ AssignedAgentId: sam!.Id }, { '@Id': urgent.Id });
  await db.repo('TicketNotes').insert([
    {
      TicketId: urgent.Id,
      AuthorAgentId: sam!.Id,
      Body: 'Reproduced on staging, patch incoming.',
      Internal: true,
    },
    {
      TicketId: urgent.Id,
      AuthorAgentId: sam!.Id,
      Body: 'We have identified the issue and are deploying a fix.',
      Internal: false,
    },
  ]);
  await db.repo('Agents').delete({ '@Id': sam!.Id });
  const afterAgentDelete = await tickets.findOne({ '@Id': urgent.Id });
  const notesAfterAgentDelete = await db.repo('TicketNotes').count({
    '@TicketId': urgent.Id,
  });
  await tickets.delete({ '@Id': urgent.Id });
  const notesAfterTicketDelete = await db.repo('TicketNotes').count({
    '@TicketId': urgent.Id,
  });
  say('5. SET_NULL un-assigns; CASCADE removes the dependent notes', {
    ticketSurvivesAgentDelete: afterAgentDelete.data !== null,
    assignedAgentIdAfterAgentDelete: afterAgentDelete.data!.AssignedAgentId,
    noteCountAfterAgentDelete: notesAfterAgentDelete.count,
    noteCountAfterTicketDelete: notesAfterTicketDelete.count,
  });

  // ─── 6. Filters + pagination ────────────────────────────────────────
  // A handful more low-stakes tickets, purely so the table holds more
  // rows than `defaultPageSize` — otherwise nothing below it would
  // ever prove the cap actually bites.
  await tickets.insert(
    Array.from({ length: 5 }, (_, i) => ({
      ExternalRef: `zd-40${i}`,
      CustomerEmail: `filler${i}@customer.dev`,
      Subject: `Question #${i}`,
      Priority: 'low' as const,
    })),
  );

  // $in / $or on the typed filter surface; defaultPageSize (5, from
  // schema.ts) caps an unbounded find() instead of returning every row
  // — pass `total: true` to still learn the real match count.
  const highPriorityOpen = await tickets.find({
    '@Priority': { $in: ['high', 'urgent'] },
    '@Status': 'open',
  });
  const unpaginated = await tickets.find({}, { total: true });
  const page2 = await tickets.find({}, { limit: 2, offset: 2 });
  say('6. $in/$or filters + defaultPageSize-bounded find()', {
    highPriorityOpenCount: highPriorityOpen.count,
    totalTicketsInTable: unpaginated.total,
    unpaginatedRowsReturned: unpaginated.data.length, // capped at defaultPageSize
    page2RowCount: page2.data.length,
  });

  // ─── 7. guardians: reject a bad webhook payload before upsert() ────
  // Same idempotent-ingestion path as scenario 4, but this delivery is
  // malformed — validate it BEFORE calling upsert(), the same rules
  // upsert()'s own insert-side Guardian would apply.
  const { insert: ticketInsertGuardian } = tickets.guardians;
  const [badPriorityErr] = ticketInsertGuardian.safeParse({
    ExternalRef: 'zd-3001',
    CustomerEmail: 'e@customer.dev',
    Subject: 'Cannot reset password',
    Priority: 'critical', // not one of Column.enum([...]) — 'urgent' is
  });
  say('7. guardians: a malformed webhook delivery never reaches upsert()', {
    rejected: badPriorityErr !== null,
    message: badPriorityErr?.message,
  });
} finally {
  await norm.disconnect();
  await removeDir(migDir, { recursive: true });
}
