import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { upsertRunFromReport } from "../lib/audits/repo";
import type { Report } from "../lib/audits/types";
import { closeDb } from "../lib/db/prisma";
import { validateReport } from "../src/report/report-schema";

interface MigrationStats {
  imported: number;
  skipped: number;
  failed: number;
  failedRunIds: string[];
}

async function listRunIds(runsDir: string): Promise<string[]> {
  const entries = await readdir(runsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("run-"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function readValidatedReport(runsDir: string, runId: string): Promise<Report | null> {
  const reportPath = path.join(runsDir, runId, "report.json");

  let raw: string;
  try {
    raw = await readFile(reportPath, "utf-8");
  } catch {
    return null;
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!validateReport(parsed).valid) {
    throw new Error(`Invalid report schema in ${reportPath}`);
  }

  return parsed as Report;
}

async function migrateRuns(): Promise<MigrationStats> {
  const runsDir = path.join(process.cwd(), "runs");
  const runIds = await listRunIds(runsDir);

  const stats: MigrationStats = {
    imported: 0,
    skipped: 0,
    failed: 0,
    failedRunIds: [],
  };

  for (const runId of runIds) {
    try {
      const report = await readValidatedReport(runsDir, runId);
      if (!report) {
        stats.skipped += 1;
        continue;
      }

      await upsertRunFromReport(report);
      stats.imported += 1;
    } catch (error) {
      stats.failed += 1;
      stats.failedRunIds.push(runId);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[db:migrate-runs] ${runId}: ${message}`);
    }
  }

  return stats;
}

async function main(): Promise<void> {
  try {
    const stats = await migrateRuns();
    console.log(`[db:migrate-runs] imported=${stats.imported} skipped=${stats.skipped} failed=${stats.failed}`);

    if (stats.failedRunIds.length > 0) {
      console.log(`[db:migrate-runs] failed runIds: ${stats.failedRunIds.join(", ")}`);
      process.exitCode = 1;
    }
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[db:migrate-runs] fatal: ${message}`);
  process.exitCode = 1;
});
