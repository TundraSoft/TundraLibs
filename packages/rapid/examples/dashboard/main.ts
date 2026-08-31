/**
 * A SALES DASHBOARD on the UI layer, in one file — the "same route,
 * both representations" demo grown into the shape dashboards actually
 * take. Three independently-swappable regions over one in-memory
 * order book:
 *
 *   #dash     GET /dash?days=      KPIs (with deltas vs the PREVIOUS
 *                                  window), revenue trend, region
 *                                  split, top reps — composed
 *                                  server-side from one payload. The
 *                                  period chips (7/30/90d) live INSIDE
 *                                  it and outer-swap the whole region
 *                                  via `withQuery`.
 *   #orders   GET /cards/orders    the latest bookings table.
 *   #logform  POST /orders         log-a-sale form — validation errors
 *                                  are the union's own 200-state,
 *                                  values kept.
 *
 * The DYNAMIC-UPDATE wiring (docs/Rapid-UI.md "Dynamic updates") shows
 * both client-side patterns at once: after a logged sale the page
 * script chains `rapid.swap('/cards/orders', '#orders')` (URL known)
 * AND `rapid.refresh('#dash')` — refresh re-fetches whatever the
 * region last showed, so the ACTIVE PERIOD FILTER survives the update
 * without app.js ever knowing about `?days=`.
 *
 * Every region is API-first — the "json" links on the page are these:
 *
 * ```bash
 * curl -s 'localhost:8002/dash?days=30' | jq     # KPIs/trend/regions/reps
 * curl -s localhost:8002/cards/orders | jq
 * curl -s -X POST localhost:8002/orders -H 'content-type: application/json' \
 *   -d '{"product":"Growth","qty":3,"region":"EMEA","rep":"Priya"}' | jq
 * ```
 *
 * Run (from the repo root):
 *
 * ```bash
 * deno run -A packages/rapid/examples/dashboard/main.ts
 * ```
 *
 * @module
 */

import { Application } from '@tundralibs/rapid';
import {
  html,
  type Html,
  htmlDocument,
  template,
  withQuery,
} from '@tundralibs/rapid/ui';

// ── the order book: seeded, in memory ────────────────────────────────
const PRODUCTS: Record<string, number> = {
  Starter: 490,
  Growth: 1900,
  Scale: 4900,
};
const REGIONS = ['NA', 'EMEA', 'APAC', 'LATAM'] as const;
const REPS = ['Priya', 'Marco', 'Yuki', 'Tomas', 'Amara'];
/** Monthly revenue target the attainment KPI measures against. */
const TARGET_30D = 160_000;

type Order = {
  id: string;
  product: string;
  qty: number;
  amount: number;
  region: string;
  rep: string;
  at: Date;
};

const orders: Order[] = [];
let seq = 1000;
const DAY = 86_400_000;

function book(
  product: string,
  qty: number,
  region: string,
  rep: string,
  at = new Date(),
): Order {
  const order: Order = {
    id: `SO-${++seq}`,
    product,
    qty,
    amount: qty * (PRODUCTS[product] ?? 0),
    region,
    rep,
    at,
  };
  orders.push(order);
  return order;
}

// ~90 days of history so every period window has data and deltas.
for (let i = 0; i < 70; i++) {
  const names = Object.keys(PRODUCTS);
  book(
    names[Math.floor(Math.random() * names.length)]!,
    1 + Math.floor(Math.random() * 5),
    REGIONS[Math.floor(Math.random() * REGIONS.length)]!,
    REPS[Math.floor(Math.random() * REPS.length)]!,
    new Date(Date.now() - Math.random() * 90 * DAY),
  );
}

