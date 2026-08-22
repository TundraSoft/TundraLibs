/**
 * @fileoverview `negotiate` — HTTP content negotiation over an `Accept` header.
 * Given the media types a handler can produce, pick the client's best match by
 * q-value (most-specific match wins; ties resolve to the earliest offered, i.e.
 * server preference). Pure and transport-agnostic; `ctx.accepts` wraps it.
 *
 * @module
 */

type AcceptEntry = { type: string; subtype: string; q: number };

/** Parse an `Accept` header into `{ type, subtype, q }`, worst params ignored. */
const parseAccept = (header: string): AcceptEntry[] => {
  const entries: AcceptEntry[] = [];
  for (const part of header.split(',')) {
    const [media, ...params] = part.trim().split(';');
    const slash = media.indexOf('/');
    if (slash === -1) continue;
    const type = media.slice(0, slash).trim().toLowerCase();
    const subtype = media.slice(slash + 1).trim().toLowerCase();
    if (type === '' || subtype === '') continue;
    let q = 1;
    for (const p of params) {
      const eq = p.indexOf('=');
      if (eq !== -1 && p.slice(0, eq).trim().toLowerCase() === 'q') {
        const v = Number.parseFloat(p.slice(eq + 1).trim());
        if (!Number.isNaN(v)) q = Math.max(0, Math.min(1, v));
      }
    }
    entries.push({ type, subtype, q });
  }
  return entries;
};

/** The q an offered type earns from `entries` — the MOST SPECIFIC match wins. */
const qualityOf = (offered: string, entries: AcceptEntry[]): number => {
  const slash = offered.indexOf('/');
  if (slash === -1) return 0; // require a full `type/subtype`
  const oType = offered.slice(0, slash).toLowerCase();
  const oSub = offered.slice(slash + 1).toLowerCase();
  let bestSpec = -1;
  let q = 0;
  for (const e of entries) {
    let spec: number;
    if (e.type === oType && e.subtype === oSub) spec = 3; // exact
    else if (e.type === oType && e.subtype === '*') spec = 2; // type/*
    else if (e.type === '*' && e.subtype === '*') spec = 1; // */*
    else continue;
    if (spec > bestSpec) {
      bestSpec = spec;
      q = e.q;
    }
  }
  return bestSpec === -1 ? 0 : q;
};

/**
 * Choose the best `offered` media type for an `Accept` header, or `undefined`
 * when the client accepts none of them. A missing/blank/unparseable `Accept`
 * yields the FIRST offered (the server's default). Offered values must be full
 * `type/subtype` media types.
 */
export function negotiate(
  accept: string | null,
  offered: readonly string[],
): string | undefined {
  if (offered.length === 0) return undefined;
  if (accept === null || accept.trim() === '') return offered[0];
  const entries = parseAccept(accept);
  if (entries.length === 0) return offered[0];
  let best: string | undefined;
  let bestQ = 0;
  for (const o of offered) {
    const q = qualityOf(o, entries);
    if (q > bestQ) {
      bestQ = q;
      best = o;
    }
  }
  return bestQ > 0 ? best : undefined;
}
