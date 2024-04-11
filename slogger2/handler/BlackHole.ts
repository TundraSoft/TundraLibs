import { AbstractHandler } from '../AbstractHandler.ts';
import type { HandlerOptions, LogObject } from '../types/mod.ts';

export class BlackHole extends AbstractHandler<HandlerOptions> {
  protected _handle(_log: LogObject): void {
    return;
  }
}
