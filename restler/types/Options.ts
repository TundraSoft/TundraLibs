export type RESTlerOptions = {
  endpointURL: string;
  timeout?: number;
  version?: string;
  defaultHeaders?: Record<string, string>;
  certChain?: string;
  certKey?: string;
  isUnixSocket?: boolean;
};
