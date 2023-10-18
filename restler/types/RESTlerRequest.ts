import type { RESTlerEndpoint } from './RESTlerEndpoint.ts';

export type RESTlerRequestBody = Record<string, unknown> | Record<
  string,
  unknown
>[] | FormData;

export type RESTlerRequest<RESTlerRequestBody = Record<string, unknown>> = {
  endpoint:
    & Omit<RESTlerEndpoint, 'baseURL'>
    & Partial<Pick<RESTlerEndpoint, 'baseURL'>>;
  headers?: Record<string, string>;
  body?: RESTlerRequestBody;
  timeout?: number;
};
