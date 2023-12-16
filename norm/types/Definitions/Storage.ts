export type PartitionDefinition = {
  name: string;
  type: 'HASH' | 'RANGE';
  columns: Array<string>;
};
