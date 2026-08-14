/**
 * @fileoverview Abstract base class shared by every concrete metric.
 *
 * @module
 */

import { InvalidLabelError, InvalidMetricOptionsError } from './errors/mod.ts';
import type { MetricOptions, MetricOutput, MetricType } from './types/mod.ts';

const VALID_TYPES: ReadonlySet<MetricType> = new Set([
  'COUNTER',
  'GAUGE',
  'HISTOGRAM',
  'SUMMARY',
]);

/**
 * Legal Prometheus metric name. A name outside this shape would
 * produce malformed exposition once interpolated (a space or `{`
 * breaks the `# TYPE` line and the series lines), so it's rejected at
 * construction rather than escaped at render time.
 */
const METRIC_NAME_PATTERN = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;

/**
 * Legal Prometheus label name. Same rationale as
 * {@link METRIC_NAME_PATTERN}: a name outside this shape (a space,
 * dash, or quote) renders malformed exposition once interpolated
 * into a series line, so it's rejected where labels enter rather
 * than escaped at render time.
 */
const LABEL_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Internal storage shape — labels are kept alongside the value so we
 * never have to parse the canonical key string back into a record.
 */
export type SeriesEntry<T> = {
  labels: Record<string, string>;
  data: T;
};

/**
 * Common state and rendering logic shared by every metric kind.
 *
 * Concrete subclasses ({@link Counter}, {@link Gauge}, {@link Histogram},
 * {@link Summary}) own the public mutation API (`inc`, `set`, `observe`)
 * and the shape of `T` — the per-series payload stored under each
 * label key. This class owns the cross-cutting parts: option
 * validation, canonical label-key construction with escaping, and
 * the three output renderers (`toString`, `toJSON`, `toPrometheus`).
 *
 * @typeParam T - Per-series payload (number for counters/gauges, an
 *   ordered bucket list for histograms, a quantile record for
 *   summaries).
 * @typeParam O - Concrete options shape, narrowing {@link MetricOptions}.
 *
 * @example
 * ```typescript
 * type MyMetricOptions = { name: string; help?: string; type: 'COUNTER' };
 *
 * class MyMetric extends BaseMetric<number, MyMetricOptions> {
 *   constructor(opt: Omit<MyMetricOptions, 'type'>) {
 *     super({ ...opt, type: 'COUNTER' });
 *   }
 * }
 * ```
 */
export abstract class BaseMetric<
  T,
  O extends MetricOptions = MetricOptions,
