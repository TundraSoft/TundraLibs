import { TundraLibError } from './TundraLibError.ts';
import { assertEquals } from '../dev.dependencies.ts';

Deno.test('utils:TundraLibError', async (t) => {
  await t.step(
    'should create a new instance of TundraLibError with the correct message and meta tags',
    () => {
      const mockMetaTags = {
        tag1: 'value1',
        tag2: 'value2',
      };
      const errorMessage = '[tag1="${tag1}" tag2="${tag2}"] This is an error';
      const error = new TundraLibError(errorMessage, mockMetaTags);
      assertEquals(
        error.message,
        `[tag1="value1" tag2="value2"] This is an error`,
      );
      assertEquals(error.meta, mockMetaTags);
    },
  );

  await t.step(
    'should create a new instance of TundraLibError without meta tags if not provided',
    () => {
      const errorMessage = 'This is an error';
      const error = new TundraLibError(errorMessage);
      assertEquals(error.message, errorMessage);
      assertEquals(error.meta, {});
    },
  );

  await t.step(
    'should create a new instance of TundraLibError with the correct cause',
    () => {
      const errorMessage = 'This is an error';
      const cause = new Error('This is the cause');
      const error = new TundraLibError(errorMessage, {}, cause);
      assertEquals(error.message, errorMessage);
      assertEquals(error.cause, cause);
    },
  );

  await t.step('Should convert class to string', () => {
    const errorMessage = 'This is an error';
    const error = new TundraLibError(errorMessage);
    const errorString = error.toString();
    assertEquals(errorString.includes('This is an error'), true);
    assertEquals(errorString.includes('TundraLibError'), true);
  });
});
