import { HTTPMethods } from "../../dependencies.ts";

// export type BodyType = "JSON" | "TEXT" | "FORM" | "BYTES";

export type PagingParam = {
  size?: number;
  page?: number;
};

export type SortingParam = {
  [key: string]: "ASC" | "DESC";
};

export type FileUploadInfo = {
  originalName: string;
  path: string;
};

export type ParsedRequest = {
  method: HTTPMethods;
  params: { [key: string]: unknown };
  paging?: PagingParam;
  sorting?: SortingParam;
  payload?:
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | undefined;
  files?: {
    [key: string]: Array<FileUploadInfo>;
  };
};
