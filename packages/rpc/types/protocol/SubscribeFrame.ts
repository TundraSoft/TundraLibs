/** Client → server: subscribe to a channel. */
export type SubscribeFrame = {
  id: string;
  type: 'sub';
  channel: string;
};
