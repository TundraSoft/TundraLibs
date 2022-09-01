import { isHttpError } from "https://deno.land/std@0.150.0/http/http_errors.ts";
import { Middleware } from "../../dependencies.ts";

export const errorHandler: Middleware = async function (ctx, next) {
  try {
    await next();
  } catch (e) {
    if (isHttpError(e)) {
      ctx.response.status = e.status;
      ctx.response.body = e.message;
      // Append all headers
      if (e.headers) {
        for (const [key, value] of e.headers) {
          ctx.response.headers.set(key, value);
        }
      }
    } else {
      // Internal server error
      ctx.response.status = 500;
      ctx.response.body = e.message;
    }
  }
};
