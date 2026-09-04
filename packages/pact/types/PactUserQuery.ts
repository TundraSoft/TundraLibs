/**
 * Discriminated query for the `getUser` hook — one hook, three lookup
 * paths; the application implements a single function and routes on
 * `by`. The OAUTH arm resolves a provider link (provider name + the
 * provider's subject id) to the local user.
 */
export type PactUserQuery =
  | { readonly by: 'ID'; readonly id: string }
  | { readonly by: 'IDENTIFIER'; readonly identifier: string }
  | {
    readonly by: 'OAUTH';
    readonly provider: string;
    readonly subject: string;
  };
