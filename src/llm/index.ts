import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import type { Action, ProposedFix, Report } from "../report/report-schema.js";

export interface LlmGenerationResult {
  proposed_fixes: ProposedFix[];
  prioritized_actions: Action[];
}

interface CodexRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

const MAX_ISSUES_FOR_LLM = 50;
const MAX_EVIDENCE_PER_ISSUE = 3;
const MAX_AFFECTED_URLS_PER_ISSUE = 5;
const MAX_PAGES_FOR_LLM = 120;

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

function severityOrder(severity: "error" | "warning" | "notice"): number {
  switch (severity) {
    case "error":
      return 3;
    case "warning":
      return 2;
    case "notice":
      return 1;
    default:
      return 0;
  }
}

function sanitizeContextPayload(report: Report): Record<string, unknown> {
  const compactIssues = [...report.issues]
    .sort((a, b) => {
      const severityDelta = severityOrder(b.severity) - severityOrder(a.severity);
      if (severityDelta !== 0) {
        return severityDelta;
      }
      const rankDelta = b.rank - a.rank;
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return a.id.localeCompare(b.id, "en");
    })
    .slice(0, MAX_ISSUES_FOR_LLM)
    .map((issue) => ({
      id: issue.id,
      category: issue.category,
      severity: issue.severity,
      rank: issue.rank,
      title: issue.title,
      description: issue.description,
      recommendation: issue.recommendation,
      tags: [...issue.tags].sort(compareStrings),
      affected_urls: issue.affected_urls.slice(0, MAX_AFFECTED_URLS_PER_ISSUE),
      affected_urls_total: issue.affected_urls.length,
      evidence: issue.evidence.slice(0, MAX_EVIDENCE_PER_ISSUE).map((item) => ({
        type: item.type,
        message: item.message,
        url: item.url,
        source_url: item.source_url,
        target_url: item.target_url,
        status: item.status,
      })),
    }));

  const compactPages = [...report.pages]
    .sort((a, b) => a.url.localeCompare(b.url, "en"))
    .slice(0, MAX_PAGES_FOR_LLM)
    .map((page) => ({
      url: page.url,
      final_url: page.final_url,
      status: page.status,
      title: page.title,
      canonical: page.canonical,
    }));

  return {
    run_id: report.run_id,
    summary: report.summary,
    focus: report.inputs.brief.focus,
    issue_count_total: report.issues.length,
    issues: compactIssues,
    page_count_total: report.pages.length,
    pages: compactPages,
    limits: {
      issues: MAX_ISSUES_FOR_LLM,
      evidence_per_issue: MAX_EVIDENCE_PER_ISSUE,
      affected_urls_per_issue: MAX_AFFECTED_URLS_PER_ISSUE,
      pages: MAX_PAGES_FOR_LLM,
    },
  };
}

function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("Empty LLM output.");
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("No JSON object found in LLM output.");
    }
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as unknown;
  }
}

function toActionArray(value: unknown): Action[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed: Action[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title : null;
    const impact = record.impact === "high" || record.impact === "medium" || record.impact === "low" ? record.impact : null;
    const effort = record.effort === "high" || record.effort === "medium" || record.effort === "low" ? record.effort : null;
    const rationale = typeof record.rationale === "string" ? record.rationale : null;
    if (title && impact && effort && rationale) {
      parsed.push({ title, impact, effort, rationale });
    }
  }
  return parsed;
}

function toProposedFixArray(value: unknown): ProposedFix[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed: ProposedFix[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const issueId = typeof record.issue_id === "string" ? record.issue_id : null;
    const pageUrl = typeof record.page_url === "string" ? record.page_url : null;
    const proposal = typeof record.proposal === "string" ? record.proposal : null;
    const rationale = typeof record.rationale === "string" ? record.rationale : null;
    if (issueId && pageUrl && proposal && rationale) {
      parsed.push({
        issue_id: issueId,
        page_url: pageUrl,
        proposal,
        rationale,
      });
    }
  }
  return parsed;
}

