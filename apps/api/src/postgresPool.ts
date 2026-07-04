import { Pool } from "pg";

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createPostgresPool(connectionString: string, applicationName: string): Pool {
  return new Pool({
    connectionString,
    max: numberEnv("PG_POOL_SIZE", 2),
    idleTimeoutMillis: numberEnv("PG_IDLE_TIMEOUT_MS", 30_000),
    connectionTimeoutMillis: numberEnv("PG_CONNECT_TIMEOUT_MS", 5_000),
    application_name: applicationName,
    query_timeout: numberEnv("PG_QUERY_TIMEOUT_MS", 25_000)
  });
}
