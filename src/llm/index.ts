import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import type { Action, ProposedFix, Report } from "../report/report-schema.js";

export interface LlmGenerationResult {
  proposed_fixes: ProposedFix[];
  prioritized_actions: Action[];
}

type LlmProvider = "codex" | "openai" | "gemini" | "claude";
type PromptProfile = "cheap" | "quality";

interface LlmRunResult {
  ok: boolean;
  outputText: string;
  errorText: string;
}

interface OutputLimits {
  maxProposedFixes: number;
  maxPrioritizedActions: number;
  maxRationaleChars: number;
}

const PROMPT_VERSION = "v1.2.0";
const COMPACTION_LIMITS = {
  max_issues: 50,
  max_evidence_per_issue: 3,
  max_affected_urls_per_issue: 5,
  max_pages: 120,
} as const;

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

function resolveProvider(): LlmProvider {
  const explicit = process.env.SEO_AUDIT_LLM_PROVIDER?.trim().toLowerCase();
  if (explicit) {
    if (explicit === "codex" || explicit === "openai" || explicit === "gpt" || explicit === "gemini" || explicit === "claude" || explicit === "anthropic") {
      if (explicit === "gpt") {
        return "openai";
      }
      if (explicit === "anthropic") {
        return "claude";
      }
      return explicit;
    }
  }

  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }
  if (process.env.GEMINI_API_KEY) {
    return "gemini";
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return "claude";
  }
  return "codex";
}

function resolvePromptProfile(): PromptProfile {
  const raw = process.env.SEO_AUDIT_LLM_PROMPT_PROFILE?.trim().toLowerCase();
  return raw === "quality" ? "quality" : "cheap";
}

function outputLimitsForProfile(profile: PromptProfile): OutputLimits {
  if (profile === "quality") {
    return {
      maxProposedFixes: 12,
      maxPrioritizedActions: 10,
      maxRationaleChars: 420,
    };
  }

  return {
    maxProposedFixes: 8,
    maxPrioritizedActions: 6,
    maxRationaleChars: 220,
  };
}

function trimText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}

