/**
 * The UI layer, end-to-end and self-contained: a small dashboard (users /
 * stats / invoices) where EVERY card route serves BOTH representations —
 * JSON to `curl` (and to the "json" links on the page), an HTML fragment
 * to the swap runtime. Run it and click around:
 *
 * ```bash
 * deno run -A packages/rapid/examples/ui.ts
 * # open  http://localhost:8093/                 (the page)
 * # curl  http://localhost:8093/cards/users      (same route, as JSON)
 * # curl  -X POST http://localhost:8093/users \
 * #       -d 'name=Eve&email=not-an-email'       (server-side reject, JSON)
 * ```
 *
 * What it demonstrates beyond the basics: template COMPOSITION (plain
 * helper functions returning `Html`, cards rendered inline by the page),
 * the `{ status: 'ok' | 'error' }` union convention (one template renders
 * both the happy card and its error banner — JSON consumers get the same
 * distinction), BROWSER-SIDE validation via the app's own script (the
 * runtime is deliberately minimal — app JS composes with it through the
 * `rapid:swapped` / `rapid:error` events and native form validity), and
 * SERVER-SIDE validation behind it (the browser check is bypassable by
 * curl — the same POST then returns the error state on both
 * representations).
 */
import { Application } from '@tundralibs/rapid';
import { html, type Html, htmlDocument, template } from '@tundralibs/rapid/ui';

// ── data (in-memory; a real app uses norm) ──────────────────────────
type User = { name: string; email: string; role: 'admin' | 'member' };
type UsersData =
  | { status: 'ok'; items: User[] }
  | { status: 'error'; message: string; items: User[] };

const users: User[] = [
  { name: 'Ada', email: 'ada@example.com', role: 'admin' },
  { name: 'Grace', email: 'grace@example.com', role: 'member' },
];
const invoices = [
  { id: '#1042', total: '€ 320.00', state: 'paid' },
  { id: '#1043', total: '€ 75.50', state: 'overdue' },
  { id: '#1044', total: '€ 1 210.00', state: 'paid' },
];
let swapsServed = 0;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── components — plain functions returning Html compose freely ──────
const badge = (state: string): Html =>
  html`<span class="badge badge-${state}">${state}</span>`;

const jsonLink = (path: string): Html =>
  html`<a class="json" href="${path}" target="_blank">json</a>`;

const UsersCard = template<UsersData>((data) =>
  html`<section class="card">
    <h2>Users ${jsonLink('/cards/users')}</h2>
    ${data.status === 'error' && html`<p class="error">${data.message}</p>`}
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
      <tbody>${
    data.items.map((u) =>
      html`<tr>
          <td>${u.name}</td><td>${u.email}</td><td>${badge(u.role)}</td>
        </tr>`
    )
  }</tbody>
    </table>
  </section>`, 'UsersCard');

const StatsCard = template<{ users: number; invoices: number; swaps: number }>(
  (data) =>
    html`<section class="card">
      <h2>Stats ${jsonLink('/cards/stats')}</h2>
      <div class="kpis">
        <div><b>${data.users}</b><span>users</span></div>
        <div><b>${data.invoices}</b><span>invoices</span></div>
        <div><b>${data.swaps}</b><span>swaps served</span></div>
      </div>
    </section>`,
  'StatsCard',
);

const InvoicesCard = template<{ items: typeof invoices }>((data) =>
  html`<section class="card">
    <h2>Invoices ${jsonLink('/cards/invoices')}</h2>
    <table>
      <thead><tr><th>Id</th><th>Total</th><th></th></tr></thead>
      <tbody>${
    data.items.map((i) =>
      html`<tr><td>${i.id}</td><td>${i.total}</td><td>${
        badge(i.state)
      }</td></tr>`
    )
  }</tbody>
    </table>
  </section>`, 'InvoicesCard');

