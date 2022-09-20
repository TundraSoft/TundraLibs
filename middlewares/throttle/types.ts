import { Context } from "../../dependencies.ts";
export type ThrottleOptions = {
  // Limit value
  limitHeader: string;
  // Remaining value
  remainingHeader: string;
  // Reset timer
  resetHeader: string;
  // window in seconds
  window: number;
  // Limit in window
  limit: number;
  // Tracking header name
  trackingHeader?: string;
  // Tracking callback
  trackingCB?: (ctx: Context) => string;
};
