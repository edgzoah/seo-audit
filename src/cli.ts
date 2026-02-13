#!/usr/bin/env node

import { Command, InvalidArgumentError } from "commander";

import { runAuditCommand } from "./audit/run.js";
import { initWorkspace } from "./config/index.js";
import { loadReportFromRun, renderReport, type ReportFormat } from "./report/index.js";

function parseReportFormat(value: string): ReportFormat {
  if (value === "json" || value === "md" || value === "llm") {
    return value;
  }

  throw new InvalidArgumentError("Format must be one of: json, md, llm");
}

function printCliError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
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
    .description("Run an audit for the given URL")
    .argument("<url>", "Target URL")
    .action(async (url: string) => {
      const result = await runAuditCommand(url);
      console.log(`Run ID: ${result.runId}`);
      console.log(`Run directory: ${result.runDir}`);
      console.log(`Pages extract: ${result.runDir}/pages.json`);
      console.log(`Issues: ${result.runDir}/issues.json (${result.issues.length})`);
      console.log(`Canonical report: ${result.runDir}/report.json`);
      console.log(`Markdown report: ${result.runDir}/report.md`);
      console.log(`LLM report: ${result.runDir}/report.llm.txt`);
      console.log(`Inputs: ${result.runDir}/inputs.json`);
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
