import { Middleware } from '/root/dependencies.ts';

export const timing: Middleware = async function (ctx, next) {
  const start = performance.now();
  await next();
  const time = performance.now() - start;
  ctx.response.headers.set('X-Response-Time', `${time}ms`);
};
