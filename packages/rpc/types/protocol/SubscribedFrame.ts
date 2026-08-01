/** Server → client: confirmation of subscribe/unsubscribe. */
export type SubscribedFrame = {
  id: string;
  type: 'subscribed' | 'unsubscribed';
  channel: string;
};
