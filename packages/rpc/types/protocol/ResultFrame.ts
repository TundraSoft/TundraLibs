/** Server → client: response to a `cmd` / `sub` / `pub` frame. */
export type ResultFrame =
  | { id: string; type: 'result'; ok: true; data?: unknown }
  | {
    id: string;
    type: 'result';
    ok: false;
    /**
     * `code`/`message` identify the failure. `data` is OPTIONAL
     * structured detail a handler chose to send with it (validation
     * field errors, a retry hint) — a handler supplies it by attaching
     * `data` to the thrown error, and the client surfaces it on the
     * rejection. Additive: peers that predate it simply ignore the
     * field.
     *
     * It crosses the wire to the CALLER, so it carries the same
     * disclosure duty as any error body — never put internals in it.
     */
    error: { code: string; message: string; data?: unknown };
  };
