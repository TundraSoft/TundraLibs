import { HTTPMethods } from '../../dependencies.ts';

// export type BodyType = "JSON" | "TEXT" | "FORM" | "BYTES";

export type PagingParam = {
  limit?: number;
  page?: number;
};

export type SortingParam = {
  [key: string]: 'ASC' | 'DESC';
};

export type FileUploadInfo = {
  originalName: string;
  path: string;
};

// For GET, HEAD and DELETE

export type ParsedRequest = {
  method: HTTPMethods;
  params: { [key: string]: unknown };
  paging?: PagingParam;
  sorting?: SortingParam;
  payload?:
    | Array<Record<string, unknown>>
    | undefined;
  files?: {
    [key: string]: Array<FileUploadInfo>;
  };
};
