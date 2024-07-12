import { assertMetricOptions } from './asserts/mod.ts';
import type { MetricOptions, MetricOutput, MetricType } from './types/mod.ts';
/**
 * Represents a base metric class.
 * @template T - The type of metric data.
 */
export abstract class BaseMetric<T> {
  declare protected _data: Map<string, T>;
  public readonly name: string;
  public readonly help: string;
  public readonly type: MetricType;

  /**
   * Constructs a new instance of the BaseMetric class.
   * @param opt - The metric options.
   */
  constructor(opt: MetricOptions) {
    if (assertMetricOptions(opt) === false) {
      throw new Error('Invalid metric options');
    }
    this.name = opt.name;
    this.help = opt.help || '';
    this.type = opt.type;
    this._data = new Map();
  }

  /**
   * Dumps the metric data in the specified format.
   * @param mode - The dump mode ('STRING', 'PROMETHEUS', or 'JSON').
   * @returns The dumped metric data.
   */
  dump(mode: 'STRING' | 'PROMETHEUS' | 'JSON'): string | MetricOutput<T> {
    if (mode === 'STRING') {
      return this.toString();
    } else if (mode === 'PROMETHEUS') {
      return this.toPrometheus();
    } else {
      return this.toJSON();
    }
  }

  /**
   * Converts the metric data to a string representation.
   * @returns The string representation of the metric data.
   */
  toString(): string {
    const lines: string[] = [];
    Array.from(this._data.keys()).forEach((k) => {
      const sd: string[] = [`type="${this.type}"`, `name="${this.name}"`];
      if (k !== 'no_label') {
        sd.push(k);
      }
      lines.push(`[${sd.join(', ')}] ${JSON.stringify(this._data.get(k))}`);
    });
    return lines.join('\n');
  }

  /**
   * Converts the metric data to a Prometheus formatted string.
   * @returns The Prometheus formatted string.
   */
  toPrometheus(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} ${this.type}`,
    ];
    // Loopdi loop
    Array.from(this._data).forEach(([k, v]) => {
      if (k === 'no_label') {
        lines.push(`${this.name} ${v}`);
      } else {
        lines.push(`${this.name}{${k}} ${v}`);
      }
    });
    return lines.join('\n');
  }

  /**
   * Converts the metric data to a JSON object.
   * @returns The JSON object representing the metric data.
   */
  toJSON(): MetricOutput<T> {
    return {
      name: this.name,
      help: this.help,
      type: this.type,
      labels: this.__extractLabels(),
      data: Object.fromEntries(this._data),
    };
  }

  /**
   * Extracts the labels from the metric data.
   * @returns An array of labels.
   */
  protected __extractLabels() {
    // Get unique labels
    return Array.from(this._data.keys()).filter((k) => k !== 'no_label').map((
      k,
    ) => k.split(',').map((v) => v.split('=')[0])).flatMap((v) => v).filter((
      v,
      i,
      a,
    ) => a.indexOf(v) === i);
  }
}
