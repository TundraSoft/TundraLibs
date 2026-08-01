/** Server → client: a published message on a subscribed channel. */
export type MessageFrame = {
  type: 'msg';
  channel: string;
  data: unknown;
};
