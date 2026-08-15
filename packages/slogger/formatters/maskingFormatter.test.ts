import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { SyslogSeverities } from '@tundralibs/utils';
import { maskingFormatter, MaskingStrategy } from './maskingFormatter.ts';
import { simpleFormatter } from './string.ts';
import { jsonFormatter } from './jsonFormatter.ts';
import { logfmtFormatter } from './logfmt.ts';
import { otelLogFormatter } from './otel.ts';
import { rfc5424Formatter } from './rfc5424.ts';
import type { SlogObject } from '../types/mod.ts';

// Helper to create a standard log object for testing
const makeLogObject = (
  message: string,
  context: Record<string, unknown> = {},
): SlogObject => ({
  id: '1',
  appName: 'testApp',
  hostname: 'localhost',
  levelName: 'INFO',
  level: SyslogSeverities.INFO,
  context,
  message,
  date: new Date('2023-01-01T12:00:00Z'),
  isoDate: '2023-01-01T12:00:00.000Z',
  timestamp: 1672574400000,
});

describe('slogger.formatters.maskingFormatter', () => {
  it('should mask sensitive fields with default settings', () => {
    const formatter = maskingFormatter();

    const log = makeLogObject('User logged in', {
      userId: 1234,
      username: 'johndoe',
      password: 'secret123',
      token: 'abc123xyz456',
    });

    const result = formatter(log);

    // Password and token should be masked
    asserts.assert(!result.includes('secret123'));
    asserts.assert(!result.includes('abc123xyz456'));
    asserts.assert(result.includes('********'));

    // Non-sensitive fields should remain visible
    asserts.assert(result.includes('johndoe'));
    asserts.assert(result.includes('1234'));
  });

  it('should mask sensitive patterns in messages', () => {
    const formatter = maskingFormatter();

    // Test with credit card numbers
    const log1 = makeLogObject('Credit card: 4111 1111 1111 1111');
    const result1 = formatter(log1);
    asserts.assert(!result1.includes('4111 1111 1111 1111'));

    // Test with email addresses
    const log2 = makeLogObject('Contact us at user@example.com');
    const result2 = formatter(log2);
    asserts.assert(!result2.includes('user@example.com'));

    // Test with API key in message
    const log3 = makeLogObject('API Key: sk_test_abcdefghijklmnopqrstuvwxyz');
    const result3 = formatter(log3);
    asserts.assert(
      !result3.includes('API Key: sk_test_abcdefghijklmnopqrstuvwxyz'),
    );
  });

  it('should support different masking strategies', () => {
    // Test FULL masking (default)
    const fullFormatter = maskingFormatter({
      strategy: MaskingStrategy.FULL,
    });

    const log = makeLogObject('Test', {
      password: 'secret123',
      apiKey: 'abcdef123456',
    });

    const fullResult = fullFormatter(log);
    asserts.assert(fullResult.includes('"password": "*********"'));
    asserts.assert(fullResult.includes('"apiKey": "************"'));

    // Test PARTIAL masking
    const partialFormatter = maskingFormatter({
      strategy: MaskingStrategy.PARTIAL,
    });

    const partialResult = partialFormatter(log);
    asserts.assert(partialResult.includes('"password": "s*******3"'));
    asserts.assert(partialResult.includes('"apiKey": "a**********6"'));

    // Test PREFIX masking
    const prefixFormatter = maskingFormatter({
      strategy: MaskingStrategy.PREFIX,
      visibleChars: 3,
    });

    const prefixResult = prefixFormatter(log);
    asserts.assert(prefixResult.includes('"password": "sec******"'));
    asserts.assert(prefixResult.includes('"apiKey": "abc*********"'));

    // Test SUFFIX masking
    const suffixFormatter = maskingFormatter({
      strategy: MaskingStrategy.SUFFIX,
      visibleChars: 3,
    });

    const suffixResult = suffixFormatter(log);
    asserts.assert(suffixResult.includes('"password": "******123"'));
    asserts.assert(suffixResult.includes('"apiKey": "*********456"'));
  });

  it('should use custom mask character', () => {
    const formatter = maskingFormatter({
      maskChar: '•',
    });

    const log = makeLogObject('Test', {
      password: 'secret123',
    });

    const result = formatter(log);
    asserts.assert(result.includes('"password": "•••••••••"'));
  });

  it('should use custom sensitive fields', () => {
    const formatter = maskingFormatter({
      sensitiveFields: ['customSecret', 'userInfo'],
    });

    const log = makeLogObject('Test', {
      customSecret: 'hidden value',
      userInfo: 'personal data',
      publicField: 'visible value',
      // The default sensitive fields shouldn't be masked anymore
      password: 'not masked',
    });

    const result = formatter(log);

    // Custom fields should be masked
    asserts.assert(!result.includes('hidden value'));
    asserts.assert(!result.includes('personal data'));

    // Other fields should remain visible
    asserts.assert(result.includes('visible value'));
    asserts.assert(result.includes('not masked'));
  });

  it('should use custom regex patterns', () => {
    const formatter = maskingFormatter({
      sensitivePatterns: [
        /custom-pattern-\d+/g,
        /SECRET_VALUE/g,
      ],
    });

    const log = makeLogObject(
      'This has custom-pattern-12345 and SECRET_VALUE in it',
    );

    const result = formatter(log);

    // Custom patterns should be masked
    asserts.assert(!result.includes('custom-pattern-12345'));
    asserts.assert(!result.includes('SECRET_VALUE'));

    // Default patterns shouldn't be applied (like email)
    const log2 = makeLogObject('Email: user@example.com should not be masked');
    const result2 = formatter(log2);

    // This is where the test is failing - fixing the assertion to match expected behavior
    // When custom patterns are provided, they should REPLACE the default patterns
    asserts.assert(
      result2.includes('user@example.com'),
      "Email should not be masked when using custom patterns that don't include email detection",
    );
  });

  it('should mask recursively in nested objects', () => {
    const formatter = maskingFormatter();

    const log = makeLogObject('Test nested objects', {
      user: {
        name: 'John Doe',
        credentials: {
          password: 'secret123',
          token: 'xyz789',
        },
      },
      settings: {
        apiKey: 'api_123456',
      },
      items: [
        { id: 1, secret: 'hidden1' },
        { id: 2, secret: 'hidden2' },
      ],
    });

    const result = formatter(log);

    // Nested fields should be masked
    asserts.assert(!result.includes('secret123'));
    asserts.assert(!result.includes('xyz789'));
    asserts.assert(!result.includes('api_123456'));
    asserts.assert(!result.includes('hidden1'));
    asserts.assert(!result.includes('hidden2'));

    // Regular fields should remain visible
    asserts.assert(result.includes('John Doe'));
  });

  it('should use provided base formatter', () => {
    // Create a custom base formatter
    const customFormat = simpleFormatter('[${levelName}] ${message}');

    const formatter = maskingFormatter({
      baseFormatter: customFormat,
    });

    const log = makeLogObject('Log with password: secret123');

    const result = formatter(log);

    // Should use the custom format
    asserts.assert(result.startsWith('[INFO]'));

    // But still mask sensitive data
    asserts.assert(!result.includes('secret123'));
  });

  it('should return valid JSON with jsonFormatter', () => {
    const formatter = maskingFormatter();

    const log = makeLogObject('Test JSON parsing', {
      password: 'secret123',
    });

    const result = formatter(log);

    // Should be valid JSON that can be parsed
    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch (e) {
      asserts.fail(`Failed to parse JSON: ${(e as Error).message}`);
    }

    // Parsed result should have the masked password
    asserts.assertNotEquals(parsed.context.password, 'secret123');
    asserts.assertEquals(parsed.context.password.length, 'secret123'.length);
  });

  it('should handle non-object contexts gracefully', () => {
    const formatter = maskingFormatter();

    // @ts-ignore - testing with invalid context type
    const log = makeLogObject('Test invalid context', 'not an object');

    // Should not throw
    let result;
    try {
      result = formatter(log);
      asserts.assert(typeof result === 'string');
    } catch (e) {
      asserts.fail(`Should not throw: ${(e as Error).message}`);
    }
  });

  describe('non-cloneable context values (structuredClone regression)', () => {
    // Regression: the formatter used structuredClone(log), which throws
    // DataCloneError on functions / symbols / class instances holding
    // function properties. Slogger.log() dispatches fire-and-forget, so
    // the throw silently dropped the record — the worst possible
    // failure mode for a security formatter.

    class Session {
      constructor(
        public userId: number,
        public password: string,
      ) {}
      describe(): string {
        return `session for ${this.userId}`;
      }
    }

    it('does not throw on functions, symbols, and class instances', () => {
      const formatter = maskingFormatter();
      const log = makeLogObject('user logged in', {
        callback: () => 'noop',
        marker: Symbol('trace'),
        session: new Session(42, 'hunter2'),
        handlerHolder: { onDone: function done() {}, password: 'secret123' },
      });

      const result = formatter(log);
      asserts.assert(typeof result === 'string');
      // The log was delivered AND sensitive fields were still masked.
      asserts.assert(!result.includes('hunter2'));
      asserts.assert(!result.includes('secret123'));
      // Non-sensitive instance fields survive the copy.
      asserts.assert(result.includes('42'));
    });

    it('masks sensitive fields nested inside class instances', () => {
      const formatter = maskingFormatter();
      const log = makeLogObject('auth check', {
        session: new Session(7, 'topsecretpw'),
      });

      const parsed = JSON.parse(formatter(log));
      asserts.assertEquals(
        parsed.context.session.password,
        '*'.repeat('topsecretpw'.length),
      );
      asserts.assertEquals(parsed.context.session.userId, 7);
    });

    it('guards against cyclic contexts', () => {
      const formatter = maskingFormatter();
      // deno-lint-ignore no-explicit-any
      const cyclic: Record<string, any> = { password: 'pw123', name: 'loop' };
      cyclic.self = cyclic;
      const log = makeLogObject('cycle test', { cyclic });

      const parsed = JSON.parse(formatter(log));
      asserts.assertEquals(parsed.context.cyclic.self, '[Circular]');
      asserts.assertEquals(parsed.context.cyclic.password, '*****');
      asserts.assertEquals(parsed.context.cyclic.name, 'loop');
    });

    it('copies shared (acyclic) references in both places', () => {
      const formatter = maskingFormatter();
      const shared = { token: 'tok-1234', label: 'shared' };
      const log = makeLogObject('dag test', { a: shared, b: shared });

      const parsed = JSON.parse(formatter(log));
      asserts.assertEquals(parsed.context.a.token, '*'.repeat(8));
      asserts.assertEquals(parsed.context.b.token, '*'.repeat(8));
      asserts.assertEquals(parsed.context.b.label, 'shared');
    });

    it('never mutates the original log context', () => {
      const formatter = maskingFormatter();
      const context = { password: 'original', nested: { secret: 'inner' } };
      const log = makeLogObject('no mutation', context);

      formatter(log);
      asserts.assertEquals(context.password, 'original');
      asserts.assertEquals(context.nested.secret, 'inner');
    });
  });

  describe('sensitive keys holding non-scalar values', () => {
    // Regression: maskObject only masked sensitive keys whose value was
    // a string or number. A sensitive key holding an array, nested
    // object, boolean, or bigint fell through to the plain copy and was
    // emitted in CLEARTEXT — a silent redaction bypass. A sensitive key
    // must be redacted whatever its value type.

    it('masks an array held under a sensitive key', () => {
      const formatter = maskingFormatter();
      const log = makeLogObject('rotate keys', {
        apiKey: ['aaakey', 'bbbkey'],
        credentials: ['cred-one', 'cred-two'],
      });

      const parsed = JSON.parse(formatter(log));
      // Structure preserved (still arrays) but every element redacted.
      asserts.assertEquals(parsed.context.apiKey.length, 2);
      for (const el of parsed.context.apiKey) {
        asserts.assertMatch(el, /^\*+$/);
      }
      for (const el of parsed.context.credentials) {
        asserts.assertMatch(el, /^\*+$/);
      }
      const raw = formatter(log);
      asserts.assert(!raw.includes('aaakey'));
      asserts.assert(!raw.includes('bbbkey'));
      asserts.assert(!raw.includes('cred-one'));
      asserts.assert(!raw.includes('cred-two'));
    });

    it('masks every leaf of an object held under a sensitive key', () => {
      const formatter = maskingFormatter();
      const log = makeLogObject('login', {
        // `value` / `raw` are NOT themselves sensitive key names — they
        // only stay hidden because the PARENT key (`password`) is.
        password: { value: 'topsecret', meta: { raw: 'deepsecret' } },
      });

      const raw = formatter(log);
      asserts.assert(!raw.includes('topsecret'));
      asserts.assert(!raw.includes('deepsecret'));

      const parsed = JSON.parse(raw);
      asserts.assertEquals(
        parsed.context.password.value,
        '*'.repeat('topsecret'.length),
      );
      asserts.assertEquals(
        parsed.context.password.meta.raw,
        '*'.repeat('deepsecret'.length),
      );
    });

    it('masks boolean and bigint values under sensitive keys', () => {
      const formatter = maskingFormatter();
      const log = makeLogObject('flags', {
        secret: true,
        token: 1234567890123456789n,
      });

      const parsed = JSON.parse(formatter(log));
      asserts.assertMatch(parsed.context.secret, /^\*+$/);
      asserts.assertMatch(parsed.context.token, /^\*+$/);
      const raw = formatter(log);
      asserts.assert(!raw.includes('true'));
      asserts.assert(!raw.includes('1234567890123456789'));
    });

    it('leaves an unrelated (non-sensitive) array untouched', () => {
      const formatter = maskingFormatter();
      const log = makeLogObject('ok', {
        tags: ['alpha', 'beta'],
      });
      const raw = formatter(log);
      asserts.assert(raw.includes('alpha'));
      asserts.assert(raw.includes('beta'));
    });
  });

  describe('whole-key sensitive-field matching', () => {
    it('does not mask unrelated fields that merely contain a sensitive substring', () => {
      // Behavior change: matching is now a case-insensitive comparison
      // against the WHOLE key. Substring matching used to over-mask
      // 'author' (hit 'auth'), 'monkeyCount' (hit 'key'), and
      // 'compassHeading' (hit 'ssn'? no — 'pass'-adjacent fields).
      const formatter = maskingFormatter();
      const log = makeLogObject('over-masking check', {
        author: 'Ada Lovelace',
        monkeyCount: 'twelve',
        compassHeading: 'north-by-northwest',
        privateer: 'ship name',
      });

      const result = formatter(log);
      asserts.assert(result.includes('Ada Lovelace'));
      asserts.assert(result.includes('twelve'));
      asserts.assert(result.includes('north-by-northwest'));
      asserts.assert(result.includes('ship name'));
    });

    it('matches case-insensitively against the whole key', () => {
      const formatter = maskingFormatter();
      const log = makeLogObject('case check', {
        PASSWORD: 'upper-secret',
        Token: 'Mixed-secret',
        accessToken: 'bearer-abc123',
      });

      const result = formatter(log);
      asserts.assert(!result.includes('upper-secret'));
      asserts.assert(!result.includes('Mixed-secret'));
      asserts.assert(!result.includes('bearer-abc123'));
    });

    // Regression (round-3 finding 2): whole-key matching silently
    // un-masked common compound secret names the old substring matching
    // caught. Component-aware matching must mask them again — without
    // re-introducing the substring over-masking (`author`/`monkeyCount`).
    it('masks compound secret keys under default fields', () => {
      const formatter = maskingFormatter();
      // Every key below has a sensitive term as its HEAD (last word
      // component) or is a whole-key default, so head-anchored matching
      // masks it. `passwordHash` is deliberately absent — its head is
      // `hash`, so it is a qualifier-position key that stays visible
      // (see the head-anchored contract test below).
      const secrets: Record<string, string> = {
        authToken: 'AUTHTOKEN_LEAK',
        secretKey: 'SECRETKEY_LEAK',
        userPassword: 'USERPASSWORD_LEAK',
        bearerToken: 'BEARERTOKEN_LEAK',
        dbPassword: 'DBPASSWORD_LEAK',
        jwt: 'JWT_LEAK',
        idToken: 'IDTOKEN_LEAK',
        apiSecret: 'APISECRET_LEAK',
        encryptionKey: 'ENCRYPTIONKEY_LEAK',
      };
      const result = formatter(makeLogObject('login', { ...secrets }));
      for (const value of Object.values(secrets)) {
        asserts.assert(
          !result.includes(value),
          `compound secret leaked in cleartext: ${value}`,
        );
      }
    });

    // Round-6: bare `token` is a GENERIC head (like `key`). Configuring
    // only `['token']` masks the whole key `token`, but NOT `*Token`
    // compounds — those must be named explicitly (or come from the
    // defaults). The full round-6 contract lives in its own block below.
    it('a bare `token` field is whole-key-only and does not mask *Token compounds', () => {
      const formatter = maskingFormatter({ sensitiveFields: ['token'] });
      const p = JSON.parse(formatter(makeLogObject('tokens', {
        token: 'WHOLE_LEAK',
        accessToken: 'ACCESS_SAFE',
        refreshToken: 'REFRESH_SAFE',
        authToken: 'AUTH_SAFE',
      }))).context;
      asserts.assertMatch(p.token, /^\*+$/);
      asserts.assertEquals(p.accessToken, 'ACCESS_SAFE');
      asserts.assertEquals(p.refreshToken, 'REFRESH_SAFE');
      asserts.assertEquals(p.authToken, 'AUTH_SAFE');
    });

    it('does NOT over-mask non-secret keys that merely contain a field as a substring', () => {
      const formatter = maskingFormatter();
      const result = formatter(makeLogObject('safe fields', {
        author: 'jane-doe', // contains 'auth' but is one word
        monkeyCount: 42, // contains 'key' but is one word
      }));
      // Whole-word component matching leaves these untouched.
      asserts.assert(
        result.includes('jane-doe'),
        'author must not be masked (substring over-mask regression)',
      );
      asserts.assert(
        result.includes('42'),
        'monkeyCount must not be masked (substring over-mask regression)',
      );
    });
  });

  describe('round-4: hump-less compound secrets vs benign generic-word keys', () => {
    // Regression (round-4 finding 2): component splitting only breaks on
    // camelCase humps and `_`/`-`/`.` separators, so an all-lowercase or
    // ALL-CAPS concatenation (`authtoken`, `AUTHTOKEN`) collapsed back to
    // a single whole-key comparison and leaked. Realistic path:
    // lowercasing HTTP header names, or Postgres folding unquoted
    // identifiers, before logging.
    it('masks lowercase and ALL-CAPS concatenated compound secret keys', () => {
      const formatter = maskingFormatter();
      // The concatenation-suffix tier is head-anchored: each key below
      // ENDS with a sensitive term once separators are stripped.
      // `passwordhash` is deliberately absent — it ends with `hash`,
      // not a term, so it stays visible (qualifier position).
      const secrets: Record<string, string> = {
        authtoken: 'LEAKa',
        AUTHTOKEN: 'LEAKb',
        secretkey: 'LEAKc',
        SECRETKEY: 'LEAKd',
        userpassword: 'LEAKe',
        bearertoken: 'LEAKg',
        dbpassword: 'LEAKh',
        idtoken: 'LEAKi',
        apisecret: 'LEAKj',
        encryptionkey: 'LEAKk',
        ENCRYPTIONKEY: 'LEAKl',
      };
      const result = formatter(makeLogObject('login', { ...secrets }));
      for (const [key, value] of Object.entries(secrets)) {
        asserts.assert(
          !result.includes(value),
          `compound secret leaked in cleartext under '${key}': ${value}`,
        );
      }
    });

    // Regression (round-4 finding 3): the bare generic defaults `key`,
    // `auth`, `private`, `pin` matched as WORD COMPONENTS, redacting large
    // classes of benign keys (and, via forceMask, whole subtrees) and
    // coercing booleans/numbers to masked strings. The generic four now
    // match only as WHOLE keys, so these benign keys pass through intact.
    it('does not mask benign keys that merely contain a bare generic word', () => {
      const formatter = maskingFormatter();
      const parsed = JSON.parse(formatter(makeLogObject('benign', {
        sortKey: 'ts',
        cacheKey: 'user:42',
        partitionKey: 'p1',
        idempotencyKey: 'idem-1',
        authUrl: 'https://idp.example.com/authorize',
        authMethod: 'oidc',
        isPrivate: false,
        privateIp: '10.0.0.1',
        keyMetrics: { p95: 12, p99: 30 },
        monkey: 'george',
        keyboard: 'qwerty',
        captain: 'ahab',
      })));
      const ctx = parsed.context;
      asserts.assertEquals(ctx.sortKey, 'ts');
      asserts.assertEquals(ctx.cacheKey, 'user:42');
      asserts.assertEquals(ctx.partitionKey, 'p1');
      asserts.assertEquals(ctx.idempotencyKey, 'idem-1');
      asserts.assertEquals(ctx.authUrl, 'https://idp.example.com/authorize');
      asserts.assertEquals(ctx.authMethod, 'oidc');
      // Type preserved — a boolean must not be coerced to a masked string.
      asserts.assertEquals(ctx.isPrivate, false);
      asserts.assertEquals(ctx.privateIp, '10.0.0.1');
      // Benign subtree preserved wholesale, numeric types intact.
      asserts.assertEquals(ctx.keyMetrics.p95, 12);
      asserts.assertEquals(ctx.keyMetrics.p99, 30);
      asserts.assertEquals(ctx.monkey, 'george');
      asserts.assertEquals(ctx.keyboard, 'qwerty');
      asserts.assertEquals(ctx.captain, 'ahab');
    });

    it('still masks a bare generic word used as the WHOLE key', () => {
      const formatter = maskingFormatter();
      const parsed = JSON.parse(formatter(makeLogObject('whole generic', {
        key: 'kkkkk',
        auth: 'aaaaa',
        private: 'ppppp',
        pin: '1234',
      })));
      asserts.assertMatch(parsed.context.key, /^\*+$/);
      asserts.assertMatch(parsed.context.auth, /^\*+$/);
      asserts.assertMatch(parsed.context.private, /^\*+$/);
      asserts.assertMatch(parsed.context.pin, /^\*+$/);
    });
  });

  // ---------------------------------------------------------------
  // Round-5: the head-anchored matching contract. Matching is redesigned
  // as a single rule — a sensitive term masks a key only when it names
  // the key's HEAD (end), via a whole-key, component-suffix, or
  // concatenation-suffix match. This simultaneously fixes:
  //   C1 (over-mask): the substring tier redacted benign keys that
  //     merely CONTAIN a term (`creditCardBrand`, `tokenBucket`,
  //     `secretary`, `tokenizer`) and coerced their scalar types.
  //   C2 (under-mask): `key`/`auth` being whole-key-only leaked real
  //     `*Key` compounds (`accessKey`, `sessionKey`, ...).
  // Each contract clause below is tested with BOTH a positive (must
  // mask) and a paired negative (must not mask) case.
  // ---------------------------------------------------------------
  describe('round-5: head-anchored matching contract', () => {
    const maskedTo = (parsed: string): boolean => /^\*+$/.test(parsed);

    // Clause 1 — whole-key sensitive fields are masked; an unrelated
    // whole key is not.
    it('masks whole-key fields but not an unrelated whole key', () => {
      const p = JSON.parse(
        maskingFormatter()(makeLogObject('whole', {
          password: 'pw', // positive
          secret: 'sc', // positive
          token: 'tk', // positive
          apiKey: 'ak', // positive
          username: 'johndoe', // negative — not a field
          brand: 'acme', // negative
        })),
      ).context;
      asserts.assert(maskedTo(p.password));
      asserts.assert(maskedTo(p.secret));
      asserts.assert(maskedTo(p.token));
      asserts.assert(maskedTo(p.apiKey));
      asserts.assertEquals(p.username, 'johndoe');
      asserts.assertEquals(p.brand, 'acme');
    });

    // Clause 2 — camelCase / `_` / `-` / `.` word-component compounds
    // whose HEAD is a sensitive term are masked (the C2 under-mask fix);
    // the SAME term in qualifier (non-head) position is not.
    it('masks head-position compounds across every separator style', () => {
      const p = JSON.parse(
        maskingFormatter()(makeLogObject('compounds', {
          userApiKey: 'UAK_LEAK', // positive (camelCase, head apiKey)
          session_auth_token: 'SAT_LEAK', // positive (snake, head token)
          'x-api-key': 'XAK_LEAK', // positive (kebab, head api key)
          'user.access.token': 'DOT_LEAK', // positive (dot, head token)
          apiKey: 'AK_LEAK', // positive (exact compound)
          authToken: 'AT_LEAK', // positive (head token)
        })),
      ).context;
      asserts.assert(maskedTo(p.userApiKey), 'userApiKey must mask');
      asserts.assert(maskedTo(p.session_auth_token), 'session_auth_token');
      asserts.assert(maskedTo(p['x-api-key']), 'x-api-key must mask');
      asserts.assert(maskedTo(p['user.access.token']), 'dotted token');
      asserts.assert(maskedTo(p.apiKey), 'apiKey must mask');
      asserts.assert(maskedTo(p.authToken), 'authToken must mask');
    });

    it('does NOT mask the same terms in qualifier (non-head) position', () => {
      // Negative counterpart of clause 2: `token`/`key` are only the
      // QUALIFIER here, so the head noun (bucket/count/metrics) wins.
      const p = JSON.parse(
        maskingFormatter()(makeLogObject('qualifier', {
          tokenBucket: 'tb', // token is qualifier
          tokenizer: 'tz', // one word, not `token`
          keyMetrics: 'km', // key is qualifier
          sortKey: 'sk', // key is head but generic + benign qualifier
          cacheKey: 'ck',
          authUrl: 'au', // auth is qualifier (+ generic)
        })),
      ).context;
      asserts.assertEquals(p.tokenBucket, 'tb');
      asserts.assertEquals(p.tokenizer, 'tz');
      asserts.assertEquals(p.keyMetrics, 'km');
      asserts.assertEquals(p.sortKey, 'sk');
      asserts.assertEquals(p.cacheKey, 'ck');
      asserts.assertEquals(p.authUrl, 'au');
    });

    // Clause 3 — real `*Key` crypto compounds are caught (C2), while
    // benign `*Key` compounds with non-secret qualifiers are not.
    it('masks curated crypto *Key compounds (C2 under-mask fix)', () => {
      const secrets: Record<string, string> = {
        accessKey: 'ACCESSKEY_LEAK', // AWS
        awsAccessKey: 'AWSACCESSKEY_LEAK', // compound of accessKey
        sessionKey: 'SESSIONKEY_LEAK',
        signingKey: 'SIGNINGKEY_LEAK',
        masterKey: 'MASTERKEY_LEAK',
        sharedKey: 'SHAREDKEY_LEAK',
        hmacKey: 'HMACKEY_LEAK',
        secretKey: 'SECRETKEY_LEAK',
      };
      const raw = maskingFormatter()(makeLogObject('rotate', { ...secrets }));
      for (const [k, v] of Object.entries(secrets)) {
        asserts.assert(!raw.includes(v), `crypto key leaked under '${k}'`);
      }
    });

    it('does NOT mask benign *Key compounds with non-secret qualifiers', () => {
      const p = JSON.parse(
        maskingFormatter()(makeLogObject('benign keys', {
          sortKey: 'a',
          cacheKey: 'b',
          partitionKey: 'c',
          idempotencyKey: 'd',
          rowKey: 'e',
          primaryKey: 'f',
        })),
      ).context;
      asserts.assertEquals(p.sortKey, 'a');
      asserts.assertEquals(p.cacheKey, 'b');
      asserts.assertEquals(p.partitionKey, 'c');
      asserts.assertEquals(p.idempotencyKey, 'd');
      asserts.assertEquals(p.rowKey, 'e');
      asserts.assertEquals(p.primaryKey, 'f');
    });

    // Clause 4 — separator-less concatenations are caught by the
    // concatenation-suffix tier when the term is a real SUFFIX; a term
    // appearing at the START/MIDDLE of a run-together word is not.
    it('masks run-together suffixes but not prefix/middle superstrings', () => {
      const p = JSON.parse(
        maskingFormatter()(makeLogObject('concat', {
          authtoken: 'AUTHTOKEN_LEAK', // positive (endsWith token)
          dbpassword: 'DBPASSWORD_LEAK', // positive (endsWith password)
          secretary: 'alice', // negative (secret at START)
          tokenizer: 'bpe', // negative (token at START)
          passwordless: 'flag', // negative (password at START)
        })),
      ).context;
      asserts.assert(maskedTo(p.authtoken));
      asserts.assert(maskedTo(p.dbpassword));
      asserts.assertEquals(p.secretary, 'alice');
      asserts.assertEquals(p.tokenizer, 'bpe');
      asserts.assertEquals(p.passwordless, 'flag');
    });

    // Clause 5 — the exact C1 over-mask + type-coercion regression:
    // benign context keys pass through unchanged, preserving their JSON
    // scalar type (number stays number, boolean stays boolean). This is
    // the reproduced payments-service failure scenario.
    it('never over-masks benign keys nor coerces their scalar type (C1)', () => {
      const p = JSON.parse(
        maskingFormatter()(makeLogObject('charged', {
          creditCardBrand: 'visa',
          creditCardLast4: '4242',
          tokenBucket: 5, // number
          nextTokenCount: 42, // number
          tokensRemaining: 5, // number
          passwordHash: 'HASH', // qualifier position (head = hash)
          passwordLength: 12, // number, qualifier position
          secretary: 'alice',
          tokenizer: 'bpe',
          isPrivate: false, // boolean
        })),
      ).context;
      // Values unchanged.
      asserts.assertEquals(p.creditCardBrand, 'visa');
      asserts.assertEquals(p.creditCardLast4, '4242');
      asserts.assertEquals(p.passwordHash, 'HASH');
      asserts.assertEquals(p.secretary, 'alice');
      asserts.assertEquals(p.tokenizer, 'bpe');
      // Scalar TYPES preserved (the coercion the substring tier caused).
      asserts.assertStrictEquals(p.tokenBucket, 5);
      asserts.assertStrictEquals(p.nextTokenCount, 42);
      asserts.assertStrictEquals(p.tokensRemaining, 5);
      asserts.assertStrictEquals(p.passwordLength, 12);
      asserts.assertStrictEquals(p.isPrivate, false);
    });

    // Sibling sweep — the matcher runs on the context BEFORE the base
    // formatter, so the fix must hold for every sibling formatter
    // (json / logfmt / otel / rfc5424 / string). Same secret + benign
    // context through each: secret absent, benign markers present.
    describe('matcher applies across all sibling base formatters', () => {
      const secretVal = 'AK_SECRET_LEAK';
      const brandMarker = 'VISABRANDMARKER';
      const tokMarker = 'BPETOKENIZERMARKER';
      const ctx = {
        apiKey: secretVal, // must be masked
        creditCardBrand: brandMarker, // must survive (C1)
        tokenizer: tokMarker, // must survive (C1)
      };
      const cases: Array<[string, (log: SlogObject) => string]> = [
        ['prettyJson (default)', maskingFormatter()],
        ['json', maskingFormatter({ baseFormatter: jsonFormatter })],
        ['logfmt', maskingFormatter({ baseFormatter: logfmtFormatter() })],
        ['otel', maskingFormatter({ baseFormatter: otelLogFormatter() })],
        [
          'rfc5424',
          maskingFormatter({
            baseFormatter: rfc5424Formatter({
              appendContext: (c) => JSON.stringify(c),
            }),
          }),
        ],
        [
          'string',
          maskingFormatter({
            baseFormatter: simpleFormatter(
              '${context.apiKey}|${context.creditCardBrand}|${context.tokenizer}',
            ),
          }),
        ],
      ];
      for (const [name, fmt] of cases) {
        it(`masks the secret and keeps benign fields under ${name}`, () => {
          const out = fmt(makeLogObject('charge', { ...ctx }));
          asserts.assert(
            !out.includes(secretVal),
            `apiKey leaked under ${name}`,
          );
          asserts.assert(
            out.includes(brandMarker),
            `creditCardBrand over-masked under ${name}`,
          );
          asserts.assert(
            out.includes(tokMarker),
            `tokenizer over-masked under ${name}`,
          );
        });
      }
    });
  });

  // ---------------------------------------------------------------
  // Round-6: bare `token` is a GENERIC head, exactly like `key`.
  //
  // The round-5 rule made bare `token` a component-/concatenation-suffix
  // term. That correctly masked authToken/accessToken but ALSO redacted
  // benign non-secret keys that merely END in `token`: pagination
  // cursors (pageToken/nextPageToken/nextToken/continuationToken) and
  // anti-forgery / reset tokens (csrfToken/resetToken). At the published
  // baseline these passed through untouched, so masking them is an
  // over-mask regression (fail-safe — no type coercion, no leak — but a
  // downstream job resuming from a logged cursor breaks).
  //
  // Resolution (symmetric with `key`): `token` joins
  // key/auth/private/pin as WHOLE-KEY-ONLY, and the real secret `*Token`
  // compounds are enumerated in the defaults instead (authToken,
  // accessToken, refreshToken, sessionToken, apiToken, bearerToken,
  // idToken). Those enumerated compounds are themselves head-anchored,
  // so their separator/concat variants still mask; benign `*Token`
  // cursors do not. Each clause has BOTH a positive and a negative case.
  // ---------------------------------------------------------------
  describe('round-6: bare `token` is generic (whole-key only)', () => {
    const maskedTo = (parsed: string): boolean => /^\*+$/.test(parsed);

    // Positive — the enumerated secret *Token compounds still mask via
    // the defaults (the C2 goal is preserved).
    it('masks enumerated secret *Token compounds via the defaults', () => {
      const p = JSON.parse(
        maskingFormatter()(makeLogObject('tokens', {
          authToken: 'AUTH_LEAK',
          accessToken: 'ACCESS_LEAK',
          refreshToken: 'REFRESH_LEAK',
          sessionToken: 'SESSION_LEAK',
          apiToken: 'APITOKEN_LEAK',
          bearerToken: 'BEARER_LEAK',
          idToken: 'IDTOKEN_LEAK',
        })),
      ).context;
      asserts.assert(maskedTo(p.authToken), 'authToken must mask');
      asserts.assert(maskedTo(p.accessToken), 'accessToken must mask');
      asserts.assert(maskedTo(p.refreshToken), 'refreshToken must mask');
      asserts.assert(maskedTo(p.sessionToken), 'sessionToken must mask');
      asserts.assert(maskedTo(p.apiToken), 'apiToken must mask');
      asserts.assert(maskedTo(p.bearerToken), 'bearerToken must mask');
      asserts.assert(maskedTo(p.idToken), 'idToken must mask');
    });

    // Negative — the reproduced regression: benign pagination cursors and
    // anti-forgery / reset tokens must pass through, scalar TYPE intact.
    it('does NOT mask benign *Token cursors (pagination / anti-forgery)', () => {
      const p = JSON.parse(
        maskingFormatter()(makeLogObject('list users', {
          pageToken: 'CURSOR123',
          nextPageToken: 'CiAKGjBpN',
          nextToken: 'NEXT123',
          continuationToken: 'CONT123',
          resetToken: 'RESET123',
          csrfToken: 'CSRF123',
          count: 50, // number — must keep its type
        })),
      ).context;
      asserts.assertEquals(p.pageToken, 'CURSOR123');
      asserts.assertEquals(p.nextPageToken, 'CiAKGjBpN');
      asserts.assertEquals(p.nextToken, 'NEXT123');
      asserts.assertEquals(p.continuationToken, 'CONT123');
      asserts.assertEquals(p.resetToken, 'RESET123');
      asserts.assertEquals(p.csrfToken, 'CSRF123');
      asserts.assertStrictEquals(p.count, 50);
    });

    // Positive — the bare whole key `token` is still a secret.
    it('still masks the bare whole key `token` (case-insensitively)', () => {
      const p = JSON.parse(
        maskingFormatter()(makeLogObject('whole token', {
          token: 'WHOLE_LEAK',
          Token: 'CASE_LEAK',
          TOKEN: 'CAPS_LEAK',
        })),
      ).context;
      asserts.assert(maskedTo(p.token));
      asserts.assert(maskedTo(p.Token));
      asserts.assert(maskedTo(p.TOKEN));
    });

    // Positive — enumerated compounds remain head-anchored across every
    // separator style and run-together spelling.
    it('enumerated *Token compounds head-anchor across separators & concat', () => {
      const p = JSON.parse(
        maskingFormatter()(makeLogObject('compound tokens', {
          'x-auth-token': 'XAT_LEAK', // kebab → authToken
          session_auth_token: 'SAT_LEAK', // snake → authToken
          awsAccessToken: 'AAT_LEAK', // camel → accessToken
          authtoken: 'CONCAT_LEAK', // run-together → authToken
          BEARERTOKEN: 'CAPS_LEAK', // all-caps → bearerToken
        })),
      ).context;
      asserts.assert(maskedTo(p['x-auth-token']), 'x-auth-token');
      asserts.assert(maskedTo(p.session_auth_token), 'session_auth_token');
      asserts.assert(maskedTo(p.awsAccessToken), 'awsAccessToken');
      asserts.assert(maskedTo(p.authtoken), 'authtoken');
      asserts.assert(maskedTo(p.BEARERTOKEN), 'BEARERTOKEN');
    });

    // User-configured bare `['token']` is whole-key-only, exactly like
    // `['key']`; to mask a compound the caller names it explicitly.
    it('user-configured bare `token` is whole-key-only, like `key`', () => {
      const fmt = maskingFormatter({ sensitiveFields: ['token'] });
      const p = JSON.parse(fmt(makeLogObject('user token', {
        token: 'WHOLE_LEAK', // masked (whole key)
        authToken: 'AUTH_SAFE', // NOT masked (defaults not active)
        pageToken: 'PAGE_SAFE', // NOT masked
      }))).context;
      asserts.assert(maskedTo(p.token));
      asserts.assertEquals(p.authToken, 'AUTH_SAFE');
      asserts.assertEquals(p.pageToken, 'PAGE_SAFE');
    });

    it('user naming the specific compound masks it + its head-anchored forms', () => {
      const fmt = maskingFormatter({ sensitiveFields: ['authToken'] });
      const p = JSON.parse(fmt(makeLogObject('specific', {
        authToken: 'AT_LEAK', // masked (exact)
        'x-auth-token': 'XAT_LEAK', // masked (head-anchored)
        pageToken: 'PAGE_SAFE', // NOT masked
      }))).context;
      asserts.assert(maskedTo(p.authToken));
      asserts.assert(maskedTo(p['x-auth-token']));
      asserts.assertEquals(p.pageToken, 'PAGE_SAFE');
    });

    // Sibling sweep — the matcher runs on the context BEFORE the base
    // formatter, so the split must hold for every sibling formatter.
    describe('round-6 split holds across all sibling base formatters', () => {
      const secretVal = 'AUTHTOKENSECRETLEAK';
      const cursorMarker = 'PAGETOKENCURSORMARKER';
      const ctx = {
        authToken: secretVal, // must be masked
        pageToken: cursorMarker, // must survive (benign cursor)
      };
      const cases: Array<[string, (log: SlogObject) => string]> = [
        ['prettyJson (default)', maskingFormatter()],
        ['json', maskingFormatter({ baseFormatter: jsonFormatter })],
        ['logfmt', maskingFormatter({ baseFormatter: logfmtFormatter() })],
        ['otel', maskingFormatter({ baseFormatter: otelLogFormatter() })],
        [
          'rfc5424',
          maskingFormatter({
            baseFormatter: rfc5424Formatter({
              appendContext: (c) => JSON.stringify(c),
            }),
          }),
        ],
        [
          'string',
          maskingFormatter({
            baseFormatter: simpleFormatter(
              '${context.authToken}|${context.pageToken}',
            ),
          }),
        ],
      ];
      for (const [name, fmt] of cases) {
        it(`masks authToken and keeps pageToken under ${name}`, () => {
          const out = fmt(makeLogObject('list', { ...ctx }));
          asserts.assert(
            !out.includes(secretVal),
            `authToken leaked under ${name}`,
          );
          asserts.assert(
            out.includes(cursorMarker),
            `pageToken over-masked under ${name}`,
          );
        });
      }
    });
  });

  // ---------------------------------------------------------------
  // Round-7 (low): the concatenation-suffix tier stripped every
  // separator AND camelCase hump before an `endsWith` test, so a compound
  // term (`idToken` → `idtoken`) could align across a hump that is
  // actually present in the key. A concat match is now honoured only when
  // it begins at a word boundary of the key, so a term cannot latch onto
  // the tail of an unrelated word.
  // ---------------------------------------------------------------
  describe('round-7: concat-suffix matches only at a word boundary', () => {
    // `androidToken` (`android`+`Token`) and `validToken` (`valid`+
    // `Token`) both collapse to strings ending in `idtoken`, yet the `id`
    // there is mid-word — not an `idToken`. Their qualifiers (`android`,
    // `valid`) are not enumerated secrets, so the head-anchored contract
    // leaves them visible (like `pageToken`/`csrfToken`).
    it('does NOT mask androidToken / validToken (concat aligns across a hump)', () => {
      const parsed = JSON.parse(
        maskingFormatter()(makeLogObject('benign', {
          androidToken: 'ANDROID_SAFE',
          validToken: 'VALID_SAFE',
        })),
      );
      asserts.assertEquals(parsed.context.androidToken, 'ANDROID_SAFE');
      asserts.assertEquals(parsed.context.validToken, 'VALID_SAFE');
    });

    // The genuine run-together spellings the concat tier exists for have
    // NO internal boundary in the matched tail and must still be masked.
    it('still masks run-together spellings authtoken / dbpassword / idtoken', () => {
      const secrets: Record<string, string> = {
        authtoken: 'LEAK_AT',
        dbpassword: 'LEAK_PW',
        idtoken: 'LEAK_ID',
      };
      const result = maskingFormatter()(makeLogObject('login', { ...secrets }));
      for (const [key, value] of Object.entries(secrets)) {
        asserts.assert(
          !result.includes(value),
          `run-together secret leaked under '${key}': ${value}`,
        );
      }
    });

    // The real idToken compound (and its separator variants) is caught by
    // component-suffix matching regardless of the concat-tier tightening.
    it('still masks the real idToken compound', () => {
      const result = maskingFormatter()(makeLogObject('auth', {
        idToken: 'LEAK_IDTOKEN',
        id_token: 'LEAK_ID_TOKEN',
        'x-id-token': 'LEAK_X_ID_TOKEN',
      }));
      asserts.assert(!result.includes('LEAK_IDTOKEN'));
      asserts.assert(!result.includes('LEAK_ID_TOKEN'));
      asserts.assert(!result.includes('LEAK_X_ID_TOKEN'));
    });
  });

  // ---------------------------------------------------------------
  // Round-8 (#275): the docs advertised `pass` and `pwd` as masked by
  // default, but neither was in the defaults — a context of `{ pwd }`
  // was written verbatim to every destination. Both are now defaults AND
  // members of the whole-key-only generic set: bare `pass` is 4 chars, so
  // as an ordinary term the concatenation-suffix tier would have matched
  // the tail of `bypass`/`compass`/`surpass`/`encompass`.
  // ---------------------------------------------------------------
  describe('round-8: `pass` / `pwd` mask as whole keys only', () => {
    const maskedTo = (parsed: string): boolean => /^\*+$/.test(parsed);

    // The reproduction from the issue: all five password-family spellings
    // must be redacted, not just the three that already were.
    it('masks pass and pwd alongside the rest of the password family', () => {
      const p = JSON.parse(
        maskingFormatter()(makeLogObject('login', {
          password: 'A',
          passwd: 'B',
          pass: 'C',
          pwd: 'D',
          secret: 'E',
        })),
      ).context;
      asserts.assert(maskedTo(p.password), 'password must mask');
      asserts.assert(maskedTo(p.passwd), 'passwd must mask');
      asserts.assert(maskedTo(p.pass), 'pass must mask');
      asserts.assert(maskedTo(p.pwd), 'pwd must mask');
      asserts.assert(maskedTo(p.secret), 'secret must mask');
    });

    it('masks pass and pwd case-insensitively', () => {
      const p = JSON.parse(
        maskingFormatter()(makeLogObject('case', {
          PASS: 'CAPS_LEAK',
          Pwd: 'MIXED_LEAK',
          PWD: 'CAPS_PWD_LEAK',
        })),
      ).context;
      asserts.assert(maskedTo(p.PASS));
      asserts.assert(maskedTo(p.Pwd));
      asserts.assert(maskedTo(p.PWD));
    });

    // The regression that would make the fix worse than the bug: `pass`
    // is a real English suffix. None of these may be touched, and their
    // scalar type must survive intact (no string coercion).
    it('does NOT mask benign words ending in pass/pwd', () => {
      const p = JSON.parse(
        maskingFormatter()(makeLogObject('benign', {
          passenger: 'plane',
          bypass: 'route',
          compass: 'north',
          passed: true,
          passive: 'yes',
          surpass: 'goal',
          encompass: 'all',
          overpass: 'bridge',
          passable: 'yes',
          passageway: 'hall',
          cwd: '/srv/app',
          fwd: 'onward',
          passCount: 3, // number — must keep its type
        })),
      ).context;
      asserts.assertEquals(p.passenger, 'plane');
      asserts.assertEquals(p.bypass, 'route');
      asserts.assertEquals(p.compass, 'north');
      asserts.assertStrictEquals(p.passed, true);
      asserts.assertEquals(p.passive, 'yes');
      asserts.assertEquals(p.surpass, 'goal');
      asserts.assertEquals(p.encompass, 'all');
      asserts.assertEquals(p.overpass, 'bridge');
      asserts.assertEquals(p.passable, 'yes');
      asserts.assertEquals(p.passageway, 'hall');
      asserts.assertEquals(p.cwd, '/srv/app');
      asserts.assertEquals(p.fwd, 'onward');
      asserts.assertStrictEquals(p.passCount, 3);
    });

    // Whole-key-only means the component-suffix tier is skipped too, so a
    // qualified compound stays visible — same contract as `pin`/`key`.
    // The longer `password`/`passwd` family still head-matches normally.
    it('leaves qualified pass/pwd compounds to the caller, unlike password', () => {
      const p = JSON.parse(
        maskingFormatter()(makeLogObject('compounds', {
          db_pass: 'DBPASS_VISIBLE',
          userPwd: 'USERPWD_VISIBLE',
          db_password: 'DBPW_LEAK',
          dbpassword: 'CONCAT_LEAK',
        })),
      ).context;
      asserts.assertEquals(p.db_pass, 'DBPASS_VISIBLE');
      asserts.assertEquals(p.userPwd, 'USERPWD_VISIBLE');
      asserts.assert(maskedTo(p.db_password), 'db_password must still mask');
      asserts.assert(maskedTo(p.dbpassword), 'dbpassword must still mask');
    });

    // A caller naming the compound explicitly gets it masked — the
    // documented escape hatch for the case above.
    it('a caller naming the compound explicitly gets it masked', () => {
      const fmt = maskingFormatter({ sensitiveFields: ['db_pass'] });
      const p = JSON.parse(fmt(makeLogObject('custom', {
        db_pass: 'DBPASS_LEAK',
        compass: 'north',
      }))).context;
      asserts.assert(maskedTo(p.db_pass));
      asserts.assertEquals(p.compass, 'north');
    });

    // Sibling sweep — the matcher runs before the base formatter, so the
    // split must hold whichever formatter renders the record.
    describe('round-8 split holds across all sibling base formatters', () => {
      const secretVal = 'PWDSECRETLEAKVALUE';
      const benignMarker = 'COMPASSBENIGNMARKER';
      const ctx = {
        pwd: secretVal, // must be masked
        compass: benignMarker, // must survive
      };
      const cases: Array<[string, (log: SlogObject) => string]> = [
        ['prettyJson (default)', maskingFormatter()],
        ['json', maskingFormatter({ baseFormatter: jsonFormatter })],
        ['logfmt', maskingFormatter({ baseFormatter: logfmtFormatter() })],
        ['otel', maskingFormatter({ baseFormatter: otelLogFormatter() })],
        [
          'rfc5424',
          maskingFormatter({
            baseFormatter: rfc5424Formatter({
              appendContext: (c) => JSON.stringify(c),
            }),
          }),
        ],
        [
          'string',
          maskingFormatter({
            baseFormatter: simpleFormatter(
              '${context.pwd}|${context.compass}',
            ),
          }),
        ],
      ];
      for (const [name, fmt] of cases) {
        it(`masks pwd and keeps compass under ${name}`, () => {
          const out = fmt(makeLogObject('nav', { ...ctx }));
          asserts.assert(!out.includes(secretVal), `pwd leaked under ${name}`);
          asserts.assert(
            out.includes(benignMarker),
            `compass over-masked under ${name}`,
          );
        });
      }
    });
  });
});
