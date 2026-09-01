/**
 * @fileoverview {@link RapidView} — the read-only per-request bag the UI
 * representer hands every template and layout.
 *
 * @module
 */

/**
 * The per-request view bag — frozen, read-only, built by the representer
 * so a layout can render a nav without any template touching `ctx`. By
 * default it carries NOTHING from the auth bag; identity reaches
 * templates only through the explicit `ui.view` projection configured
 * at `Application.initialize`, whose returned fields merge over these
 * defaults (typed via `Extra`).
 *
 * @typeParam Extra - the app projection's added fields.
 */
export type RapidView<
  // The default must be the EMPTY shape (Record<never, never>), not
  // Record<string, never> — the latter intersects every named property
  // with `never` and makes the whole bag unconstructible.
  Extra extends Record<string, unknown> = Record<never, never>,
> = Readonly<
  {
    /** Correlation id of the request being rendered. */
    requestId: string;
    /** Where the swap runtime is served — for the layout's script tag. */
    runtimePath: string;
    /** URL pathname of the request. */
    path: string;
    /**
     * Version a static asset URL: `'/style.css'` →
     * `'/style.css?v=<hash>'` when the path is in the `ui.assets`
     * manifest (see `fingerprintAssets`) or under a fingerprint-enabled
     * `server.static` mount (lazily content-hashed), the path unchanged
     * otherwise — safe to use unconditionally.
     */
    asset(path: string): string;
    /** Raw query params, decoded; the LAST value wins for a repeated key. */
    query: Readonly<Record<string, string>>;
    /** The `csrf()` cookie's token, when present on the request. */
    csrfToken?: string;
  } & Extra
>;
