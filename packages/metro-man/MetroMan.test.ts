/**
 * @fileoverview Tests for the MetroMan registry.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Counter, Gauge, Histogram, MetroMan, Summary } from './mod.ts';
import { DuplicateMetricError, MetricNotFoundError } from './errors/mod.ts';

/**
 * Minimal validator for the Prometheus text-exposition grammar —
 * enough to catch a body a real scraper would reject. Returns `null`
 * when `body` conforms, or a message describing the first violation.
 *
 * Checks the parts this package is responsible for:
 *   - the whole document ends with exactly one line feed (the spec's
 *     "The last line must end with a line feed character") and not a
 *     trailing blank line;
 *   - every `# HELP` / `# TYPE` metadata line is well-formed (the TYPE
 *     token is one of the lowercase kinds);
 *   - every sample line is `name{labels}? value`.
 */
function validatePrometheusText(body: string): string | null {
  if (body === '') return null; // an empty exposition is trivially valid
  if (!body.endsWith('\n')) {
    return 'body does not end with a terminating line feed';
  }
  if (body.endsWith('\n\n')) return 'body ends with a blank line';
  const HELP = /^# HELP [a-zA-Z_:][a-zA-Z0-9_:]*( .*)?$/;
  const TYPE =
    /^# TYPE [a-zA-Z_:][a-zA-Z0-9_:]* (?:counter|gauge|histogram|summary|untyped)$/;
  const SAMPLE = /^[a-zA-Z_:][a-zA-Z0-9_:]*(?:\{.*\})? .+$/;
  // Drop the final '' the trailing LF produces before validating lines.
  for (const line of body.slice(0, -1).split('\n')) {
    if (line === '') return 'contains a blank line';
    if (line.startsWith('# HELP ')) {
      if (!HELP.test(line)) return `malformed HELP line: ${line}`;
    } else if (line.startsWith('# TYPE ')) {
      if (!TYPE.test(line)) return `malformed TYPE line: ${line}`;
    } else if (line.startsWith('#')) {
      continue; // a plain comment line is allowed
    } else if (!SAMPLE.test(line)) {
      return `malformed sample line: ${line}`;
    }
  }
  return null;
}

