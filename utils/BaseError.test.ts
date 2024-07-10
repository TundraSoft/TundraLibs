import { BaseError } from './BaseError.ts';
import { asserts } from '../dev.dependencies.ts';

Deno.test('utils > BaseError', async (t) => {
  await t.step(
    'should create a new instance of BaseError with the correct message and meta tags',
    () => {
      const mockMetaTags = {
        tag1: 'value1',
        tag2: 'value2',
      };
      const errorMessage = '[tag1="${tag1}" tag2="${tag2}"] This is an error';
      const error = new BaseError(errorMessage, mockMetaTags);
      asserts.assertEquals(
        error.message,
        `[tag1="value1" tag2="value2"] This is an error`,
      );
      asserts.assertEquals(error.meta, mockMetaTags);
    },
  );

  await t.step(
    'should create a new instance of BaseError without meta tags if not provided',
    () => {
      const errorMessage = 'This is an error';
      const error = new BaseError(errorMessage);
      asserts.assertEquals(error.message, errorMessage);
      asserts.assertEquals(error.meta, {});
    },
  );

  await t.step(
    'should create a new instance of BaseError with the correct cause',
    () => {
      const errorMessage = 'This is an error';
      const cause = new Error('This is the cause');
      const error = new BaseError(errorMessage, {}, cause);
      asserts.assertEquals(error.message, errorMessage);
      asserts.assertEquals(error.cause, cause);
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
      asserts.assertEquals(
        error.message,
        `[tag1="value1" tag2="value2"] This is an error`,
      );
      asserts.assertEquals(error.meta, mockMetaTags);
      asserts.assertEquals(error.meta['tag1'], error.getMeta('tag1'));
      asserts.assertEquals(error.cause, cause);
    },
  );

  await t.step('Should convert class to string', () => {
    const errorMessage = 'This is an error';
    const error = new BaseError(errorMessage);
    const errorString = error.toString();
    asserts.assertEquals(errorString.includes('This is an error'), true);
    asserts.assertEquals(errorString.includes('BaseError'), true);
  });
});
