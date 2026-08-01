/**
 * @fileoverview Discriminator for the supported authentication schemes.
 *
 * @module
 */

/**
 * Discriminator for the supported authentication schemes
 *
 * `CUSTOM` carries arbitrary fields that the subclass interprets; the base
 * class only injects headers for `BASIC` and `BEARER`.
 */
export type RESTlerAuthTypes = 'BASIC' | 'BEARER' | 'CUSTOM';
