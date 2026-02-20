import { getDb } from "../db/prisma";

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
}

export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string;
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
  };
}

export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  const db = getDb();
  const rows = await db.unsafe<UserRow[]>(
    'SELECT "id", "email", "passwordHash" FROM "User" WHERE "email" = $1 LIMIT 1',
    [email],
  );
  if (!rows[0]) return null;
  return toAuthUser(rows[0]);
}

export async function createUser(email: string, passwordHash: string): Promise<AuthUser> {
  const db = getDb();
  const rows = await db.unsafe<UserRow[]>(
    `INSERT INTO "User" ("id", "email", "passwordHash", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
     RETURNING "id", "email", "passwordHash"`,
    [email, passwordHash],
  );
  return toAuthUser(rows[0]);
}

export async function ensureUserByEmail(email: string, passwordHashFallback: string): Promise<AuthUser> {
  const existing = await getUserByEmail(email);
  if (existing) {
    return existing;
  }
  return createUser(email, passwordHashFallback);
}
