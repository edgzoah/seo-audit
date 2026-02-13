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
    "## Config defaults",
    "",
    "- `defaults.sitemap_urls: string[]` allows adding explicit sitemap endpoints for seed discovery.",
    "",
    "## Seed discovery behavior (STEP 1)",
    "",
    "- Start URL is always a seed.",
    "- Additional seeds can come from `robots.txt` sitemap entries, `/sitemap.xml`, and `defaults.sitemap_urls`.",
    "- `allowed_domains`, `include_patterns`, and `exclude_patterns` are applied deterministically.",
    "- In `quick` coverage, seeds are capped by `max_pages` with start URL first.",
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
