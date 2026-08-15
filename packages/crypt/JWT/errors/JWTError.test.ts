import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { JWTError, type JWTErrorCode, JWTErrorCodes } from './mod.ts';

describe('crypt.JWT.Error', () => {
  it('JWTError - Basic error creation', () => {
    const error = new JWTError('EXPIRED_TOKEN');

    asserts.assertInstanceOf(error, JWTError);
    asserts.assertEquals(error.name, 'JWTError');
    asserts.assertEquals(error.message, 'JWT token is expired');
    asserts.assertEquals(error.context.code, 'EXPIRED_TOKEN');
  });

  it('JWTError - Error with cause message', () => {
    const error = new JWTError('INVALID_JWT', {
      causeMessage: 'Malformed header structure',
    });

    asserts.assertEquals(
      error.message,
      'JWT token is invalid - Malformed header structure',
    );
    asserts.assertEquals(error.context.code, 'INVALID_JWT');
    asserts.assertEquals(
      error.context.causeMessage,
      'Malformed header structure',
    );
  });

  it('JWTError - Error with template interpolation', () => {
    const error = new JWTError('INVALID_SIGNATURE', {
      causeMessage: 'HMAC verification failed',
    });

    asserts.assertEquals(
      error.message,
      'JWT signature verification failed - HMAC verification failed',
    );
    asserts.assertEquals(
      error.context.causeMessage,
      'HMAC verification failed',
    );
  });

  it('JWTError - Error with header context', () => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const error = new JWTError('INVALID_HEADER', {
      causeMessage: 'Missing required field',
      header,
    });

    asserts.assertEquals(error.context.header, header);
    asserts.assertEquals(error.context.causeMessage, 'Missing required field');
  });

  it('JWTError - Error with payload context', () => {
    const payload = { sub: 'user123', exp: 1234567890 };
    const error = new JWTError('INVALID_PAYLOAD', {
      causeMessage: 'Invalid expiration time',
      payload,
    });

    asserts.assertEquals(error.context.payload, payload);
    asserts.assertEquals(error.context.causeMessage, 'Invalid expiration time');
  });

  it('JWTError - Error with cause chain', () => {
    const originalError = new Error('Original network error');
    const error = new JWTError('UNKNOWN_ERROR', {
      causeMessage: 'Network failure during verification',
    }, originalError);

    asserts.assertEquals(error.cause, originalError);
    asserts.assertEquals(
      error.context.causeMessage,
      'Network failure during verification',
    );
  });

  it('JWTError - Error with additional metadata', () => {
    const error = new JWTError('UNSUPPORTED_ALGORITHM', {
      causeMessage: 'RS256 not supported',
      algorithm: 'RS256',
      supportedAlgorithms: ['HS256', 'HS384', 'HS512'],
    });

    asserts.assertEquals(error.context.algorithm, 'RS256');
    asserts.assertEquals(error.context.supportedAlgorithms, [
      'HS256',
      'HS384',
      'HS512',
    ]);
  });

  it('JWTError - Unknown error code mapping', () => {
    const error = new JWTError('UNKNOWN_CODE' as JWTErrorCode);

    asserts.assertEquals(error.context.code, 'INVALID_JWT');
    asserts.assertEquals(error.context.originalCode, 'UNKNOWN_CODE');
    asserts.assert(error.message.includes('JWT token is invalid'));
  });

  it('JWTError - Template interpolation without causeMessage', () => {
    const error = new JWTError('INVALID_SIGNATURE');

    // The slot goes, and the ` - ` that introduced it goes with it.
    asserts.assertEquals(error.message, 'JWT signature verification failed');
  });

  it('JWTError - Every templated code drops the slot cleanly', () => {
    const expected: Partial<Record<JWTErrorCode, string>> = {
      INVALID_JWT: 'JWT token is invalid',
      INVALID_SECRET: 'Invalid or empty secret provided',
      INVALID_PAYLOAD: 'Invalid payload format or content',
      INVALID_HEADER: 'Invalid JWT header format',
      INVALID_SIGNATURE: 'JWT signature verification failed',
      INVALID_FORMAT: 'Invalid JWT token format',
      UNSUPPORTED_ALGORITHM: 'Unsupported JWT algorithm',
      INVALID_CLAIMS: 'Invalid JWT claims',
      UNKNOWN_ERROR: 'Unknown JWT error',
    };

    for (const [code, message] of Object.entries(expected)) {
      const error = new JWTError(code as JWTErrorCode);
      asserts.assertEquals(error.message, message);
      // No placeholder, and no separator left hanging off the end.
      asserts.assert(!error.message.includes('${'));
      asserts.assertEquals(error.message, error.message.trimEnd());
      asserts.assert(!error.message.endsWith('-'));
      // Supplying the cause restores the full sentence.
      asserts.assertEquals(
        new JWTError(code as JWTErrorCode, { causeMessage: 'boom' }).message,
        `${message} - boom`,
      );
    }
  });

  it('JWTError - Blank causeMessage is treated as absent', () => {
    for (const causeMessage of ['', '   ']) {
      const error = new JWTError('INVALID_CLAIMS', { causeMessage });
      asserts.assertEquals(error.message, 'Invalid JWT claims');
      // The value still reaches context even though it shaped no message.
      asserts.assertEquals(error.context.causeMessage, causeMessage);
    }
  });

  it('JWTError - Unknown code maps to INVALID_JWT without a slot', () => {
    const error = new JWTError('NO_SUCH_CODE' as JWTErrorCode);

    asserts.assertEquals(error.message, 'JWT token is invalid');
    asserts.assertEquals(error.context.code, 'INVALID_JWT');
    asserts.assertEquals(error.context.originalCode, 'NO_SUCH_CODE');
  });

  it('JWTError - Codes without a slot are untouched', () => {
    const error = new JWTError('EXPIRED_TOKEN', { causeMessage: 'ignored' });

    asserts.assertEquals(error.message, 'JWT token is expired');
  });

  it('JWTError - All error codes coverage', () => {
    const codes: JWTErrorCode[] = [
      'EXPIRED_TOKEN',
      'NOT_ACTIVE',
      'INVALID_JWT',
      'INVALID_SECRET',
      'INVALID_PAYLOAD',
      'INVALID_HEADER',
      'INVALID_SIGNATURE',
      'INVALID_FORMAT',
      'UNSUPPORTED_ALGORITHM',
      'INVALID_CLAIMS',
      'MAX_AGE_EXCEEDED',
      'UNKNOWN_ERROR',
    ];

    for (const code of codes) {
      const error = new JWTError(code, { causeMessage: 'Test error' });
      asserts.assertEquals(error.context.code, code);
      asserts.assert(JWTErrorCodes[code]);
      asserts.assertInstanceOf(error, JWTError);
    }
  });

  it('JWTError - Error codes have corresponding messages', () => {
    const codes = Object.keys(JWTErrorCodes) as JWTErrorCode[];

    for (const code of codes) {
      const message = JWTErrorCodes[code];
      asserts.assert(typeof message === 'string');
      asserts.assert(message.length > 0);
    }
  });

  it('JWTError - Template variables in error messages', () => {
    // Test that messages with templates work correctly
    const templatedCodes: JWTErrorCode[] = [
      'INVALID_JWT',
      'INVALID_SECRET',
      'INVALID_PAYLOAD',
      'INVALID_HEADER',
      'INVALID_SIGNATURE',
      'INVALID_FORMAT',
      'UNSUPPORTED_ALGORITHM',
      'INVALID_CLAIMS',
      'UNKNOWN_ERROR',
    ];

    for (const code of templatedCodes) {
      const message = JWTErrorCodes[code];
      if (message.includes('${causeMessage}')) {
        const error = new JWTError(code, { causeMessage: 'Test cause' });
        asserts.assert(error.message.includes('Test cause'));
        asserts.assert(!error.message.includes('${causeMessage}'));
      }
    }
  });

  it('JWTError - Non-templated error messages', () => {
    const nonTemplatedCodes: JWTErrorCode[] = [
      'EXPIRED_TOKEN',
      'NOT_ACTIVE',
      'MAX_AGE_EXCEEDED',
    ];

    for (const code of nonTemplatedCodes) {
      const error = new JWTError(code);
      const expectedMessage = JWTErrorCodes[code];
      asserts.assertEquals(error.message, expectedMessage);
    }
  });

  it('JWTError - Complex metadata object', () => {
    const complexMeta = {
      causeMessage: 'Complex validation failure',
      header: { alg: 'HS256', typ: 'JWT' },
      payload: { sub: 'user', exp: Date.now() },
      customField: 'custom value',
      nestedObject: { key: 'value' },
      arrayField: [1, 2, 3],
    };

    const error = new JWTError('INVALID_CLAIMS', complexMeta);

    asserts.assertEquals(error.context.header, complexMeta.header);
    asserts.assertEquals(error.context.payload, complexMeta.payload);
    asserts.assertEquals(error.context.customField, complexMeta.customField);
    asserts.assertEquals(error.context.nestedObject, complexMeta.nestedObject);
    asserts.assertEquals(error.context.arrayField, complexMeta.arrayField);
  });
});
