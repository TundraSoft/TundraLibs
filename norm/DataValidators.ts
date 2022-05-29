import type { ValidationInput } from "./types.ts"

export default {
  notNull: function(col: string, data: ValidationInput): boolean {
    return true;
  }, 
}