export type ClientEvents = {
  connect: (name: string) => void;
  close: (name: string) => void;
  slowQuery: (name: string, sql: string, time: number) => void;
  error: (
    name: string,
    dialect: string,
    sql: string,
    error: string,
  ) => Promise<void>;
};
