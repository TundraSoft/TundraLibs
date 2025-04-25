import { SlogObject } from './Object.ts';

export type SloggerFormatter = (log: Readonly<SlogObject>) => string;
