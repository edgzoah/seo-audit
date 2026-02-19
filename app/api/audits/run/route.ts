import { unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";

import { NextResponse } from "next/server";

import { getRunById } from "../../../../lib/audits/repo";
import { newAuditSchema } from "../../../../lib/audits/new-audit-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildArgs(input: ReturnType<typeof newAuditSchema.parse>): string[] {
  const args = [
    path.join(process.cwd(), "dist", "cli.js"),
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

  if (input.primary_url) {
    args.push("--focus-url", input.primary_url);
  }
  if (input.keyword) {
    args.push("--focus-keyword", input.keyword);
  }
  if (input.goal) {
    args.push("--focus-goal", input.goal);
  }
  if (input.constraints.length > 0) {
    args.push("--constraints", input.constraints.join(";"));
  }

  return args;
}

function runAuditCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}

function extractRunId(stdout: string): string | null {
  const matched = stdout.match(/Run ID:\s*(run-[A-Za-z0-9T:\-\.Z]+)/);
  return matched?.[1] ?? null;
}

export async function POST(request: Request): Promise<Response> {
  let tempInputPath: string | null = null;

  try {
    const json = (await request.json()) as unknown;
    const input = newAuditSchema.parse(json);

    tempInputPath = path.join(tmpdir(), `seo-audit-inputs-${Date.now()}.json`);
    await writeFile(tempInputPath, `${JSON.stringify(input, null, 2)}\n`, "utf-8");

    const args = buildArgs(input);
    const result = await runAuditCli(args);

    if (result.code !== 0) {
      return NextResponse.json(
        {
          error: result.stderr.trim() || result.stdout.trim() || "Audit process exited with non-zero status.",
        },
        { status: 500 },
      );
    }

    const runId = extractRunId(result.stdout);

    if (!runId) {
      return NextResponse.json({ error: "Audit finished but run id could not be detected." }, { status: 500 });
    }

    const report = await getRunById(runId);
    if (!report) {
      return NextResponse.json({ error: `Audit finished but run was not saved in DB: ${runId}` }, { status: 500 });
    }

    return NextResponse.json({ runId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tempInputPath) {
      await unlink(tempInputPath).catch(() => undefined);
    }
  }
}
