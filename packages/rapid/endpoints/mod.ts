/**
 * @fileoverview Ready-made mountable endpoint handlers — mount where you
 * like (`app.get('/metrics', metrics())`). They read the app through the
 * context and convert per their options.
 *
 * @module
 */
export { health, type HealthOptions } from './health.ts';
export { login, type LoginOptions } from './login.ts';
export { metrics, type MetricsOptions } from './metrics.ts';
export { openapi, type OpenApiOptions } from './openapi.ts';
