import { ensureDbConfigured, getDb } from "../db/prisma";

export type RunJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface RunJobState {
  id: string;
  ownerUserId: string;
  status: RunJobStatus;
  createdAt: string;
  updatedAt: string;
  runId?: string;
  error?: string;
  logs: {
    stdoutTail: string;
    stderrTail: string;
  };
}

interface AuditRunJobRow {
  id: string;
  ownerUserId: string;
  status: RunJobStatus;
  runId: string | null;
  error: string | null;
  logsJson: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
}

const MAX_TAIL = 6000;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function trimTail(value: string): string {
  if (value.length <= MAX_TAIL) return value;
  return value.slice(value.length - MAX_TAIL);
}

function parseProgressTail(logsJson: unknown): string {
  if (!logsJson || typeof logsJson !== "object") {
    return "";
  }

  const candidate = logsJson as { progressTail?: unknown };
  if (typeof candidate.progressTail !== "string") {
    return "";
  }

  return candidate.progressTail;
}

function rowToState(row: AuditRunJobRow): RunJobState {
  const progressTail = parseProgressTail(row.logsJson);
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    status: row.status,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    runId: row.runId ?? undefined,
    error: row.error ?? undefined,
    logs: {
      stdoutTail: progressTail,
      stderrTail: "",
    },
  };
}

async function getJobById(jobId: string): Promise<AuditRunJobRow | null> {
  ensureDbConfigured();
  const db = getDb();
  const rows = await db.unsafe<AuditRunJobRow[]>(
    'SELECT "id", "ownerUserId", "status", "runId", "error", "logsJson", "createdAt", "updatedAt" FROM "AuditRunJob" WHERE "id" = $1 LIMIT 1',
    [jobId],
  );
  return rows[0] ?? null;
}

export async function createRunJob(ownerUserId: string): Promise<RunJobState> {
  ensureDbConfigured();
  const db = getDb();
  const rows = await db.unsafe<AuditRunJobRow[]>(
    `INSERT INTO "AuditRunJob" ("ownerUserId", "status", "logsJson")
     VALUES ($1, 'queued', $2::jsonb)
     RETURNING "id", "ownerUserId", "status", "runId", "error", "logsJson", "createdAt", "updatedAt"`,
    [ownerUserId, JSON.stringify({ progressTail: "" })],
  );

  const row = rows[0];
  if (!row) {
    throw new Error("Could not create audit run job.");
  }

  return rowToState(row);
}

export async function getRunJob(ownerUserId: string, jobId: string): Promise<RunJobState | null> {
  ensureDbConfigured();
  const db = getDb();
  const rows = await db.unsafe<AuditRunJobRow[]>(
    'SELECT "id", "ownerUserId", "status", "runId", "error", "logsJson", "createdAt", "updatedAt" FROM "AuditRunJob" WHERE "ownerUserId" = $1 AND "id" = $2 LIMIT 1',
    [ownerUserId, jobId],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return rowToState(row);
}

export async function setRunJobRunning(jobId: string): Promise<void> {
  ensureDbConfigured();
  const db = getDb();
  await db.unsafe(
    'UPDATE "AuditRunJob" SET "status" = $2, "updatedAt" = NOW() WHERE "id" = $1',
    [jobId, "running"],
  );
}

export async function appendRunJobProgress(jobId: string, line: string): Promise<void> {
  const row = await getJobById(jobId);
  if (!row) {
    return;
  }

  const currentTail = parseProgressTail(row.logsJson);
  const nextTail = trimTail(currentTail.length > 0 ? `${currentTail}\n${line}` : line);

  ensureDbConfigured();
  const db = getDb();
  await db.unsafe(
    'UPDATE "AuditRunJob" SET "logsJson" = $2::jsonb, "updatedAt" = NOW() WHERE "id" = $1',
    [jobId, JSON.stringify({ progressTail: nextTail })],
  );
}

export async function setRunJobFailed(jobId: string, error: string): Promise<void> {
  const row = await getJobById(jobId);
  const progressTail = row ? parseProgressTail(row.logsJson) : "";

  ensureDbConfigured();
  const db = getDb();
  await db.unsafe(
    'UPDATE "AuditRunJob" SET "status" = $2, "error" = $3, "logsJson" = $4::jsonb, "updatedAt" = NOW() WHERE "id" = $1',
    [jobId, "failed", error, JSON.stringify({ progressTail })],
  );
}

export async function setRunJobSucceeded(jobId: string, runId: string): Promise<void> {
  const row = await getJobById(jobId);
  const progressTail = row ? parseProgressTail(row.logsJson) : "";

  ensureDbConfigured();
  const db = getDb();
  await db.unsafe(
    'UPDATE "AuditRunJob" SET "status" = $2, "runId" = $3, "logsJson" = $4::jsonb, "updatedAt" = NOW() WHERE "id" = $1',
    [jobId, "succeeded", runId, JSON.stringify({ progressTail })],
  );
}
