import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "vitest";

import { runAuditCommand } from "../run.js";
import { PAGINATED_EXPECTED_PATHS, PAGINATED_SITE_ROUTES } from "../../../test/fixtures/paginated-site.js";
import { createRouteAwareFetchMock } from "../../../test/fixtures/fetch-mock.js";

const createdRunDirs: string[] = [];

afterEach(async () => {
  for (const dir of createdRunDirs.splice(0, createdRunDirs.length)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function normalizePathWithQuery(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

async function listRuns(baseRunsDir: string): Promise<string[]> {
  const entries = await readdir(baseRunsDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("run-")).map((entry) => entry.name).sort();
}

test("runAuditCommand integration captures paginated pages and deduplicated outlinks", async () => {
  const baseUrl = "https://fixture.local";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createRouteAwareFetchMock(baseUrl, PAGINATED_SITE_ROUTES);
  try {
    const result = await runAuditCommand(`${baseUrl}/`, {
      coverage: "surface",
      maxPages: 30,
      depth: 5,
      robots: false,
      format: "json",
      llm: false,
      includeSerp: false,
    });
    createdRunDirs.push(result.runDir);

    const pages = await readJson<
      Array<{
        final_url: string;
        outlinksInternal: Array<{ targetUrl: string; anchorText: string; rel: string; isNavLikely: boolean; occurrences: number }>;
      }>
    >(path.join(result.runDir, "pages.json"));
    assert.ok(
      pages.every((page) => page.outlinksInternal.every((link) => typeof link.occurrences === "number" && link.occurrences >= 1)),
      "each outlinksInternal record should include numeric occurrences",
    );
    assert.ok(
      pages.every((page) => {
        const keys = page.outlinksInternal.map(
          (link) => `${link.targetUrl}\u0000${link.anchorText}\u0000${link.rel}\u0000${link.isNavLikely ? "1" : "0"}`,
        );
        return new Set(keys).size === keys.length;
      }),
      "each page should have deduplicated outlinksInternal records",
    );

    const crawled = new Set(pages.map((page) => normalizePathWithQuery(page.final_url)));
    for (const expectedPath of PAGINATED_EXPECTED_PATHS) {
      assert.ok(crawled.has(expectedPath), `expected page in pages.json: ${expectedPath}`);
    }

    const czytelniaPage = pages.find((page) => normalizePathWithQuery(page.final_url) === "/o-nas/czytelnia");
    assert.ok(czytelniaPage, "expected /o-nas/czytelnia page extract");

    const cennikLinks = czytelniaPage.outlinksInternal.filter((link) => normalizePathWithQuery(link.targetUrl) === "/cennik");
    assert.equal(cennikLinks.length, 1);
    assert.equal(cennikLinks[0].occurrences, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CLI scenario writes report artifacts with consistent internal link summary", async () => {
  const baseUrl = "https://fixture.local";
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const runsDir = path.join(repoRoot, "runs");
  const beforeRuns = await listRuns(runsDir);

  await new Promise<string>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "test/fixtures/run-cli-with-fetch-mock.ts",
        "audit",
        `${baseUrl}/`,
        "--no-robots",
        "--format",
        "json",
        "--depth",
        "5",
        "--max-pages",
        "30",
        "--no-include-serp",
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          SEO_AUDIT_FIXTURE_BASE_URL: baseUrl,
          SEO_AUDIT_FIXTURE_ROUTES_JSON: JSON.stringify(PAGINATED_SITE_ROUTES),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`CLI exited with ${code}. stderr=${stderr}`));
        return;
      }
      resolve(stdout);
    });
    child.on("error", reject);
  });

  const afterRuns = await listRuns(runsDir);
  const createdRunId = afterRuns.find((runId) => !beforeRuns.includes(runId));
  assert.ok(createdRunId, "expected a new run directory from CLI command");
  const runDir = path.join(runsDir, createdRunId);
  createdRunDirs.push(runDir);

  const report = await readJson<{ summary: { internal_links: { orphanPagesCount: number; nearOrphanPagesCount: number } } }>(
    path.join(runDir, "report.json"),
  );
  const pages = await readJson<Array<{ final_url: string }>>(path.join(runDir, "pages.json"));

  const crawled = new Set(pages.map((page) => normalizePathWithQuery(page.final_url)));
  assert.ok(crawled.has("/o-nas/czytelnia?page=3"));
  assert.ok(crawled.has("/o-nas/czytelnia/jak-stres-wplywa-na-nasza-odpornosc"));
  assert.ok(report.summary.internal_links.orphanPagesCount >= 0);
  assert.ok(report.summary.internal_links.nearOrphanPagesCount >= 0);
});
