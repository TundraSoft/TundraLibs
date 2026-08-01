/**
 * Param-name allocator with dedup-on-add. Every translator instance gets one.
 * `add(value)` returns a stable param name; calling it twice with the same
 * value returns the same name. Callers shouldn't care about that — it's a
 * payload optimisation, not a semantic guarantee.
 *
 * `Date`, `bigint` and `string` use string-keyed dedup so identical
 * values dedupe correctly across calls; everything else dedupes by JS Map
 * identity. The key is derived, never stored as the value — see
 * {@link DATE_KEY_TAG}.
 *
 * @module translator/Parameters
 */

/**
 * Dedup-key namespace tags. `Date` / `bigint` don't compare structurally in
 * a `Map`, so they're keyed by a tagged string built from their contents.
 *
 * Strings are tagged too, and that is the point: it is what makes the key
 * space unambiguous. Without a string tag, a user value like the literal
 * string `'date:1000'` would key identically to `new Date(1000)` — the two
 * would collapse onto one placeholder and one of them would be bound with
 * the wrong type. Every string going through {@link Parameters.add} lands
 * under {@link STRING_KEY_TAG}, so no user-supplied content can ever
 * synthesise a `Date` / `bigint` key.
 */
const DATE_KEY_TAG = 'date:';
/** @see {@link DATE_KEY_TAG} */
const BIGINT_KEY_TAG = 'bigint:';
/** @see {@link DATE_KEY_TAG} */
const STRING_KEY_TAG = 'string:';

/** A registered parameter: its allocated name and the value to bind. */
type ParamEntry = {
  name: string;
  value: unknown;
};

export class Parameters {
  /**
   * Dedup key → entry. The key is a *derived* lookup token
   * ({@link Parameters.#dedupKey}); the value to bind is carried
   * separately on the entry, so the keying scheme can never round-trip
   * back into a caller-visible value.
   */
  readonly #params: Map<unknown, ParamEntry> = new Map();
  readonly #prefix: string;

  /** @param prefix - Param-name prefix. Trailing `_` is added if absent. */
  constructor(prefix = 'p') {
    this.#prefix = prefix.endsWith('_') ? prefix : `${prefix}_`;
  }

  /**
   * Register `value` and return its param name. Same value → same name.
   */
  public add(value: unknown): string {
    const key = this.#dedupKey(value);
    const existing = this.#params.get(key);
    if (existing !== undefined) return existing.name;
    const name = `${this.#prefix}${this.#params.size}`;
    this.#params.set(key, { name, value });
    return name;
  }

  /** Snapshot of all params as a `Record<name, value>`. */
  public asRecord(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const { name, value } of this.#params.values()) {
      out[name] = value;
    }
    return out;
  }

  public get size(): number {
    return this.#params.size;
  }

  /**
   * Derive the dedup lookup key for `value`.
   *
   * `Date` and `bigint` are keyed by a tagged string built from their
   * contents so two structurally-equal instances dedupe. Strings are
   * tagged as well so they occupy a disjoint key namespace — see
   * {@link DATE_KEY_TAG}. Everything else keys as itself (Map identity /
   * SameValueZero).
   */
  #dedupKey(value: unknown): unknown {
    if (value instanceof Date) return `${DATE_KEY_TAG}${value.getTime()}`;
    if (typeof value === 'bigint') {
      return `${BIGINT_KEY_TAG}${value.toString()}`;
    }
    if (typeof value === 'string') return `${STRING_KEY_TAG}${value}`;
    return value;
  }
}
