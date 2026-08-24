/**
 * @fileoverview One log call, six wire formats — side by side.
 *
 * Slogger's whole pitch is one `logger.info(...)` call fanning out to
 * many destinations, each pulling only the shape it needs from the same
 * `SlogObject` (see the README's "Destination" table). This example
 * makes that concrete: a single `Slogger` instance with six handlers —
 * five printing the SAME record to the console in a different wire
 * format, one writing real NDJSON to disk — all fed by the exact same
 * log calls below. Run it and read the console output top to bottom:
 * every block of lines under a `===` header came from ONE call.
 *
 * Docs: ../../README.md (the "Destination" table this mirrors),
 * ../../docs/Slogger-Configuration.md (handler/formatter config),
 * ../../docs/Slogger-Correlation.md (the OTel formatter's home doc).
 *
 * Run on any runtime:
 *
 * ```bash
 * deno run --allow-all packages/slogger/examples/fan-out/main.ts
 * bun run packages/slogger/examples/fan-out/main.ts
 * node --import tsx packages/slogger/examples/fan-out/main.ts
 * ```
 *
 * @module
 */
import {
  jsonFormatter,
  logfmtFormatter,
  otelLogFormatter,
  rfc5424Formatter,
  Slogger,
  SyslogSeverities,
} from '@tundralibs/slogger';
// Needs a separate install: deno add @tundralibs/compat
import { join } from '@tundralibs/compat/path';
import { makeTempDir, readTextFile, removeDir } from '@tundralibs/compat/file';

// FileHandler writes real files, so it gets a real (temp) directory —
// removed at the end of this script, same pattern as the norm example.
const logDir = await makeTempDir({ prefix: 'slogger-fanout-' });
const logFile = 'fanout.log';

const logger = new Slogger({
  appName: 'fanout-demo',
  level: SyslogSeverities.INFO,
  handlers: [
    // 1. Human-readable line — what an operator tailing stdout sees.
    {
      name: 'human',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      formatter: 'detailed',
      useColor: true,
    },
    // 2. Single-line JSON — what an ELK / Loki / Datadog ingester wants.
    {
      name: 'json',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      formatter: jsonFormatter,
    },
    // 3. logfmt — Heroku Logplex / Splunk Observability / Promtail style.
    {
      name: 'logfmt',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      formatter: logfmtFormatter(),
    },
    // 4. RFC 5424 syslog wire frame — the exact bytes SyslogHandler would
    //    ship to a syslog daemon (see ../../handlers/Slogger-Handlers.md).
    {
      name: 'syslog',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      formatter: rfc5424Formatter({ appName: 'fanout-demo' }),
    },
    // 5. OpenTelemetry log record — timeUnixNano/severityNumber/body/
    //    attributes/resource, ready for an OTel collector's /v1/logs.
    {
      name: 'otel',
      type: 'ConsoleHandler',
      level: SyslogSeverities.INFO,
      formatter: otelLogFormatter({
        resource: { 'deployment.environment': 'demo' },
      }),
    },
    // 6. A genuinely different DESTINATION, not just a different
    //    formatter: real NDJSON on disk, buffered + rotated.
    {
      name: 'file',
      type: 'FileHandler',
      level: SyslogSeverities.INFO,
      directory: logDir,
      filenameTemplate: logFile,
      formatter: 'json',
    },
  ],
});

console.log('=== 1. logger.info("user signed in", { userId, plan }) ===');
logger.info('user signed in', { userId: 'u_42', plan: 'pro' });

console.log(
  '\n=== 2. logger.warning("payment retry", { orderId, attempt }) ===',
);
logger.warning('payment retry', { orderId: 'o_9001', attempt: 2 });

console.log('\n=== 3. logger.error("charge failed", { orderId, reason }) ===');
logger.error('charge failed', {
  orderId: 'o_9001',
  reason: 'card_declined',
});

// Below the logger's INFO threshold — dropped before any handler runs
// (before the message is even formatted). None of the six lines above
// appear for this call. See the README's "Two-level filter" hot-path
// note.
console.log('\n=== 4. logger.debug(...) — below the INFO threshold ===');
logger.debug('cache miss', { key: 'user:42' });
console.log('(nothing printed above — filtered before any handler ran)');

// FileHandler buffers writes; only ERROR+ auto-flushes mid-run (see
// FileHandler's docs). finalize() guarantees the rest lands before we
// read the file back.
await logger.finalize();

const filePath = join(logDir, logFile);
const persisted = await readTextFile(filePath);
console.log(`\n=== Persisted to disk (NDJSON): ${filePath} ===`);
console.log(persisted.trimEnd());

await removeDir(logDir, { recursive: true });
