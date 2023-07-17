import type { Callback, EventsType } from '../../events/mod.ts';
// import type { OptionType } from './OptionTypes.ts';
export type OptionKeys<
  O extends Record<string, unknown> = Record<string, unknown>,
  E extends EventsType = Record<string, Callback>,
> =
  & O
  & {
    [K in keyof E as `_on${string & K}`]?: Callback;
  };
