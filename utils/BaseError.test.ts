import { BaseError } from './BaseError.ts';
import { assertEquals } from '../dev.dependencies.ts';

Deno.test('utils:BaseError', async (t) => {
  await t.step(
    'should create a new instance of BaseError with the correct message and meta tags',
    () => {
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
    },
  );

  await t.step(
    'should create a new instance of BaseError without meta tags if not provided',
    () => {
      const errorMessage = 'This is an error';
      const error = new BaseError(errorMessage);
      assertEquals(error.message, errorMessage);
      assertEquals(error.meta, {});
    },
  );

  await t.step(
    'should create a new instance of BaseError with the correct cause',
    () => {
      const errorMessage = 'This is an error';
      const cause = new Error('This is the cause');
      const error = new BaseError(errorMessage, {}, cause);
      assertEquals(error.message, errorMessage);
      assertEquals(error.cause, cause);
    },
  );

  await t.step(
    'should create a new instance of BaseError with the correct cause and meta tags',
    () => {
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
      assertEquals(error.meta['tag1'], error.getMeta('tag1'));
      assertEquals(error.cause, cause);
    },
  );

  await t.step('Should convert class to string', () => {
    const errorMessage = 'This is an error';
    const error = new BaseError(errorMessage);
    const errorString = error.toString();
    assertEquals(errorString.includes('This is an error'), true);
    assertEquals(errorString.includes('BaseError'), true);
  });
});
