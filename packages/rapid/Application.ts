import { ambient } from '@tundralibs/ambient';
import {
  makeTempDirSync,
  readFileSync,
  remove,
  removeSync,
  statSync,
} from '@tundralibs/compat/file';
import { Slogger, SyslogSeverities } from '@tundralibs/slogger';
import {
  exit,
  isBrowser,
  isWorkers,
  unrefTimer,
} from '@tundralibs/compat/runtime';
import { Tracer } from '@tundralibs/tracer';
import {
  Config,
  type ConfigType,
  type EventOptionKeys,
  loadConfig,
  Options,
} from '@tundralibs/utils';
import type { HTTPMethod } from '@tundralibs/compat/http';
import type { ServerMetrics } from '@tundralibs/compat/webserver';
import { sequenceID, ulid } from '@tundralibs/id';
import { parseSchedule } from '@tundralibs/cronus';
import {
  Doctor,
  type DoctorContainer,
  setContainerProvider,
} from '@tundralibs/doctor';
import { RapidError } from './errors/mod.ts';
import { isTemplate, normalizeRouteTemplate } from './ui/represent.ts';
import { UI_HISTORY, UI_HISTORY_ETAG } from './ui/history.ts';
import { UI_LIVE, UI_LIVE_ETAG } from './ui/live.ts';
import { UI_RUNTIME, UI_RUNTIME_ETAG } from './ui/ui.ts';
import { middlewareUsesStateKey } from './middlewares/stateKeyGuard.ts';
import { HTTPTransport, JOBTransport } from './transports/mod.ts';
import {
  buildExporter,
  buildState,
  currentContainer,
  djb2,
  hasDecorations,
  ifNoneMatch,
  Meter,
  mountModule,
  normalizeStaticConfig,
  type StaticMount,
} from './utils/mod.ts';
import {
  isAbsolute as _pathIsAbsolute,
  join as joinPath,
  SEPARATOR as PATH_SEPARATOR,
} from '@tundralibs/compat/path';
import {
  initModules,
  type ModuleRuntime,
  type RapidModule,
} from './modules/mod.ts';
import type {
  RapidApplicationEvents,
  RapidApplicationFactoryOptions,
  RapidApplicationFetchInfo,
  RapidApplicationJobMetrics,
  RapidApplicationOptions,
  RapidChannelOptions,
  RapidClusterSnapshot,
  RapidContextState,
  RapidErrorHandler,
  RapidHTTPHandler,
  RapidHTTPMiddleware,
  RapidJobEntry,
  RapidMiddleware,
  RapidModuleEventMap,
  RapidModuleInitResult,
  RapidModuleSources,
  RapidRouteEntry,
  RapidRouteOptions,
  RapidSocketEntry,
  RapidSOCKETHandler,
  RapidSOCKETMiddleware,
  RapidUiConfigOptions,
  RapidUiOptions,
  RapidUiTemplateOptions,
} from './types/mod.ts';

/**
 * Adopted correlation ids are ATTACKER-CONTROLLED: cap the length and
 * restrict the charset (log-injection guard). Anything failing this is
 * discarded and a fresh id is minted instead. The SAME guard is applied to
 * the output of a user-supplied {@link Application.requestIdGenerator},
 * since a minted id is echoed as a response header and written to logs.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * The default request-id generator: ONE shared `sequenceID()` instance per
 * process, so the counter is monotonic across the whole app. Crypto-free
 * and ~10x cheaper than a ULID (a correlation id never needed a CSPRNG);
 * the format `server_id·startup_time·counter` even identifies the minting
 * instance. The factory returns bigints — stringified here, which is also
 * why the setter validates that a generator's output IS a string.
 */
const defaultSequence = sequenceID();
const DEFAULT_REQUEST_ID_GENERATOR = (): string => String(defaultSequence());

/** The process-wide generator — see {@link Application.requestIdGenerator}. */
let requestIdGenerator: () => string = DEFAULT_REQUEST_ID_GENERATOR;

/**
 * Installed once (first `Application`), never per instance: one global
 * doctor provider reads the app container off the current request's
 * ambient bag, so it serves EVERY app and request — a later app does not
 * overwrite an earlier one's wiring.
 */
let __containerProviderInstalled = false;

/**
 * The brand {@link Application.initialize} hands the private constructor.
 * A direct `new Application(...)` (a JS consumer reaching past the private
 * modifier) lacks it and is rejected — so `initialize` is the single,
 * runtime-enforced way in.
 */
const INIT_BRAND: unique symbol = Symbol('rapid.application.init');

/**
 * The closed key sets `__configureUi` validates the DATA half against —
 * a YAML `ui:` bag reaches it uncheckable by TS, and an unknown key
 * silently no-oping (or a code-half name booting clean then 500ing at
 * render) breaks the "config fails as loudly as code" contract.
 */
const UI_DATA_KEYS = new Set([
  'enabled',
  'runtimePath',
  'live',
  'history',
  'prefer',
  'csrfCookie',
  'swapHeader',
  'swapUnless',
  'redirectHeader',
]);
const UI_CODE_KEYS = new Set([
  'core',
  'layout',
  'view',
  'errorTemplate',
  'errorTemplates',
  'assets',
]);

/**
 * The rAPId application class. The constructor is PRIVATE — build every app
 * through the async {@link Application.initialize} factory, which takes either
 * plain options (programmatic) or a config directory (config-driven, sourcing
 * options from the `Application` set). This makes construction uniform and
 * un-skippable, so an app never silently misses its config.
 */
