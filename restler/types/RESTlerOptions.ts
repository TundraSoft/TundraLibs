export type RESTlerOptions = {
  endpointURL: string;
  timeout?: number;
  maxAuthTries?: number;
  version?: string;
  defaultHeaders?: Record<string, string>;
}