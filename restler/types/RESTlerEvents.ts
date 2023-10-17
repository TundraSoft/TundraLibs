export type RESTlerEvents = {
  request: () => void;
  response: () => void;
  authFailre: () => void;
  timeout: () => void;
  error: () => void;
};