/** Every period-scoped number the dashboard shows, from one window. */
function dashboard(days: number) {
  const now = Date.now();
  const inWindow = (o: Order, from: number, to: number) =>
    o.at.getTime() > from && o.at.getTime() <= to;
  const current = orders.filter((o) => inWindow(o, now - days * DAY, now));
  const previous = orders.filter((o) =>
    inWindow(o, now - 2 * days * DAY, now - days * DAY)
  );
  const sum = (list: Order[]) => list.reduce((a, o) => a + o.amount, 0);
  const revenue = sum(current);
  const prevRevenue = sum(previous);
  const by = (key: (o: Order) => string) => {
    const out = new Map<string, number>();
    for (const o of current) out.set(key(o), (out.get(key(o)) ?? 0) + o.amount);
    return out;
  };
  // Twelve equal buckets across the window — the trend bars.
  const trend = Array.from({ length: 12 }, () => 0);
  for (const o of current) {
    const age = now - o.at.getTime();
    trend[11 - Math.min(11, Math.floor(age / ((days * DAY) / 12)))] += o.amount;
  }
  return {
    days,
    revenue,
    // Delta vs the previous window of the SAME length, in percent.
    delta: prevRevenue === 0
      ? null
      : Math.round(((revenue - prevRevenue) / prevRevenue) * 100),
    orders: current.length,
    prevOrders: previous.length,
    avgDeal: current.length === 0 ? 0 : Math.round(revenue / current.length),
    target: Math.round((TARGET_30D * days) / 30),
    trend,
    regions: [...by((o) => o.region).entries()].sort((a, b) => b[1] - a[1]),
    reps: [...by((o) => o.rep).entries()].sort((a, b) => b[1] - a[1])
      .slice(0, 4),
  };
}
type DashData = ReturnType<typeof dashboard>;

let fragmentsServed = 0;

// ── templates ────────────────────────────────────────────────────────

