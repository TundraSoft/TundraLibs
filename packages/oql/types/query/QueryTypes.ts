import type { DMLQueries } from './DMLQueries.ts';
import type { DDLQueries } from './DDLQueries.ts';

/** All supported query types (DML + DDL). */
export type QueryTypes = DMLQueries | DDLQueries;
