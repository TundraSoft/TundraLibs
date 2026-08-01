/**
 * Server → client: out-of-band error, not tied to a specific
 * request (e.g. malformed frame, protocol violation). `id` is set
 * when it can be recovered from the offending inbound frame — then
 * it correlates with that request so the client can fail it fast
 * instead of waiting out its timeout. It is omitted when no id is
 * recoverable (invalid JSON, binary, or an over-limit frame — see
 * `docs/Rpc-Protocol.md`).
 */
export type ServerErrorFrame = {
  id?: string;
  type: 'error';
  code: string;
  message: string;
};
