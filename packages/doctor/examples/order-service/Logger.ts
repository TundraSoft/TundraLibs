/**
 * A SINGLETON with a label dependency: built once, on first resolve;
 * `inject(CONFIG)` runs while the constructor runs. @module
 */
import { inject, Vial } from '../../mod.ts';
import { CONFIG } from './tokens.ts';

@Vial('SINGLETON')
export class Logger {
  readonly config = inject(CONFIG);
  readonly lines: string[] = [];
  info(msg: string): void {
    this.lines.push(msg);
    console.log(`[${this.config.currency}] ${msg}`);
  }
}
