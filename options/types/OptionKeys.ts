import type { EventCallback, EventType } from '../../events/mod.ts';

export type OptionKeys<
  O extends Record<string, unknown> = Record<string, unknown>,
  E extends EventType = Record<string, EventCallback>,
> = O & { [K in keyof E as `_on${string & K}`]?: EventCallback };
