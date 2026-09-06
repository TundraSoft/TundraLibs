/**
 * Data categories pact can cache, each in its own cacher namespace
 * (`pact__<type>`) so one category can be bulk-invalidated without
 * touching the others.
 */
export type PactCacheType = 'apiKey' | 'principal' | 'session';
