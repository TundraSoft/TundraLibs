/** Information about the upgrade request, exposed to the `open` callback. */
export type WebSocketUpgradeContext = {
  request: Request;
  remoteAddress: string | null;
  remotePort: number | null;
};
