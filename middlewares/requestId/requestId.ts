import { Middleware } from "../../dependencies.ts";

export const requestId: Middleware = async function (ctx, next) {
  let requestID = ctx.request.headers.get("X-Request-Id");
  if (!requestID) {
    requestID = crypto.randomUUID();
  }
  await next();
  ctx.response.headers.set("X-Request-Id", requestID);
};
