/**
 * @fileoverview Tests for the cross-cutting BaseMetric option validation.
 * Concrete metric behavior is covered by Counter/Gauge/Histogram/Summary tests.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Counter, Gauge, Histogram, Summary } from './mod.ts';
import { InvalidLabelError, InvalidMetricOptionsError } from './errors/mod.ts';

// A naked construction path that reaches BaseMetric's validator without
// the concrete-metric type injection. `Counter` is the cheapest entry
// point since its constructor forwards directly to the base.

describe('BaseMetric', () => {
  describe('Option validation', () => {
    it('should require a `name` field', () => {
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => new Counter({} as any),
        InvalidMetricOptionsError,
        'Metric name is required',
      );
    });

    it('should reject a non-string `name`', () => {
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => new Counter({ name: 123 } as any),
        InvalidMetricOptionsError,
        'Invalid metric name',
      );
    });

    it('should reject a `name` that breaks Prometheus exposition', () => {
      for (
        const bad of ['has space', 'has{brace', 'has\nnewline', '1leading']
      ) {
        asserts.assertThrows(
          () => new Counter({ name: bad }),
          InvalidMetricOptionsError,
          'Metric name must match',
        );
      }
    });

    it('should accept colons and underscores in `name`', () => {
      const c = new Counter({ name: 'app:http_requests_total' });
      asserts.assertEquals(c.name, 'app:http_requests_total');
    });

    it('should reject a non-string `help`', () => {
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => new Counter({ name: 'ok', help: 123 } as any),
        InvalidMetricOptionsError,
        'Invalid metric help',
      );
    });

    it('should accept `help: undefined` as if omitted', () => {
      const c = new Counter({ name: 'with_help', help: undefined });
      asserts.assertEquals(c.help, '');
    });

    it('should default help to empty string when omitted', () => {
      const c = new Counter({ name: 'no_help' });
      asserts.assertEquals(c.help, '');
    });

    it('should set name, help, and type on the instance', () => {
      const c = new Counter({ name: 'metric_one', help: 'first' });
      asserts.assertEquals(c.name, 'metric_one');
      asserts.assertEquals(c.help, 'first');
      asserts.assertEquals(c.type, 'COUNTER');
    });
  });

  describe('Label name validation', () => {
    it('should reject a label name that breaks Prometheus exposition', () => {
      const c = new Counter({ name: 'label_name_test' });
      for (const bad of ['bad-name!', 'has space', '1leading', 'quo"te']) {
        asserts.assertThrows(
          () => c.inc({ [bad]: 'v' }),
          InvalidLabelError,
          `Label name '${bad}' must match`,
        );
      }
      // The rejected calls must not have created a series.
      asserts.assertEquals(c.toJSON().data, {});
    });

    it('should validate label names on every metric kind', () => {
      const h = new Histogram({ name: 'label_name_test' });
      asserts.assertThrows(
        () => h.observe(1, { 'bad-name!': 'v' }),
        InvalidLabelError,
        "Label name 'bad-name!' must match",
      );
      const s = new Summary({ name: 'label_name_test' });
      asserts.assertThrows(
        () => s.observe(1, { 'bad-name!': 'v' }),
        InvalidLabelError,
        "Label name 'bad-name!' must match",
      );
    });

    it('should attach label, reason, and metricType to the error context', () => {
      const c = new Counter({ name: 'label_name_test' });
      try {
        c.inc({ 'bad-name!': 'v' });
        asserts.fail('inc() should have thrown');
      } catch (e) {
        asserts.assertInstanceOf(e, InvalidLabelError);
        asserts.assertEquals(e.context.label, 'bad-name!');
        asserts.assertEquals(e.context.reason, 'invalid');
        asserts.assertEquals(e.context.metricType, 'COUNTER');
      }
    });

    it('should accept underscore-led and alphanumeric label names', () => {
      const c = new Counter({ name: 'label_name_test' });
      c.inc({ alpha_1: 'x', beta: '1' });
      asserts.assertEquals(Object.keys(c.toJSON().data), [
        'alpha_1="x",beta="1"',
      ]);
    });
  });

  describe('toPrometheus() escaping', () => {
    it('should escape newlines and backslashes in `help`', () => {
      const c = new Counter({
        name: 'esc_counter',
        help: 'line one\nline two \\ end',
      });
      const lines = c.toPrometheus().split('\n');
      // The HELP line must remain a single line — an unescaped newline
      // would split it into two malformed lines.
      asserts.assertEquals(
        lines[0],
        String.raw`# HELP esc_counter line one\nline two \\ end`,
      );
      asserts.assertEquals(lines[1], '# TYPE esc_counter counter');
    });
  });

  describe('toPrometheus() `# TYPE` token', () => {
    // The Prometheus text-exposition parser only accepts a lowercase
    // type token on the `# TYPE` line — counter/gauge/histogram/summary/
    // untyped. An uppercase token ('COUNTER', …) makes the scrape parser
    // abort the entire scrape with `invalid metric type`, so every kind's
    // exposition must emit the lowercase token even though the internal
    // `MetricType` discriminator (and the JSON/STRING outputs) stay
    // uppercase.
    const TYPE_LINE =
      /^# TYPE ([a-zA-Z_:][a-zA-Z0-9_:]*) (?:counter|gauge|histogram|summary|untyped)$/;

    const cases: Array<[string, () => { toPrometheus(): string }, string]> = [
      [
        'counter',
        () => new Counter({ name: 'req_total' }),
        'req_total counter',
      ],
      ['gauge', () => new Gauge({ name: 'in_flight' }), 'in_flight gauge'],
      [
        'histogram',
        () => new Histogram({ name: 'lat_seconds' }),
        'lat_seconds histogram',
      ],
      [
        'summary',
        () => new Summary({ name: 'dur_seconds' }),
        'dur_seconds summary',
      ],
    ];

    for (const [kind, make, expected] of cases) {
      it(`should emit a lowercase '${kind}' type token`, () => {
        const typeLine = make().toPrometheus().split('\n').find((l) =>
          l.startsWith('# TYPE ')
        );
        asserts.assertEquals(typeLine, `# TYPE ${expected}`);
        // ...and it must satisfy the Prometheus `# TYPE` grammar.
        asserts.assertMatch(typeLine!, TYPE_LINE);
      });
    }
  });

  describe('toPrometheus() terminating line feed', () => {
    // The text-exposition format requires the rendered body to end with
    // a line feed: "Lines are separated by a line feed character (\n).
    // The last line must end with a line feed character." A body whose
    // final sample line has no trailing LF is rejected at EOF by strict
    // parsers (Pushgateway ingestion, `promtool check metrics`), so
    // every metric kind's `toPrometheus()` must self-terminate — a
    // single metric served straight to `/metrics`, and each block
    // concatenated by `collect('PROMETHEUS')`, must both end in exactly
    // one LF (and not a trailing blank line).
    const cases: Array<[string, () => { toPrometheus(): string }]> = [
      ['counter', () => {
        const c = new Counter({ name: 'req_total' });
        c.inc(2, { route: '/u' });
        return c;
      }],
      ['gauge', () => {
        const g = new Gauge({ name: 'in_flight' });
        g.set(1);
        return g;
      }],
      ['histogram', () => {
        const h = new Histogram({ name: 'lat_seconds' });
        h.observe(0.4);
        return h;
      }],
      ['summary', () => {
        const s = new Summary({ name: 'dur_seconds' });
        s.observe(0.42);
        return s;
      }],
    ];

    for (const [kind, make] of cases) {
      it(`should terminate ${kind} exposition with exactly one line feed`, () => {
        const body = make().toPrometheus();
        asserts.assertEquals(body.endsWith('\n'), true);
        asserts.assertEquals(body.endsWith('\n\n'), false);
      });
    }

    // A metric that is registered/constructed but not yet observed is the
    // common "declare at startup, scrape /metrics before the first request"
    // state. It renders header-only (`# HELP` / `# TYPE`, no sample lines),
    // and that body must be just as spec-valid as an observed one: exactly
    // one terminating LF and *no* blank line anywhere (a trailing `\n\n` or
    // a mid-body blank line is rejected by Pushgateway / `promtool check
    // metrics`). Histogram/Summary previously concatenated a header string
    // that already ended in `\n` with an empty data string, emitting a
    // trailing blank line for this case.
    const emptyCases: Array<[string, () => { toPrometheus(): string }]> = [
      ['counter', () => new Counter({ name: 'req_total' })],
      ['gauge', () => new Gauge({ name: 'in_flight' })],
      ['histogram', () => new Histogram({ name: 'lat_seconds' })],
      ['summary', () => new Summary({ name: 'dur_seconds' })],
    ];

    for (const [kind, make] of emptyCases) {
      it(`should render an unobserved ${kind} as spec-valid header-only exposition`, () => {
        const body = make().toPrometheus();
        // Exactly one terminating line feed…
        asserts.assertEquals(body.endsWith('\n'), true);
        asserts.assertEquals(body.endsWith('\n\n'), false);
        // …no blank line anywhere in the body…
        asserts.assertEquals(body.includes('\n\n'), false);
        // …and no leading blank line.
        asserts.assertEquals(body.startsWith('\n'), false);
      });
    }
  });
});
