export type JSONStructure = {
  [key: string]: JSONStructure | string | number | boolean | Date | unknown;
};