function sanitizeContextPayload(input: {
  report: Report;
  provider: LlmProvider;
  profile: PromptProfile;
  outputLimits: OutputLimits;
}): Record<string, unknown> {
  const report = input.report;

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
    .slice(0, COMPACTION_LIMITS.max_issues)
    .map((issue) => ({
      id: issue.id,
      category: issue.category,
      severity: issue.severity,
      rank: issue.rank,
      title: issue.title,
      description: issue.description,
      recommendation: issue.recommendation,
      tags: [...issue.tags].sort(compareStrings),
      affected_urls: issue.affected_urls.slice(0, COMPACTION_LIMITS.max_affected_urls_per_issue),
      affected_urls_total: issue.affected_urls.length,
      evidence: issue.evidence.slice(0, COMPACTION_LIMITS.max_evidence_per_issue).map((item) => ({
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
    .slice(0, COMPACTION_LIMITS.max_pages)
    .map((page) => ({
      url: page.url,
      final_url: page.final_url,
      status: page.status,
      title: page.title,
      canonical: page.canonical,
    }));

  return {
    meta: {
      prompt_version: PROMPT_VERSION,
      provider: input.provider,
      prompt_profile: input.profile,
      payload_compaction_limits: COMPACTION_LIMITS,
      output_limits: input.outputLimits,
    },
    run_id: report.run_id,
    summary: report.summary,
    focus: report.inputs.brief.focus,
    issue_count_total: report.issues.length,
    issues: compactIssues,
    page_count_total: report.pages.length,
    pages: compactPages,
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

function toActionArray(value: unknown, limits: OutputLimits): Action[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed: Action[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? trimText(record.title, 120) : null;
    const impact = record.impact === "high" || record.impact === "medium" || record.impact === "low" ? record.impact : null;
    const effort = record.effort === "high" || record.effort === "medium" || record.effort === "low" ? record.effort : null;
    const rationale = typeof record.rationale === "string" ? trimText(record.rationale, limits.maxRationaleChars) : null;
    if (title && impact && effort && rationale) {
      parsed.push({ title, impact, effort, rationale });
    }
  }
  return parsed.slice(0, limits.maxPrioritizedActions);
}

function toProposedFixArray(input: {
  value: unknown;
  limits: OutputLimits;
  validIssueIds: Set<string>;
  validPageUrls: Set<string>;
}): ProposedFix[] {
  if (!Array.isArray(input.value)) {
    return [];
  }
  const parsed: ProposedFix[] = [];
  for (const item of input.value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const issueId = typeof record.issue_id === "string" ? record.issue_id : null;
    const pageUrl = typeof record.page_url === "string" ? record.page_url : null;
    const proposal = typeof record.proposal === "string" ? trimText(record.proposal, 280) : null;
    const rationale = typeof record.rationale === "string" ? trimText(record.rationale, input.limits.maxRationaleChars) : null;

    // Evidence-only guard: issue/page must map to known payload entities.
    if (!issueId || !pageUrl || !input.validIssueIds.has(issueId) || !input.validPageUrls.has(pageUrl)) {
      continue;
    }

    if (proposal && rationale) {
      parsed.push({
        issue_id: issueId,
        page_url: pageUrl,
        proposal,
        rationale,
      });
    }
  }
  return parsed.slice(0, input.limits.maxProposedFixes);
}

function normalizeLlmOutput(input: {
  raw: unknown;
  limits: OutputLimits;
  report: Report;
}): LlmGenerationResult {
  if (!input.raw || typeof input.raw !== "object") {
    return { proposed_fixes: [], prioritized_actions: [] };
  }

  const validIssueIds = new Set(input.report.issues.map((issue) => issue.id));
  const validPageUrls = new Set(input.report.pages.map((page) => page.url));
  const record = input.raw as Record<string, unknown>;

  const proposedFixes = toProposedFixArray({
    value: record.proposed_fixes,
    limits: input.limits,
    validIssueIds,
    validPageUrls,
  });
  const proposedFixesAlt =
    proposedFixes.length > 0
      ? proposedFixes
      : toProposedFixArray({
          value: record.proposedFixes,
          limits: input.limits,
          validIssueIds,
          validPageUrls,
        });
  const proposedFixesFinal =
    proposedFixesAlt.length > 0
      ? proposedFixesAlt
      : toProposedFixArray({
          value: record.focus_proposals,
          limits: input.limits,
          validIssueIds,
          validPageUrls,
        });

  const prioritizedActions = toActionArray(record.prioritized_actions, input.limits);
  const prioritizedActionsAlt = prioritizedActions.length > 0 ? prioritizedActions : toActionArray(record.prioritizedActions, input.limits);
  const prioritizedActionsFinal = prioritizedActionsAlt.length > 0 ? prioritizedActionsAlt : toActionArray(record.global_actions, input.limits);

  return {
    proposed_fixes: proposedFixesFinal,
    prioritized_actions: prioritizedActionsFinal,
  };
}

function providerInstruction(provider: LlmProvider): string {
  if (provider === "codex") {
    return "Provider note: You can read local files in run directory. Keep output JSON-only.";
  }
  return "Provider note: NO markdown, NO prose wrapper, NO code fences. JSON object only.";
}

function buildMainPrompt(input: {
  contextFiles: string[];
  payloadFileName: string;
  focusUrl: string | null;
  provider: LlmProvider;
  profile: PromptProfile;
  outputLimits: OutputLimits;
}): string {
  const focusRules = input.focusUrl
    ? [
        "FOCUS_RULES:",
        `- Focus page: ${input.focusUrl}`,
        '- Prefer issues tagged as "focus" and "inlink" when proposing fixes.',
      ]
    : ["FOCUS_RULES:", "- No focus page provided. Generate only site-wide proposals."];

  return [
    "SYSTEM_RULES:",
    "- STRICT JSON only.",
    "- No claims without evidence from payload.",
    "- If evidence is insufficient, omit candidate.",
    `- Prompt profile: ${input.profile}.`,
    providerInstruction(input.provider),
    "",
    "TASK_RULES:",
    `- Generate up to ${input.outputLimits.maxProposedFixes} proposed_fixes.`,
    `- Generate up to ${input.outputLimits.maxPrioritizedActions} prioritized_actions.`,
    `- Keep each rationale <= ${input.outputLimits.maxRationaleChars} chars.`,
    "- Use only payload evidence and issue/page mapping.",
    "",
    ...focusRules,
    "",
    "OUTPUT_CONTRACT (must match):",
    "{",
    '  "proposed_fixes": [',
    '    { "issue_id": "string", "page_url": "string", "proposal": "string", "rationale": "string" }',
    "  ],",
    '  "prioritized_actions": [',
    '    { "title": "string", "impact": "high|medium|low", "effort": "high|medium|low", "rationale": "string" }',
    "  ]",
    "}",
    "",
    "CONTEXT_FILES:",
    ...input.contextFiles.map((filePath) => `- ${filePath}`),
    "",
    `INPUT_PAYLOAD_FILE: ${input.payloadFileName}`,
  ].join("\n");
}

function buildRepairPrompt(input: {
  contextFiles: string[];
  payloadFileName: string;
  brokenOutputFileName: string;
  provider: LlmProvider;
}): string {
  return [
    "SYSTEM_RULES:",
    "- Repair invalid model output into STRICT JSON.",
    "- Output only JSON object, no markdown, no wrappers.",
    providerInstruction(input.provider),
    "",
    "OUTPUT_CONTRACT:",
    "{",
    '  "proposed_fixes": [',
    '    { "issue_id": "string", "page_url": "string", "proposal": "string", "rationale": "string" }',
    "  ],",
    '  "prioritized_actions": [',
    '    { "title": "string", "impact": "high|medium|low", "effort": "high|medium|low", "rationale": "string" }',
    "  ]",
    "}",
    "",
    "CONTEXT_FILES:",
    ...input.contextFiles.map((filePath) => `- ${filePath}`),
    `PAYLOAD_FILE: ${input.payloadFileName}`,
    `BROKEN_OUTPUT_FILE: ${input.brokenOutputFileName}`,
  ].join("\n");
}

function extractOpenAiText(responseBody: unknown): string {
  const root = responseBody as Record<string, unknown>;
  const choices = Array.isArray(root.choices) ? (root.choices as Array<Record<string, unknown>>) : [];
  const first = choices[0];
  const message = first?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  return typeof content === "string" ? content : "";
}

async function runOpenAiApi(promptText: string): Promise<LlmRunResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, outputText: "", errorText: "OPENAI_API_KEY is not set." };
  }

  const model = process.env.SEO_AUDIT_OPENAI_MODEL ?? "gpt-4o-mini";
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: "Return STRICT JSON only." },
          { role: "user", content: promptText },
        ],
      }),
    });
    const raw = (await response.text()) || "";
    if (!response.ok) {
      return { ok: false, outputText: "", errorText: raw };
    }
    const parsed = JSON.parse(raw) as unknown;
    const content = extractOpenAiText(parsed);
    return { ok: true, outputText: content, errorText: "" };
  } catch (error) {
    return { ok: false, outputText: "", errorText: error instanceof Error ? error.message : String(error) };
  }
}

