/**
 * What a single-use action token was minted for. Stored on the record
 * and checked after consumption, so a token minted for one flow can
 * never complete another.
 */
export type PactTokenPurpose = 'PASSWORD_RESET' | 'EMAIL_VERIFICATION';