// The page composes the cards inline (the same frozen view threads
// through) and wires the form + refresh buttons to the routes below.
const Page = template<{
  users: UsersData;
  stats: { users: number; invoices: number; swaps: number };
  invoices: { items: typeof invoices };
}>((data, view) =>
  html`<header>
      <h1>rAPId dashboard</h1>
      <button data-action="/cards/stats" data-target="#card-stats">
        Refresh stats
      </button>
    </header>
    <div class="grid">
      <!-- Slot wrappers are the swap TARGETS; fragments replace their
           CONTENT — so repeated swaps never nest or duplicate ids. -->
      <div id="card-users">${UsersCard.render(data.users, view)}</div>
      <div id="card-stats">${StatsCard.render(data.stats, view)}</div>
      <div id="card-invoices">${InvoicesCard.render(data.invoices, view)}</div>
      <section class="card">
        <h2>Add a user</h2>
        <form data-action="/users" data-target="#card-users" novalidate>
          <label>Name
            <input name="name" placeholder="Try <b>bold</b> — it escapes" required>
          </label>
          <label>Email <input name="email" type="email" required></label>
          <label>Role
            <select name="role">
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <p class="hint" id="form-hint" hidden></p>
          <button id="add" disabled>Add</button>
        </form>
      </section>
    </div>
    <div id="toast" hidden></div>`, 'Page');

const Shell = template<{ body: unknown; title?: string }>((data, view) =>
  htmlDocument({
    title: data.title ?? 'rAPId dashboard',
    head: html`<style>
      body { margin: 0; background: #f3f4f6; color: #1a1a1a;
             font-family: system-ui, sans-serif; }
      main { max-width: 56rem; margin: 0 auto; padding: 1.5rem; }
      header { display: flex; align-items: center; gap: 1rem;
               justify-content: space-between; }
      .grid { display: grid; gap: 1rem;
              grid-template-columns: repeat(auto-fit, minmax(24rem, 1fr)); }
      .card { background: #fff; border-radius: 10px; padding: 1rem 1.25rem;
              box-shadow: 0 1px 3px rgb(0 0 0 / .12); }
      .card.flash { outline: 2px solid #2563eb; transition: outline .1s; }
      .card h2 { margin-top: 0; display: flex; justify-content: space-between;
                 align-items: baseline; font-size: 1.05rem; }
      a.json { font-size: .75rem; font-weight: normal; color: #2563eb; }
      table { width: 100%; border-collapse: collapse; font-size: .9rem; }
      th { text-align: left; color: #6b7280; font-weight: 500;
           border-bottom: 1px solid #e5e7eb; padding: .25rem 0; }
      td { padding: .3rem 0; border-bottom: 1px solid #f3f4f6; }
      .badge { padding: .1rem .5rem; border-radius: 999px; font-size: .75rem; }
      .badge-admin, .badge-paid { background: #dcfce7; color: #166534; }
      .badge-member { background: #e0e7ff; color: #3730a3; }
      .badge-overdue { background: #fee2e2; color: #991b1b; }
      .kpis { display: flex; gap: 2rem; }
      .kpis b { display: block; font-size: 1.6rem; }
      .kpis span { color: #6b7280; font-size: .8rem; }
      form label { display: block; margin: .5rem 0; font-size: .85rem; }
      form input, form select { display: block; width: 100%; margin-top: .2rem;
        padding: .4rem; border: 1px solid #d1d5db; border-radius: 6px;
        box-sizing: border-box; }
      form input.bad { border-color: #dc2626; }
      .hint, .error { color: #dc2626; font-size: .8rem; }
      button { padding: .45rem .9rem; border: 0; border-radius: 6px;
               background: #2563eb; color: #fff; cursor: pointer; }
      button:disabled { background: #9ca3af; cursor: not-allowed; }
      #toast { position: fixed; bottom: 1rem; right: 1rem; background: #991b1b;
               color: #fff; padding: .6rem 1rem; border-radius: 8px; }
    </style>`,
    body: html`<main>${data.body}</main>
      <script src="${view.runtimePath}"></script>
      <script src="/app.js"></script>`,
  }), 'Shell');

/**
 * The APP's own browser script — live validation + feedback. The swap
 * runtime is deliberately tiny; app JS composes with it: native form
 * validity gates the submit, and the `rapid:swapped` / `rapid:error`
 * events drive the flash + toast. Served as a route (no inline handlers
 * anywhere — CSP `script-src 'self'` still suffices).
 */
