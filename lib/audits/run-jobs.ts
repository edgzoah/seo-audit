import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

import type { NewAuditInput } from "./new-audit-schema";
import { getRunById } from "./repo";

export type RunJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface RunJobState {
  id: string;
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

const MAX_TAIL = 6000;
const JOB_TTL_MS = 6 * 60 * 60 * 1000;

declare global {
  var __auditRunJobs: Map<string, RunJobState> | undefined;
}

function jobsStore(): Map<string, RunJobState> {
  if (!global.__auditRunJobs) {
    global.__auditRunJobs = new Map<string, RunJobState>();
  }
  return global.__auditRunJobs;
}

function nowIso(): string {
  return new Date().toISOString();
}

function trimTail(value: string): string {
  if (value.length <= MAX_TAIL) return value;
  return value.slice(value.length - MAX_TAIL);
}

function extractRunId(output: string): string | null {
  const matched = output.match(/Run ID:\s*(run-[A-Za-z0-9T:\-\.Z]+)/);
  return matched?.[1] ?? null;
}

async function resolveCliCommand(): Promise<{ command: string; argsPrefix: string[] }> {
  if (process.env.NODE_ENV === "production") {
    return {
      command: process.execPath,
      argsPrefix: [path.join(process.cwd(), "dist", "cli.js")],
    };
  }

  const localTsx = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  try {
    await access(localTsx, fsConstants.X_OK);
    return {
      command: localTsx,
      argsPrefix: [path.join(process.cwd(), "src", "cli.ts")],
    };
  } catch {
    return {
      command: process.execPath,
      argsPrefix: [path.join(process.cwd(), "dist", "cli.js")],
    };
  }
}

function buildCliArgs(input: NewAuditInput): string[] {
  return [
    "audit",
    input.target,
    "--coverage",
    input.coverage,
    "--max-pages",
    String(input.max_pages),
    "--depth",
    String(input.depth),
    "--format",
    "json",
  ];
}

async function waitForRunPersisted(runId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const report = await getRunById(runId);
    if (report) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function cleanupExpiredJobs(store: Map<string, RunJobState>): void {
  const threshold = Date.now() - JOB_TTL_MS;
  for (const [jobId, job] of store.entries()) {
    const updated = Date.parse(job.updatedAt);
    if (Number.isFinite(updated) && updated < threshold) {
      store.delete(jobId);
    }
  }
}

function setJobState(jobId: string, updater: (prev: RunJobState) => RunJobState): void {
  const store = jobsStore();
  const prev = store.get(jobId);
  if (!prev) return;
  store.set(jobId, updater(prev));
}

async function runJob(jobId: string, input: NewAuditInput): Promise<void> {
  try {
    setJobState(jobId, (prev) => ({ ...prev, status: "running", updatedAt: nowIso() }));

    const cli = await resolveCliCommand();
    const child = spawn(cli.command, [...cli.argsPrefix, ...buildCliArgs(input)], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
      setJobState(jobId, (prev) => ({
        ...prev,
        updatedAt: nowIso(),
        logs: {
          stdoutTail: trimTail(stdout),
          stderrTail: trimTail(stderr),
        },
      }));
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
      setJobState(jobId, (prev) => ({
        ...prev,
        updatedAt: nowIso(),
        logs: {
          stdoutTail: trimTail(stdout),
          stderrTail: trimTail(stderr),
        },
      }));
    });

    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });

    if (code !== 0) {
      setJobState(jobId, (prev) => ({
        ...prev,
        status: "failed",
        updatedAt: nowIso(),
        error: stderr.trim() || stdout.trim() || "Audit process exited with non-zero status.",
        logs: {
          stdoutTail: trimTail(stdout),
          stderrTail: trimTail(stderr),
        },
      }));
      return;
    }

    const runId = extractRunId(stdout);
    if (!runId) {
      setJobState(jobId, (prev) => ({
        ...prev,
        status: "failed",
        updatedAt: nowIso(),
        error: "Audit finished but run id could not be detected.",
        logs: {
          stdoutTail: trimTail(stdout),
          stderrTail: trimTail(stderr),
        },
      }));
      return;
    }

    const persisted = await waitForRunPersisted(runId);
    if (!persisted) {
      setJobState(jobId, (prev) => ({
        ...prev,
        status: "failed",
        updatedAt: nowIso(),
        runId,
        error: `Audit finished but run was not saved in DB: ${runId}`,
        logs: {
          stdoutTail: trimTail(stdout),
          stderrTail: trimTail(stderr),
        },
      }));
      return;
    }

    setJobState(jobId, (prev) => ({
      ...prev,
      status: "succeeded",
      updatedAt: nowIso(),
      runId,
      logs: {
        stdoutTail: trimTail(stdout),
        stderrTail: trimTail(stderr),
      },
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setJobState(jobId, (prev) => ({ ...prev, status: "failed", updatedAt: nowIso(), error: message }));
  }
}

export function startRunJob(input: NewAuditInput): RunJobState {
  const store = jobsStore();
  cleanupExpiredJobs(store);

  const id = randomUUID();
  const state: RunJobState = {
    id,
    status: "queued",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    logs: {
      stdoutTail: "",
      stderrTail: "",
    },
  };

  store.set(id, state);
  void runJob(id, input);
  return state;
}

export function getRunJob(jobId: string): RunJobState | null {
  const store = jobsStore();
  cleanupExpiredJobs(store);
  return store.get(jobId) ?? null;
}