function extractGeminiText(responseBody: unknown): string {
  const root = responseBody as Record<string, unknown>;
  const candidates = Array.isArray(root.candidates) ? (root.candidates as Array<Record<string, unknown>>) : [];
  const first = candidates[0] ?? {};
  const content = first.content as Record<string, unknown> | undefined;
  const parts = Array.isArray(content?.parts) ? (content?.parts as Array<Record<string, unknown>>) : [];
  return parts.map((part) => (typeof part.text === "string" ? part.text : "")).join("\n");
}

async function runGeminiApi(promptText: string): Promise<LlmRunResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, outputText: "", errorText: "GEMINI_API_KEY is not set." };
  }

  const model = process.env.SEO_AUDIT_GEMINI_MODEL ?? "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0,
        },
      }),
    });
    const raw = (await response.text()) || "";
    if (!response.ok) {
      return { ok: false, outputText: "", errorText: raw };
    }
    const parsed = JSON.parse(raw) as unknown;
    return { ok: true, outputText: extractGeminiText(parsed), errorText: "" };
  } catch (error) {
    return { ok: false, outputText: "", errorText: error instanceof Error ? error.message : String(error) };
  }
}

function extractClaudeText(responseBody: unknown): string {
  const root = responseBody as Record<string, unknown>;
  const content = Array.isArray(root.content) ? (root.content as Array<Record<string, unknown>>) : [];
  return content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("\n");
}