const money = (n: number): string => `$${n.toLocaleString('en-US')}`;
const ago = (at: Date | string): string => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / (60 * 24))}d ago`;
};
const bars = (entries: [string, number][]): Html => {
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return html`<ul class="bars">${
    entries.map(([label, n]) =>
      html`<li>
      <span class="lbl">${label}</span>
      <span class="bar"><i style="--w:${
        Math.round((n / max) * 100)
      }%"></i></span>
      <span class="num">${money(n)}</span>
    </li>`
    )
  }</ul>`;
};

/**
 * The period-scoped dashboard — ONE region so the chips (and any
 * refresh) replace every number that depends on `?days=` atomically;
 * no card can show last period's revenue beside this period's trend.
 */
const DashView = template<DashData>((data, view) => {
  const attainment = Math.round((data.revenue / data.target) * 100);
  const trendMax = Math.max(1, ...data.trend);
  return html`<section id="dash">
    <div class="rowhead">
      <nav class="chips">${
    [7, 30, 90].map((days) =>
      html`<button class="chip${days === data.days ? ' chip-on' : ''}"
          data-action="${withQuery('/dash', {}, { days })}"
          data-target="#dash" data-swap="outer">${days}d</button>`
    )
  }</nav>
      <a class="json" href="${withQuery('/dash', {}, { days: data.days })}">json</a>
    </div>
    <div class="kpis">
      <div class="kpi">
        <b>${money(data.revenue)}</b><span>revenue</span>
        ${
    data.delta === null ? '' : html`<em class="${data.delta < 0 ? 'down' : 'up'}">${
      data.delta >= 0 ? '▲' : '▼'
    } ${Math.abs(data.delta)}%</em>`
  }
      </div>
      <div class="kpi">
        <b>${data.orders}</b><span>orders</span>
        <em class="${data.orders < data.prevOrders ? 'down' : 'up'}">prev ${data.prevOrders}</em>
      </div>
      <div class="kpi"><b>${money(data.avgDeal)}</b><span>avg deal</span></div>
      <div class="kpi">
        <b>${attainment}%</b><span>of ${money(data.target)} target</span>
        <span class="gauge"><i style="--w:${Math.min(100, attainment)}%"
          class="${attainment >= 100 ? 'over' : ''}"></i></span>
      </div>
    </div>
    <div class="panels">
      <div class="panel wide">
        <h2>Revenue trend</h2>
        <div class="trend">${
    data.trend.map((n) =>
      html`<i style="--h:${Math.round((n / trendMax) * 100)}%"
          title="${money(n)}"></i>`
    )
  }</div>
      </div>
      <div class="panel"><h2>By region</h2>${bars(data.regions)}</div>
      <div class="panel"><h2>Top reps</h2>${bars(data.reps)}</div>
    </div>
    <p class="meta">
      window: last ${data.days} days · deltas vs the ${data.days} before ·
      ${fragmentsServed} fragment${fragmentsServed === 1 ? '' : 's'} served
      this session
    </p>
  </section>`;
}, 'DashView');

/** The latest bookings — its own slot region + its own JSON face. */
const OrdersView = template<{ rows: Order[] }>((data) =>
  html`<div class="rowhead">
    <h2>Latest bookings</h2><a class="json" href="/cards/orders">json</a>
  </div>
  <table>
    <thead><tr>
      <th>Order</th><th>Product</th><th>Region</th><th>Rep</th>
      <th class="r">Amount</th><th class="r">When</th>
    </tr></thead>
    <tbody>${
    data.rows.map((o) =>
      html`<tr>
      <td>${o.id}</td><td>${o.product}</td><td>${o.region}</td>
      <td>${o.rep}</td><td class="r">${money(o.amount)}</td>
      <td class="r muted">${ago(o.at)}</td>
    </tr>`
    )
  }</tbody>
  </table>`, 'OrdersView');

/** Log-a-sale — errors are the union's 200-state, values kept. */
type LogData =
  | { state: 'clean' }
  | {
    state: 'error';
    message: string;
    values: { product: string; qty: string; region: string; rep: string };
  };
const LogForm = template<LogData>((data) => {
  const v = data.state === 'error'
    ? data.values
    : { product: 'Growth', qty: '1', region: 'NA', rep: '' };
  return html`<form id="logform" data-action="/orders" data-swap="outer">
    <h2>Log a sale</h2>
    <select name="product">${
    Object.keys(PRODUCTS).map((p) =>
      html`<option${p === v.product ? html` selected` : ''}>${p}</option>`
    )
  }</select>
    <input name="qty" type="number" min="1" max="999" value="${v.qty}">
    <select name="region">${
    REGIONS.map((r) =>
      html`<option${r === v.region ? html` selected` : ''}>${r}</option>`
    )
  }</select>
    <input id="log-rep" name="rep" placeholder="Rep" value="${v.rep}"
      autocomplete="off">
    <button type="submit">Book it</button>
    ${data.state === 'error' ? html`<p class="err">${data.message}</p>` : ''}
  </form>`;
}, 'LogForm');

/** The page — regions composed; see APP_JS for the update wiring. */
const Page = template<
  { dash: DashData; orders: { rows: Order[] }; log: LogData }
>((data, view) =>
  html`${DashView.render(data.dash, view)}
  <div class="lower">
    <div class="panel grow" id="orders">${
    OrdersView.render(data.orders, view)
  }</div>
    <div class="panel">${LogForm.render(data.log, view)}</div>
  </div>`, 'Page');

const Shell = template<{ body: Html; title?: string }>((data, view) =>
  htmlDocument({
    title: data.title ?? 'Northlight — a rAPId sales dashboard',
    head: html`<style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f2f4f7; color: #182230;
             font: 15px/1.45 system-ui, sans-serif; }
      main { max-width: 68rem; margin: 0 auto; padding: 1.6rem 1.2rem 3rem; }
      h1 { margin: 0 0 1.2rem; font-size: 1.25rem; }
      h1 small { color: #7a8698; font-weight: 400; font-size: .85rem;
        margin-left: .6rem; }
      h2 { margin: 0 0 .7rem; font-size: .74rem; letter-spacing: .12em;
        text-transform: uppercase; color: #7a8698; }
      .rowhead { display: flex; align-items: center; gap: .8rem;
        margin-bottom: .8rem; }
      .json { margin-left: auto; color: #2b5c8a; font-size: .75rem; }
      .chips { display: flex; gap: .4rem; }
      .chip { background: #fff; color: #48566a; border: 1px solid #d6dde6;
        border-radius: 999px; padding: .28rem .8rem; font: .8rem system-ui;
        cursor: pointer; }
      .chip-on { background: #2b5c8a; border-color: #2b5c8a; color: #fff;
        font-weight: 600; }

      .kpis { display: grid; gap: .8rem;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        margin-bottom: .8rem; }
      @media (max-width: 52rem) { .kpis { grid-template-columns: 1fr 1fr; } }
      .kpi { background: #fff; border: 1px solid #e2e7ee;
        border-radius: 12px; padding: .9rem 1rem; }
      .kpi b { display: block; font-size: 1.35rem;
        font-variant-numeric: tabular-nums; }
      .kpi span { color: #7a8698; font-size: .78rem; }
      .kpi em { display: block; font-style: normal; font-size: .75rem;
        font-weight: 600; margin-top: .2rem; }
      .up { color: #1d7a4f; } .down { color: #b3341f; }
      .gauge { display: block; background: #e9edf2; border-radius: 6px;
        height: .5rem; margin-top: .45rem; overflow: hidden; }
      .gauge i { display: block; height: 100%; width: var(--w, 0%);
        background: #2b5c8a; border-radius: 6px; transition: width .4s; }
      .gauge i.over { background: #1d7a4f; }

      .panels { display: grid; gap: .8rem;
        grid-template-columns: 2fr 1.2fr 1.2fr; }
      @media (max-width: 52rem) { .panels { grid-template-columns: 1fr; } }
      .panel { background: #fff; border: 1px solid #e2e7ee;
        border-radius: 12px; padding: .9rem 1rem; }
      .trend { display: flex; align-items: flex-end; gap: 4px;
        height: 6.5rem; }
      .trend i { flex: 1; background: #2b5c8a; opacity: .85;
        border-radius: 3px 3px 0 0; height: var(--h, 0%);
        min-height: 2px; transition: height .4s; }
      .bars { list-style: none; margin: 0; padding: 0; }
      .bars li { display: flex; align-items: center; gap: .5rem;
        padding: .28rem 0; font-size: .82rem; }
      .lbl { width: 3.6rem; }
      .bar { flex: 1; background: #e9edf2; border-radius: 5px;
        height: .55rem; overflow: hidden; }
      .bar i { display: block; height: 100%; width: var(--w, 0%);
        background: #6f95b5; border-radius: 5px; transition: width .4s; }
      .num { width: 5.5rem; text-align: right; color: #48566a;
        font-variant-numeric: tabular-nums; font-size: .78rem; }
      .meta { margin: .8rem 0 0; color: #98a3b1; font-size: .74rem; }

      .lower { display: grid; gap: .8rem; grid-template-columns: 2fr 1fr;
        margin-top: .8rem; align-items: start; }
      @media (max-width: 52rem) { .lower { grid-template-columns: 1fr; } }
      table { width: 100%; border-collapse: collapse; font-size: .84rem; }
      th { text-align: left; color: #7a8698; font-weight: 600;
        font-size: .72rem; text-transform: uppercase;
        letter-spacing: .08em; padding: .3rem .4rem; }
      td { padding: .42rem .4rem; border-top: 1px solid #eef1f5;
        font-variant-numeric: tabular-nums; }
      .r { text-align: right; }
      .muted { color: #98a3b1; }

      #logform { display: flex; flex-direction: column; gap: .55rem; }
      #logform input, #logform select { border: 1px solid #d6dde6;
        border-radius: 8px; padding: .45rem .6rem; font: inherit;
        background: #fff; }
      #logform button { background: #2b5c8a; color: #fff; border: 0;
        border-radius: 8px; padding: .55rem; font: 600 .9rem system-ui;
        cursor: pointer; }
      .err { margin: 0; color: #b3341f; font-size: .82rem; }
      .flash { animation: flash .5s ease-out; }
      @keyframes flash { from { box-shadow: 0 0 0 3px #6f95b5; } }
    </style>`,
    body: html`<main>
      <h1>Northlight <small>a rAPId sales dashboard — every region is
      also JSON</small></h1>
      ${data.body}
    </main>
    <script src="${view.runtimePath}"></script>
    <script src="/app.js"></script>`,
  }), 'Shell');

// ── the page's own script: both dynamic-update patterns at once ──────
const APP_JS = `(() => {
  document.addEventListener('rapid:swapped', (e) => {
    e.target.classList.add('flash');
    setTimeout(() => e.target.classList.remove('flash'), 500);
    if (e.target.id !== 'logform') return;
    // A rejected sale re-renders the form WITH its error (200 + the
    // union's error state) — the book didn't change, refresh nothing.
    if (e.target.querySelector('.err')) return;
    // Pattern 1 — URL known to the page script:
    rapid.swap('/cards/orders', '#orders');
    // Pattern 2 — URL-free: re-fetch whatever #dash last showed, so
    // the active ?days= filter survives without this file knowing it.
    rapid.refresh('#dash');
  });
  document.addEventListener('rapid:error', (e) => {
    console.warn('swap failed', e.detail.status);
  });
})();
`;

// ── the app: every region is API-first (JSON unless swapped) ─────────
const app = await Application.initialize({
  name: 'sales-dashboard',
  server: { port: 8002 },
});
app.ui({ layout: Shell });

app.get('/app.js', () => ({
  content: APP_JS,
  headers: { 'content-type': 'text/javascript; charset=UTF-8' },
}));

/** `?days=` from the chips: 7 | 30 | 90, default 30. */
const daysOf = (ctx: { url: string }): number => {
  const raw = new URL(ctx.url).searchParams.get('days');
  return raw === '7' || raw === '90' ? Number(raw) : 30;
};

// The page IS a route whose template is the page.
app.get('/', { template: { render: Page, prefer: 'html' } }, (ctx) => ({
  content: {
    dash: dashboard(daysOf(ctx)),
    orders: { rows: orders.slice(-8).reverse() },
    log: { state: 'clean' },
  },
}));

// `ctx.isSwap` is the representer's own decision (config-aware), so
// per-representation side effects — here, the fragment counter the
// dash footer shows — never re-derive header checks.
app.get('/dash', { template: DashView }, (ctx) => {
  if (ctx.isSwap) fragmentsServed++;
  return { content: dashboard(daysOf(ctx)) };
});

app.get('/cards/orders', { template: OrdersView }, (ctx) => {
  if (ctx.isSwap) fragmentsServed++;
  return { content: { rows: orders.slice(-8).reverse() } };
});

app.post('/orders', { template: LogForm }, async (ctx) => {
  const body = ((await ctx.payload) ?? {}) as Record<string, string>;
  const { product = '', region = '', rep = '' } = body;
  const qty = Number(body.qty ?? '');
  const values = { product, qty: body.qty ?? '', region, rep: rep.trim() };
  if (PRODUCTS[product] === undefined) {
    return {
      content: { state: 'error', message: 'Pick a real product.', values },
    };
  }
  if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
    return {
      content: { state: 'error', message: 'Quantity: 1-999.', values },
    };
  }
  if (values.rep === '') {
    return {
      content: { state: 'error', message: 'Whose sale is it?', values },
    };
  }
  book(product, qty, REGIONS.find((r) => r === region) ?? 'NA', values.rep);
  return { status: 201, content: { state: 'clean' } };
});

await app.start();
app.log.info(
  `Northlight — http://localhost:${app.port}/ ` +
    `(JSON: curl -s 'localhost:${app.port}/dash?days=30' | jq)`,
);
