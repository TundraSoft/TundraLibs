/**
 * @fileoverview Config — singleton settings holder with required
 * constructor arguments. Registered via the `factory` hook in
 * [registry.ts](registry.ts).
 *
 * @module
 */

export class Config {
  constructor(
    public readonly appName: string,
    public readonly version: string,
  ) {}
}
