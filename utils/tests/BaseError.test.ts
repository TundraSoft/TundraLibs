import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from '../../dev.dependencies.ts';
import { afterEach, beforeEach, describe, it } from '../../dev.dependencies.ts';

import { BaseError, ErrorMetaTags } from '../BaseError.ts';

describe('BaseError', () => {
  it('should set the message and library correctly', () => {
    const message = 'Something went wrong';
    const library = 'example-library';
    const error = new BaseError(message, library);
    assertEquals(error.message, `[library='${library}'] ${message}`);
    assertEquals(error.library, library);
  });

  it('should set the metaTags correctly', () => {
    const message = 'Something went wrong';
    const library = 'example-library';
    const metaTags: ErrorMetaTags = {
      tag1: 'value1',
      tag2: 123,
      tag3: true,
      tag4: new Date(),
      tag5: undefined,
    };
    const error = new BaseError(message, library, metaTags);
    assertEquals(
      error.message,
      `[library='${library}' tag1='value1' tag2='123' tag3='true' tag4='${metaTags.tag4}' tag5='N/A'] ${message}`,
    );
  });
});
