import type { BaseQueryFilter } from "./QueryFilter.ts";

export type SelectColumnOptions = { 
  columns: {
    [alias: string]: string
  }
  aggregation?: {
    average?: string | string[], 
    count?: boolean, 
    max?: string | string[], 
    min?: string | string[], 
  }, 
  filters?: BaseQueryFilter
}
export type JoinOptions = {
  type: 'INNER' | 'LEFT' | 'RIGHT', 
  relation: {
    [parent: string]: string
  }
}

export type SelectQueryOptions = SelectColumnOptions & {
  from: string;
  schema?: string;
  with?: Array<JoinOptions & SelectQueryOptions>, 
  page?: number;
  pageSize?: number;
}

function escapeColumnName(columnName: string): string {
  return `"${columnName}"`;
}

function escapeValue(value: any): string {
  if (typeof value === 'string') {
    return `'${value}'`;
  }
  return value.toString();
}

function buildSelectQuery(options: SelectQueryOptions): string {
  let query = 'SELECT ';

  // Handle columns
  for (const alias in options.columns) {
    query += `"${options.columns[alias]}" AS "${alias}", `;
  }
  query = query.slice(0, -2); // Remove trailing comma

  // Add FROM clause
  query += ` FROM ${options.schema ? options.schema + '.' : ''}"${options.from}"`;

  // Handle aggregation
  if (options.aggregation) {
    for (const func in options.aggregation) {
      if (Array.isArray(options.aggregation[func])) {
        options.aggregation[func].forEach((col) => {
          if (!Object.values(options.columns).includes(col)) throw new Error(`Invalid column name ${col}`);
          query += `, ${func.toUpperCase()}("${col}")`;
        });
      } else if (typeof options.aggregation[func] === 'string') {
        if (!Object.values(options.columns).includes(options.aggregation[func])) throw new Error(`Invalid column name ${options.aggregation[func]}`);
        query += `, ${func.toUpperCase()}("${options.aggregation[func]}")`;
      } else if (func === 'count' && options.aggregation[func]) {
        query += ', COUNT(*)';
      }
    }
  }

  // Handle filters
  if (options.filters) {
    query += ' WHERE ';
    for (const field in options.filters) {
      const filter = options.filters[field];
      if (!Object.values(options.columns).includes(field)) throw new Error(`Invalid filter column name ${field}`);
      query += `${escapeColumnName(field)} ${filter.operator} ${escapeValue(filter.value)} AND `;
    }
    query = query.slice(0, -5); // Remove trailing AND
  }


  // Handle JOINs
  if (options.with) {
    options.with.forEach((join) => {
      query += ` ${join.type} JOIN "${join.from}" ON `;
      for (const parent in join.relation) {
        if (!Object.values(options.columns).includes(parent) || !Object.values(join.columns).includes(join.relation[parent])) throw new Error(`Invalid join column name ${parent} or ${join.relation[parent]}`);
        query += `"${parent}" = "${join.relation[parent]}" AND `;
      }
      query = query.slice(0, -5); // Remove trailing AND

      // Include join columns in SELECT
      for (const alias in join.columns) {
        query += `, "${join.columns[alias]}" AS "${alias}"`;
      }
    });
  }

  // Handle pagination
  if (options.page !== undefined && options.pageSize !== undefined) {
    const offset = (options.page - 1) * options.pageSize;
    query += ` LIMIT ${options.pageSize} OFFSET ${offset}`;
  }

  return query;
}

const a: SelectQueryOptions = {
  from: 'ABC', 
  schema: 'public', 
  columns: {
    Id: 'id', 
    Name: 'name', 
    Email: 'user_email'
  }, 
  aggregation: {
    min: 'id'
  }
};

console.log(buildSelectQuery(a));

