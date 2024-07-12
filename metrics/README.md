# Metrics

Collection of classes to help calculate and track performance metrics. It is follows prometheus standards of metric collection.

Currently supported metrics:

- [x] Counter
- [x] Gauge
- [x] Histogram
- [x] Summary

Custom metrics can be defined by extending the base class BaseMetric.

## MetroMan

This is a "registry" - A simply utility class which stores the instances of different metrics making it easier to get the instance.

### Usage

```ts
import { Counter, MetroMan } from './mod.ts';
const registry = new MetroMan();
const c = new Counter({ name: 'test_counter' });
registry.register(c);

// Later on
const fromRegistry = registry.get<Counter>('test_counter');
fromRegistry.inc();
```

#### register

Registers an instance of metric. It automatically fetches the type and name from the metric and uses them to store the
instance.

`register(inst: BasicMetric<unknown>): void`

`inst:BasicMetric<unknown>` - The instance of the metric class. The name is fetched from this instance and lowercased and used for reference making it case-insensitive

#### get

Gets a specific instance of metric.

`get<T extends BaseMetric<unknown> = BaseMetric<unknown>>(name: string): T`

`T extends BasicMetric<unknown>` - The type of metric. This would be required to seamlessly use the returned instance as the methods will vary from implementation to implementation. If this is not provided, then you can always force type conversion by using `as ClassName`

`name: string` - The name of the metric. This is provided when creating the metric instance. Case insensitive.

## BaseMetric

This is an abstract class basis which all metrics have been implemented. This allows easy extendability of metrics.
