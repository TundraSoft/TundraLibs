export type ClientEvents = {
  "connect": () => void;
  "disconnect": () => void;
  "error": (error: Error) => void;
};
