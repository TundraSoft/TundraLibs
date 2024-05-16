import type { RESTlerEndpoint } from './Endpoint.ts';

export type RESTlerRequest = {
  endpoint:
    & Omit<RESTlerEndpoint, 'baseURL'>
    & Partial<Pick<RESTlerEndpoint, 'baseURL'>>;
  headers?: Record<string, string>;
  body?:
    | Record<string, unknown>
    | Record<string, unknown>[]
    | FormData
    | string
    | Uint8Array;
  timeout?: number;
};
