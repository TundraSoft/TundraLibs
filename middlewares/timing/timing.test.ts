import { Context } from '/root/dependencies.ts';
import { timing } from './timing.ts';
import { assert, assertEquals } from '/root/dev.dependencies.ts';

Deno.test({
  name: 'responseTime',
  async fn() {
    const mockContext = {
      response: {
        headers: new Headers(),
      },
    } as Context;
    const mockNext = () => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 50);
      });
    };
    await timing(mockContext, mockNext);
    assertEquals(mockContext.response.headers.has('x-response-time'), true);
    const value = parseInt(
      mockContext.response.headers.get('x-response-time')!,
      10,
    );
    assert(value >= 50);
  },
});
