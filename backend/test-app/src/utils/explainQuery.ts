import { DataSource } from 'typeorm';

/**
 * Runs EXPLAIN ANALYZE on a query — intended for dev/perf tuning only.
 * Disabled in production to avoid overhead and leaking query plans.
 */
export async function explainQuery(
  db: DataSource,
  sql: string,
  parameters: unknown[] = [],
): Promise<string> {
  if (process.env.NODE_ENV === 'production') {
    return 'EXPLAIN analysis is disabled in production';
  }

  const [plan] = await db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`, parameters);
  const row = plan as Record<string, string>;
  return row['QUERY PLAN'] ?? JSON.stringify(plan);
}
