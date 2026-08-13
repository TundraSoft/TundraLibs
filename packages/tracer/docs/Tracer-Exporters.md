# Tracer Exporters

Where finished spans go, and how batching keeps that off the request path.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [The exporter contract](#the-exporter-contract)
- [Built-in exporters](#built-in-exporters)
- [BatchSpanProcessor](#batchspanprocessor)
- [Tuning the batch](#tuning-the-batch)
- [Shutdown](#shutdown)
- [Writing your own exporter](#writing-your-own-exporter)

## The exporter contract

{@linkcode SpanExporter} is two methods, one of them optional:

```typescript
import type { SpanData } from '@tundralibs/tracer';

type SpanExporter = {
  export(spans: SpanData[]): Promise<void>;
  shutdown?(): Promise<void>;
};
```

Two rules an implementation must honour:

1. **Never throw into the caller.** A failed export is an observability problem,
   not an application problem. Report it out of band — a callback, a log line —
   and resolve normally. Tracer swallows both rejections and synchronous throws
   as a backstop, but an exporter that relies on that is reporting nothing to
   anyone.
2. **Treat `spans` as immutable.** It is a snapshot; retaining or mutating it
   affects only your copy, and retaining large batches is a leak.

## Built-in exporters

| Exporter          | Use                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `ConsoleExporter` | local development — one readable line per span, or `{ json: true }` for newline-delimited JSON |
| `MemoryExporter`  | tests — buffers spans, with `spans`, `find(name)` and `reset()`                                |
| `OTLPExporter`    | real backends — see [Tracer-OTLP](Tracer-OTLP.md)                                              |

`MemoryExporter` is what makes tracing assertable:

```typescript
import { MemoryExporter, Tracer } from '@tundralibs/tracer';

const exporter = new MemoryExporter();
const tracer = new Tracer({ serviceName: 'test', exporter });

tracer.startActiveSpan('work', (s) => s.setAttribute('ok', true));

exporter.find('work')?.attributes.ok; // true
exporter.reset(); // between cases
```

A tracer with **no** exporter is valid and useful: spans are still created,
still nest, and still propagate, but nothing is emitted. That is the right
configuration for a library that wants correlation ids without imposing an
export destination.

## BatchSpanProcessor

By default a span is exported the moment it ends — one export call per span.
Fine for console and memory; wrong for anything over a network, where it means
one HTTP round-trip per span.

{@linkcode BatchSpanProcessor} buffers spans and flushes them in batches. It
_is_ a `SpanExporter` that wraps another one, so it needs no special support
from `Tracer` — it just goes in the `exporter` slot:

```typescript
import { BatchSpanProcessor, Tracer } from '@tundralibs/tracer';
import { OTLPExporter } from '@tundralibs/tracer/exporters/otlp';

const baseURL = 'http://localhost:4318';

new Tracer({
  serviceName: 'orders',
  exporter: new BatchSpanProcessor(new OTLPExporter({ baseURL })),
});
```

A batch flushes on whichever comes first:

- the queue reaches `maxExportBatchSize`
- `scheduledDelayMs` elapses with anything queued

The timer is armed **only while spans are queued** and cleared as soon as the
queue drains, so an idle tracer holds no pending timer and cannot keep a
short-lived process — a CLI, a serverless invocation — alive past its work.

## Tuning the batch

| Option               | Default | Meaning                                          |
| -------------------- | ------- | ------------------------------------------------ |
| `maxQueueSize`       | 2048    | spans buffered before the **oldest** are dropped |
| `maxExportBatchSize` | 512     | spans per export call                            |
| `scheduledDelayMs`   | 5000    | how long a partial batch waits                   |
| `onDrop`             | —       | called with the number dropped on overflow       |

The queue is bounded on purpose: an unreachable collector must cost bounded
memory, not grow until the process dies. On overflow the **oldest** spans go
first, on the reasoning that when telemetry is backing up, recent spans describe
the problem better than stale ones.

Dropping is silent by default — it is the designed response to backpressure, not
an error — but it is worth alarming on, because it means you are losing data:

```typescript
import { BatchSpanProcessor, ConsoleExporter } from '@tundralibs/tracer';

const exporter = new ConsoleExporter();
const metrics = { counter: (_name: string) => ({ inc: (_n: number) => {} }) };

new BatchSpanProcessor(exporter, {
  onDrop: (n) => metrics.counter('spans.dropped').inc(n),
});
```

Lower `scheduledDelayMs` for a low-traffic service that would otherwise wait
seconds to report; raise `maxExportBatchSize` for a high-traffic one to trade
latency for fewer round-trips.

## Shutdown

Buffered spans are lost if the process exits with a partial batch. Flush before
exiting:

```typescript
import { Tracer } from '@tundralibs/tracer';

const tracer = new Tracer({ serviceName: 'orders' });

await tracer.shutdown();
```

`Tracer.shutdown()` awaits in-flight exports and then calls the exporter's
`shutdown()`, which for `BatchSpanProcessor` flushes the queue, awaits those
exports, and shuts the wrapped exporter down in turn.

`forceFlush()` does the same without shutting down — useful at a natural
checkpoint, or in a test before asserting on exported spans.

## Writing your own exporter

Anything satisfying the two-method contract works — a file writer, a vendor SDK,
a test double:

```typescript
import type { SpanData, SpanExporter } from '@tundralibs/tracer';

class FileExporter implements SpanExporter {
  #handle: Deno.FsFile;
  #onError?: (err: unknown) => void;

  constructor(handle: Deno.FsFile) {
    this.#handle = handle;
  }

  async export(spans: SpanData[]): Promise<void> {
    try {
      const lines = spans.map((s) => JSON.stringify(s)).join('\n') + '\n';
      await this.#handle.write(new TextEncoder().encode(lines));
    } catch (err) {
      // Rule 1: report, never throw into the caller.
      this.#onError?.(err);
    }
  }

  async shutdown(): Promise<void> {
    this.#handle.close();
  }
}
```

Wrap it in a `BatchSpanProcessor` if the write is expensive; leave it bare if it
is cheap and synchronous.
