import { BaseError } from './BaseError.ts';
import { assertEquals, describe, it } from '../dev.dependencies.ts';

describe('utils', () => {
  describe('BaseError', () => {
    it('should create a new instance of BaseError with the correct message and meta tags', () => {
      const mockMetaTags = {
        tag1: 'value1',
        tag2: 'value2',
      };
      const errorMessage = '[tag1="${tag1}" tag2="${tag2}"] This is an error';
      const error = new BaseError(errorMessage, mockMetaTags);
      assertEquals(
        error.message,
        `[tag1="value1" tag2="value2"] This is an error`,
      );
      assertEquals(error.meta, mockMetaTags);
    });

    it('should create a new instance of BaseError without meta tags if not provided', () => {
      const errorMessage = 'This is an error';
      const error = new BaseError(errorMessage);
      assertEquals(error.message, errorMessage);
      assertEquals(error.meta, {});
    });

    it('should create a new instance of BaseError with the correct cause', () => {
      const errorMessage = 'This is an error';
      const cause = new Error('This is the cause');
      const error = new BaseError(errorMessage, {}, cause);
      assertEquals(error.message, errorMessage);
      assertEquals(error.cause, cause);
    });

    it('should create a new instance of BaseError with the correct cause and meta tags', () => {
      const mockMetaTags = {
        tag1: 'value1',
        tag2: 'value2',
      };
      const errorMessage = '[tag1="${tag1}" tag2="${tag2}"] This is an error';
      const cause = new Error('This is the cause');
      const error = new BaseError(errorMessage, mockMetaTags, cause);
      assertEquals(
        error.message,
        `[tag1="value1" tag2="value2"] This is an error`,
      );
      assertEquals(error.meta, mockMetaTags);
      assertEquals(error.cause, cause);
    });
  });
});
// describe(`[library='utils' name='BaseError']`, () => {
//   const mockMetaTags = {
//     tag1: 'value1',
//     tag2: 'value2',
//   };

//   it('should create a new instance of BaseError with the correct message and meta tags', () => {
//     const errorMessage =
//       '[tag1="${meta.tag1}" tag2="${meta.tag2}"] This is an error';
//     const error = new BaseError(errorMessage, mockMetaTags);
//     assertEquals(
//       error.message,
//       `[tag1="value1" tag2="value2"] This is an error`,
//     );
//     assertEquals(error.metaTags, mockMetaTags);
//   });

//   it('should create a new instance of BaseError without meta tags if not provided', () => {
//     const errorMessage = 'This is an error';
//     const error = new BaseError(errorMessage);
//     assertEquals(error.message, errorMessage);
//     assertEquals(error.metaTags, {});
//   });
// });
