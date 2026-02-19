#!/usr/bin/env node

import { Command, InvalidArgumentError } from "commander";

import { runAuditCommand, type AuditCliOptions, type AuditProgressEvent } from "./audit/run.js";
import { initWorkspace } from "./config/index.js";
import { loadDiffFromRuns, loadReportFromRun, renderDiff, renderReport, type CoverageMode, type ReportFormat } from "./report/index.js";

function parseReportFormat(value: string): ReportFormat {
  if (value === "json" || value === "md" || value === "llm") {
    return value;
  }

  throw new InvalidArgumentError("Format must be one of: json, md, llm");
}

function parseCoverageMode(value: string): CoverageMode {
  if (value === "quick" || value === "surface" || value === "full") {
    return value;
  }

  throw new InvalidArgumentError("Coverage must be one of: quick, surface, full");
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Value must be a positive integer");
  }

  return parsed;
}

function printCliError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
}

function buildProgressRenderer(): { update: (event: AuditProgressEvent) => void; finish: () => void } {
  let lastLineLength = 0;
  const width = 26;
  const isTty = Boolean(process.stdout.isTTY);

  const update = (event: AuditProgressEvent): void => {
    if (!isTty) {
      return;
    }
    const percent = Math.max(0, Math.min(100, event.percent));
    const filled = Math.round((percent / 100) * width);
    const bar = `${"=".repeat(filled)}${"-".repeat(Math.max(0, width - filled))}`;
    const line = `[${bar}] ${String(percent).padStart(3, " ")}% ${event.stage} ${event.detail}`;
    const padded = line.padEnd(Math.max(lastLineLength, line.length), " ");
    process.stdout.write(`\r${padded}`);
    lastLineLength = padded.length;
  };

  const finish = (): void => {
    if (!isTty) {
      return;
    }
    if (lastLineLength > 0) {
      process.stdout.write("\n");
    }
  };

  return { update, finish };
}

async function run(): Promise<void> {
  const program = new Command();

  program
    .name("seo-audit")
    .description("SEO audit CLI")
    .version("0.1.0");

  program
    .command("init")
    .description("Initialize seo-audit workspace")
    .action(async () => {
      const result = await initWorkspace();

      if (result.created.length > 0) {
        console.log("Created:");
        for (const filePath of result.created) {
          console.log(`- ${filePath}`);
        }
      }

      if (result.skipped.length > 0) {
        console.log("Skipped (already exists):");
        for (const filePath of result.skipped) {
          console.log(`- ${filePath}`);
        }
      }
    });

  program
    .command("audit")
    .description("Run an audit for the given URL or local path")
    .argument("<url-or-path>", "Target URL or local path")
    .option("-C, --coverage <mode>", "Coverage mode: quick|surface|full", parseCoverageMode)
    .option("-m, --max-pages <n>", "Maximum number of pages", parsePositiveInteger)
    .option("--depth <n>", "Maximum crawl depth", parsePositiveInteger)
    .option("--format <format>", "Report format: json|md|llm", parseReportFormat)
    .option("--refresh", "Refresh cached inputs for this run")
    .option("--headless", "Use headless rendering mode")
    .option("--no-robots", "Disable robots.txt restrictions")
    .option("--llm", "Enable optional LLM proposals")
    .option("--baseline <run-id>", "Baseline run ID for regression comparison")
    .option("--brief <path>", "Path to pre-audit brief markdown file")
    .option("--focus-url <url-or-path>", "Primary focus page URL or path")
    .option("--focus-keyword <keyword>", "Primary focus keyword")
    .option("--focus-goal <goal>", "Primary focus goal")
    .option("--constraints <items>", "Semicolon-separated constraints (e.g. c1;c2;c3)")
    .option("--lighthouse", "Enable Lighthouse performance measurement for focus/home")
    .option("--focus-inlinks-threshold <n>", "Minimum focus inlinks threshold", parsePositiveInteger)
    .option("--service-min-words <n>", "Minimum words for service pages", parsePositiveInteger)
    .option("--generic-anchors <path>", "Path to custom generic anchor list (newline/comma separated)")
    .option("--no-include-serp", "Disable SERP/intent-related deterministic rules")
    .option("--no-db-write", "Disable writing audit result into PostgreSQL")
    .action(async (target: string, options: AuditCliOptions) => {
      const progress = buildProgressRenderer();
      try {
        const result = await runAuditCommand(target, {
          ...options,
          onProgress: progress.update,
        });
        progress.finish();
        console.log(`Run ID: ${result.runId}`);
        console.log(`Run directory: ${result.runDir}`);
        console.log(`Pages extract: ${result.runDir}/pages.json`);
        console.log(`Issues: ${result.runDir}/issues.json (${result.issues.length})`);
        console.log(`Canonical report: ${result.runDir}/report.json`);
        console.log(`Markdown report: ${result.runDir}/report.md`);
        console.log(`LLM report: ${result.runDir}/report.llm.txt`);
        console.log(`HTML report: ${result.runDir}/report.html`);
        console.log(`Inputs: ${result.runDir}/inputs.json`);
      } finally {
        progress.finish();
      }
    });

  program
    .command("report")
    .description("Generate a report for an existing run")
    .argument("<run-id>", "Audit run identifier")
    .requiredOption("--format <format>", "Output format: json|md|llm", parseReportFormat)
    .action(async (runId: string, options: { format: ReportFormat }) => {
      const report = await loadReportFromRun(runId);
      const output = renderReport(report, options.format);
      process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
    });

  program
    .command("diff")
    .description("Generate a diff between baseline and current runs")
    .argument("<baseline-run-id>", "Baseline run identifier")
    .argument("<current-run-id>", "Current run identifier")
    .requiredOption("--format <format>", "Output format: json|md|llm", parseReportFormat)
    .action(async (baselineRunId: string, currentRunId: string, options: { format: ReportFormat }) => {
      const diff = await loadDiffFromRuns(baselineRunId, currentRunId);
      const output = renderDiff(diff, options.format);
      process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
    });

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    printCliError(error);
    process.exitCode = 1;
  }
}

run().catch((error) => {
  printCliError(error);
  process.exit(1);
});
