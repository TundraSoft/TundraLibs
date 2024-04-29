import { HTTPMethods } from '../../dependencies.ts';

export type RESTlerEndpoint = {
  method: HTTPMethods;
  baseURL: string;
  version?: string;
  path: string;
  searchParams?: Record<string, string>;
};
