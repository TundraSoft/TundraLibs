import type { MessageFrame } from './MessageFrame.ts';
import type { ResultFrame } from './ResultFrame.ts';
import type { ServerErrorFrame } from './ServerErrorFrame.ts';
import type { SubscribedFrame } from './SubscribedFrame.ts';

/** Union of all server-to-client frame types. */
export type OutboundFrame =
  | ResultFrame
  | SubscribedFrame
  | MessageFrame
  | ServerErrorFrame;
