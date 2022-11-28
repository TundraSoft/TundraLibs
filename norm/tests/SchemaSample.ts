import { SchemaManager } from "../SchemaManager.ts";
import * as models from "./models/mod.ts";

export const schema = new SchemaManager(models);

schema.get("Groups");
