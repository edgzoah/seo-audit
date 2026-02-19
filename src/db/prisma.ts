import postgres, { type Sql } from "postgres";

let cliDb: Sql | null = null;

function ensureDatabaseConfigured(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured. Audit DB write cannot run.");
  }
  return url;
}

export function getCliDb(): Sql {
  if (!cliDb) {
    cliDb = postgres(ensureDatabaseConfigured(), {
      prepare: false,
      max: 5,
    });
  }

  return cliDb;
}

export async function closeCliDb(): Promise<void> {
  if (!cliDb) return;
  await cliDb.end({ timeout: 5 });
  cliDb = null;
}