const APP_JS = `(() => {
  const form = document.querySelector('form[data-action="/users"]');
  const name = form.querySelector('[name=name]');
  const email = form.querySelector('[name=email]');
  const hint = document.getElementById('form-hint');
  const add = document.getElementById('add');
  const EMAIL = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

  const validate = () => {
    let message = '';
    if (name.value.trim().length < 2) message = 'Name needs 2+ characters.';
    else if (!EMAIL.test(email.value)) message = 'That email looks wrong.';
    name.classList.toggle('bad', name.value !== '' && name.value.trim().length < 2);
    email.classList.toggle('bad', email.value !== '' && !EMAIL.test(email.value));
    hint.textContent = message;
    hint.hidden = message === '' || (name.value === '' && email.value === '');
    add.disabled = message !== '';
  };
  name.addEventListener('input', validate);
  email.addEventListener('input', validate);
  validate();

  // After a successful swap: flash the card; when it was the USERS card,
  // clear the form and refresh the stats card too — the multi-region
  // update, done with the runtime's one programmatic hook instead of a
  // declarative attribute.
  document.addEventListener('rapid:swapped', (e) => {
    const card = e.target;
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 600);
    if (card.id === 'card-users') {
      // A server-side reject re-renders the card WITH its error banner
      // (200 + the union's error state) — keep the user's input then.
      if (!card.querySelector('.error')) { form.reset(); validate(); }
      rapid.swap('/cards/stats', '#card-stats');
    }
  });

  // A non-swappable response (JSON envelope, network failure): toast it.
  document.addEventListener('rapid:error', (e) => {
    const toast = document.getElementById('toast');
    toast.textContent = 'Request failed (' + e.detail.status + ')';
    toast.hidden = false;
    setTimeout(() => { toast.hidden = true; }, 2500);
  });
})();
`;

// ── the app: every card route is API-first (JSON unless swapped) ─────
const app = await Application.initialize({
  name: 'ui-demo',
  server: { port: 8093 },
});
app.ui({ layout: Shell });

const statsData = () => ({
  users: users.length,
  invoices: invoices.length,
  swaps: swapsServed,
});

// The page IS a route whose template is the page.
app.get('/', { template: { render: Page, prefer: 'html' } }, () => ({
  content: {
    users: { status: 'ok', items: users },
    stats: statsData(),
    invoices: { items: invoices },
  },
}));

// `ctx.isSwap` is the representer's own decision (config-aware — a
// renamed swapHeader keeps this correct), so per-representation side
// effects never re-derive it against a hardcoded header name.
app.get('/cards/users', { template: UsersCard }, (ctx) => {
  if (ctx.isSwap) swapsServed++;
  return { content: { status: 'ok', items: users } };
});
app.get('/cards/stats', { template: StatsCard }, (ctx) => {
  if (ctx.isSwap) swapsServed++;
  return { content: statsData() };
});
app.get('/cards/invoices', { template: InvoicesCard }, (ctx) => {
  if (ctx.isSwap) swapsServed++;
  return { content: { items: invoices } };
});

// SERVER-side validation too — the browser check is bypassable (curl).
// The union carries the outcome on BOTH representations: the template
// shows the banner, a JSON consumer reads `status`. Note the 200: the
// runtime deliberately never swaps a non-2xx body (those toast via
// `rapid:error`), so recoverable form feedback is STATE in the data —
// an API-strict app would instead throw a RapidError (422 envelope)
// and leave the UI to the toast.
app.post('/users', { template: UsersCard }, async (ctx) => {
  // `payload` hands back whatever JSON parsed to — `null` included, so
  // guard before property access (the browser check is bypassable).
  const body = ((await ctx.payload) ?? {}) as {
    name?: string;
    email?: string;
    role?: string;
  };
  const name = (body.name ?? '').trim();
  const email = (body.email ?? '').trim();
  if (name.length < 2 || !EMAIL.test(email)) {
    return {
      content: {
        status: 'error',
        message: 'Name needs 2+ characters and the email must be valid.',
        items: users,
      },
    };
  }
  users.push({
    name,
    email,
    role: body.role === 'admin' ? 'admin' : 'member',
  });
  return { content: { status: 'ok', items: users } };
});

app.get('/app.js', () => ({
  content: APP_JS,
  headers: { 'content-type': 'text/javascript; charset=UTF-8' },
}));

await app.start();
console.log(`open http://localhost:${app.port}/`);
