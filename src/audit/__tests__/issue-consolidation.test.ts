import assert from "node:assert/strict";
import { test } from "vitest";

import { consolidateIssues } from "../run.js";
import type { Issue } from "../../report/report-schema.js";

function makeIssue(input: Partial<Issue> & Pick<Issue, "id" | "title">): Issue {
  return {
    id: input.id,
    category: input.category ?? "seo",
    severity: input.severity ?? "warning",
    rank: input.rank ?? 5,
    title: input.title,
    description: input.description ?? "desc",
    affected_urls: input.affected_urls ?? [],
    evidence: input.evidence ?? [],
    recommendation: input.recommendation ?? "rec",
    tags: input.tags ?? [],
  };
}

test("consolidateIssues merges repeated issues and unions affected URLs/tags/evidence", () => {
  const input: Issue[] = [
    makeIssue({
      id: "missing_security_headers",
      title: "Missing security headers",
      affected_urls: ["https://example.com/a"],
      tags: ["inlink"],
      evidence: [{ type: "security", message: "Missing headers on /a" }],
      rank: 5,
    }),
    makeIssue({
      id: "missing_security_headers",
      title: "Missing security headers",
      affected_urls: ["https://example.com/b"],
      tags: ["focus"],
      evidence: [{ type: "security", message: "Missing headers on /b" }],
      rank: 8,
    }),
  ];

  const result = consolidateIssues(input);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].affected_urls, ["https://example.com/a", "https://example.com/b"]);
  assert.deepEqual(result[0].tags, ["focus", "inlink"]);
  assert.equal(result[0].evidence.length, 2);
  assert.equal(result[0].rank, 8);
});

test("consolidateIssues keeps distinct issues when core identity differs", () => {
  const input: Issue[] = [
    makeIssue({
      id: "duplicate_title",
      title: "Duplicate titles detected",
      description: "d1",
      affected_urls: ["https://example.com/a"],
    }),
    makeIssue({
      id: "duplicate_title",
      title: "Duplicate titles detected",
      description: "d2",
      affected_urls: ["https://example.com/b"],
    }),
  ];

  const result = consolidateIssues(input);
  assert.equal(result.length, 2);
});
