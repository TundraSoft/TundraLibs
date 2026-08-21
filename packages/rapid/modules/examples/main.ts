/**
 * Runnable walkthrough of the module system — STANDALONE (no
 * Application, no HTTP): every scenario a real app hits, narrated.
 *
 *   deno run -A packages/rapid/modules/examples/main.ts
 *
 * Scenarios: plain service calls · fire-and-forget vs awaited events ·
 * subscriber isolation · delegation through `invoke` with guards ·
 * correlation ids flowing into subscribers · the single-instance rule ·
 * lifecycle order.
 * @module
 */
import { ambient } from '@tundralibs/ambient';
import { inject } from '@tundralibs/doctor';
import { SyslogSeverities } from '@tundralibs/slogger';
import { initModules } from '../mod.ts';
import { Mailer } from './services/Mailer.ts';
import * as mods from './modules/mod.ts';

const say = (title: string, ...detail: unknown[]) =>
  console.log(`\n▶ ${title}`, ...detail.map((d) => JSON.stringify(d)));

// ── boot: ONE bootstrap call; doctor builds the services on demand ──────
const { modules, runtime } = await initModules(
  {
    name: 'poc',
    mode: 'DEVELOPMENT',
    logger: { level: SyslogSeverities.WARNING },
  },
  { modules: [mods] },
);
const { Users, Posts, Comments, Search, Audit } = modules;
const mailer = inject(Mailer);
say('booted', runtime.modules.map((m) => `${m.namespace}:${m.name}`));
say('declared events', runtime.declaredEvents);

// 1 ─ plain call + fire-and-forget event ─────────────────────────────────
const ada = Users.register('ada@example.com');
const admin = Users.register('root@example.com');
await runtime.drain(); // we didn't await register's emit — drain to observe its effects
say('1. register → UserRegistered (fire-and-forget) → welcome mail + audit', {
  mails: mailer.sent.length,
  audit: Audit.entries.map((e) => e.event),
});

// 2 ─ awaited event: "published" means subscribers are done ──────────────
const post = Posts.create(ada.id, 'Modules, Events and Invocations');
await Posts.publish(post.id); // plain call — no guard runs here; awaited emit inside
say(
  "2. publish (awaited) → Search indexed synchronously from the caller's view",
  {
    query: Search.query('events'),
    followerMail: mailer.sent.at(-1),
  },
);

// 3 ─ a throwing subscriber is isolated ──────────────────────────────────
const c = await Comments.add(post.id, 'troll', 'first!');
say('3. comment by "troll" → Notifications handler THROWS, yet:', {
  commentSaved: Comments.forPost(post.id).length === 1 && c.id === 1,
  auditStillRecorded: Audit.entries.at(-1)?.event,
  note: 'the failure was logged by the runtime, not propagated to Comments.add',
});

// 4 ─ delegation through invoke: the target's guard sees the CALLER's principal
const asEditor = await runtime.invoke(mods.Comments, 'purgeThread', [post.id], {
  state: { principal: { id: ada.id, role: 'member' } },
});
const asAdmin = await runtime.invoke(mods.Comments, 'purgeThread', [post.id], {
  state: { principal: { id: admin.id, role: 'admin' } },
});
say('4. purgeThread → invoke(Posts.remove) honors requireRole(admin)', {
  asMember: asEditor.content,
  asAdmin: asAdmin.content,
  postGone: Search.query('events'),
});

// 5 ─ correlation: subscribers carry the originating requestId ───────────
await ambient.run({ requestId: 'req-42' }, async () => {
  Posts.create(ada.id, 'Correlated');
  await runtime.drain();
});
say('5. inside a request scope, audit entries carry its requestId', {
  last: Audit.entries.at(-1),
});

// 6 ─ guards only bite through invoke ────────────────────────────────────
const denied = await runtime.invoke(mods.Users, 'promote', [ada.id, 'editor']);
const direct = Users.promote(ada.id, 'editor');
say(
  '6. guard: invoke without principal → envelope; direct call → just a method',
  {
    invoked: denied,
    direct: direct.role,
  },
);

// 7 ─ single-instance rule ──────────────────────────────────────────────
say('7. Search.inject(Audit) is the mounted Audit', {
  sameInstance: Search.auditedEvents() === Audit.entries.length,
});

// 8 ─ lifecycle ─────────────────────────────────────────────────────────
await runtime.dispose();
say('8. dispose ran (init was in mount order, dispose in reverse — see logs)');
