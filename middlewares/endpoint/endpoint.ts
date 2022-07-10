import { Middleware } from "../Middleware.ts";

export const endpoint: Middleware = async function (ctx, next) {
  const { request } = ctx;
  const body =  (request.body) ? await (await request.body?.getReader().read()).value : {};
}