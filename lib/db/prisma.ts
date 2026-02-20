import postgres, { type Sql } from "postgres";

let db: Sql | null = null;

function toPostgresJsUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("schema");
    return parsed.toString();
  } catch {
    return url;
  }
}

export function ensureDbConfigured(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured. Configure PostgreSQL connection first.");
  }
  return url;
}

export function getDb(): Sql {
  if (!db) {
    db = postgres(toPostgresJsUrl(ensureDbConfigured()), {
      prepare: false,
      max: 10,
    });
  }

  return db;
}

export async function closeDb(): Promise<void> {
  if (!db) return;
  await db.end({ timeout: 5 });
  db = null;
}