describe('MetroMan', () => {
  describe('Construction', () => {
    it('should start with no registered metrics', () => {
      const metrics = new MetroMan();
      asserts.assertInstanceOf(metrics, MetroMan);
      asserts.assertEquals(metrics.names.length, 0);
    });
  });

  describe('Factory methods', () => {
    it('should create, register, and return typed instances', () => {
      const metrics = new MetroMan();
      const counter = metrics.counter({
        name: 'test_counter',
        help: 'A test counter',
      });
      const gauge = metrics.gauge({ name: 'test_gauge', help: 'A test gauge' });
      const histogram = metrics.histogram({
        name: 'test_histogram',
        help: 'A test histogram',
        buckets: [0.1, 0.5, 1, 2, 5],
      });
      const summary = metrics.summary({
        name: 'test_summary',
        help: 'A test summary',
        quantiles: [0.5, 0.9, 0.95, 0.99],
      });

      asserts.assertInstanceOf(counter, Counter);
      asserts.assertInstanceOf(gauge, Gauge);
      asserts.assertInstanceOf(histogram, Histogram);
      asserts.assertInstanceOf(summary, Summary);

      asserts.assertEquals(metrics.names.length, 4);
      asserts.assertEquals(metrics.names, [
        'test_counter',
        'test_gauge',
        'test_histogram',
        'test_summary',
      ]);
      asserts.assertEquals(metrics.has('test_counter'), true);
      asserts.assertEquals(metrics.has('nonexistent'), false);
    });
  });

  describe('register()', () => {
    it('should register externally constructed instances', () => {
      const metrics = new MetroMan();
      const counter = new Counter({
        name: 'manual_counter',
        help: 'Manually registered counter',
      });
      const gauge = new Gauge({
        name: 'manual_gauge',
        help: 'Manually registered gauge',
      });
      metrics.register(counter, gauge);

      asserts.assertEquals(metrics.names.length, 2);
      asserts.assertEquals(metrics.has('manual_counter'), true);
      asserts.assertEquals(metrics.has('manual_gauge'), true);

      const retrievedCounter = metrics.get<Counter>('manual_counter');
      asserts.assertInstanceOf(retrievedCounter, Counter);
      retrievedCounter.inc();
    });

    it('should throw DuplicateMetricError on a name collision', () => {
      const metrics = new MetroMan();
      metrics.counter({ name: 'dup' });
      asserts.assertThrows(
        () => metrics.counter({ name: 'dup' }),
        DuplicateMetricError,
        "Metric 'dup' is already registered",
      );
    });

    it('should reject the whole register() call if any name conflicts', () => {
      const metrics = new MetroMan();
      metrics.counter({ name: 'existing' });
      const newCounter = new Counter({ name: 'fresh' });
      const collidingCounter = new Counter({ name: 'existing' });
      asserts.assertThrows(
        () => metrics.register(newCounter, collidingCounter),
        DuplicateMetricError,
      );
      asserts.assertEquals(metrics.has('fresh'), false);
    });

    it('should reject duplicate names within a single register() call', () => {
      // Regression: the pre-check only compared against already
      // registered names, so an intra-batch duplicate slipped through
      // and the later instance silently overwrote the earlier one.
      const metrics = new MetroMan();
      asserts.assertThrows(
        () =>
          metrics.register(
            new Counter({ name: 'dup' }),
            new Gauge({ name: 'dup' }),
          ),
        DuplicateMetricError,
        "Metric 'dup' is already registered",
      );
      // All-or-nothing: neither instance may have been stored.
      asserts.assertEquals(metrics.has('dup'), false);
      // Intra-batch comparison is case-insensitive, like the registry.
      asserts.assertThrows(
        () =>
          metrics.register(
            new Counter({ name: 'Dup' }),
            new Gauge({ name: 'DUP' }),
          ),
        DuplicateMetricError,
      );
      asserts.assertEquals(metrics.names.length, 0);
    });
  });

  describe('remove()', () => {
    it('should remove a registered metric by name', () => {
      const metrics = new MetroMan();
      metrics.counter({ name: 'to_remove' });
      asserts.assertEquals(metrics.remove('to_remove'), true);
      asserts.assertEquals(metrics.has('to_remove'), false);
    });

    it('should return false when no metric is registered', () => {
      const metrics = new MetroMan();
      asserts.assertEquals(metrics.remove('absent'), false);
    });
  });

  describe('get()', () => {
    it('should throw MetricNotFoundError when no metric is registered', () => {
      const metrics = new MetroMan();
      asserts.assertThrows(
        () => metrics.get('non_existent_metric'),
        MetricNotFoundError,
        "Metric 'non_existent_metric' not found",
      );
    });

    it('should attach the lookup name to the error context', () => {
      const metrics = new MetroMan();
      try {
        metrics.get('Some_Name');
        asserts.fail('get() should have thrown');
      } catch (e) {
        asserts.assertInstanceOf(e, MetricNotFoundError);
        asserts.assertEquals(e.context.name, 'some_name');
      }
    });
  });

  describe('collect()', () => {
    it('should return JSON, STRING, and PROMETHEUS outputs for all metrics', () => {
      const metrics = new MetroMan();
      const counter = metrics.counter({
        name: 'collect_counter',
        help: 'Counter for collection test',
      });
      const gauge = metrics.gauge({
        name: 'collect_gauge',
        help: 'Gauge for collection test',
      });
      counter.inc();
      gauge.set(123);

      const jsonOutput = metrics.collect('JSON');
      asserts.assert(Object.keys(jsonOutput).includes('collect_counter'));
      asserts.assert(Object.keys(jsonOutput).includes('collect_gauge'));

      const stringOutput = metrics.collect('STRING');
      asserts.assert(stringOutput.includes('collect_counter'));
      asserts.assert(stringOutput.includes('collect_gauge'));

      const prometheusOutput = metrics.collect('PROMETHEUS');
      asserts.assert(prometheusOutput.includes('# HELP collect_counter'));
      asserts.assert(prometheusOutput.includes('# TYPE collect_counter'));
      asserts.assert(prometheusOutput.includes('# HELP collect_gauge'));
      asserts.assert(prometheusOutput.includes('# TYPE collect_gauge'));
    });

    it('should collect only the named subset when given a metrics list', () => {
      const metrics = new MetroMan();
      const counter1 = metrics.counter({
        name: 'specific_counter1',
        help: 'Counter 1',
      });
      const counter2 = metrics.counter({
        name: 'specific_counter2',
        help: 'Counter 2',
      });
      const gauge = metrics.gauge({ name: 'specific_gauge', help: 'Gauge' });
      counter1.inc();
      counter2.inc();
      counter2.inc();
      gauge.set(42);

      const specificMetrics = metrics.collect('JSON', [
        'specific_counter1',
        'specific_counter2',
      ]);
      asserts.assert(
        Object.keys(specificMetrics).includes('specific_counter1'),
      );
      asserts.assert(
        Object.keys(specificMetrics).includes('specific_counter2'),
      );
      asserts.assertEquals(
        Object.keys(specificMetrics).includes('specific_gauge'),
        false,
      );

      const specificMetricsAlt = metrics.collect(['specific_gauge']);
      asserts.assert(
        Object.keys(specificMetricsAlt).includes('specific_gauge'),
      );
      asserts.assertEquals(
        Object.keys(specificMetricsAlt).includes('specific_counter1'),
        false,
      );
    });

    it('should terminate the PROMETHEUS exposition with one line feed and parse as valid text', () => {
      // Regression: the rendered body previously ended on the final
      // sample line with no trailing LF, violating the text-exposition
      // spec ("The last line must end with a line feed character") and
      // getting rejected at EOF by strict parsers (Pushgateway,
      // `promtool check metrics`) — the up=0/zero-samples end-state the
      // round-3 `# TYPE`-token fix was supposed to eliminate. Every
      // metric family (Counter/Gauge/Histogram/Summary) participates,
      // so exercise all four in one document.
      const metrics = new MetroMan();
      metrics.counter({ name: 'http_requests_total', help: 'reqs' })
        .inc(3, { route: '/u' });
      metrics.gauge({ name: 'http_requests_in_flight' }).set(2);
      metrics.histogram({ name: 'lat_seconds', buckets: [0.1, 0.5, 1] })
        .observe(0.4);
      metrics.summary({ name: 'dur_seconds', quantiles: [0.5, 0.9] })
        .observe(0.42);

      const body = metrics.collect('PROMETHEUS');
      // Ends with exactly one terminating line feed…
      asserts.assertEquals(body.endsWith('\n'), true);
      // …and not a trailing blank line.
      asserts.assertEquals(body.endsWith('\n\n'), false);
      // The whole document parses as valid Prometheus text.
      asserts.assertEquals(validatePrometheusText(body), null);
    });

    it('should terminate a single-metric PROMETHEUS collect with a line feed', () => {
      const metrics = new MetroMan();
      metrics.counter({ name: 'only_one', help: 'x' }).inc();
      const body = metrics.collect('PROMETHEUS');
      asserts.assertEquals(body.endsWith('\n'), true);
      asserts.assertEquals(validatePrometheusText(body), null);
    });

    it('should render unobserved (header-only) metrics as valid families with no blank line', () => {
      // Regression: a Histogram/Summary registered at startup but scraped
      // before its first observation renders header-only (`# HELP`/`# TYPE`,
      // no samples). Its `toPrometheus()` block previously ended in a
      // trailing blank line (`\n\n`), which — concatenated by collect —
      // injected a blank line between families (mid-document) or left a
      // trailing blank line (if last), a body Pushgateway / `promtool check
      // metrics` reject. Exercise every kind unobserved, plus an observed
      // family after them to catch the mid-document blank line.
      const metrics = new MetroMan();
      metrics.histogram({ name: 'lat_seconds', buckets: [0.1, 0.5, 1] });
      metrics.summary({ name: 'dur_seconds', quantiles: [0.5, 0.9] });
      metrics.gauge({ name: 'in_flight' });
      metrics.counter({ name: 'req_total', help: 'reqs' }).inc();

      const body = metrics.collect('PROMETHEUS');
      // No blank line anywhere — not between families, not at EOF.
      asserts.assertEquals(body.includes('\n\n'), false);
      asserts.assertEquals(body.endsWith('\n'), true);
      asserts.assertEquals(body.endsWith('\n\n'), false);
      // The whole document parses as valid Prometheus text.
      asserts.assertEquals(validatePrometheusText(body), null);
    });

    it('should render a lone unobserved histogram collect as valid (trailing case)', () => {
      // The unobserved family is also the *last* (here, only) family, so a
      // stray trailing blank line would surface directly at EOF.
      const metrics = new MetroMan();
      metrics.histogram({ name: 'lat_seconds' });
      const body = metrics.collect('PROMETHEUS');
      asserts.assertEquals(body.endsWith('\n'), true);
      asserts.assertEquals(body.endsWith('\n\n'), false);
      asserts.assertEquals(validatePrometheusText(body), null);
    });

    it('should silently skip unknown metric names', () => {
      const metrics = new MetroMan();
      metrics.counter({ name: 'real_counter' });
      const emptyCollection = metrics.collect(['nonexistent_metric']);
      asserts.assertEquals(Object.keys(emptyCollection).length, 0);
    });

    it('should collect nothing when given an explicitly empty selection', () => {
      // Regression: an empty selection list is a selection that selects
      // nothing (mirroring `collect(['nonexistent'])`), so it must yield
      // empty output — not fall through to dumping the whole registry.
      const metrics = new MetroMan();
      metrics.counter({ name: 'c1' });
      metrics.gauge({ name: 'g1' });

      asserts.assertEquals(metrics.collect('JSON', []), {});
      asserts.assertEquals(Object.keys(metrics.collect([])).length, 0);
      asserts.assertEquals(metrics.collect('PROMETHEUS', []), '');
      asserts.assertEquals(metrics.collect('STRING', []), '');

      // An omitted selection (undefined) still dumps everything.
      asserts.assertEquals(
        Object.keys(metrics.collect('JSON')).length,
        2,
      );
      asserts.assertEquals(Object.keys(metrics.collect()).length, 2);
    });

    it('should emit each family once when a name repeats in the selection list', () => {
      // Regression: the selection-list branch pushed one instance per
      // matching name with no de-duplication (the only Set guard lived in
      // register()), so a name repeated in the list — easy to hit when the
      // list is concatenated from overlapping config groups — rendered its
      // family twice. For PROMETHEUS/STRING the per-instance blocks are
      // concatenated, so a repeated `# HELP`/`# TYPE` makes a real scraper
      // (promtool / Pushgateway) reject the whole exposition ("second HELP
      // line for metric name ...").
      const metrics = new MetroMan();
      metrics.counter({ name: 'http_requests_total', help: 'reqs' }).inc();
      metrics.gauge({ name: 'in_flight' }).set(2);

      // PROMETHEUS: exactly one `# TYPE http_requests_total` line despite
      // the name appearing twice (and in mixed case) in the selection.
      const prom = metrics.collect('PROMETHEUS', [
        'http_requests_total',
        'HTTP_REQUESTS_TOTAL',
      ]);
      const typeLines = prom
        .split('\n')
        .filter((l) => l.startsWith('# TYPE http_requests_total'));
      asserts.assertEquals(typeLines.length, 1);
      const helpLines = prom
        .split('\n')
        .filter((l) => l.startsWith('# HELP http_requests_total'));
      asserts.assertEquals(helpLines.length, 1);
      // The de-duplicated document is still valid Prometheus text.
      asserts.assertEquals(validatePrometheusText(prom), null);

      // A repeated name across two families still renders each once, in
      // first-occurrence order.
      const promMulti = metrics.collect('PROMETHEUS', [
        'http_requests_total',
        'in_flight',
        'http_requests_total',
      ]);
      asserts.assertEquals(
        promMulti.split('\n').filter((l) =>
          l.startsWith('# TYPE http_requests_total')
        )
          .length,
        1,
      );
      asserts.assertEquals(
        promMulti.split('\n').filter((l) => l.startsWith('# TYPE in_flight'))
          .length,
        1,
      );
      asserts.assertEquals(validatePrometheusText(promMulti), null);

      // STRING: the repeated family's block is not duplicated either.
      const str = metrics.collect('STRING', [
        'http_requests_total',
        'http_requests_total',
      ]);
      asserts.assertEquals(
        str.split('\n').filter((l) => l.includes('http_requests_total')).length,
        1,
      );
    });
  });

  describe('clear()', () => {
    it('should remove every registered metric', () => {
      const metrics = new MetroMan();
      metrics.counter({ name: 'temp_counter', help: 'Temporary counter' });
      metrics.gauge({ name: 'temp_gauge', help: 'Temporary gauge' });
      asserts.assertEquals(metrics.names.length, 2);
      metrics.clear();
      asserts.assertEquals(metrics.names.length, 0);
      asserts.assertEquals(metrics.has('temp_counter'), false);
      asserts.assertEquals(metrics.has('temp_gauge'), false);
    });
  });

  describe('Case insensitivity', () => {
    it('should resolve names regardless of casing', () => {
      const metrics = new MetroMan();
      metrics.counter({ name: 'CaseSensitive', help: 'Case test' });
      asserts.assertEquals(metrics.has('casesensitive'), true);
      asserts.assertEquals(metrics.has('CASESENSITIVE'), true);
      asserts.assertEquals(metrics.has('CaseSensitive'), true);
      const counter = metrics.get('caseSENSITIVE');
      asserts.assertInstanceOf(counter, Counter);
    });
  });
});
