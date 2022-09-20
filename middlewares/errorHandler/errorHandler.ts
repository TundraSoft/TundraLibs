import { isHttpError, STATUS_TEXT } from "../../dependencies.ts";
import { isHTTPError } from "../../endpoint/mod.ts";
import { Middleware } from "../../dependencies.ts";

export const errorHandler: Middleware = async function (ctx, next) {
  try {
    await next();
  } catch (e) {
    if (isHTTPError(e)) {
      ctx.response.status = e.status;
      if (e.internal) {
        ctx.response.body = {
          message: `${STATUS_TEXT[e.status]}`,
        };
      } else {
        ctx.response.body = e.data;
      }
      // Append all headers
      if (e.headers) {
        for (const [key, value] of e.headers) {
          ctx.response.headers.set(key, value);
        }
      }
    } else if (isHttpError(e)) {
      ctx.response.status = e.status;
      if (e.expose) {
        ctx.response.body = {
          message: e.message,
        };
      } else {
        ctx.response.body = {
          message: `${STATUS_TEXT[e.status]}`,
        };
      }
      // Append all headers
      if (e.headers) {
        for (const [key, value] of e.headers) {
          ctx.response.headers.set(key, value);
        }
      }
    } else {
      // Internal server error
      ctx.response.status = 500;
      ctx.response.body = `${STATUS_TEXT[500]}`;
    }
  }
};
