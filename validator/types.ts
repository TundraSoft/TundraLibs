export type ValidationFunction<T> = (...args: T[]) => boolean;

export type Validators<T> = {
  cb: (...args: T[]) => boolean;
  message: string;
};
