type QueryValue = string | number | boolean | null;

type NeonField = {
  name: string;
};

type NeonQueryResult = {
  fields: NeonField[];
  rows: QueryValue[][];
};

export function databaseUrl() {
  return process.env.POSTGRES_URL || process.env.DATABASE_URL || "";
}

export function hasDatabaseUrl() {
  return Boolean(databaseUrl());
}

function neonSqlEndpoint(connectionString: string) {
  const url = new URL(connectionString);
  const endpointHost = url.hostname.replace(/^[^.]+\./, "api.");

  return `https://${endpointHost}/sql`;
}

function rowToObject<T extends Record<string, unknown>>(
  fields: NeonField[],
  row: QueryValue[],
) {
  return Object.fromEntries(
    fields.map((field, index) => [field.name, row[index] ?? null]),
  ) as T;
}

export async function query<T extends Record<string, unknown>>(
  sql: string,
  params: QueryValue[] = [],
) {
  const connectionString = databaseUrl();

  if (!connectionString) {
    throw new Error("POSTGRES_URL or DATABASE_URL is required.");
  }

  const response = await fetch(neonSqlEndpoint(connectionString), {
    method: "POST",
    headers: {
      "Neon-Connection-String": connectionString,
      "Neon-Raw-Text-Output": "true",
      "Neon-Array-Mode": "true",
    },
    body: JSON.stringify({
      query: sql,
      params,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;

    throw new Error(payload?.message || `Database query failed with ${response.status}.`);
  }

  const payload = (await response.json()) as NeonQueryResult;

  return (payload.rows ?? []).map((row) =>
    rowToObject<T>(payload.fields ?? [], row),
  );
}