function normalizeLlmOutput(raw: unknown): LlmGenerationResult {
  if (!raw || typeof raw !== "object") {
    return { proposed_fixes: [], prioritized_actions: [] };
  }

  const record = raw as Record<string, unknown>;
  const proposedFixes = toProposedFixArray(record.proposed_fixes);
  const proposedFixesAlt = proposedFixes.length > 0 ? proposedFixes : toProposedFixArray(record.proposedFixes);
  const proposedFixesFinal = proposedFixesAlt.length > 0 ? proposedFixesAlt : toProposedFixArray(record.focus_proposals);

  const prioritizedActions = toActionArray(record.prioritized_actions);
  const prioritizedActionsAlt = prioritizedActions.length > 0 ? prioritizedActions : toActionArray(record.prioritizedActions);
  const prioritizedActionsFinal = prioritizedActionsAlt.length > 0 ? prioritizedActionsAlt : toActionArray(record.global_actions);

  return {
    proposed_fixes: proposedFixesFinal,
    prioritized_actions: prioritizedActionsFinal,
  };
}

function runProcess(command: string, args: string[], cwd: string): Promise<CodexRunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({
        ok: false,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });

    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        stdout,
        stderr,
      });
    });
  });
}

async function runCodexWithPromptFiles(input: {
  runDir: string;
  promptFilePath: string;
  payloadFilePath: string;
}): Promise<CodexRunResult> {
  const command = process.env.SEO_AUDIT_CODEX_CMD ?? "codex";
  const promptText = await readFile(input.promptFilePath, "utf-8");
  const outputFileName = "llm.codex.last-message.txt";
  const outputFilePath = path.join(input.runDir, outputFileName);

  const strategies: Array<{ args: string[]; stdinText: string | null }> = [
    {
      args: ["exec", "-", "--output-last-message", outputFileName, "--skip-git-repo-check"],
      stdinText: `${promptText.trim()}\n\nPayload file: ${path.basename(input.payloadFilePath)}\n`,
    },
    {
      args: ["exec", "-", "--output-last-message", outputFileName],
      stdinText: `${promptText.trim()}\n\nPayload file: ${path.basename(input.payloadFilePath)}\n`,
    },
    {
      args: ["exec", promptText.trim(), "--output-last-message", outputFileName, "--skip-git-repo-check"],
      stdinText: null,
    },
  ];

  let lastError = "Failed to execute codex CLI using supported argument patterns.";
  for (const strategy of strategies) {
    const result = await new Promise<CodexRunResult>((resolve) => {
      const child = spawn(command, strategy.args, {
        cwd: input.runDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        resolve({
          ok: false,
          stdout,
          stderr: `${stderr}\n${error.message}`.trim(),
        });
      });

      child.on("close", async (code) => {
        if (code !== 0) {
          resolve({
            ok: false,
            stdout,
            stderr,
          });
          return;
        }

        try {
          const lastMessage = await readFile(outputFilePath, "utf-8");
          resolve({
            ok: true,
            stdout: lastMessage,
            stderr,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          resolve({
            ok: false,
            stdout,
            stderr: `${stderr}\n${message}`.trim(),
          });
        }
      });

      if (strategy.stdinText !== null) {
        child.stdin.write(strategy.stdinText);
      }
      child.stdin.end();
    });

    if (result.ok) {
      return result;
    }
    if (result.stderr.trim().length > 0) {
      lastError = result.stderr.trim();
    }
  }

  return {
    ok: false,
    stdout: "",
    stderr: lastError,
  };
}

function buildMainPrompt(input: {
  contextFiles: string[];
  payloadFileName: string;
  focusUrl: string | null;
}): string {
  const focusLine = input.focusUrl
    ? `Focus page: ${input.focusUrl}. Include focus-specific proposals as required.`
    : "No focus page provided. Return only site-wide proposals.";

  return [
    "You are generating SEO audit proposals.",
    "Use only evidence present in the payload report JSON.",
    "Payload is compacted for token efficiency; prioritize high-severity and high-rank items first.",
    "Return STRICT JSON only. No markdown, no prose outside JSON.",
    "",
    "Required JSON shape:",
    "{",
    '  "proposed_fixes": [',
    '    { "issue_id": "string", "page_url": "string", "proposal": "string", "rationale": "string" }',
    "  ],",
    '  "prioritized_actions": [',
    '    { "title": "string", "impact": "high|medium|low", "effort": "high|medium|low", "rationale": "string" }',
    "  ]",
    "}",
    "",
    `${focusLine}`,
    "",
    "Context files:",
    ...input.contextFiles.map((filePath) => `- ${filePath}`),
    "",
    `Input payload file: ${input.payloadFileName}`,
  ].join("\n");
}

function buildRepairPrompt(input: {
  contextFiles: string[];
  payloadFileName: string;
  brokenOutputFileName: string;
}): string {
  return [
    "Repair invalid model output into STRICT JSON.",
    "Do not add commentary. Output JSON only.",
    "",
    "Use the same required shape:",
    "{",
    '  "proposed_fixes": [',
    '    { "issue_id": "string", "page_url": "string", "proposal": "string", "rationale": "string" }',
    "  ],",
    '  "prioritized_actions": [',
    '    { "title": "string", "impact": "high|medium|low", "effort": "high|medium|low", "rationale": "string" }',
    "  ]",
    "}",
    "",
    "Context files:",
    ...input.contextFiles.map((filePath) => `- ${filePath}`),
    `Payload file: ${input.payloadFileName}`,
    `Broken output file: ${input.brokenOutputFileName}`,
  ].join("\n");
}

export async function generateOptionalLlmProposals(input: {
  runDir: string;
  report: Report;
}): Promise<LlmGenerationResult | null> {
  const contextFiles = [
    path.join(process.cwd(), "docs", "seo-values.md"),
    path.join(process.cwd(), "docs", "report-schema.md"),
    path.join(process.cwd(), "docs", "workflow.md"),
  ];

  const contextPayload = sanitizeContextPayload(input.report);

  const payloadFileName = "llm.input.json";
  const payloadFilePath = path.join(input.runDir, payloadFileName);
  const promptFileName = "llm.prompt.txt";
  const promptFilePath = path.join(input.runDir, promptFileName);

  await writeFile(payloadFilePath, `${JSON.stringify(contextPayload, null, 2)}\n`, "utf-8");
  await writeFile(
    promptFilePath,
    `${buildMainPrompt({
      contextFiles,
      payloadFileName,
      focusUrl: input.report.inputs.brief.focus.primary_url,
    })}\n`,
    "utf-8",
  );

  const firstRun = await runCodexWithPromptFiles({
    runDir: input.runDir,
    promptFilePath,
    payloadFilePath,
  });
  if (!firstRun.ok) {
    await writeFile(path.join(input.runDir, "llm.error.log"), `${firstRun.stderr}\n`, "utf-8");
    return null;
  }

  try {
    const parsed = parseJsonLoose(firstRun.stdout);
    return normalizeLlmOutput(parsed);
  } catch {
    await writeFile(path.join(input.runDir, "llm.raw.txt"), `${firstRun.stdout}\n`, "utf-8");
    const repairPromptFileName = "llm.repair.prompt.txt";
    const repairPromptFilePath = path.join(input.runDir, repairPromptFileName);
    await writeFile(
      repairPromptFilePath,
      `${buildRepairPrompt({
        contextFiles,
        payloadFileName,
        brokenOutputFileName: "llm.raw.txt",
      })}\n`,
      "utf-8",
    );

    const secondRun = await runCodexWithPromptFiles({
      runDir: input.runDir,
      promptFilePath: repairPromptFilePath,
      payloadFilePath,
    });
    if (!secondRun.ok) {
      await writeFile(path.join(input.runDir, "llm.error.log"), `${secondRun.stderr}\n`, "utf-8");
      return null;
    }

    try {
      const repaired = parseJsonLoose(secondRun.stdout);
      return normalizeLlmOutput(repaired);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeFile(path.join(input.runDir, "llm.error.log"), `${message}\n`, "utf-8");
      return null;
    }
  }
}
