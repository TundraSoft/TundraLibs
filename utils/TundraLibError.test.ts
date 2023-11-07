import { TundraLibError } from './TundraLibError.ts';
import type { TundraLibErrorMetaTags } from './TundraLibError.ts';
import { assertEquals, describe, it } from '../dev.dependencies.ts';

describe(`[library='utils' name='TundraLibError']`, () => {
  const mockMetaTags: TundraLibErrorMetaTags = {
    library: 'TestLib',
    tag1: 'value1',
    tag2: 'value2',
  };

  it('should create a new instance of TundraLibError with the correct message and meta tags', () => {
    const errorMessage = 'This is an error';
    const error = new TundraLibError(errorMessage, mockMetaTags);
    assertEquals(
      error.message,
      `[library='TestLib' tag1='value1' tag2='value2'] ${errorMessage}`,
    );
    assertEquals(error.metaTags, mockMetaTags);
  });

  it('should create a new instance of TundraLibError without meta tags if not provided', () => {
    const errorMessage = 'This is an error';
    const error = new TundraLibError(errorMessage);
    assertEquals(error.message, errorMessage);
    assertEquals(error.metaTags, {});
  });
});
