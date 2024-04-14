import type { RESTlerEndpoint } from './RESTlerEndpoint.ts';

export type RESTlerRequest = {
  endpoint:
    & Omit<RESTlerEndpoint, 'baseURL'>
    & Partial<Pick<RESTlerEndpoint, 'baseURL'>>;
  headers?: Record<string, string>;
  body?:
    | Record<string, unknown>
    | Record<string, unknown>[]
    | FormData
    | string;
  timeout?: number;
};
