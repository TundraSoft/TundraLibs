export type QuerySorting<T> = {
  [Property in keyof T]?: "ASC" | "DESC";
};
