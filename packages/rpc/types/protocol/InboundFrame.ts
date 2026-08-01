import type { CommandFrame } from './CommandFrame.ts';
import type { PublishFrame } from './PublishFrame.ts';
import type { SubscribeFrame } from './SubscribeFrame.ts';
import type { UnsubscribeFrame } from './UnsubscribeFrame.ts';

/** Union of all client-to-server frame types. */
export type InboundFrame =
  | CommandFrame
  | SubscribeFrame
  | UnsubscribeFrame
  | PublishFrame;
