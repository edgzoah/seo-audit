import { runAuditCommand, type AuditCliOptions } from "../../src/audit/run";
import type { NewAuditInput } from "./new-audit-schema";
import {
  appendRunJobProgress,
  createRunJob,
  getRunJob as getRunJobFromDb,
  setRunJobFailed,
  setRunJobRunning,
  setRunJobSucceeded,
  type RunJobState,
} from "./jobs-repo";

function mapInputToAuditOptions(input: NewAuditInput, ownerUserId: string): AuditCliOptions {
  return {
    coverage: input.coverage,
    maxPages: input.max_pages,
    depth: input.depth,
    focusUrl: input.primary_url || undefined,
    focusKeyword: input.keyword || undefined,
    focusGoal: input.goal || undefined,
    constraints: input.constraints.join(";"),
    llm: false,
    dbWrite: true,
    ownerUserId,
  };
}

async function runJob(jobId: string, ownerUserId: string, input: NewAuditInput): Promise<void> {
  try {
    await setRunJobRunning(jobId);

    const options = mapInputToAuditOptions(input, ownerUserId);
    const result = await runAuditCommand(input.target, {
      ...options,
      onProgress: (progress) => {
        const line = `[${String(progress.percent).padStart(3, " ")}%] ${progress.stage}: ${progress.detail}`;
        void appendRunJobProgress(jobId, line);
      },
    });

    await setRunJobSucceeded(jobId, result.runId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setRunJobFailed(jobId, message);
  }
}

export async function startRunJob(input: NewAuditInput, ownerUserId: string): Promise<RunJobState> {
  const job = await createRunJob(ownerUserId);
  void runJob(job.id, ownerUserId, input);
  return job;
}

export async function getRunJob(ownerUserId: string, jobId: string): Promise<RunJobState | null> {
  return getRunJobFromDb(ownerUserId, jobId);
}
