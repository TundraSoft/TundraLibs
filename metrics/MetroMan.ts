import { BaseMetric } from './Base.ts';

/**
 * MetroMan - Centralised metrics storage for easier access.
 */
export class MetroMan {
  protected _instances: Map<string, BaseMetric<unknown>> = new Map();

  /**
   * Registers an instance of metrics. It can be accessed later using the name with which
   * it was created
   *
   * @param inst Metric instance to register.
   */
  register<T = unknown>(...inst: BaseMetric<T>[]): void {
    // Register the metric instance with the metrics registry.
    inst.forEach((i) => {
      const name = i.name.trim().toLowerCase();
      this._instances.set(name, i);
    });
  }

  /**
   * Gets a specific metric instance. The name is not case sensitive.
   *
   * @param name string The name with which the metrics was created
   * @returns BaseMetrics Returns the Metric instance. Use the type parameter to specify the type of the metric.
   */
  get<T extends BaseMetric<unknown> = BaseMetric<unknown>>(name: string): T {
    name = name.trim().toLowerCase();
    if (!this._instances.has(name)) {
      throw new Error(`Metric '${name}' not found`);
    }
    return this._instances.get(name)! as T;
  }

  collect(type: 'STRING'): string;
  collect(type: 'JSON'): Record<string, unknown>;
  collect(type: 'PROMETHEUS'): string;
  /**
   * Collects all the metrics in the specified format.
   *
   * @param type { STRING | JSON | PROMETHEUS } The output format of the metrics
   * @returns string | Record<string, unknown> Returns the metrics in the specified format
   */
  collect(
    type: 'STRING' | 'JSON' | 'PROMETHEUS' = 'JSON',
  ): string | Record<string, unknown> {
    if (type === 'STRING' || type === 'PROMETHEUS') {
      return Array.from(this._instances.values()).map((inst) => inst.dump(type))
        .join('\n');
    } else if (type === 'JSON') {
      const metrics: Record<string, unknown> = {};
      this._instances.forEach((inst, name) => {
        metrics[name] = inst.dump(type);
      });
      return metrics;
    } else {
      throw new Error('Invalid output type');
    }
  }
}
