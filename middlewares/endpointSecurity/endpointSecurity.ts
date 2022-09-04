import { Middleware } from "../../dependencies.ts";

export type EndpointSecurityOptions = {
  clientHeader: string;
  clientSecret: string;
};

export const endpointSecurity = (
  options: EndpointSecurityOptions,
): Middleware => {
  return async (ctx, next) => {
    const { request, response } = ctx;
    const searchParams = request.url.searchParams,
      method = request.method,
      body = await request.body().value;
  };
};
