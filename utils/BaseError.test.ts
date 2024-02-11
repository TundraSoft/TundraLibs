import { BaseError } from './BaseError.ts';
import { assertEquals, describe, it } from '../dev.dependencies.ts';

describe(`[library='utils' name='BaseError']`, () => {
  const mockMetaTags = {
    tag1: 'value1',
    tag2: 'value2',
  };

  it('should create a new instance of BaseError with the correct message and meta tags', () => {
    const errorMessage =
      '[tag1="${meta.tag1}" tag2="${meta.tag2}"] This is an error';
    const error = new BaseError(errorMessage, mockMetaTags);
    assertEquals(
      error.message,
      `[tag1="value1" tag2="value2"] This is an error`,
    );
    assertEquals(error.metaTags, mockMetaTags);
  });

  it('should create a new instance of BaseError without meta tags if not provided', () => {
    const errorMessage = 'This is an error';
    const error = new BaseError(errorMessage);
    assertEquals(error.message, errorMessage);
    assertEquals(error.metaTags, {});
  });
});
