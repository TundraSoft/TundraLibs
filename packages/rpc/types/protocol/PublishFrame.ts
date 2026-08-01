/**
 * Client → server: publish to a channel — delegates to the
 * channel's `onPublish` hook.
 */
export type PublishFrame = {
  id: string;
  type: 'pub';
  channel: string;
  payload: unknown;
};
