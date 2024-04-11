import { Severities } from '../syslog/mod.ts';
import { AbstractHandler } from './AbstractHandler.ts';
import type { LogObject } from './types/mod.ts';

export class Logger {
  public readonly name: string;

  protected _handlers: AbstractHandler[] = [];
  protected _severity: Severities = Severities.ERROR;

  constructor(name: string) {
    this.name = name.trim().toLowerCase();
  }

  public addHandler(handler: AbstractHandler): void {
    this._handlers.push(handler);
  }

  public removeHandler(handler: AbstractHandler): void {
    const index = this._handlers.indexOf(handler);
    if (index !== -1) {
      this._handlers.splice(index, 1);
    }
  }

  log(
    severity: Severities,
    message: string,
    params?: Record<string, unknown>,
  ): void {
    if (severity >= this._severity) {
      // Lets try to find the first stack frame that is not in the logger
      const error = new Error();
      const stack = error.stack?.split('\n');
      let frame = '';
      let source: string | undefined = undefined;
      if (stack) {
        // Well this will fail dramatically if its called from this file :P
        for (let i = 2; i < stack.length; i++) {
          frame = stack[i].trim();
          if (!frame.includes('Logger')) {
            break;
          }
        }
        // Well use the second entry then
        if (frame.length === 0) {
          frame = stack[2].trim();
        }
      }
      if (frame.length > 0) {
        const cwd = Deno.cwd(); //import.meta.url.replace('file://', '');
        const m = frame.substring(frame.indexOf(cwd) + cwd.length + 1).match(
          /^(.*?):(\d+):(\d+)/,
        );
        if (m) {
          source = `${m[1]}:${m[2]}:${m[3]}`;
        }
      }
      const log: LogObject = {
        appName: this.name,
        severity,
        message,
        params,
        timestamp: new Date(),
        source,
      };
      this._handlers.forEach((handler) => handler.handle(log));
    }
  }

  emergency(message: string, params?: Record<string, unknown>): void {
    this.log(Severities.EMERGENCY, message, params);
  }

  alert(message: string, params?: Record<string, unknown>): void {
    this.log(Severities.ALERT, message, params);
  }

  critical(message: string, params?: Record<string, unknown>): void {
    this.log(Severities.CRITICAL, message, params);
  }

  error(message: string, params?: Record<string, unknown>): void {
    this.log(Severities.ERROR, message, params);
  }

  warning(message: string, params?: Record<string, unknown>): void {
    this.log(Severities.WARNING, message, params);
  }

  notice(message: string, params?: Record<string, unknown>): void {
    this.log(Severities.NOTICE, message, params);
  }

  info(message: string, params?: Record<string, unknown>): void {
    this.log(Severities.INFORMATIONAL, message, params);
  }

  debug(message: string, params?: Record<string, unknown>): void {
    this.log(Severities.DEBUG, message, params);
  }

  _getCWD(): string | undefined {
    const perm = Deno.permissions.querySync({ name: 'read' });
    if (perm.state === 'granted') {
      return Deno.cwd();
    }
  }
}

const a = new Logger('test');
a.log(Severities.DEBUG, 'This is a test', { test: 'test' });
