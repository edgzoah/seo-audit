import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_CONFIG } from "./defaults.js";

const DOC_TEMPLATES: Record<string, string> = {
  "seo-values.md": [
    "# SEO Values",
    "",
    "Core priorities for this project:",
    "- Indexability and crawlability first",
    "- Content clarity and intent match",
    "- Technical stability and security",
  ].join("\n"),
  "audit-inputs.md": [
    "# Audit Inputs",
    "",
    "Document expected input fields for `AuditInputs`.",
    "Capture project defaults and allowed overrides here.",
  ].join("\n"),
  "report-schema.md": [
    "# Report Schema",
    "",
    "Canonical report shape is defined in `src/report/report-schema.ts`.",
    "Keep this file as a human-readable companion.",
  ].join("\n"),
  "workflow.md": [
    "# Workflow",
    "",
    "1. `seo-audit init`",
    "2. `seo-audit audit <url>`",
    "3. `seo-audit report <run-id> --format md|json|llm`",
  ].join("\n"),
};

export interface InitWorkspaceResult {
  created: string[];
  skipped: string[];
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function initWorkspace(baseDir: string = process.cwd()): Promise<InitWorkspaceResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  const configPath = path.join(baseDir, "seo-audit.config.json");
  const docsDir = path.join(baseDir, "docs");

  await mkdir(docsDir, { recursive: true });

  if (await fileExists(configPath)) {
    skipped.push("seo-audit.config.json");
  } else {
    await writeFile(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf-8");
    created.push("seo-audit.config.json");
  }

  for (const [fileName, content] of Object.entries(DOC_TEMPLATES)) {
    const fullPath = path.join(docsDir, fileName);
    const relativePath = path.join("docs", fileName);

    if (await fileExists(fullPath)) {
      skipped.push(relativePath);
      continue;
    }

    await writeFile(fullPath, `${content}\n`, "utf-8");
    created.push(relativePath);
  }

  return { created, skipped };
}
