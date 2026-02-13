import type { Evidence, Issue, IssueSeverity, PageExtract } from "../report/report-schema.js";

const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  error: 3,
  warning: 2,
  notice: 1,
};

function createIssue(input: {
  id: Issue["id"];
  category: Issue["category"];
  severity: Issue["severity"];
  rank: Issue["rank"];
  title: Issue["title"];
  description: Issue["description"];
  affectedUrl: string;
  evidence: Evidence[];
  recommendation: Issue["recommendation"];
}): Issue {
  return {
    id: input.id,
    category: input.category,
    severity: input.severity,
    rank: input.rank,
    title: input.title,
    description: input.description,
    affected_urls: [input.affectedUrl],
    evidence: input.evidence,
    recommendation: input.recommendation,
    tags: ["global"],
  };
}

export function sortIssuesDeterministic(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const severityDelta = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }

    const rankDelta = b.rank - a.rank;
    if (rankDelta !== 0) {
      return rankDelta;
    }

    return a.id.localeCompare(b.id, "en");
  });
}

export function runRules(page: PageExtract): Issue[] {
  const issues: Issue[] = [];

  if (!page.title || page.title.trim().length === 0) {
    issues.push(
      createIssue({
        id: "missing_title",
        category: "seo",
        severity: "error",
        rank: 9,
        title: "Missing <title>",
        description: "Page does not define a title tag.",
        affectedUrl: page.url,
        evidence: [
          {
            type: "content",
            message: "No <title> text extracted.",
            url: page.url,
            details: {
              selector: "title",
              extracted_value: page.title,
            },
          },
        ],
        recommendation: "Add a unique, descriptive <title> tag.",
      }),
    );
  }

  if (!page.meta_description || page.meta_description.trim().length === 0) {
    issues.push(
      createIssue({
        id: "missing_description",
        category: "seo",
        severity: "warning",
        rank: 7,
        title: "Missing meta description",
        description: "Page does not define a meta description.",
        affectedUrl: page.url,
        evidence: [
          {
            type: "content",
            message: "No meta description extracted.",
            url: page.url,
            details: {
              selector: "meta[name='description']",
              extracted_value: page.meta_description,
            },
          },
        ],
        recommendation: "Add a concise meta description aligned with search intent.",
      }),
    );
  }

  const h1Count = page.headings_outline.filter((heading) => heading.level === 1).length;
  if (h1Count === 0) {
    issues.push(
      createIssue({
        id: "missing_h1",
        category: "content",
        severity: "warning",
        rank: 6,
        title: "Missing H1 heading",
        description: "Page does not include an H1 heading.",
        affectedUrl: page.url,
        evidence: [
          {
            type: "content",
            message: "No heading with level=1 in extracted outline.",
            url: page.url,
            details: {
              selector: "h1",
              extracted_h1_count: h1Count,
              outline_sample: page.headings_outline.slice(0, 5),
            },
          },
        ],
        recommendation: "Add one clear H1 reflecting the page topic.",
      }),
    );
  }

  if (page.meta_robots && /(^|[\s,])noindex([\s,]|$)/i.test(page.meta_robots)) {
    issues.push(
      createIssue({
        id: "meta_noindex",
        category: "indexability",
        severity: "error",
        rank: 10,
        title: "Meta robots contains noindex",
        description: "Page is marked as non-indexable by meta robots.",
        affectedUrl: page.url,
        evidence: [
          {
            type: "content",
            message: "Detected noindex token in meta robots.",
            url: page.url,
            details: {
              selector: "meta[name='robots']",
              extracted_value: page.meta_robots,
            },
          },
        ],
        recommendation: "Remove noindex if the page should appear in search results.",
      }),
    );
  }

  if (!page.canonical || page.canonical.trim().length === 0) {
    issues.push(
      createIssue({
        id: "missing_canonical",
        category: "seo",
        severity: "notice",
        rank: 4,
        title: "Missing canonical URL",
        description: "Page does not define rel=canonical.",
        affectedUrl: page.url,
        evidence: [
          {
            type: "content",
            message: "No canonical link extracted.",
            url: page.url,
            details: {
              selector: "link[rel='canonical']",
              extracted_value: page.canonical,
            },
          },
        ],
        recommendation: "Add rel=canonical pointing to the preferred URL.",
      }),
    );
  }

  if (page.schema.json_parse_failures.length > 0) {
    issues.push(
      createIssue({
        id: "invalid_jsonld",
        category: "schema",
        severity: "warning",
        rank: 7,
        title: "Invalid JSON-LD detected",
        description: "At least one JSON-LD block could not be parsed.",
        affectedUrl: page.url,
        evidence: page.schema.json_parse_failures.map((failure, index) => ({
          type: "schema",
          message: failure,
          url: page.url,
          details: {
            selector: "script[type='application/ld+json']",
            block_index: index,
            fragment: page.schema.jsonld_blocks[index]?.slice(0, 240) ?? "",
          },
        })),
        recommendation: "Fix JSON syntax and validate structured data blocks.",
      }),
    );
  }

  return sortIssuesDeterministic(issues);
}
