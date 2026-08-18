/**
 * @fileoverview WebConfig — singleton settings holder with required
 * constructor arguments. Doctor can't call `new WebConfig()` itself,
 * so the registration uses the `factory` hook in
 * [registry.ts](registry.ts) to construct it from env (with
 * defaults).
 *
 * @module
 */

export class WebConfig {
  constructor(
    public readonly appName: string,
    public readonly dbUrl: string,
  ) {}

  public get(key: 'appName' | 'dbUrl'): string {
    return this[key];
  }
}
