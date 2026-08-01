/** Client → server: invoke a registered command. */
export type CommandFrame = {
  id: string;
  type: 'cmd';
  cmd: string;
  payload?: unknown;
};
