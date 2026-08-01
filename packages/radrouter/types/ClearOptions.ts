/**
 * Options for {@link RadRouter.clear}.
 */
export type ClearOptions = {
  /**
   * When true, retain global middlewares registered via
   * {@link RadRouter.use}. Defaults to false (clears everything).
   */
  keepGlobalMiddlewares?: boolean;
};
