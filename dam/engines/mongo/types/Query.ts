import type { EngineQuery } from '../../../engine/types/mod.ts';
/**
 * MongoDB-specific query operations
 */
export type MongoDBOperation =
  | 'find'
  | 'findOne'
  | 'insert'
  | 'insertOne'
  | 'insertMany'
  | 'update'
  | 'updateOne'
  | 'updateMany'
  | 'replaceOne'
  | 'delete'
  | 'deleteOne'
  | 'deleteMany'
  | 'aggregate'
  | 'count'
  | 'countDocuments'
  | 'distinct'
  | 'bulkWrite'
  | 'createIndex'
  | 'dropIndex';

/**
 * MongoDB-specific query structure
 * Uses the extended EngineQuery format with NoSQL-specific fields
 */
export type MongoDBQuery = EngineQuery & {
  sql: MongoDBOperation; // Repurpose sql field for operation type
  collection: string; // Target collection name
  data?: Record<string, unknown> | Record<string, unknown>[]; // Filter, document(s) to insert, or aggregation pipeline
  options?: Record<string, unknown>; // MongoDB operation options (limit, sort, projection, etc.)
  // params field ignored for MongoDB operations
};
