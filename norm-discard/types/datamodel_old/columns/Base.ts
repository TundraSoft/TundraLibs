export type BaseColumnDefinition = {
  name?: string;
  nullable?: boolean;
  defaults?: {
    insert?: unknown;
    update?: unknown;
  };
  security?: 'HASH' | 'ENCRYPT';
  comment?: string;
};
