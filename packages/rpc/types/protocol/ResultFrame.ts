/** Server → client: response to a `cmd` / `sub` / `pub` frame. */
export type ResultFrame =
  | { id: string; type: 'result'; ok: true; data?: unknown }
  | {
    id: string;
    type: 'result';
    ok: false;
    error: { code: string; message: string };
  };
