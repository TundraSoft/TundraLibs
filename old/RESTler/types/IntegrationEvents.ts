import type { RequestOptions, ResponseObject } from './mod.ts';

export type IntegrationEvents = {
  request<RequestBody = Record<string, unknown>>(
    request: RequestOptions<RequestBody>,
  ): void;
  response<
    RequestBody = Record<string, unknown>,
    ResponseBody = Record<string, unknown>,
  >(
    response: ResponseObject<ResponseBody>,
    request: RequestOptions<RequestBody>,
  ): void;
  timeout<RequestBody = Record<string, unknown>>(
    timeout: number,
    request: RequestOptions<RequestBody>,
  ): void;
  error<RequestBody = Record<string, unknown>>(
    error: Error,
    request?: RequestOptions<RequestBody>,
  ): void;
  log<
    RequestBody = Record<string, unknown>,
    ResponseBody = Record<string, unknown>,
  >(
    request: RequestOptions<RequestBody>,
    response?: ResponseObject<ResponseBody>,
    timeTaken?: number,
    isTimedOut?: boolean,
  ): void;
};