export class Application<S extends RapidContextState = RapidContextState>
  extends Options<RapidApplicationOptions, RapidApplicationEvents> {
  /**
   * The state template — captured once. Under SHARE this IS the
   * instance every context receives; under CLONE/PROTOTYPE it is the
   * template copies/prototypes are made from.
   */
  protected readonly _state: S;

  /**
   * The application's loaded configuration (utils `ConfigType`) —
   * env-interpolated, frozen after load, safe to expose to request
   * scope (`ctx.app.config.get('database.host')` — set names are
   * LOWERCASED at load). ALWAYS present:
   * empty when constructed without one. NOT the options reader — see
   * {@link option}.
   */
  public readonly config: ConfigType;

  /**
   * The application logger — ALWAYS present. Contexts expose it as
   * `this._log`; the framework logs its own lifecycle through it. The
   * `contextProvider` is framework-owned: the ambient invocation bag
   * plus live trace identity when tracing is enabled.
   */
  public readonly log: Slogger;

  /**
   * The tracer, when `tracer` options are configured. Exposed readonly
   * primarily for the transports (server spans, propagation).
   */
  protected readonly _tracer?: Tracer;

  /** App-level UNIVERSAL middleware, in registration order. */
  private readonly __middleware: RapidMiddleware[] = [];
  /** Registered routes (express-style paths), in registration order. */
  private readonly __routes: RapidRouteEntry<S>[] = [];
  private readonly __socketCommands: Map<string, RapidSocketEntry<S>> =
    new Map();
  /** Registered jobs, keyed by name. */
  private readonly __jobs = new Map<string, RapidJobEntry<S>>();

  private readonly __instanceId: string = ulid();
  private __cluster?: RapidClusterSnapshot;
  private readonly __channels = new Map<string, RapidChannelOptions>();
  private __http?: HTTPTransport<S>;
  private __jobTransport?: JOBTransport<S>;
  private __moduleRuntime?: ModuleRuntime;
  /**
   * This app's DI container — a child of the global `Doctor` that reads
   * its registrations but holds its own instances, so two apps in one
   * process never share module instances. Pinned on each request's
   * ambient bag (see {@link Application.container}) so a handler's
   * `inject()` resolves here.
   */
  private readonly __container: DoctorContainer = Doctor.createContainer();
  /** The optional per-request error hook (see {@link onError}). */
  private __onError?: RapidErrorHandler<S>;
  /** `server.static` normalized to ordered mounts (empty = none). */
  private __staticMounts: readonly StaticMount[] = [];
  /**
   * `view.asset()`'s lazy version cache: URL path → content hash (djb2),
   * plus the mtime it was computed at (DEVELOPMENT re-checks it so a
   * changed file re-hashes; PRODUCTION caches forever).
   */
  private readonly __assetVersions = new Map<
    string,
    { version: string; mtimeMs: number }
  >();

  /** The app.ui() configuration (see {@link ui}); frozen once set. */
  private __ui?: Readonly<
    & RapidUiConfigOptions
    & Omit<RapidUiTemplateOptions, 'errorTemplate'>
    & { enabled: boolean; runtimePath: string }
  >;
  private readonly __meter?: Meter;
  /**
   * The upload temp dir THIS instance created (`uploads.path` left
   * unset) — `undefined` when the caller supplied their own path, which
   * this instance does not own and must not remove.
   */
  private readonly __ownedUploadPath?: string;
  /**
   * Lifecycle truth — never inferred from transport presence (a
   * one-shot triggerJob must not make the app look started).
   */
  private __started = false;

  get mode(): 'DEVELOPMENT' | 'PRODUCTION' {
    return this.option('mode') ?? 'PRODUCTION';
  }

  /**
   * The request-id generator every app in this process mints correlation
   * ids with (static: the id is a process-wide concern, shared by every
   * `Application`). Defaults to a shared `sequenceID()` — crypto-free,
   * monotonic, ~10x cheaper than a ULID. Swap it for sortable ULIDs, nanoIDs,
   * or your own scheme:
   *
   * ```ts ignore
   * import { ulid } from '@tundralibs/id';
   * Application.requestIdGenerator = ulid;
   * ```
   *
   * The setter BLIND-CALLS the generator once and validates the result, so
   * a misconfigured generator fails at assignment, not on the first
   * request: the output must be a string, non-empty, and pass the same
   * charset/length guard applied to inbound ids (the id is echoed as a
   * header and logged). Read by {@link newRequestId} and by the module
   * runtime's fallback mints.
   *
   * @throws {RapidError} RAPID_CONFIG when `fn` is not a function, throws
   *   when called, or returns something other than a safe non-empty string.
   */
  public static get requestIdGenerator(): () => string {
    return requestIdGenerator;
  }

  public static set requestIdGenerator(fn: () => string) {
    if (typeof fn !== 'function') {
      throw new RapidError('RAPID_CONFIG', {
        message: 'requestIdGenerator must be a function returning a string',
        details: { key: 'requestIdGenerator' },
      });
    }
    let sample: unknown;
    try {
      sample = fn();
    } catch (cause) {
      throw new RapidError('RAPID_CONFIG', {
        message: 'requestIdGenerator threw when called',
        details: { key: 'requestIdGenerator' },
        cause: cause instanceof Error ? cause : undefined,
      });
    }
    if (typeof sample !== 'string' || !SAFE_REQUEST_ID.test(sample)) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          'requestIdGenerator must return a non-empty string of at most 64 chars from [A-Za-z0-9._-]',
        details: {
          key: 'requestIdGenerator',
          sample: typeof sample === 'string' ? sample : typeof sample,
        },
      });
    }
    requestIdGenerator = fn;
  }

  /**
   * The ONE way to make an `Application` — the constructor is private, so
   * every app is built correctly here (and cannot silently skip config).
   * Two shapes:
   *
   * - **Config-driven** — a directory path (or {@link RapidApplicationFactoryOptions}
   *   with a `path`): loads the config directory (env-interpolated), sources
   *   {@link RapidApplicationOptions} from the `Application` set, and carries the
   *   FULL config so every other set stays readable via `app.config`.
   * - **Programmatic** — plain {@link RapidApplicationOptions}: used verbatim, no
   *   files read (`app.config` is empty). The entry for tests/scripts.
   *
   * Always async (config loading is), so `await` it in both shapes.
   *
   * @param source - A config-directory path, factory options (`{ path, env,
   *   applicationSet }`), or plain application options.
   * @param defaultState - The state template (runtime DATA; `S` infers from it).
   * @throws {@link RapidError} RAPID_CONFIG on a bad config file or cross-key
   *   validation failure (surfaced by the constructor).
   *
   * @example
   * ```ts ignore
   * const prod = await Application.initialize('./configs'); // reads Application.yaml + siblings
   * const test = await Application.initialize({ name: 'test', mode: 'DEVELOPMENT' });
   * ```
   */
  public static async initialize<
    S extends RapidContextState = RapidContextState,
  >(
    source:
      | string
      | RapidApplicationFactoryOptions
      | EventOptionKeys<RapidApplicationOptions, RapidApplicationEvents>,
    defaultState?: S,
  ): Promise<Application<S>> {
    // Config-driven: a path string, or factory options carrying a `path`.
    if (typeof source === 'string' || 'path' in source) {
      const factoryOptions: RapidApplicationFactoryOptions =
        typeof source === 'string' ? { path: source, env: true } : source;
      const { applicationSet = 'Application', ui: uiCode, ...loadOptions } =
        factoryOptions;
      const loaded = await loadConfig(loadOptions);
      // loadConfig lowercases set names (Application.yaml → 'application').
      const setName = applicationSet.toLowerCase();
      const fromFile = loaded.has(setName)
        ? loaded.get<Partial<RapidApplicationOptions>>(setName)
        : {};
      // The UI splits by NATURE here: the YAML `ui:` key is the DATA
      // half, the factory's `ui` the CODE half (typed disjoint — nothing
      // can be configured twice). Neither enters the Options store; the
      // resolved `__ui` is their single home.
      const { ui: uiData, ...appOptions } = fromFile as Partial<
        RapidApplicationOptions
      >;
      // The constructor validates — a bad Application file fails as loudly as
      // bad code-supplied options.
      const app = new Application<S>(
        INIT_BRAND,
        appOptions as EventOptionKeys<
          RapidApplicationOptions,
          RapidApplicationEvents
        >,
        defaultState,
        loaded,
        typeof loadOptions.path === 'string' ? loadOptions.path : undefined,
      );
      if (uiData !== undefined || uiCode !== undefined) {
        app.__configureUi(
          (uiData ?? {}) as RapidUiConfigOptions,
          uiCode ?? {},
        );
      }
      return app;
    }
    // Programmatic: plain options, no files read (config stays empty).
    // One `ui` bag carries both halves here (there is only one source, so
    // the two-place hazard the split exists for cannot arise); destructure
    // by nature before the Options store sees anything.
    const { ui, ...rest } = source as
      & EventOptionKeys<RapidApplicationOptions, RapidApplicationEvents>
      & { ui?: RapidUiConfigOptions & RapidUiTemplateOptions };
    const app = new Application<S>(
      INIT_BRAND,
      rest as EventOptionKeys<RapidApplicationOptions, RapidApplicationEvents>,
      defaultState,
    );
    if (ui !== undefined) {
      const {
        core,
        layout,
        view,
        errorTemplate,
        errorTemplates,
        assets,
        ...data
      } = ui;
      app.__configureUi(data, {
        ...(core !== undefined ? { core } : {}),
        ...(layout !== undefined ? { layout } : {}),
        ...(view !== undefined ? { view } : {}),
        ...(errorTemplate !== undefined ? { errorTemplate } : {}),
        ...(errorTemplates !== undefined ? { errorTemplates } : {}),
        ...(assets !== undefined ? { assets } : {}),
      });
    }
    return app;
  }

  /**
   * PRIVATE — construct via {@link Application.initialize} (see its
   * doc). The `brand` gate makes that funnel enforceable at runtime too,
   * not just at compile time: a JS consumer reaching past the private
   * modifier still lacks the brand and is rejected.
   *
   * @param brand - The internal init brand; only `initialize` holds it.
   * @param options - Application options (serializable — the factory
   *   sources these from the `Application` config set; group defaults
   *   are filled here, so partial groups are fine).
   * @param defaultState - The state template — runtime DATA, not
   *   config (may hold functions/instances), hence a separate argument.
   *   `S` infers from it.
   * @param config - The loaded configuration; `initialize` passes the
   *   full `loadConfig` result. Defaults to an empty config.
   * @throws {RapidError} RAPID_CONFIG when constructed without the brand
   *   (i.e. not via `initialize`), or when cross-key validation fails
   *   (bad name/port/socket combination, invalid paging/query caps).
   */
  private constructor(
    brand: symbol,
    options: EventOptionKeys<RapidApplicationOptions, RapidApplicationEvents>,
    defaultState?: S,
    config?: ConfigType,
    configDir?: string,
  ) {
    super();
    if (brand !== INIT_BRAND) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          'Application must be created via Application.initialize(), not `new Application()`',
      });
    }
    // Teach doctor's inject() to resolve against the app container that
    // the in-flight request pinned on its ambient bag. One provider
    // serves every app (it reads per-request state), so install it once.
    if (!__containerProviderInstalled) {
      setContainerProvider(currentContainer);
      __containerProviderInstalled = true;
    }
    // Created eagerly (regardless of whether the app ever registers an
    // upload route) only when the caller didn't supply their own path —
    // tracked so stop() can remove it, and so a constructor failure
    // below doesn't strand it (see the catch block). SKIPPED on a
    // filesystem-less runtime (Workers, browser): there is nowhere to
    // put it, and a file upload that arrives is rejected at parse time
    // with RAPID_UPLOADS_UNAVAILABLE rather than crashing construction.
    const ownedUploadPath =
      options.uploads?.path === undefined && !isWorkers && !isBrowser
        ? makeTempDirSync({ prefix: 'rapid-' })
        : undefined;
    try {
      // Group defaults merge UNDER the user's partial groups BEFORE
      // _setOptions — its top-level merge would otherwise let a partial
      // user group clobber the defaulted keys. Callers never need to
      // send complete groups.
      this._setOptions({
        ...options,
        server: {
          enabled: true,
          requestIdHeader: 'x-request-id',
          trustProxy: false, // secure by default — no proxy-header trust
          socketPath: '/ws',
          maxBodySize: 1_048_576, // 1 MB — 0 disables
          metrics: false, // opt-in — the request path pays nothing off
          ...options.server,
          // Nested sub-groups merge EXPLICITLY — the one-level group
          // spread above would let a partial user `paging`/`query`
          // clobber the defaulted keys.
          paging: {
            pageHeader: 'x-page-number',
            sizeHeader: 'x-page-size',
            defaultSize: 10,
            maxSize: 1000,
            maxPage: 1000,
            ...options.server?.paging,
          },
          query: {
            maxFilters: 50,
            maxSorts: 5,
            maxValueLength: 2048,
            maxArrayItems: 100,
            ...options.server?.query,
          },
          versioning: {
            mode: 'header',
            ...options.server?.versioning,
          },
        },
        jobs: {
          enabled: true,
          ...options.jobs,
        },
        uploads: {
          maxSize: 10_485_760, // 10 MB
          allowedExtensions: [], // FAIL-SAFE: no uploads until declared
          // The promised temp-dir default — uploads.path is ALWAYS set
          // at runtime.
          ...(ownedUploadPath !== undefined ? { path: ownedUploadPath } : {}),
          ...options.uploads,
        },
      }, {
        mode: 'PRODUCTION',
        stateMode: 'CLONE',
        shutdownTimeout: 25_000, // under Cloud Run's 30s SIGTERM window
      });
      this.__validate();
      // server.static → ordered mounts, boot-loud. Relative roots anchor
      // to the config directory (a deployment's YAML means the same
      // thing from any working directory), else the CWD.
      const staticConfig = this.option('server')?.static;
      if (staticConfig !== undefined) {
        this.__staticMounts = normalizeStaticConfig(staticConfig, configDir);
      }
    } catch (error) {
      if (ownedUploadPath !== undefined) {
        try {
          removeSync(ownedUploadPath);
        } catch {
          // Best-effort — the original construction error is what
          // matters; a stray temp dir beats masking it.
        }
      }
      throw error;
    }
    this.__ownedUploadPath = ownedUploadPath;
    // Metrics are opt-in — a Meter exists only when server.metrics is on,
    // so the invoke cycle pays nothing otherwise.
    if (this.option('server')?.metrics === true) this.__meter = new Meter();
    this._state = defaultState ?? ({} as S);
    this.config = config ?? Config({});

    // Tracing is opt-in: absent config = no tracer, zero overhead.
    const tracer = this.option('tracer');
    if (tracer !== undefined) {
      this._tracer = new Tracer({
        serviceName: this.option('name'),
        ...tracer,
        exporter: buildExporter(tracer.exporter),
      });
    }

    // Logging is ALWAYS on. rAPId owns appName and contextProvider —
    // correlation is the framework's job, not the app's. The console
    // handler is the constructor-set default; callers may send partial
    // logger options (or none).
    const logger = this.option('logger');
    const level = logger?.level ??
      (this.mode === 'DEVELOPMENT'
        ? SyslogSeverities.DEBUG
        : SyslogSeverities.INFO);
    this.log = new Slogger({
      ...logger,
      appName: this.option('name'),
      level,
      handlers: logger?.handlers ?? [{
        name: 'console',
        type: 'ConsoleHandler',
        level,
      }],
      contextProvider: this.__logContext,
    });
  }

  /** The tracer instance, when tracing is configured. */
  public get tracer(): Tracer | undefined {
    return this._tracer;
  }

  /**
   * The correlation-id POLICY, in one place: a validated inbound value
   * is adopted (trusted-edge reuse); anything unsafe or absent mints a
   * fresh id via {@link requestIdGenerator}. Transports source the inbound
   * candidate (they know their transport); contexts only carry the result.
   */
  public newRequestId(inbound?: string | null): string {
    const candidate = inbound?.trim();
    return candidate !== undefined && SAFE_REQUEST_ID.test(candidate)
      ? candidate
      : requestIdGenerator();
  }

  /**
   * Register app-level UNIVERSAL middleware — the outer onion, in
   * order, on EVERY transport's invocation cycle (HTTP requests,
   * socket frames, job firings alike). Narrow per-transport behaviour
   * inside the middleware via `ctx.type` (see {@link RapidMiddleware}).
   */
  public use(...middleware: RapidMiddleware[]): this {
    this.__assertRegistrable('app.use()');
    this.__middleware.push(...middleware);
    return this;
  }

  /**
   * Loud gate for every registration surface: the router snapshots at
   * prepare (start() / the first fetch()), so a later registration would
   * "succeed" yet never serve — the silent half-applied state
   * {@link __configureUi} already forbids. One rule for all surfaces.
   */
  private __assertRegistrable(what: string): void {
    if (this.__started || this.__http !== undefined) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          `${what} after start() / the first fetch() would never serve — register before the app starts`,
      });
    }
  }

  /** The app-level universal middleware, in order (read-only view). */
  public get middlewares(): readonly RapidMiddleware[] {
    return this.__middleware;
  }

  /**
   * This process's stable id — a ULID minted once at construction.
   * Every node reports it (cluster registration, the console banner);
   * distinct from the per-request id ({@link newRequestId}).
   */
  public get instanceId(): string {
    return this.__instanceId;
  }

  /**
   * The application signing key (the `secret` option) — the HMAC key behind
   * signed cookies, `session()` ids, and `csrf()` tokens. Validated at boot
   * (≥ 32 chars). Throws when absent: a signing feature that is USED without
   * a configured secret is a misconfiguration, surfaced where it bites.
   *
   * @throws {RapidError} RAPID_CONFIG when no `secret` is configured.
   */
  public get secret(): string {
    const secret = this.option('secret');
    if (secret === undefined) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          'a signed cookie / session / CSRF token needs the application `secret` option (≥ 32 chars, e.g. `secret: ${APP_SECRET}` in Application.yaml)',
        details: { key: 'secret' },
      });
    }
    return secret;
  }

  /**
   * This app's DI container — a child of the global `Doctor` that reads
   * its registrations but keeps its own instances. Modules boot through
   * it, and it is pinned on each request's ambient context, so a handler
   * calling `inject()` — even after an `await` — resolves against THIS
   * app (not the process-wide `Doctor`). `stock()` an override here to
   * scope a fake or a per-app implementation to this app alone.
   */
  public get container(): DoctorContainer {
    return this.__container;
  }

  /**
   * The current cluster snapshot, or `undefined` on a solo node. Filled
   * by the cluster module (post-1.0) via {@link setCluster}; the dev
   * console reads `cluster ?? metrics`, so any node in a cluster shows the
   * fleet and a solo node shows itself — with no other change.
   */
  public get cluster(): RapidClusterSnapshot | undefined {
    return this.__cluster;
  }

  /** Feed (or clear) the cluster snapshot — the cluster module's seam. */
  public setCluster(snapshot: RapidClusterSnapshot | undefined): void {
    this.__cluster = snapshot;
  }

  /** Declared pub/sub channels (read by the transport at listen). */
  public get channels(): ReadonlyMap<string, RapidChannelOptions> {
    return this.__channels;
  }

  /**
   * Declare a WebSocket pub/sub channel clients may subscribe to. Server
   * code then pushes to subscribers with {@link publish} / `ctx.publish`.
   * `options.authorize` gates who may subscribe (open when omitted).
   * Declaring one makes the app mount its socket listener even with no
   * `socket()` commands.
   *
   * @throws {RapidError} RAPID_CONFIG when the channel name is empty or
   *   already declared.
   */
  public channel(name: string, options: RapidChannelOptions = {}): this {
    if (name.trim() === '') {
      throw new RapidError('RAPID_CONFIG', {
        message: 'channel name must be a non-empty string',
      });
    }
    if (this.__channels.has(name)) {
      throw new RapidError('RAPID_CONFIG', {
        message: `channel '${name}' is already declared`,
        details: { name },
      });
    }
    // Declared AFTER start() with no listener mounted: the app started with
    // zero channels and zero socket commands, so no websocket upgrade endpoint
    // exists and this channel would be silently unreachable. Fail loud rather
    // than register a channel nobody can subscribe to.
    if (
      this.__started && this.__http !== undefined &&
      !this.__http.hasSocketListener
    ) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          `channel('${name}') was declared after start(), but this app ` +
          `started with no channels or socket commands, so no websocket ` +
          `listener was mounted — clients could never subscribe. Declare a ` +
          `channel (or an app.socket() command) BEFORE start().`,
        details: { name },
      });
    }
    this.__channels.set(name, options);
    // Declared after start()? Register it on the live rpc server too.
    this.__http?.declareChannel(name, options);
    return this;
  }

  /**
   * Server-initiated push to every subscriber of `channel` (across
   * processes when a cross-process pub/sub adapter is configured). A
   * no-op before the socket listener is up or when nobody subscribes —
   * pub/sub is fire-and-forget.
   */
  public publish(channel: string, data: unknown): Promise<void> {
    return this.__http?.publish(channel, data) ?? Promise.resolve();
  }

  /** The registered routes (read-only view). */
  public get routes(): readonly RapidRouteEntry<S>[] {
    return this.__routes;
  }

  /** Registered websocket commands (read by the HTTP transport). */
  public get socketCommands(): readonly RapidSocketEntry<S>[] {
    return [...this.__socketCommands.values()];
  }

  /**
   * Register a websocket COMMAND (rpc protocol; served on
   * `server.socketPath`, sharing the HTTP listener): optional
   * command-scoped middleware, handler LAST — same grammar as
   * {@link route}. One invocation per inbound frame, through the same
   * cycle as HTTP and jobs (universal chain first, then this chain).
   *
   * @throws {RapidError} RAPID_CONFIG on a duplicate or empty command,
   *   or when no handler was given.
   */
  public socket(
    command: string,
    ...chain: [...RapidSOCKETMiddleware[], RapidSOCKETHandler<S>]
  ): this {
    this.__assertRegistrable('socket()');
    if (command.trim() === '') {
      throw new RapidError('RAPID_CONFIG', {
        message: 'socket command must be a non-empty string',
      });
    }
    if (this.__socketCommands.has(command)) {
      throw new RapidError('RAPID_CONFIG', {
        message: `socket command '${command}' is already registered`,
        details: { command },
      });
    }
    if (chain.length === 0) {
      throw new RapidError('RAPID_CONFIG', {
        message: 'socket command needs a handler',
        details: { command },
      });
    }
    this.__socketCommands.set(command, {
      command,
      middlewares: chain.slice(0, -1) as RapidSOCKETMiddleware[],
      handler: chain[chain.length - 1] as RapidSOCKETHandler<S>,
    });
    return this;
  }

  /** The registered jobs (read-only view). */
  public get jobs(): readonly RapidJobEntry<S>[] {
    return [...this.__jobs.values()];
  }

  /**
   * Register a route: radrouter-native path (`/users/:id:` — params
   * are COLON-WRAPPED). Optional route-scoped middleware, handler
   * LAST. Path GRAMMAR is radrouter's to enforce — a malformed
   * segment (express-style `:id`, stray colons) fails at start() with
   * radrouter's own precise error, wrapped as RAPID_CONFIG; collisions
   * surface there too.
   *
   * An optional leading `{version}` options object (distinguished from
   * a middleware at the call site by shape — a middleware is always a
   * function) sets the route's radrouter version slot, a dimension
   * separate from `path` — mainly for the `@GET`/etc. decorators,
   * which always call this form; the plain fluent API may use it too.
   *
   * @throws {RapidError} RAPID_CONFIG when `path` does not start with
   *   `/` or no handler was given.
   */
  public route(
    method: HTTPMethod,
    path: string,
    ...chain: [...RapidHTTPMiddleware[], RapidHTTPHandler<S>]
  ): this;
  public route(
    method: HTTPMethod,
    path: string,
    options: RapidRouteOptions,
    ...chain: [...RapidHTTPMiddleware[], RapidHTTPHandler<S>]
  ): this;
  public route(
    method: HTTPMethod,
    path: string,
    ...args: unknown[]
  ): this {
    this.__assertRegistrable('route()');
    if (typeof path !== 'string' || !path.startsWith('/')) {
      throw new RapidError('RAPID_CONFIG', {
        message: "route path must start with '/'",
        details: { method, path },
      });
    }
    const hasOptions = args.length > 0 && typeof args[0] === 'object' &&
      args[0] !== null;
    const opts = hasOptions ? (args[0] as RapidRouteOptions) : {};
    const version = opts.version;
    // Fail-fast: a wrong template import dies at registration, never at
    // first request.
    const template = opts.template !== undefined
      ? normalizeRouteTemplate(
        opts.template,
        opts.layout,
        `${method} ${path}`,
      )
      : undefined;
    // A first-arg OBJECT that carries none of the option keys is a
    // mistake, not options — most likely a bare template where
    // `{ template }` was meant. Loud, not a silently untemplated route.
    if (
      hasOptions && Object.keys(opts).length > 0 &&
      opts.version === undefined && opts.openapi === undefined &&
      opts.template === undefined && opts.layout === undefined
    ) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          'unrecognized route options object — a template goes under { template: ... }',
        details: { method, path, keys: Object.keys(opts) },
      });
    }
    if (opts.layout !== undefined && opts.template === undefined) {
      throw new RapidError('RAPID_CONFIG', {
        message: "route option 'layout' does nothing without 'template'",
        details: { method, path },
      });
    }
    const chain = (hasOptions ? args.slice(1) : args) as [
      ...RapidHTTPMiddleware[],
      RapidHTTPHandler<S>,
    ];
    if (
      chain.length === 0 ||
      typeof chain[chain.length - 1] !== 'function'
    ) {
      throw new RapidError('RAPID_CONFIG', {
        message: 'route needs a handler (the last argument must be a function)',
        details: { method, path },
      });
    }
    this.__routes.push({
      method,
      path,
      middlewares: chain.slice(0, -1) as RapidHTTPMiddleware[],
      handler: chain[chain.length - 1] as RapidHTTPHandler<S>,
      ...(version !== undefined ? { version } : {}),
      ...(opts.openapi !== undefined ? { openapi: opts.openapi } : {}),
      ...(template !== undefined ? { template } : {}),
    });
    return this;
  }

  public get(
    path: string,
    ...chain: [...RapidHTTPMiddleware[], RapidHTTPHandler<S>]
  ): this;
  public get(
    path: string,
    options: RapidRouteOptions,
    ...chain: [...RapidHTTPMiddleware[], RapidHTTPHandler<S>]
  ): this;
  public get(path: string, ...args: unknown[]): this {
    return this.__verb('GET', path, args);
  }
  public post(
    path: string,
    ...chain: [...RapidHTTPMiddleware[], RapidHTTPHandler<S>]
  ): this;
  public post(
    path: string,
    options: RapidRouteOptions,
    ...chain: [...RapidHTTPMiddleware[], RapidHTTPHandler<S>]
  ): this;
  public post(path: string, ...args: unknown[]): this {
    return this.__verb('POST', path, args);
  }
  public put(
    path: string,
    ...chain: [...RapidHTTPMiddleware[], RapidHTTPHandler<S>]
  ): this;
  public put(
    path: string,
    options: RapidRouteOptions,
    ...chain: [...RapidHTTPMiddleware[], RapidHTTPHandler<S>]
  ): this;
  public put(path: string, ...args: unknown[]): this {
    return this.__verb('PUT', path, args);
  }
  public patch(
    path: string,
    ...chain: [...RapidHTTPMiddleware[], RapidHTTPHandler<S>]
  ): this;
  public patch(
    path: string,
    options: RapidRouteOptions,
    ...chain: [...RapidHTTPMiddleware[], RapidHTTPHandler<S>]
  ): this;
  public patch(path: string, ...args: unknown[]): this {
    return this.__verb('PATCH', path, args);
  }
  public delete(
    path: string,
    ...chain: [...RapidHTTPMiddleware[], RapidHTTPHandler<S>]
  ): this;
  public delete(
    path: string,
    options: RapidRouteOptions,
    ...chain: [...RapidHTTPMiddleware[], RapidHTTPHandler<S>]
  ): this;
  public delete(path: string, ...args: unknown[]): this {
    return this.__verb('DELETE', path, args);
  }

  /** Shared verb-helper body — `route()` shape-detects the options object. */
  private __verb(method: HTTPMethod, path: string, args: unknown[]): this {
    return this.route(
      method,
      path,
      ...args as [...RapidHTTPMiddleware[], RapidHTTPHandler<S>],
    );
  }

  /**
   * Register a scheduled job: 5-field cron expression, validated NOW
   * (a bad schedule or duplicate name is a loud registration error,
   * not a silent never-fires). Run-once and intervals come with the
   * cadence layer on cronus later. Whether THIS replica runs it is
   * config (`jobs.enabled`).
   *
   * @param options - `args`: default invocation params — every firing's
   *   `ctx.args.params` starts from these; `triggerJob` overrides merge
   *   on top per firing.
   * @throws {RapidError} RAPID_CONFIG on a duplicate job name or an
   *   invalid cron schedule.
   */
  public job(
    name: string,
    schedule: RapidJobEntry<S>['schedule'],
    handler: RapidJobEntry<S>['handler'],
    options: { args?: Readonly<Record<string, unknown>> } = {},
  ): this {
    this.__assertRegistrable('job()');
    if (this.__jobs.has(name)) {
      throw new RapidError('RAPID_CONFIG', {
        message: `job '${name}' is already registered`,
        details: { name },
      });
    }
    try {
      parseSchedule(schedule);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new RapidError('RAPID_CONFIG', {
        message: `job '${name}' has an invalid schedule: ${reason}`,
        details: { name, schedule, reason },
      });
    }
    this.__jobs.set(name, { name, schedule, handler, args: options.args });
    return this;
  }

  /**
   * Mount one or more decorated INSTANCES: `@GET`/`@POST`/`@PUT`/
   * `@PATCH`/`@DELETE`/`@SOCKET`/`@JOB` methods anywhere on the
   * instance's prototype chain register through this SAME `route()`/
   * `socket()`/`job()` core — a `@Module(name, { prefix })` class gets
   * its prefix joined onto HTTP paths only (`namespace` does the same
   * job for SOCKET/JOB's flat namespaces).
   *
   * rAPId never constructs the instance — `new Users(db)`, a DI
   * container, a factory, whatever your own module system does is
   * invisible here; this only binds what you hand it. See
   * `DESIGN-modules.md` for the full boundary and the subclass-
   * override policy.
   *
   * @throws {RapidError} RAPID_CONFIG when an instance has no
   *   decorated methods, when a decorated method is overridden without
   *   re-decorating the override, or when a decoration binds
   *   `connection()` off `@SOCKET`; and whatever `route()`/`socket()`/
   *   `job()` themselves throw (duplicate command/job name, malformed
   *   path grammar surfaces at `start()`).
   */
  public module(...instances: object[]): this {
    for (const instance of instances) {
      mountModule<S>(this, instance);
    }
    return this;
  }

  /**
   * Boot the module system ON this app: `initModules` with the app's
   * logger, config and mode, then every resulting instance that carries
   * route/socket/job decorations is mounted exactly as {@link module}
   * would. Modules get `this.log` (scoped `module: 'ns:Name'`),
   * `this.config`, typed `emit`, guarded `invoke`; events published while
   * a request is in flight inherit its requestId. Call ONCE, before
   * `start()`/`fetch()`, with every namespace; `stop()` disposes the
   * runtime (reverse init order).
   *
   * @throws {RapidError} RAPID_CONFIG on a second call, and whatever
   *   `initModules`/`module()` throw (then the runtime is disposed).
   */
  public async modules<
    const M extends readonly object[],
    I extends Record<string, RapidModule<RapidModuleEventMap>> = Record<
      never,
      RapidModule<RapidModuleEventMap>
    >,
  >(sources: RapidModuleSources<M, I>): Promise<RapidModuleInitResult<M, I>> {
    if (this.__moduleRuntime !== undefined) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          'app.modules() boots the module system once — pass every namespace in that one call',
      });
    }
    const result = await initModules(
      { log: this.log, config: this.config, mode: this.mode },
      sources,
      this.__container,
    );
    try {
      for (const instance of result.runtime.modules) {
        if (hasDecorations(instance)) mountModule<S>(this, instance);
      }
    } catch (error) {
      await result.runtime.dispose();
      throw error;
    }
    this.__moduleRuntime = result.runtime;
    return result;
  }

  /** The module runtime booted by {@link modules}; `undefined` before. */
  public get moduleRuntime(): ModuleRuntime | undefined {
    return this.__moduleRuntime;
  }

  private async __disposeModules(): Promise<void> {
    const runtime = this.__moduleRuntime;
    if (runtime === undefined) return;
    this.__moduleRuntime = undefined;
    await runtime.dispose();
  }

  /** `true` between a successful start() and stop(). */
  public get running(): boolean {
    return this.__started;
  }

  /** HTTP listener address; `null` when not listening. */
  public get address(): string | null {
    return this.__http?.address ?? null;
  }

  /** ACTUAL bound TCP port (port 0 friendly); `null` when not listening. */
  public get port(): number | null {
    return this.__http?.port ?? null;
  }

  /**
   * Live server metrics (request/status/latency + websocket counters) —
   * `undefined` when the HTTP listener is not up. Populated only when
   * `server.metrics` is enabled; otherwise a zeroed structure. A copy on
   * every read, safe to serialize (e.g. a `/metrics` route, the dev
   * dashboard).
   */
  public get metrics(): ServerMetrics | undefined {
    return this.__http?.metrics;
  }

  /**
   * The metro-man metrics recorder — per-transport counters, a latency
   * histogram, and in-flight — or `undefined` when `server.metrics` is
   * off. The `metrics()` endpoint serves `meter.collect(...)`.
   */
  public get meter(): Meter | undefined {
    return this.__meter;
  }

  /**
   * Live WebSocket connection metrics (upgrades, open/peak connections,
   * messages, errors, connection duration) — the socket slice of the
   * server counters. `undefined` when the HTTP listener is not up;
   * populated only when `server.metrics` is enabled.
   */
  public get socketMetrics(): ServerMetrics['websocket'] | undefined {
    return this.__http?.metrics?.websocket;
  }

  /**
   * Live cron scheduler statistics (registered/running counts + per-job
   * run count, last run, executing) — `undefined` when the job transport
   * is not running. NOT gated on `server.metrics`; cronus always tracks
   * these. A copy on every read, safe to serialize.
   */
  public get jobMetrics(): RapidApplicationJobMetrics | undefined {
    return this.__jobTransport?.metrics;
  }

  /**
   * Register the per-request error hook: on any disclosed error (every
   * transport), it runs during disclosure and MAY return a
   * {@link RapidContextResponse} to override the default envelope — remap the
   * status, add fields, theme the body — or return nothing to keep it. It
   * must be SYNCHRONOUS (the disclosure path is sync-through) and never needs
   * to throw (a throw is logged and the default envelope is used). One hook
   * per app; the last call wins. See {@link RapidErrorHandler}.
   */
  public onError(handler: RapidErrorHandler<S>): this {
    this.__onError = handler;
    return this;
  }

  /** The registered {@link onError} hook, or `undefined` — read by the transport. */
  public get errorHook(): RapidErrorHandler<S> | undefined {
    return this.__onError;
  }

  /**
   * Configure the UI layer — DEPRECATED sugar over the initialize-time
   * configuration: pass the serializable DATA half as the `ui:` options
   * (or YAML) key and the CODE half (`core`, `layout`, `view`, error
   * templates, `assets`) programmatically at
   * `Application.initialize({ path, ui })`. This one-bag form maps onto
   * the same machinery and keeps its exact old behavior (a legacy
   * `layout` is the app-default module-tier layout; with no `core`, its
   * output serves as the page).
   *
   * @deprecated Configure the UI at `Application.initialize` instead.
   * @throws {RapidError} RAPID_CONFIG on a second configuration or any
   *   invalid option (see the initialize-time validation).
   */
  public ui(options: RapidUiOptions = {}): this {
    const {
      core,
      layout,
      view,
      errorTemplate,
      errorTemplates,
      assets,
      ...data
    } = options;
    this.__configureUi(data, {
      ...(core !== undefined ? { core } : {}),
      ...(layout !== undefined ? { layout } : {}),
      ...(view !== undefined ? { view } : {}),
      ...(errorTemplate !== undefined ? { errorTemplate } : {}),
      ...(errorTemplates !== undefined ? { errorTemplates } : {}),
      ...(assets !== undefined ? { assets } : {}),
    });
    return this;
  }

  /**
   * The UI configuration funnel — both halves validated and frozen into
   * `__ui`, the runtime/live routes registered (when `enabled`). Called
   * by `initialize` (the sanctioned path) and the deprecated `app.ui()`.
   *
   * @throws {RapidError} RAPID_CONFIG on a second configuration, a call
   *   after start, an unknown (or code-half) key in the data half, a
   *   non-boolean gate, a non-template `core`/`layout`/error entry, both
   *   `errorTemplate` and `errorTemplates`, a registry key outside the
   *   closed grammar, an invalid `prefer`/`runtimePath`/header name, or
   *   a bad `assets` map.
   */
  private __configureUi(
    data: RapidUiConfigOptions,
    code: RapidUiTemplateOptions,
  ): void {
    if (this.__ui !== undefined) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          'the UI is already configured — one initialize ui / app.ui() per app',
      });
    }
    if (this.__started || this.__http !== undefined) {
      // The router snapshots routes at prepare(): configured now, the
      // runtime route would 404 while uiOptions took effect — the
      // half-applied state the JSDoc forbids. Fail loud, like channel().
      throw new RapidError('RAPID_CONFIG', {
        message: 'the UI must be configured before start() / the first fetch()',
      });
    }
    for (const key of Object.keys(data)) {
      if (UI_CODE_KEYS.has(key)) {
        // Config names code, never imports it: a YAML `ui: { core: ... }`
        // would ride into __ui as a string and 500 every render.
        throw new RapidError('RAPID_CONFIG', {
          message:
            `ui: '${key}' is code (a template/function) — it cannot come from config data; pass it in Application.initialize's ui option`,
          details: { key },
        });
      }
      if (!UI_DATA_KEYS.has(key)) {
        throw new RapidError('RAPID_CONFIG', {
          message: `ui: unknown option '${key}' (valid: ${
            [...UI_DATA_KEYS].join(', ')
          })`,
          details: { key },
        });
      }
    }
    // The boolean gates must BE booleans — YAML's `live: "true"` would
    // otherwise leave the feature silently off.
    for (
      const [name, value] of [
        ['enabled', data.enabled],
        ['live', data.live],
        ['history', data.history],
      ] as const
    ) {
      if (value !== undefined && typeof value !== 'boolean') {
        throw new RapidError('RAPID_CONFIG', {
          message: `ui: ${name} must be a boolean`,
          details: { key: name, value },
        });
      }
    }
    for (
      const [name, value] of [
        ['core', code.core],
        ['layout', code.layout],
        ['errorTemplate', code.errorTemplate],
      ] as const
    ) {
      if (value !== undefined && !isTemplate(value)) {
        throw new RapidError('RAPID_CONFIG', {
          message: `ui: ${name} is not a RapidTemplate`,
        });
      }
    }
    if (code.errorTemplate !== undefined && code.errorTemplates !== undefined) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          'ui: errorTemplate and errorTemplates are mutually exclusive — errorTemplate is sugar for { default }',
      });
    }
    if (code.errorTemplates !== undefined) {
      // The CLOSED grammar: an exact status (400-599), '4xx'/'5xx', or
      // 'default'. Nothing else is ever a key.
      for (const [key, value] of Object.entries(code.errorTemplates)) {
        const exact = Number(key);
        const valid = key === '4xx' || key === '5xx' || key === 'default' ||
          (Number.isInteger(exact) && exact >= 400 && exact <= 599);
        if (!valid) {
          throw new RapidError('RAPID_CONFIG', {
            message:
              `ui: errorTemplates key '${key}' is outside the closed grammar (400-599, '4xx', '5xx', 'default')`,
          });
        }
        if (!isTemplate(value)) {
          throw new RapidError('RAPID_CONFIG', {
            message: `ui: errorTemplates['${key}'] is not a RapidTemplate`,
          });
        }
      }
    }
    if (
      data.prefer !== undefined && data.prefer !== 'json' &&
      data.prefer !== 'html'
    ) {
      throw new RapidError('RAPID_CONFIG', {
        message: `ui: prefer must be 'json' or 'html'`,
      });
    }
    if (code.assets !== undefined) {
      for (const [key, value] of Object.entries(code.assets)) {
        if (!key.startsWith('/') || typeof value !== 'string') {
          throw new RapidError('RAPID_CONFIG', {
            message:
              "ui: assets keys must start with '/' and map to version strings",
            details: { key },
          });
        }
      }
    }
    const runtimePath = data.runtimePath ?? '/__rapid/ui.js';
    if (!runtimePath.startsWith('/')) {
      throw new RapidError('RAPID_CONFIG', {
        message: `ui: runtimePath must start with '/'`,
      });
    }
    if (data.live === true && runtimePath === '/__rapid/live.js') {
      // Caught HERE, attributed — not as a duplicate-route error two
      // registrations later.
      throw new RapidError('RAPID_CONFIG', {
        message:
          `ui: runtimePath collides with the live bridge's /__rapid/live.js`,
      });
    }
    if (data.history === true && runtimePath === '/__rapid/history.js') {
      throw new RapidError('RAPID_CONFIG', {
        message:
          `ui: runtimePath collides with the history module's /__rapid/history.js`,
      });
    }
    const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
    for (
      const [key, value] of [
        ['swapHeader', data.swapHeader],
        ['redirectHeader', data.redirectHeader],
        ['csrfCookie', data.csrfCookie],
        ...(data.swapUnless ?? []).map((
          name,
        ): [string, string] => ['swapUnless', name]),
      ] as [string, string | undefined][]
    ) {
      if (value !== undefined && !HEADER_NAME.test(value)) {
        throw new RapidError('RAPID_CONFIG', {
          message: `ui: ${key} must be a valid header name (got '${value}')`,
        });
      }
    }
    const enabled = data.enabled !== false;
    // `errorTemplate` folds into the registry as its `default` — one
    // internal shape, one resolution path.
    const errorTemplates = code.errorTemplate !== undefined
      ? Object.freeze({ default: code.errorTemplate })
      : code.errorTemplates !== undefined
      ? Object.freeze({ ...code.errorTemplates })
      : undefined;
    const { errorTemplate: _fold, ...codeRest } = code;
    this.__ui = Object.freeze({
      ...data,
      ...codeRest,
      // Deep-frozen copy: the caller's array must not steer swap/Vary
      // behavior after registration.
      ...(data.swapUnless !== undefined
        ? { swapUnless: Object.freeze([...data.swapUnless]) }
        : {}),
      ...(errorTemplates !== undefined ? { errorTemplates } : {}),
      enabled,
      runtimePath,
    });
    if (!enabled) return; // API replica: no runtime, no live, no history
    this.__scriptRoute(runtimePath, UI_RUNTIME, UI_RUNTIME_ETAG);
    if (data.live === true) {
      this.__scriptRoute('/__rapid/live.js', UI_LIVE, UI_LIVE_ETAG);
    }
    if (data.history === true) {
      this.__scriptRoute('/__rapid/history.js', UI_HISTORY, UI_HISTORY_ETAG);
    }
  }

  /**
   * Serve one string-constant script with a strong content ETag and
   * always-revalidate caching (no-cache: the path never changes, so
   * `immutable` would pin a stale script across package upgrades — a
   * changed ETag is never consulted on an immutable entry; an unchanged
   * script still costs only a 304). Liberal If-None-Match — `*`, comma
   * lists, W/ prefixes — and the 304 re-carries its validators per
   * RFC 9110.
   */
  private __scriptRoute(path: string, source: string, etag: string): void {
    this.get(path, (ctx) => {
      const inm = ctx.headers.get('if-none-match');
      const matches = inm !== null && ifNoneMatch(inm, etag);
      const headers = { etag, 'cache-control': 'no-cache' };
      if (matches) return { status: 304, content: '', headers };
      return {
        content: source,
        headers: {
          ...headers,
          'content-type': 'text/javascript; charset=UTF-8',
        },
      };
    });
  }

  /**
   * Whether this replica represents templated routes at all — `false`
   * only when the UI was configured with `enabled: false` (the per-
   * replica API-only gate). Distinct from "UI never configured": route-
   * level templates work without any app-level UI configuration, but a
   * disabled replica serves JSON unconditionally.
   */
  public get uiEnabled(): boolean {
    return this.__ui?.enabled !== false;
  }

  /** The normalized `server.static` mounts, in declaration order. */
  public get staticMounts(): readonly StaticMount[] {
    return this.__staticMounts;
  }

  /**
   * The content-hash version for a static asset URL path, or
   * `undefined` when no fingerprint-enabled `server.static` mount
   * covers it (or the file is unreadable — Workers included, where
   * `view.asset()` then passes the path through unchanged). LAZY: the
   * file is read and hashed on first reference and cached —
   * DEVELOPMENT re-checks the mtime per call so an edited file gets a
   * fresh hash on the next render; PRODUCTION caches forever. Sync by
   * necessity (templates render synchronously) — so the FIRST render
   * referencing an asset pays its read+hash inline, once per path.
   */
  public assetVersion(urlPath: string): string | undefined {
    for (const mount of this.__staticMounts) {
      if (!mount.fingerprint) continue;
      if (
        mount.prefix !== '' && urlPath !== mount.prefix &&
        !urlPath.startsWith(mount.prefix + '/')
      ) continue;
      const rel = urlPath.slice(mount.prefix.length);
      if (rel === '' || rel.endsWith('/')) continue;
      // Lexical guard only — this HASHES (never serves) and a template
      // author writes these paths, but `..` must still not escape.
      const filePath = joinPath(mount.root, rel);
      if (
        filePath !== mount.root &&
        !filePath.startsWith(mount.root + PATH_SEPARATOR)
      ) continue;
      const dev = this.mode === 'DEVELOPMENT';
      const cached = this.__assetVersions.get(urlPath);
      if (cached !== undefined && !dev) return cached.version;
      try {
        // Stat BEFORE the read: an edit landing between the two then
        // caches under the OLD mtime (re-hashed next call) — the reverse
        // order would cache a stale hash under the NEW mtime, sticky
        // until the next edit.
        const mtimeMs = statSync(filePath).mtime?.getTime() ?? 0;
        if (cached !== undefined && mtimeMs === cached.mtimeMs) {
          return cached.version;
        }
        const version = djb2(readFileSync(filePath));
        this.__assetVersions.set(urlPath, { version, mtimeMs });
        return version;
      } catch {
        continue; // unreadable here — an overlapping later mount may host it
      }
    }
    return undefined;
  }

  /**
   * The resolved UI configuration, or `undefined` when the UI is not
   * configured OR this replica set `ui.enabled: false` — the single
   * switch the representer (and `ctx.isSwap`) reads, so a disabled
   * replica serves JSON everywhere with zero further gating.
   */
  public get uiOptions():
    | Readonly<
      & RapidUiConfigOptions
      & Omit<RapidUiTemplateOptions, 'errorTemplate'>
      & { runtimePath: string }
    >
    | undefined {
    return this.__ui?.enabled === false ? undefined : this.__ui;
  }

  /**
   * Boot-time invariants shared by {@link start} and {@link fetch}.
   * @throws {RapidError} RAPID_CONFIG on an unsafe option combination.
   */
  private __assertBootConfig(): void {
    if (this.option('stateMode') === 'SHARE') {
      const candidates: RapidMiddleware[] = [
        ...this.__middleware,
        ...this.__routes.flatMap((r) =>
          r.middlewares as unknown as RapidMiddleware[]
        ),
        ...[...this.__socketCommands.values()].flatMap((c) =>
          c.middlewares as unknown as RapidMiddleware[]
        ),
      ];
      const offender = candidates.find(middlewareUsesStateKey);
      if (offender !== undefined) {
        throw new RapidError('RAPID_CONFIG', {
          message:
            "stateMode: 'SHARE' is incompatible with a stateKey-writing middleware (responseTimer/requestId) — every invocation would read and write the SAME state object, corrupting per-invocation values (duration, correlation id) under concurrency",
          details: { stateMode: 'SHARE' },
        });
      }
    }
  }

  /**
   * Boot the ENABLED transports: HTTP unless `server.enabled` is
   * false; jobs when any are registered and `jobs.enabled` is not
   * false. Emits `start`; a boot failure emits `error`, tears down,
   * and rethrows.
   */
  public async start(): Promise<this> {
    if (this.__started) return this;
    this.__started = true; // set FIRST so a boot failure can tear down
    try {
      // `stateMode: 'SHARE'` hands every invocation the SAME state
      // object; a middleware writing a per-invocation value there
      // (responseTimer/requestId's `stateKey`) corrupts under
      // concurrency (last write wins, across unrelated invocations).
      // Unlike the removed R2-H3 heuristic, this is a deterministic
      // check — no false negatives to lie about — so it fails the
      // boot outright rather than warning. Scans every place a
      // middleware can be registered, not just app.use(): a
      // route-scoped or socket-command-scoped chain is an equally
      // normal, documented way to reach this hazard.
      this.__assertBootConfig();
      if (this.option('server')!.enabled !== false) {
        // NOTE: a boot-time "socket commands are unguarded" warning
        // lived here and was REMOVED (adversarial review R2-H3). It
        // asked only whether SOME middleware reaches SOCKET, which any
        // unscoped middleware (a logger) answers yes to — so it went
        // silent for the exact `use(requestLogger(), onlyHTTP(auth))`
        // hole it existed to catch, while firing for `guardHTTP(auth)`,
        // which fails CLOSED and is safe. Its message therefore pushed
        // developers from `guard*` to `only*` — from safe to unsafe.
        // Coverage checking needs to know which middleware is
        // security-relevant; that belongs to the auth-context design
        // round, not to a heuristic over transport scope.
        // `??=`: a transport prepared by fetch() is reused, not rebuilt —
        // its routes are already in the router.
        this.__http ??= new HTTPTransport(this);
        await this.__http.start();
      }
      if (this.__jobs.size > 0 && this.option('jobs')!.enabled !== false) {
        this.__jobTransport = new JOBTransport(this);
        await this.__jobTransport.start();
      }
      this._emit('start');
      this.log.info('started', {
        address: this.address,
        jobs: this.__jobTransport !== undefined ? this.__jobs.size : 0,
      });
      return this;
    } catch (error) {
      const err = RapidError.from(error);
      this._emit('error', err);
      await this.stop().catch(() => {});
      this.__started = false;
      throw err;
    }
  }

  /**
   * Serve ONE request without a listener — the fetch-handler form that
   * Cloudflare Workers, `Deno.serve`, `Bun.serve` and in-process tests
   * speak. Same routes, middleware, context and disclosure as
   * {@link start}; only the socket's owner differs. HTTP only: socket
   * commands need a listener (RAPID_CONFIG on the first call), jobs are
   * not scheduled (use {@link triggerJob} from a cron trigger), and
   * `address`/`port`/`metrics` stay `null`/`undefined`. Routes are read
   * on the first call — register them before, as with `start()`. A later
   * `start()` reuses the prepared routes.
   *
   * @example
   * ```ts ignore
   * export default { fetch: (request: Request) => app.fetch(request) };
   * ```
   * @throws {RapidError} RAPID_CONFIG when socket commands are registered
   *   or a boot invariant fails (same checks as `start()`).
   */
  public fetch(
    request: Request,
    info?: RapidApplicationFetchInfo,
  ): Response | Promise<Response> {
    const http = this.__http ?? this.__prepareFetch();
    return http.handle(request, info?.remoteAddress ?? null);
  }

  private __prepareFetch(): HTTPTransport<S> {
    if (this.__socketCommands.size > 0) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          'fetch() serves HTTP only — socket commands need a listening server; use start()',
        details: { socketCommands: [...this.__socketCommands.keys()] },
      });
    }
    this.__assertBootConfig();
    if (this.__ui?.live === true) {
      // The rpc socket mounts only in start()'s listening server — on a
      // fetch()-only deployment (Workers, tests, any embedder) the
      // bridge has no server end and can never connect. Loud, once.
      this.log.warn(
        'ui.live: true on the fetch()-only path: /ws never mounts here, so the live bridge cannot connect',
      );
    }
    if (this.__channels.size > 0) {
      // Same unreachability as ui.live — declared channels have no socket
      // to publish over here, so publish() silently no-ops. Warn, not
      // throw: channels may be declared by shared boot code that also
      // runs on listening replicas.
      this.log.warn(
        'channels declared on the fetch()-only path: /ws never mounts here, so publish() will no-op',
        { channels: [...this.__channels.keys()] },
      );
    }
    const http = new HTTPTransport<S>(this);
    http.prepare();
    this.__http = http;
    return http;
  }

  /**
   * Stop all transports. `shutdownTimeout` is the graceful-drain window:
   * the HTTP server drains in-flight requests for up to that long, then
   * force-closes the rest (see {@link HTTPTransport.stop}). A nuclear
   * process-exit backstop fires a little later — `shutdownTimeout` plus a
   * 10% grace, unref'd so it cannot hold the loop open — to guarantee exit
   * if the drain's own force-close or a later teardown step (jobs, module
   * dispose) itself wedges. `shutdownTimeout: 0` disables both: the server
   * force-closes immediately and no exit is armed.
   */
  public async stop(): Promise<this> {
    if (!this.__started) {
      // The upload temp dir is created at CONSTRUCTION, not start() — an
      // instance that never started still owns one (e.g. a validation
      // probe in tests). Idempotent: a second stop() finds nothing.
      if (this.__ownedUploadPath !== undefined) {
        await remove(this.__ownedUploadPath).catch(() => {});
      }
      await this.__disposeModules(); // booted via modules() + fetch(), never listened
      return this;
    }
    // The graceful-drain window handed to the HTTP transport; the nuclear
    // exit is armed a 10% grace beyond it so the drain's force-close and the
    // later teardown steps (jobs, module dispose) settle first in the normal
    // case, and the exit only fires when teardown is genuinely wedged.
    const drainMs = this.option('shutdownTimeout')!;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (drainMs > 0) {
      // Nuclear exit via compat (never a raw runtime global — golden rule);
      // unref'd so it can't itself keep the process alive when teardown wins.
      timer = setTimeout(() => exit(1), Math.ceil(drainMs * 1.1));
      unrefTimer(timer);
    }
    try {
      const http = this.__http;
      const jobs = this.__jobTransport;
      this.__http = undefined;
      this.__jobTransport = undefined;
      this.__started = false;
      // Isolated teardown: one transport's failure cannot orphan the
      // other; the first failure resurfaces after BOTH have stopped.
      const failures: unknown[] = [];
      try {
        // Same drain window as HTTP: a job mid-run gets to finish before
        // the module dispose below closes what it is using.
        await jobs?.stop(drainMs);
      } catch (error) {
        failures.push(error);
      }
      try {
        await http?.stop(drainMs);
      } catch (error) {
        failures.push(error);
      }
      // The owned upload dir goes only AFTER the drain — a request
      // mid-multipart-parse is still writing temp files into it, and
      // removing it first would 500 the very requests the drain exists
      // to protect.
      if (this.__ownedUploadPath !== undefined) {
        await remove(this.__ownedUploadPath).catch(() => {});
      }
      // Modules go LAST: in-flight requests may still invoke them.
      try {
        await this.__disposeModules();
      } catch (error) {
        failures.push(error);
      }
      this._emit('stop');
      if (failures.length > 0) throw RapidError.from(failures[0]);
      return this;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /**
   * Fire a registered job NOW (test/ops escape). Works before start()
   * too — via a THROWAWAY transport that never touches lifecycle state.
   * `args` merge OVER the job's registration defaults for this firing.
   * `handlerRan` in the outcome is `false` when middleware
   * short-circuited the run (the handler never executed).
   *
   * @throws {RapidError} RAPID_CONFIG when no job is registered under
   *   `name` (as a rejection of the returned promise).
   */
  public triggerJob(
    name: string,
    args?: Readonly<Record<string, unknown>>,
  ): Promise<{ status: number; content: unknown; handlerRan: boolean }> {
    const transport = this.__jobTransport ?? new JOBTransport(this);
    return transport.triggerNow(name, args);
  }

  /**
   * Read an application OPTION (constructor-time framework knob). The
   * app's file configuration is a different thing — {@link config}.
   */
  public option<K extends keyof RapidApplicationOptions>(
    name: K,
  ): RapidApplicationOptions[K] {
    return super._getOption(name);
  }

  /**
   * The per-invocation state, built by `stateMode` — contexts read this
   * ONCE at construction (the app is the state factory; policy and
   * mechanism live in one place). See {@link RapidApplicationOptions.stateMode}
   * for the mode semantics.
   */
  public get state(): S {
    return buildState(this._state, this.option('stateMode') ?? 'CLONE');
  }
  /**
   * The framework-owned log correlation source: the ambient invocation
   * bag (requestId, name — opened per invocation by the transports)
   * composed with live trace identity when tracing is on. A stable
   * bound arrow — slogger caches configs by function identity.
   */
  private readonly __logContext = (): Record<string, unknown> => {
    return {
      ...(ambient.get()),
      ...(this._tracer?.logContext()),
    };
  };

  /** Cross-key validation — loud at boot, per the config-error rule. */
  private __validate(): void {
    // `mode` steers error disclosure and log levels — a silently wrong
    // value ('development' from natural YAML casing running as
    // PRODUCTION) is a posture change with no hint why. Any casing of
    // the two values normalizes; anything else fails the boot.
    const mode = this._getOption('mode') as unknown;
    const upper = typeof mode === 'string' ? mode.toUpperCase() : undefined;
    if (upper !== 'DEVELOPMENT' && upper !== 'PRODUCTION') {
      throw new RapidError('RAPID_CONFIG', {
        message: `mode must be 'DEVELOPMENT' or 'PRODUCTION'`,
        details: { key: 'mode', value: mode },
      });
    }
    if (mode !== upper) this._setOption('mode', upper);
    // Required + slogger's appName contract, surfaced as OUR error
    // (missing name from a bad Application file must fail loudly here,
    // not deep inside Slogger construction).
    const name = this._getOption('name');
    if (typeof name !== 'string' || name.trim() === '' || name.length > 30) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          'name must be a non-empty string of at most 30 characters (it is also the logging appName)',
        details: { key: 'name', value: name },
      });
    }
    // A present-but-weak signing key is worse than none: every signed cookie
    // / session id / CSRF token would be forgeable. Refuse it loudly at boot.
    const secret = this._getOption('secret');
    if (
      secret !== undefined && (typeof secret !== 'string' || secret.length < 32)
    ) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          'secret must be a string of at least 32 characters (it is the HMAC key for signed cookies, sessions, and CSRF tokens)',
        details: { key: 'secret' },
      });
    }
    const { port, hostname, unixSocketPath } = this._getOption('server') ?? {};
    if (
      port !== undefined &&
      (!Number.isInteger(port) || port < 0 || port > 65535)
    ) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          'port must be an integer between 0 and 65535 (0 = OS-assigned)',
        details: { key: 'port', value: port },
      });
    }
    if (
      unixSocketPath !== undefined &&
      (typeof unixSocketPath !== 'string' || unixSocketPath.trim() === '')
    ) {
      throw new RapidError('RAPID_CONFIG', {
        message: 'unixSocketPath must be a non-empty string',
        details: { key: 'unixSocketPath' },
      });
    }
    if (
      unixSocketPath !== undefined &&
      (port !== undefined || hostname !== undefined)
    ) {
      throw new RapidError('RAPID_CONFIG', {
        message: 'unixSocketPath is mutually exclusive with port/hostname',
        details: { key: 'unixSocketPath' },
      });
    }
    const shutdownTimeout = this._getOption('shutdownTimeout')!;
    if (!Number.isInteger(shutdownTimeout) || shutdownTimeout < 0) {
      throw new RapidError('RAPID_CONFIG', {
        message: 'shutdownTimeout must be a non-negative integer (ms)',
        details: { key: 'shutdownTimeout', value: shutdownTimeout },
      });
    }
    // The paging/query sub-groups: defaults were merged in, so every
    // key is present — reject nonsense loudly (config-error rule).
    const { paging, query } = this._getOption('server') ?? {};
    for (
      const [key, value] of [
        ['server.paging.defaultSize', paging?.defaultSize],
        ['server.paging.maxSize', paging?.maxSize],
        ['server.paging.maxPage', paging?.maxPage],
        ['server.query.maxFilters', query?.maxFilters],
        ['server.query.maxSorts', query?.maxSorts],
        ['server.query.maxValueLength', query?.maxValueLength],
        ['server.query.maxArrayItems', query?.maxArrayItems],
      ] as const
    ) {
      if (!Number.isInteger(value) || (value as number) < 1) {
        throw new RapidError('RAPID_CONFIG', {
          message: `${key} must be a positive integer`,
          details: { key, value },
        });
      }
    }
    if (paging!.defaultSize! > paging!.maxSize!) {
      throw new RapidError('RAPID_CONFIG', {
        message: 'server.paging.defaultSize cannot exceed maxSize',
        details: {
          defaultSize: paging!.defaultSize,
          maxSize: paging!.maxSize,
        },
      });
    }
  }
}
