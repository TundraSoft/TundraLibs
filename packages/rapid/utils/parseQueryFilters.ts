/**
 * @fileoverview `parseQueryFilters` — the query-string filter/sort
 * grammar, decoupled from the HTTP context for independent testing.
 *
 * Config-free at parse: no field allowlist, no semantic validation —
 * keys are LOWERCASED and values normalised to single-operator objects
 * (`{ $eq: ... }`, `{ $in: [...] }`, ...), and that is ALL. The result
 * is an UNTRUSTED carrier: field allowlisting, re-casing, and type
 * validation belong to the consumer (or the binder tier, once modules
 * land). What IS enforced here are the always-on STRUCTURAL caps
 * (filter/sort counts, value lengths) — DoS guards, thrown as
 * `RAPID_QUERY_INVALID` (400).
 *
 * The returned `filters` object has a NULL PROTOTYPE so that a hostile
 * `__proto__`/`constructor` field name cannot corrupt it (see the
 * accumulator below). Consumers copying it into a plain object should
 * use spread or `Object.fromEntries` — both use define semantics —
 * rather than `target[key] = value` assignment, which would re-open
 * the same hole on their side.
 *
 * Grammar (values shown decoded):
 * - `field=value`            → `{ $eq: 'value' }`
 * - `field=op:value`         → `{ $op: ... }` for eq/ne/gt/gte/lt/lte/
 *   like/ilike/null/in/nin — the value is EVERYTHING after the FIRST
 *   colon (an URL like `https://x` inside a value survives intact)
 * - `field=[a,b,c]`          → `{ $in: ['a','b','c'] }`
 * - `sort=field:desc`        → sorting entry (also `sortby`)
 * - `sort1=..`, `sort2=..`   → ordered sorting entries (numeric order)
 * - `page`/`pagelimit`/`limit` are RESERVED for paging and skipped here
 *
 * Divergences from the ancestral parser (clearremit), on purpose:
 * - an unknown `word:` prefix is an EXACT MATCH of the whole value —
 *   never a silent drop;
 * - `like` maps to `$like` and `ilike` to `$ilike` (the ancestor folded
 *   both to case-insensitive; rAPId is storage-agnostic);
 * - `null:` accepts only `true`/`false` — anything else falls back to
 *   exact match of the whole raw value;
 * - bare values normalise to `{ $eq }` so every filter is one shape.
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import type {
  RapidContextQuery,
  RapidContextQueryFilter,
  RapidContextQuerySort,
} from '../types/mod.ts';

/** Structural caps — mirrors the `server.query` option group. */
export type ParseQueryOptions = {
  /** Maximum distinct filter fields. @default 50 */
  maxFilters?: number;
  /** Maximum sort instructions. @default 5 */
  maxSorts?: number;
  /** Maximum single-value length (characters). @default 2048 */
  maxValueLength?: number;
  /** Maximum items in one array/`in`/`nin` filter. @default 100 */
  maxArrayItems?: number;
};

/** Keys consumed by paging resolution — never filters. */
const PAGING_KEYS = new Set(['page', 'pagelimit', 'limit']);
/** Un-numbered sort keys. */
const SORT_KEYS = new Set(['sort', 'sortby']);
/** Numbered sort keys (`sort1`, `sort2`, ...). */
const SORT_N = /^sort(\d+)$/;

/** Split a comma list, trim entries, drop empties — capped. */
function splitList(
  raw: string,
  cap: number,
  field: string,
): string[] {
  const items = raw.split(',').map((item) => item.trim()).filter(
    (item) => item !== '',
  );
  if (items.length > cap) {
    throw new RapidError('RAPID_QUERY_INVALID', {
      message: `Query filter '${field}' has too many list items (max ${cap})`,
      details: { field, items: items.length, maxArrayItems: cap },
    });
  }
  return items;
}

/** `value` verbatim for $gt-family when numeric-looking, else raw. */
function coerceComparable(value: string): string | number {
  return value !== '' && !Number.isNaN(Number(value)) ? Number(value) : value;
}

/** Parse one `field=value` into a filter, per the module grammar. */
function parseFilterValue(
  field: string,
  value: string,
  maxArrayItems: number,
): RapidContextQueryFilter | undefined {
  // Array form: Code=[a,b,c] → $in.
  if (value.startsWith('[') && value.endsWith(']')) {
    const items = splitList(value.slice(1, -1), maxArrayItems, field);
    return items.length > 0 ? { $in: items } : undefined;
  }
  const colon = value.indexOf(':');
  if (colon > 0) {
    const operator = value.slice(0, colon).toLowerCase();
    // EVERYTHING after the first colon — never truncated (the ancestral
    // split(':', 2) discarded the remainder past the second colon).
    const rest = value.slice(colon + 1);
    switch (operator) {
      case 'eq':
        return { $eq: rest };
      case 'ne':
        return { $ne: rest };
      case 'like':
        return { $like: `%${rest}%` };
      case 'ilike':
        return { $ilike: `%${rest}%` };
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        const comparable = coerceComparable(rest);
        if (operator === 'gt') return { $gt: comparable };
        if (operator === 'gte') return { $gte: comparable };
        if (operator === 'lt') return { $lt: comparable };
        return { $lte: comparable };
      }
      case 'null': {
        const flag = rest.trim().toLowerCase();
        // Strict true/false; anything else is NOT a null-op — fall
        // through to the exact-match fallback below.
        if (flag === 'true') return { $null: true };
        if (flag === 'false') return { $null: false };
        break;
      }
      case 'in': {
        const items = splitList(rest, maxArrayItems, field);
        return items.length > 0 ? { $in: items } : undefined;
      }
      case 'nin': {
        const items = splitList(rest, maxArrayItems, field);
        return items.length > 0 ? { $nin: items } : undefined;
      }
    }
    // Unknown operator (or invalid null flag): the colon belongs to the
    // VALUE (`website=https://x`) — exact match, never a silent drop.
  }
  return { $eq: value };
}

