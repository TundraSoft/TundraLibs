export type TranslatorCapability = {
  cascade: boolean; // Cascade is supported
  matview: boolean; // Materialized Views are supported
  distributed: boolean; // Distributed tables are supported (e.g citus)
  partition: boolean; // Table partitioning is supported
};
