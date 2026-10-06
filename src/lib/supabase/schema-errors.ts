/** PostgREST "table not in schema cache" and Postgres "undefined_table". */
const MISSING_TABLE_CODES = new Set(["PGRST205", "42P01"]);

/**
 * True when a query failed because the table does not exist, i.e. a migration has
 * not been applied to this database yet. Lets code that depends on a newer table
 * degrade safely during a rollout instead of blocking unrelated behavior.
 */
export function isMissingTableError(error: { code?: string } | null | undefined): boolean {
  return Boolean(error?.code && MISSING_TABLE_CODES.has(error.code));
}
