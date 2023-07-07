import type { RequestOptions } from './RequestOptions.ts';
import type { ResponseObject } from './ResponseObject.ts';
export type IntegrationOptions = {
  endpointURL: string;
  timeout: number;
  onRequest?: <RequestBody = Record<string, unknown>>(
    request: RequestOptions<RequestBody>,
  ) => void;
  onResponse?: <
    RequestBody = Record<string, unknown>,
    ResponseBody = Record<string, unknown>,
  >(
    response: ResponseObject<ResponseBody>,
    request: RequestOptions<RequestBody>,
  ) => void;
  onTimeout?: <RequestBody = Record<string, unknown>>(
    timeout: number,
    request: RequestOptions<RequestBody>,
  ) => void;
  onError?: <RequestBody = Record<string, unknown>>(
    error: Error,
    request?: RequestOptions<RequestBody>,
  ) => void;
  log?: <
    RequestBody = Record<string, unknown>,
    ResponseBody = Record<string, unknown>,
  >(
    request: RequestOptions<RequestBody>,
    response?: ResponseObject<ResponseBody>,
    timeTaken?: number,
    timeout?: boolean,
  ) => () => void;
};
