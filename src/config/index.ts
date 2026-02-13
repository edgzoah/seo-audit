import { readFile } from "node:fs/promises";
import path from "node:path";

import type { SeoAuditConfig } from "./defaults.js";
import { DEFAULT_CONFIG } from "./defaults.js";

export * from "./defaults.js";
export * from "./init.js";

export async function loadConfig(baseDir: string = process.cwd()): Promise<SeoAuditConfig> {
  const configPath = path.join(baseDir, "seo-audit.config.json");

  try {
    const raw = await readFile(configPath, "utf-8");
    return JSON.parse(raw) as SeoAuditConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}