/**
 * Guard the sort cap as entries ACCUMULATE (see the call sites).
 * @throws {RapidError} RAPID_QUERY_INVALID past `cap`.
 */
function assertSortCap(current: number, cap: number): void {
  if (current >= cap) {
    throw new RapidError('RAPID_QUERY_INVALID', {
      message: `Query has too many sort fields (max ${cap})`,
      details: { maxSorts: cap },
    });
  }
}

/** Parse one sort value (`field[:direction]`) — first-colon split. */
function parseSortValue(value: string): RapidContextQuerySort | undefined {
  const colon = value.indexOf(':');
  const field = (colon === -1 ? value : value.slice(0, colon))
    .trim().toLowerCase();
  if (field === '') return undefined;
  const direction =
    (colon === -1 ? '' : value.slice(colon + 1)).trim().toUpperCase() ===
        'DESC'
      ? 'DESC'
      : 'ASC';
  return { field, direction };
}

/**
 * Parse `searchParams` into filters + sorting per the module grammar.
 * NEVER consults an allowlist and NEVER validates semantics — see the
 * fileoverview for the trust model.
 *
 * @param searchParams - The query string to parse.
 * @param options - Structural caps; defaults per {@link ParseQueryOptions}.
 * @throws {RapidError} RAPID_QUERY_INVALID when a structural cap is
 *   exceeded (a 400 — query strings are caller-controlled input).
 */
export function parseQueryFilters(
  searchParams: URLSearchParams,
  options: ParseQueryOptions = {},
): RapidContextQuery {
  const maxFilters = options.maxFilters ?? 50;
  const maxSorts = options.maxSorts ?? 5;
  const maxValueLength = options.maxValueLength ?? 2048;
  const maxArrayItems = options.maxArrayItems ?? 100;

  // NULL-PROTOTYPE accumulator — mandatory, not hygiene theatre: on a
  // plain `{}`, a `?__proto__=eq:x` key hits Object.prototype's
  // `__proto__` SETTER, which swaps the object's prototype and makes
  // the filter vanish from `Object.keys` (silent drop, runtime-
  // divergent). With no prototype there is no setter and no inherited
  // key: `__proto__`/`constructor` land as ordinary own keys, `in`
  // sees own keys only (so the cap below cannot be skipped), and the
  // result is inert for consumers.
  const filters: Record<string, RapidContextQueryFilter> = Object.create(
    null,
  ) as Record<string, RapidContextQueryFilter>;
  const sorting: RapidContextQuerySort[] = [];
  /** Numbered sorts, ordered by N AFTER the un-numbered ones. */
  const numbered: { n: number; sort: RapidContextQuerySort }[] = [];

  for (const [rawKey, value] of searchParams.entries()) {
    const key = rawKey.trim().toLowerCase();
    if (key === '' || PAGING_KEYS.has(key)) continue;

    if (value.length > maxValueLength) {
      throw new RapidError('RAPID_QUERY_INVALID', {
        message: `Query value for '${key}' is too long ` +
          `(${value.length} > ${maxValueLength})`,
        details: { field: key, length: value.length, maxValueLength },
      });
    }

    if (SORT_KEYS.has(key)) {
      const sort = parseSortValue(value);
      if (sort !== undefined) {
        // Checked IN the loop: a post-loop check still lets a hostile
        // `?sort1=..&sort2=..&…` accumulate (and sort) every entry the
        // URL can carry before throwing — the cap must bound the WORK,
        // not just the result.
        assertSortCap(sorting.length + numbered.length, maxSorts);
        sorting.push(sort);
      }
      continue;
    }
    const sortN = SORT_N.exec(key);
    if (sortN !== null) {
      const sort = parseSortValue(value);
      if (sort !== undefined) {
        assertSortCap(sorting.length + numbered.length, maxSorts);
        numbered.push({ n: Number(sortN[1]), sort });
      }
      continue;
    }

    const filter = parseFilterValue(key, value, maxArrayItems);
    if (filter === undefined) continue;
    // Duplicate keys: LAST wins (ancestral behaviour, kept on purpose —
    // an override in a hand-edited URL behaves predictably).
    if (
      !Object.hasOwn(filters, key) &&
      Object.keys(filters).length >= maxFilters
    ) {
      throw new RapidError('RAPID_QUERY_INVALID', {
        message: `Query has too many filters (max ${maxFilters})`,
        details: { maxFilters },
      });
    }
    filters[key] = filter;
  }

  // sort1..sortN in NUMERIC order (insertion order would make sort10
  // precede sort2), appended after any un-numbered `sort`/`sortby`.
  numbered.sort((a, b) => a.n - b.n);
  for (const { sort } of numbered) sorting.push(sort);

  return { filters, sorting };
}
