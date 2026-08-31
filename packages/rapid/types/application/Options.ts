/**
 * @fileoverview {@link RapidApplicationOptions} — the Application constructor options.
 *
 * @module
 */

import type { SloggerOptions } from '@tundralibs/slogger';
import type { SpanExporter, TracerOptions } from '@tundralibs/tracer';
import type { RapidApplicationExporterConfig } from './ExporterConfig.ts';
import type { RapidApplicationJobsOptions } from './JobsOptions.ts';
import type { RapidApplicationServerOptions } from './ServerOptions.ts';
import type { RapidUiConfigOptions } from '../UiConfigOptions.ts';
import type { RapidUiTemplateOptions } from '../UiTemplateOptions.ts';
import type { RapidApplicationUploadOptions } from './UploadOptions.ts';

/** The `Application` constructor options — every field but `name` optional and defaulted. */
export type RapidApplicationOptions = {
  /**
   * name is the name of the application. It is used for logging and error reporting.
   */
  name: string;
  /**
   * The application's signing key — ONE secret, HMAC via `@tundralibs/crypt`,
   * shared by everything that signs a cookie: `ctx.setCookie(..., { signed })`
   * / the reply `cookies` key, `session()`'s id cookie, and `csrf()`'s token.
   * Source it from the environment (`secret: ${APP_SECRET}` in the config
   * file); never commit it. Required only when something signs — a boot
   * error if a signing feature is used without it. Minimum 32 characters.
   */
  secret?: string;
  /**
   * mode drives error disclosure and logging verbosity. DEVELOPMENT
   * renders true messages, details, debug data, and stacks; PRODUCTION
   * is the safe direction — 5xx collapse to opaque defaults, debug never
   * renders. Tests run in DEVELOPMENT; staging runs PRODUCTION.
   * @default 'PRODUCTION'
   */
  mode?: 'DEVELOPMENT' | 'PRODUCTION';
  /**
   * State mode determines how each invocation's state is built from the
   * default-state template (the rAPId constructor's SECOND argument —
   * runtime data, not serializable config):
   *
   * - 'CLONE' (default): a DEEP copy per invocation — each top-level
   *   value is `structuredClone`d; values that cannot be cloned
   *   (functions, class instances) are kept BY REFERENCE instead of
   *   being dropped (unlike Oak, nothing silently vanishes).
   * - 'PROTOTYPE': `Object.create(template)` — reads fall through to
   *   the template, top-level writes shadow per invocation. Cheapest
   *   for large templates. Mutating a NESTED object still hits the
   *   shared template.
   * - 'SHARE': every invocation reads and writes THE template instance
   *   (Oak's `alias`).
   */
  stateMode?: 'CLONE' | 'PROTOTYPE' | 'SHARE';
  /**
   * Graceful-shutdown deadline in ms before force-exit; `0` disables.
   * Default sits under Cloud Run's 30s SIGTERM grace window.
   * @default 25000
   */
  shutdownTimeout?: number;

  /** Web server + request-cycle configuration. */
  server?: RapidApplicationServerOptions;

  /**
   * UI configuration. YAML/config files can express only the
   * serializable DATA half ({@link RapidUiConfigOptions} — `enabled`,
   * `runtimePath`, `live`, `history`, the contract headers, `prefer`);
   * the CODE half ({@link RapidUiTemplateOptions} — `core`, `layout`,
   * `view`, error templates, `assets`) rides here only from
   * PROGRAMMATIC options objects, or via the factory options of a
   * config-driven app. Config names code, never imports it.
   */
  ui?: RapidUiConfigOptions & RapidUiTemplateOptions;

  /** Upload handling configuration. */
  uploads?: RapidApplicationUploadOptions;

  /** Scheduled-job execution configuration. */
  jobs?: RapidApplicationJobsOptions;

  /**
   * Logging — ALWAYS on (a framework that cannot log its own boot
   * errors is broken). rAPId supplies `appName` (= {@link name}) and
   * OWNS `contextProvider` (correlation is the framework's job — not
   * overridable). Every field is optional; the constructor defaults a
   * console handler and mode-appropriate level. Custom logging SYSTEMS
   * integrate as handlers (slogger is a fan-out) — the module-facing
   * API stays uniform.
   */
  logger?: Partial<Omit<SloggerOptions, 'appName' | 'contextProvider'>>;
  /**
   * Tracing — OPT-IN. Absent = no tracer, zero overhead. Present =
   * SERVER span per request (inbound traceparent honoured), outbound
   * propagation, and trace ids composed onto every log line. rAPId
   * supplies `serviceName` (= {@link name}); `exporter` takes the
   * declarative {@link RapidApplicationExporterConfig} (file-able) or a
   * `SpanExporter` instance (code path).
   */
  tracer?: Omit<TracerOptions, 'serviceName' | 'exporter'> & {
    exporter?: RapidApplicationExporterConfig | SpanExporter;
  };
};
