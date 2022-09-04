export type BodyType = "JSON" | "TEXT" | "FORM" | "BYTES";

export type PagingParam = {
  size?: number, 
  page?: number,
}

export type SortingParam = {
  [key: string]: "ASC" | "DESC",
}

export type ParsedBody = {
  type: BodyType,
  value: { [key: string]: unknown, 
    _files?: {
    [key: string]: string,
  } } | string | undefined,
}

export type ParsedRequest = {
  params: { [key: string]: unknown },
  paging: PagingParam,
  sorting: SortingParam,
  body: ParsedBody,
}
