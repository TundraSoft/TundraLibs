import { HTTPMethods } from '../../utils/mod.ts';

export type RESTlerEndpoint = {
  method: HTTPMethods;
  baseURL: string;
  version?: string;
  path: string;
  searchParams?: Record<string, string>;
};
