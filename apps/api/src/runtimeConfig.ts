import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

let cachedDatabaseUrl: string | null = null;

function parseSecretValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("postgres://") || trimmed.startsWith("postgresql://")) return normalizeDatabaseUrl(trimmed);
  const parsed = JSON.parse(trimmed) as Record<string, unknown>;
  const candidate = parsed.DATABASE_URL ?? parsed.databaseUrl ?? parsed.connectionString ?? parsed.url;
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error("Database secret must be a Postgres URL or JSON containing DATABASE_URL.");
  }
  return normalizeDatabaseUrl(candidate);
}

function normalizeDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.searchParams.get("sslmode") === "require") {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return value;
  }
}

export async function resolveDatabaseUrl(): Promise<string | undefined> {
  if (process.env.DATABASE_URL) return normalizeDatabaseUrl(process.env.DATABASE_URL);
  if (cachedDatabaseUrl) return cachedDatabaseUrl;
  if (!process.env.DATABASE_SECRET_ARN) return undefined;

  const client = new SecretsManagerClient({ region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1" });
  const result = await client.send(new GetSecretValueCommand({ SecretId: process.env.DATABASE_SECRET_ARN }));
  if (!result.SecretString) throw new Error("Database secret does not contain SecretString.");
  cachedDatabaseUrl = parseSecretValue(result.SecretString);
  return cachedDatabaseUrl;
}
