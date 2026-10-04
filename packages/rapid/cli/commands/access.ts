/**
 * @fileoverview `rapid access <entry>` — the access audit: every action an
 * application serves and the `access` string it declares. An action with
 * none is PUBLIC; the audit is how that stays a decision rather than an
 * accident. `--fail-on-undeclared` exits 1 when any routed action is
 * undeclared (a CI step for an app that wants the hard gate).
 *
 * The entry module must export the application, or a function (sync or
 * async, no arguments) returning it, as `default` or `app`. The app is
 * read, never started.
 * @module
 */
import { isAbsolute, resolve } from '@tundralibs/compat/path';
import { toFileUrl } from '@tundralibs/compat/file';
import type { RapidAccessReportRow } from '../../types/mod.ts';

/** The one shape the command needs from an application. */
type Reportable = { accessReport(): RapidAccessReportRow[] };

const isReportable = (value: unknown): value is Reportable =>
  typeof value === 'object' && value !== null &&
  typeof (value as Reportable).accessReport === 'function';

/**
 * Resolve the application an entry module exposes: `default` or `app`,
 * a value or a zero-argument factory (awaited).
 *
 * @throws {Error} when neither export yields an application.
 */
export async function loadApp(entry: string): Promise<Reportable> {
  const url = toFileUrl(isAbsolute(entry) ? entry : resolve(entry));
  const mod = await import(url.href) as Record<string, unknown>;
  for (const name of ['default', 'app']) {
    let value = mod[name];
    if (typeof value === 'function') value = await (value as () => unknown)();
    if (isReportable(value)) return value;
  }
  throw new Error(
    `${entry} must export the Application (or a function returning it) as \`default\` or \`app\``,
  );
}

/** The report as an aligned table: KIND, ACTION, ACCESS (or `public`), and `cache …` when cached. */
export function formatAccessReport(
  rows: readonly RapidAccessReportRow[],
): string {
  const sorted = [...rows].sort((a, b) =>
    a.kind.localeCompare(b.kind) || a.action.localeCompare(b.action)
  );
  const width = Math.max(6, ...sorted.map((r) => r.action.length));
  const lines = sorted.map((r) =>
    `${r.kind.padEnd(7)} ${r.action.padEnd(width)}  ${r.access ?? 'public'}${
      r.cache === undefined ? '' : `  cache ${r.cache}`
    }`
  );
  const undeclared = sorted.filter((r) => r.access === undefined).length;
  lines.push(
    '',
    `${sorted.length} actions: ${undeclared} public (no access declared), ${
      sorted.length - undeclared
    } declared`,
  );
  return lines.join('\n');
}

/**
 * The `access` command. Returns the exit code: 0, or 1 when the entry
 * cannot be loaded, or when `failOnUndeclared` is set and an action
 * declares no `access`.
 */
export async function accessCommand(
  entry: string,
  opts: { failOnUndeclared?: boolean; json?: boolean } = {},
  log: (line: string) => void = console.log,
): Promise<number> {
  let rows: RapidAccessReportRow[];
  try {
    rows = (await loadApp(entry)).accessReport();
  } catch (error) {
    console.error(
      `✗ ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
  log(opts.json ? JSON.stringify(rows, null, 2) : formatAccessReport(rows));
  if (opts.failOnUndeclared && rows.some((r) => r.access === undefined)) {
    console.error('✗ undeclared (public) actions found — see above');
    return 1;
  }
  return 0;
}
