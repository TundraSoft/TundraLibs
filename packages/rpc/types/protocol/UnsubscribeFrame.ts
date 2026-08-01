/** Client → server: unsubscribe from a channel. */
export type UnsubscribeFrame = {
  id: string;
  type: 'unsub';
  channel: string;
};
