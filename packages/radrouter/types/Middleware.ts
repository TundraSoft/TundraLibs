/**
 * Reference shape for a middleware function. {@link RadRouter} is
 * structurally agnostic — it stores and dispatches functions but
 * never reads `ctx` itself, so this type carries no `Ctx` generic.
 * Consumers wanting an end-to-end typed chain define their own
 * typed alias and supply it directly to `RadRouter<M>`:
 *
 * ```ts
 * type AppMw = (ctx: AppCtx, next: () => Promise<void>) => Promise<void>;
 * const router = new RadRouter<AppMw>();
 * // ctx is now typed AppCtx inside every middleware
 * ```
 *
 * The exported `Middleware` is informational — it documents the
 * expected shape and serves as the unconstrained default for `M`.
 */
export type Middleware = (
  ctx: unknown,
  next: () => Promise<void>,
) => Promise<void>;
