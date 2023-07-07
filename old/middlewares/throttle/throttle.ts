import { Middleware } from '../../dependencies.ts';
import { ThrottleOptions } from './types.ts';

type ThrottleStorage = {
  count: number;
  lastRequest: number;
};

export const throttle = (options: Partial<ThrottleOptions>): Middleware => {
  const defOptions = {
      limitHeader: 'X-RateLimit-Limit',
      remainingHeader: 'X-RateLimit-Remaining',
      resetHeader: 'X-RateLimit-Reset',
      window: 60,
      limit: 30,
    },
    storage = new Map<string, { count: number; lastRequest: number }>(),
    opt: ThrottleOptions = { ...options, ...defOptions } as ThrottleOptions;
  return async (ctx, next) => {
    // Get identifier
    //#region Identifier
    const id = ctx.request.headers.get('X-Forwarded-For') || ctx.request.ip;
    // IP Based
    ctx.request.headers.get('X-Forwarded-For') || ctx.request.ip;
    // Header then we use X-Client-Id or equivalent
    if (opt.trackingHeader) {
      ctx.request.headers.get(opt.trackingHeader);
    }
    if (opt.trackingCB) {
      opt.trackingCB(ctx);
    }
    // If all yields null, then we revert to IP

    //#endregion Identifier
    // Check usage
    const ts = Math.floor(Date.now() / 1000),
      window = opt.window,
      usage = storage.get(id) || {
        count: 0,
        lastRequest: Math.floor(Date.now() / 1000),
      };

    // If last request + timewindow is lesser than current time, reset usage
    if (usage.lastRequest + window < ts) {
      usage.count = 0;
      usage.lastRequest = ts;
    }
    usage.count++;
    // save to storage
    storage.set(id, usage);

    // Check limit
    if (usage.count > opt.limit) {
      // Throw rate limit error
      ctx.response.headers.set(opt.limitHeader, `${opt.limit}`);
      ctx.response.headers.set(
        opt.remainingHeader,
        `${opt.limit - usage.count}`,
      );
      ctx.response.headers.set(
        opt.resetHeader,
        `${ts - (usage.lastRequest + window)}`,
      );
      ctx.response.headers.set(
        'Retry-After',
        `${ts - (usage.lastRequest + window)}`,
      );
      ctx.response.status = 429;
      ctx.response.body = 'Rate limit exceeded';
      ctx.respond = true;
      return;
    }

    await next();
    // Ensure these headers are set. We can set them before the next middleware,
    // but incase the middleware resets headers we ensure it is set
    ctx.response.headers.set(opt.limitHeader, `${opt.limit}`);
    ctx.response.headers.set(opt.remainingHeader, `${opt.limit - usage.count}`);
    ctx.response.headers.set(
      opt.resetHeader,
      `${ts - (usage.lastRequest + window)}`,
    );
  };
};
