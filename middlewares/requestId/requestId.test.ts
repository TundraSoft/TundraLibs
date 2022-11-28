import { Context } from '/root/dependencies.ts';
import { requestId } from './requestId.ts';
import { assertEquals } from '/root/dev.dependencies.ts';

Deno.test({
  name: 'RequestId - Check if request id gets generated',
  async fn() {
    const mockContext = {
      request: {
        headers: new Headers(),
      },
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
    await requestId(mockContext, mockNext);

    console.log(mockContext.response.headers);
    assertEquals(mockContext.response.headers.has('x-Request-id'), true);
    // const value = parseInt(
    //   mockContext.response.headers.get("x-request-id")!,
    //   10,
    // );
    // assert(value >= 50);
  },
});

Deno.test({
  name:
    'RequestId - Check if request id sent in request is also sent in response',
  async fn() {
    const reqId = crypto.randomUUID();
    const mockContext = {
      request: {
        headers: new Headers(),
      },
      response: {
        headers: new Headers(),
      },
    } as Context;
    mockContext.request.headers.set('x-Request-id', reqId);
    const mockNext = () => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 50);
      });
    };
    await requestId(mockContext, mockNext);
    assertEquals(mockContext.response.headers.has('x-Request-id'), true);
    const respId = mockContext.response.headers.get('x-Request-id');
    assertEquals(respId, reqId);
    // const value = parseInt(
    //   mockContext.response.headers.get("x-request-id")!,
    //   10,
    // );
    // assert(value >= 50);
  },
});