async function runClaudeApi(promptText: string): Promise<LlmRunResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, outputText: "", errorText: "ANTHROPIC_API_KEY is not set." };
  }

  const model = process.env.SEO_AUDIT_CLAUDE_MODEL ?? "claude-3-5-sonnet-latest";
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2500,
        temperature: 0,
        messages: [{ role: "user", content: promptText }],
      }),
    });
    const raw = (await response.text()) || "";
    if (!response.ok) {
      return { ok: false, outputText: "", errorText: raw };
    }
    const parsed = JSON.parse(raw) as unknown;
    return { ok: true, outputText: extractClaudeText(parsed), errorText: "" };
  } catch (error) {
    return { ok: false, outputText: "", errorText: error instanceof Error ? error.message : String(error) };
  }
}

async function runCodexExec(input: {
  runDir: string;
  promptText: string;
  payloadFileName: string;
}): Promise<LlmRunResult> {
  const command = process.env.SEO_AUDIT_CODEX_CMD ?? "codex";
  const outputFileName = "llm.codex.last-message.txt";
  const outputFilePath = path.join(input.runDir, outputFileName);

  const strategies: Array<{ args: string[]; stdinText: string | null }> = [
    {
      args: ["exec", "-", "--output-last-message", outputFileName, "--skip-git-repo-check"],
      stdinText: `${input.promptText.trim()}\n\nPayload file: ${input.payloadFileName}\n`,
    },
    {
      args: ["exec", "-", "--output-last-message", outputFileName],
      stdinText: `${input.promptText.trim()}\n\nPayload file: ${input.payloadFileName}\n`,
    },
    {
      args: ["exec", input.promptText.trim(), "--output-last-message", outputFileName, "--skip-git-repo-check"],
      stdinText: null,
    },
  ];

  let lastError = "Failed to execute codex CLI using supported argument patterns.";
  for (const strategy of strategies) {
    const result = await new Promise<LlmRunResult>((resolve) => {
      const child = spawn(command, strategy.args, {
        cwd: input.runDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stderr = "";
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        resolve({
          ok: false,
          outputText: "",
          errorText: `${stderr}\n${error.message}`.trim(),
        });
      });

      child.on("close", async (code) => {
        if (code !== 0) {
          resolve({
            ok: false,
            outputText: "",
            errorText: stderr.trim(),
          });
          return;
        }

        try {
          const lastMessage = await readFile(outputFilePath, "utf-8");
          resolve({
            ok: true,
            outputText: lastMessage,
            errorText: stderr.trim(),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          resolve({
            ok: false,
            outputText: "",
            errorText: `${stderr}\n${message}`.trim(),
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
    if (result.errorText.length > 0) {
      lastError = result.errorText;
    }
  }

  return {
    ok: false,
    outputText: "",
    errorText: lastError,
  };
}

async function runProviderPrompt(input: {
  provider: LlmProvider;
  runDir: string;
  promptText: string;
  payloadFileName: string;
  payloadJsonText: string;
}): Promise<LlmRunResult> {
  if (input.provider === "codex") {
    return await runCodexExec({
      runDir: input.runDir,
      promptText: input.promptText,
      payloadFileName: input.payloadFileName,
    });
  }

  const promptWithPayload = [input.promptText, "", "Payload JSON (compact):", input.payloadJsonText].join("\n");

  if (input.provider === "openai") {
    return await runOpenAiApi(promptWithPayload);
  }
  if (input.provider === "gemini") {
    return await runGeminiApi(promptWithPayload);
  }
  return await runClaudeApi(promptWithPayload);
}

export async function generateOptionalLlmProposals(input: {
  runDir: string;
  report: Report;
}): Promise<LlmGenerationResult | null> {
  const provider = resolveProvider();
  const profile = resolvePromptProfile();
  const outputLimits = outputLimitsForProfile(profile);

  await writeFile(path.join(input.runDir, "llm.provider.txt"), `${provider}\n`, "utf-8");
  await writeFile(path.join(input.runDir, "llm.prompt.version.txt"), `${PROMPT_VERSION}\n`, "utf-8");

  const contextFiles = [
    path.join(process.cwd(), "docs", "seo-values.md"),
    path.join(process.cwd(), "docs", "report-schema.md"),
    path.join(process.cwd(), "docs", "workflow.md"),
  ];

  const contextPayload = sanitizeContextPayload({
    report: input.report,
    provider,
    profile,
    outputLimits,
  });
  const payloadJsonText = JSON.stringify(contextPayload, null, 2);

  const payloadFileName = "llm.input.json";
  const payloadFilePath = path.join(input.runDir, payloadFileName);
  const promptFileName = "llm.prompt.txt";
  const promptFilePath = path.join(input.runDir, promptFileName);

  await writeFile(payloadFilePath, `${payloadJsonText}\n`, "utf-8");
  const mainPrompt = buildMainPrompt({
    contextFiles,
    payloadFileName,
    focusUrl: input.report.inputs.brief.focus.primary_url,
    provider,
    profile,
    outputLimits,
  });
  await writeFile(promptFilePath, `${mainPrompt}\n`, "utf-8");

  const firstRun = await runProviderPrompt({
    provider,
    runDir: input.runDir,
    promptText: mainPrompt,
    payloadFileName,
    payloadJsonText,
  });
  if (!firstRun.ok) {
    await writeFile(path.join(input.runDir, "llm.error.log"), `${firstRun.errorText}\n`, "utf-8");
    return null;
  }

  try {
    const parsed = parseJsonLoose(firstRun.outputText);
    return normalizeLlmOutput({
      raw: parsed,
      limits: outputLimits,
      report: input.report,
    });
  } catch {
    await writeFile(path.join(input.runDir, "llm.raw.txt"), `${firstRun.outputText}\n`, "utf-8");
    const repairPromptFileName = "llm.repair.prompt.txt";
    const repairPromptFilePath = path.join(input.runDir, repairPromptFileName);
    const repairPrompt = buildRepairPrompt({
      contextFiles,
      payloadFileName,
      brokenOutputFileName: "llm.raw.txt",
      provider,
    });
    await writeFile(repairPromptFilePath, `${repairPrompt}\n`, "utf-8");

    const secondRun = await runProviderPrompt({
      provider,
      runDir: input.runDir,
      promptText: repairPrompt,
      payloadFileName,
      payloadJsonText,
    });
    if (!secondRun.ok) {
      await writeFile(path.join(input.runDir, "llm.error.log"), `${secondRun.errorText}\n`, "utf-8");
      return null;
    }

    try {
      const repaired = parseJsonLoose(secondRun.outputText);
      return normalizeLlmOutput({
        raw: repaired,
        limits: outputLimits,
        report: input.report,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeFile(path.join(input.runDir, "llm.error.log"), `${message}\n`, "utf-8");
      return null;
    }
  }
}
