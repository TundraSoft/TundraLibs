/**
 * @module
 *
 * `NormResult` — the ONE envelope every norm operation returns,
 * riding on the engine result (`data`/`count`/`time`/`isSlow`) and
 * augmenting it with correlation metadata:
 *
 * - `id` — a ULID minted per operation. The SAME id is stamped on the
 *   `call` event, so event-bus logs correlate 1:1 with the envelope
 *   the caller holds.
 * - `txId` — present iff the operation ran on a transaction-scoped
 *   handle.
 * - `data` — typed EXACTLY per method (`Row[]` for find/insert,
 *   `Row | null` for findOne/getByPK) and ABSENT entirely for
 *   count-only operations (update/delete/count/truncate): when the
 *   generic is left at its `undefined` default, the envelope has no
 *   `data` property at all.
 * - `count` — always a `number` (BIGINT counts are coerced). For
 *   reads it is the rows in THIS result (pagination applies!); for
 *   writes the affected-row count; for `count()` the answer.
 * - `total` — OPT-IN on `find(filter, { total: true })`: the total
 *   matching rows regardless of limit/offset, via a second COUNT
 *   sharing the same (rewritten) filter and filter-driven joins.
 *
 * @since 1.0.0
 */

/** Crockford base32 alphabet (ULID). */
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Compact ULID: 48-bit timestamp + 80 bits of randomness, 26 chars,
 * lexicographically sortable by creation time. No monotonic counter —
 * these ids correlate logs, they don't order same-millisecond events.
 */
export function ulid(now: number = Date.now()): string {
  let ts = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    ts = B32[t % 32] + ts;
    t = Math.floor(t / 32);
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let rand = '';
  for (let i = 0; i < 16; i++) rand += B32[bytes[i]! & 31];
  return ts + rand;
}

/**
 * The consistent operation envelope. Instantiate the generic for
 * data-bearing operations; leave it defaulted for count-only ones —
 * the `data` property then does not exist (not even as `undefined`).
 */
export type NormResult<P = undefined> =
  & {
    /** Operation id (ULID) — also stamped on the `call` event. */
    readonly id: string;
    /** Transaction id when run on a tx-scoped handle. */
    readonly txId?: string;
    /** The executed operation (`SELECT` / `INSERT` / …). */
    readonly op: string;
    /** Rows in THIS result / affected rows / the count() answer. */
    readonly count: number;
    /** Engine-reported duration in ms. */
    readonly time: number;
    readonly isSlow: boolean;
    /** Total matching rows — only when `find(…, { total: true })`. */
    readonly total?: number;
    /** The equality scope filter that was actually applied to this
     * operation (from `db.scope(...)`), keyed by `@column`. Present only
     * when a scope constrained the op — for logging/audit. */
    readonly scoped?: Readonly<Record<string, unknown>>;
  }
  & ([P] extends [undefined] ? unknown : { readonly data: P });

/** Coerce engine counts (BIGINT → string on some dialects) to number. */
export function coerceCount(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'bigint') return Number(raw);
  if (typeof raw === 'string' && raw !== '') return Number(raw);
  return 0;
}

/** @internal Assemble an envelope (runtime side of the conditional). */
export function makeResult<P>(fields: {
  op: string;
  count: number;
  time: number;
  isSlow: boolean;
  txId?: string | undefined;
  total?: number | undefined;
  scoped?: Readonly<Record<string, unknown>> | undefined;
  data?: P;
  id?: string;
}): NormResult<P> {
  return {
    id: fields.id ?? ulid(),
    op: fields.op,
    count: fields.count,
    time: fields.time,
    isSlow: fields.isSlow,
    ...(fields.txId !== undefined ? { txId: fields.txId } : {}),
    ...(fields.total !== undefined ? { total: fields.total } : {}),
    ...(fields.scoped !== undefined ? { scoped: fields.scoped } : {}),
    ...('data' in fields ? { data: fields.data } : {}),
  } as NormResult<P>;
}
