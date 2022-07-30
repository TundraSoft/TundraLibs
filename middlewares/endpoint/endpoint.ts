import { Middleware } from "../Middleware.ts";

export const endpoint: Middleware = async function (ctx, _next) {
  const { request } = ctx;
  const _body = (request.body)
    ? await (await request.body?.getReader().read()).value
    : {};
};