> {
  /** Prometheus family name, validated against {@link METRIC_NAME_PATTERN}. */
  public readonly name: string;

  /**
   * Description rendered on the `# HELP` line. Empty string when the
   * caller omitted `help`.
   */
  public readonly help: string;

  /** Metric kind, fixed by the concrete subclass at construction. */
  public readonly type: MetricType;

  /** Per-series storage. Key is the canonical label string. */
  protected _data: Map<string, SeriesEntry<T>> = new Map();

  /**
   * Validate the option fields every metric kind shares, then record
   * `name`, `help`, and `type`.
   *
   * @param opt - Concrete options object. Subclasses inject `type`
   *   themselves before delegating to `super()`.
   *
   * @throws {@link InvalidMetricOptionsError} When `name` is missing
   *   or not a string, `help` is provided but not a string, or `type`
   *   is not one of {@link MetricType}.
   */
  constructor(opt: O) {
    BaseMetric.__assertMetricOptions(opt);
    this.name = opt.name;
    this.help = opt.help ?? '';
    this.type = opt.type;
  }

  /** Snapshot every series as a {@link MetricOutput} object. */
  public dump(mode: 'JSON'): MetricOutput<T>;
  /**
   * Render every series as text — `'STRING'` gives the bracket-prefixed
   * debug form, `'PROMETHEUS'` the `# HELP` / `# TYPE` exposition.
   */
  public dump(mode: 'STRING' | 'PROMETHEUS'): string;
  public dump(
    mode: 'STRING' | 'PROMETHEUS' | 'JSON',
  ): string | MetricOutput<T> {
    if (mode === 'STRING') return this.toString();
    if (mode === 'PROMETHEUS') return this.toPrometheus();
    return this.toJSON();
  }

  /**
   * Human-readable dump — one line per series, bracket-prefixed with
   * `type=` and `name=`. Intended for log lines and ad-hoc debugging,
   * not as a stable wire format.
   */
  public toString(): string {
    const lines: string[] = [];
    for (const [k, entry] of this._data) {
      const sd: string[] = [`type="${this.type}"`, `name="${this.name}"`];
      if (k !== 'no_label') sd.push(k);
      lines.push(`[${sd.join(', ')}] ${JSON.stringify(entry.data)}`);
    }
    return lines.join('\n');
  }

  /**
   * Prometheus text-exposition rendering. Subclasses override when
   * their series isn't a single scalar — {@link Histogram} adds
   * `_bucket` / `_sum` / `_count` lines, {@link Summary} adds
   * quantile-suffixed lines.
   *
   * The `# TYPE` line emits the **lowercase** type token
   * (`counter`/`gauge`/`histogram`/`summary`) via
   * {@link BaseMetric._promType}: the Prometheus text-exposition parser
   * is case-sensitive here and rejects an uppercase token, aborting the
   * whole scrape. The uppercase {@link MetricType} discriminator is kept
   * for the JSON and STRING renderers.
   *
   * The rendered body is **terminated with a trailing line feed**. The
   * text-exposition format is explicit: "Lines are separated by a line
   * feed character (`\n`). The last line must end with a line feed
   * character." A body whose final sample line lacks that LF is rejected
   * at EOF by the strict parsers (Pushgateway ingestion,
   * `promtool check metrics`), so every kind self-terminates — a single
   * metric served straight to `/metrics`, and each block concatenated by
   * {@link MetroMan.collect}, both end in exactly one LF.
   */
  public toPrometheus(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${BaseMetric._escapeHelp(this.help)}`,
      `# TYPE ${this.name} ${BaseMetric._promType(this.type)}`,
    ];
    for (const [k, entry] of this._data) {
      if (k === 'no_label') {
        lines.push(`${this.name} ${entry.data}`);
      } else {
        lines.push(`${this.name}{${k}} ${entry.data}`);
      }
    }
    return lines.join('\n') + '\n';
  }

  /**
   * Structured snapshot of the metric. `labels` lists the unique
   * label names observed across all series; `data` is keyed by the
   * canonical label string and carries the per-series payload.
   *
   * Each per-series payload is **deep-copied** so the returned object
   * is a true point-in-time snapshot: a later `observe()`/`inc()`/`set()`
   * cannot mutate an already-returned result (the {@link Histogram}
   * payload is a live mutable object updated in place), and a caller
   * mutating the returned object cannot corrupt the metric's internal
   * counters.
   */
  public toJSON(): MetricOutput<T> {
    const data: Record<string, T> = {};
    for (const [k, entry] of this._data) data[k] = structuredClone(entry.data);
    return {
      name: this.name,
      help: this.help,
      type: this.type,
      labels: this.__extractLabels(),
      data,
    };
  }

  /**
   * Clear every series. The metric stays registered; its label set
   * is wiped so the next observation starts fresh.
   */
  public reset(): void {
    this._data.clear();
  }

  /**
   * Drop the series matching `labels`. With no argument, drops the
   * unlabelled series. Returns `true` if a series was actually
   * removed.
   *
   * @throws {@link InvalidLabelError} When `labels` contains a name
   *   that isn't a legal Prometheus label name.
   */
  public remove(labels?: Record<string, string>): boolean {
    return this._data.delete(this._labelKey(labels));
  }

  /**
   * Build the canonical label-string key for a labels record.
   *
   * Keys are sorted alphabetically by label name so `{b:'2', a:'1'}`
   * and `{a:'1', b:'2'}` produce the same series. Values are
   * escaped per the Prometheus exposition spec (`\` → `\\`, `"` →
   * `\"`, `\n` → `\n`). Returns `'no_label'` when `labels` is
   * `undefined`/empty.
   *
   * @throws {@link InvalidLabelError} When a label name doesn't match
   *   {@link LABEL_NAME_PATTERN} — there is no escaping that could
   *   make such a name render as valid exposition.
   */
  protected _labelKey(labels?: Record<string, string>): string {
    if (!labels) return 'no_label';
    const entries = Object.entries(labels);
    if (entries.length === 0) return 'no_label';
    for (const [name] of entries) {
      if (!LABEL_NAME_PATTERN.test(name)) {
        throw new InvalidLabelError(
          `Label name '${name}' must match /^[a-zA-Z_][a-zA-Z0-9_]*$/`,
          { label: name, reason: 'invalid', metricType: this.type },
        );
      }
    }
    entries.sort(([a], [b]) => a.localeCompare(b));
    return entries
      .map(([k, v]) => `${k}="${BaseMetric.__escapeLabelValue(v)}"`)
      .join(',');
  }

  /**
   * Look up (or create) the entry for a label set, initialising
   * `data` with the value returned by `init()` on a miss.
   */
  protected _entry(
    labels: Record<string, string> | undefined,
    init: () => T,
  ): SeriesEntry<T> {
    const key = this._labelKey(labels);
    let entry = this._data.get(key);
    if (!entry) {
      entry = { labels: labels ? { ...labels } : {}, data: init() };
      this._data.set(key, entry);
    }
    return entry;
  }

  /** Collect the union of label names across every stored series. */
  private __extractLabels(): string[] {
    const seen = new Set<string>();
    for (const entry of this._data.values()) {
      for (const name of Object.keys(entry.labels)) seen.add(name);
    }
    return Array.from(seen);
  }

  /**
   * Apply Prometheus value escaping per the
   * [text exposition spec](https://prometheus.io/docs/instrumenting/exposition_formats/):
   * backslashes, double quotes, and newlines get backslash-escaped.
   */
  private static __escapeLabelValue(value: string): string {
    let out = '';
    for (const ch of value) {
      if (ch === '\\') out += String.raw`\\`;
      else if (ch === '"') out += String.raw`\"`;
      else if (ch === '\n') out += String.raw`\n`;
      else out += ch;
    }
    return out;
  }

  /**
   * Map the internal uppercase {@link MetricType} discriminator to the
   * lowercase token the Prometheus text-exposition format requires on
   * the `# TYPE` line.
   *
   * The Prometheus scrape parser only accepts
   * `counter`/`gauge`/`histogram`/`summary`/`untyped`; an uppercase
   * token makes it abort the entire scrape with `invalid metric type`.
   * The uppercase {@link MetricType} value is preserved everywhere else
   * (the JSON `type` field and the STRING `type=` prefix).
   *
   * Subclasses that build their own `# TYPE` header call this so the
   * mapping stays in one place.
   */
  protected static _promType(type: MetricType): string {
    return type.toLowerCase();
  }

  /**
   * Escape a `help` string for a Prometheus `# HELP` line. Per the
   * [text exposition spec](https://prometheus.io/docs/instrumenting/exposition_formats/),
   * only backslashes and newlines are escaped on HELP lines (double
   * quotes are left as-is); an unescaped newline would otherwise split
   * the metric into two malformed lines.
   *
   * Subclasses that build their own `# HELP` header call this so the
   * escaping stays in one place.
   */
  protected static _escapeHelp(help: string): string {
    let out = '';
    for (const ch of help) {
      if (ch === '\\') out += String.raw`\\`;
      else if (ch === '\n') out += String.raw`\n`;
      else out += ch;
    }
    return out;
  }

  /**
   * Validate the cross-cutting fields every metric shares.
   *
   * @throws {@link InvalidMetricOptionsError} When validation fails.
   */
  private static __assertMetricOptions(opts: MetricOptions): void {
    const obj = opts as unknown as Record<string, unknown>;
    if (!('name' in obj)) {
      throw new InvalidMetricOptionsError('Metric name is required', {
        field: 'name',
      });
    }
    if (typeof obj.name !== 'string') {
      throw new InvalidMetricOptionsError('Invalid metric name', {
        field: 'name',
      });
    }
    if (!METRIC_NAME_PATTERN.test(obj.name)) {
      throw new InvalidMetricOptionsError(
        'Metric name must match /^[a-zA-Z_:][a-zA-Z0-9_:]*$/',
        { field: 'name' },
      );
    }
    if (
      'help' in obj && obj.help !== undefined && typeof obj.help !== 'string'
    ) {
      throw new InvalidMetricOptionsError('Invalid metric help', {
        field: 'help',
      });
    }
    if (!('type' in obj)) {
      throw new InvalidMetricOptionsError('Metric type is required', {
        field: 'type',
      });
    }
    const rawType = obj.type;
    if (typeof rawType !== 'string') {
      throw new InvalidMetricOptionsError(
        `Invalid metric type: ${typeof rawType}`,
        { field: 'type' },
      );
    }
    if (!VALID_TYPES.has(rawType as MetricType)) {
      throw new InvalidMetricOptionsError(`Invalid metric type: ${rawType}`, {
        field: 'type',
      });
    }
  }
}
