import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import type { Action, LlmProposalPacks, PageExtract, ProposedFix, Report } from "../report/report-schema.js";

export interface LlmGenerationResult {
  proposed_fixes: ProposedFix[];
  prioritized_actions: Action[];
  proposed_packs?: LlmProposalPacks;
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

function normalizeUrl(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
}

function findFocusPage(report: Report): PageExtract | null {
  const focusUrl = normalizeUrl(report.inputs.brief.focus.primary_url);
  if (!focusUrl || !report.page_extracts) {
    return null;
  }
  return report.page_extracts.find((page) => normalizeUrl(page.final_url) === focusUrl || normalizeUrl(page.url) === focusUrl) ?? null;
}

function buildFocusNeighborhood(report: Report, focusPage: PageExtract | null): Array<{ url: string; title: string | null; topHeadings: string[] }> {
  if (!focusPage || !report.page_extracts) {
    return [];
  }

  const sourceScores = new Map<string, number>();
  for (const page of report.page_extracts) {
    for (const link of page.outlinksInternal) {
      if (normalizeUrl(link.targetUrl) === normalizeUrl(focusPage.final_url)) {
        sourceScores.set(page.final_url, (sourceScores.get(page.final_url) ?? 0) + 1);
      }
    }
  }

  const topSources = Array.from(sourceScores.entries())
    .sort((a, b) => {
      const countDelta = b[1] - a[1];
      if (countDelta !== 0) {
        return countDelta;
      }
      return compareStrings(a[0], b[0]);
    })
    .slice(0, 10)
    .map(([url]) => url);

  return topSources
    .map((url) => report.page_extracts?.find((page) => page.final_url === url || page.url === url))
    .filter((page): page is PageExtract => Boolean(page))
    .map((page) => ({
      url: page.final_url,
      title: page.titleText || page.title,
      topHeadings: page.headings_outline.slice(0, 5).map((item) => item.text),
    }));
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

function normalizeAnchorText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

function sanitizeContextPayload(input: {
  report: Report;
  provider: LlmProvider;
  profile: PromptProfile;
  outputLimits: OutputLimits;
}): Record<string, unknown> {
  const report = input.report;
  const focusPage = findFocusPage(report);
  const focusNeighborhood = buildFocusNeighborhood(report, focusPage);
  const focusIssueIds = new Set(
    report.issues.filter((issue) => issue.tags.includes("focus") || issue.tags.includes("inlink")).map((issue) => issue.id),
  );

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
    focus_page_extract: focusPage
      ? {
          url: focusPage.url,
          final_url: focusPage.final_url,
          titleText: focusPage.titleText,
          headingTextConcat: focusPage.headingTextConcat,
          mainText: trimText(focusPage.mainText, 4000),
          headings_outline: focusPage.headings_outline.slice(0, 20),
          inlinksCount: focusPage.inlinksCount,
          inlinksAnchorsTop: focusPage.inlinksAnchorsTop.slice(0, 10),
          outlinksInternal: focusPage.outlinksInternal.slice(0, 40),
          outlinksExternal: focusPage.outlinksExternal.slice(0, 20),
          schemaTypesDetected: focusPage.schemaTypesDetected,
          htmlLang: focusPage.htmlLang,
          lighthouse: focusPage.lighthouse ?? null,
        }
      : null,
    focus_internal_link_neighborhood: focusNeighborhood,
    focus_and_global_priority_issues: compactIssues
      .filter((issue) => focusIssueIds.has(issue.id))
      .concat(compactIssues.slice(0, 10))
      .slice(0, 20),
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

function toActionArray(value: unknown, limits: OutputLimits, validIssueIds: Set<string>): Action[] {
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
    const issueIdsFromArray = Array.isArray(record.issue_ids)
      ? record.issue_ids.filter((id): id is string => typeof id === "string" && validIssueIds.has(id))
      : [];
    const issueIdSingle = typeof record.issue_id === "string" && validIssueIds.has(record.issue_id) ? [record.issue_id] : [];
    const issueIds = Array.from(new Set([...issueIdsFromArray, ...issueIdSingle]));
    if (title && impact && effort && rationale && issueIds.length > 0) {
      parsed.push({ title, impact, effort, rationale, issue_ids: issueIds });
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

function toStringArray(value: unknown, maxItems: number, maxChars = 180): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => trimText(item, maxChars))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function toProposedPacks(input: { value: unknown; report: Report }): LlmProposalPacks | undefined {
  const value = input.value;
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const root = value as Record<string, unknown>;
  const packs: LlmProposalPacks = {};
  const focusUrl = normalizeUrl(input.report.summary.focus?.primary_url ?? null);
  const existingFocusLinksBySource = new Map<
    string,
    {
      hasNonNavLinkToFocus: boolean;
      anchors: Set<string>;
    }
  >();

  if (focusUrl && input.report.page_extracts) {
    for (const page of input.report.page_extracts) {
      const sourceUrl = normalizeUrl(page.final_url) ?? normalizeUrl(page.url);
      if (!sourceUrl) {
        continue;
      }
      for (const outlink of page.outlinksInternal) {
        let targetUrl: string | null = null;
        try {
          targetUrl = new URL(outlink.targetUrl, page.final_url).toString();
        } catch {
          targetUrl = normalizeUrl(outlink.targetUrl);
        }
        if (targetUrl !== focusUrl) {
          continue;
        }
        const normalizedAnchor = normalizeAnchorText(outlink.anchorText);
        const current = existingFocusLinksBySource.get(sourceUrl) ?? {
          hasNonNavLinkToFocus: false,
          anchors: new Set<string>(),
        };
        if (!outlink.isNavLikely) {
          current.hasNonNavLinkToFocus = true;
        }
        if (normalizedAnchor.length > 0) {
          current.anchors.add(normalizedAnchor);
        }
        existingFocusLinksBySource.set(sourceUrl, current);
      }
    }
  }

  const serp = root.focus_serp_pack as Record<string, unknown> | undefined;
  if (serp && typeof serp === "object") {
    const titles = Array.isArray(serp.titles)
      ? serp.titles
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
          .map((item) => ({
            title: trimText(typeof item.title === "string" ? item.title : "", 140),
            rationale: trimText(typeof item.rationale === "string" ? item.rationale : "", 220),
            nonNegotiableWords: toStringArray(item.nonNegotiableWords, 10, 40),
          }))
          .filter((item) => item.title.length > 0)
          .slice(0, 5)
      : [];
    const metaDescriptions = Array.isArray(serp.meta_descriptions)
      ? serp.meta_descriptions
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
          .map((item) => {
            const tone: "informational" | "sales" | "neutral" =
              item.tone === "informational" || item.tone === "sales" || item.tone === "neutral" ? item.tone : "neutral";
            return {
              tone,
              text: trimText(typeof item.text === "string" ? item.text : "", 220),
            };
          })
          .filter((item) => item.text.length > 0)
          .slice(0, 3)
      : [];
    const fallbacks = toStringArray(serp.suggested_snippet_fallbacks, 3, 100);
    if (titles.length > 0 || metaDescriptions.length > 0 || fallbacks.length > 0) {
      packs.focus_serp_pack = {
        titles,
        meta_descriptions: metaDescriptions,
        suggested_snippet_fallbacks: fallbacks,
      };
    }
  }

  const outline = root.focus_outline_pack as Record<string, unknown> | undefined;
  if (outline && typeof outline === "object") {
    const outlineList = toStringArray(outline.outline, 20, 140);
    const intentMapRaw = outline.intent_coverage_mapping;
    const intentMap: Record<string, string> = {};
    if (intentMapRaw && typeof intentMapRaw === "object" && !Array.isArray(intentMapRaw)) {
      for (const [key, value] of Object.entries(intentMapRaw)) {
        if (typeof value === "string" && key.trim().length > 0) {
          intentMap[trimText(key, 120)] = trimText(value, 160);
        }
      }
    }
    const faqQuestions = toStringArray(outline.faq_questions, 12, 160);
    if (outlineList.length > 0 || faqQuestions.length > 0 || Object.keys(intentMap).length > 0) {
      packs.focus_outline_pack = {
        outline: outlineList,
        intent_coverage_mapping: intentMap,
        faq_questions: faqQuestions,
      };
    }
  }

  const internalLinkPlan = Array.isArray(root.internal_link_plan)
    ? root.internal_link_plan
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : "",
          suggestedAnchor: trimText(typeof item.suggestedAnchor === "string" ? item.suggestedAnchor : "", 100),
          suggestedSentenceContext: trimText(typeof item.suggestedSentenceContext === "string" ? item.suggestedSentenceContext : "", 220),
        }))
        .filter((item) => item.sourceUrl.length > 0 && item.suggestedAnchor.length > 0)
        .filter((item, index, array) => {
          const sourceUrl = normalizeUrl(item.sourceUrl);
          if (!sourceUrl) {
            return false;
          }
          const normalizedAnchor = normalizeAnchorText(item.suggestedAnchor);
          if (normalizedAnchor.length === 0) {
            return false;
          }
          const existingForSource = focusUrl ? existingFocusLinksBySource.get(sourceUrl) : undefined;
          // If source already has a non-nav link to focus URL, skip additional suggestion from LLM.
          if (existingForSource?.hasNonNavLinkToFocus) {
            return false;
          }
          // If only nav links exist, at least avoid repeating the same anchor text.
          if (existingForSource?.anchors.has(normalizedAnchor)) {
            return false;
          }
          // Remove duplicates suggested by LLM in the same plan.
          return array.findIndex((candidate) => {
            const candidateSource = normalizeUrl(candidate.sourceUrl);
            const candidateAnchor = normalizeAnchorText(candidate.suggestedAnchor);
            return candidateSource === sourceUrl && candidateAnchor === normalizedAnchor;
          }) === index;
        })
        .slice(0, 10)
    : [];
  if (internalLinkPlan.length > 0) {
    packs.internal_link_plan = internalLinkPlan;
  }

  const entityPack = root.entity_local_pack as Record<string, unknown> | undefined;
  if (entityPack && typeof entityPack === "object") {
    const checklist = toStringArray(entityPack.trust_elements_checklist, 15, 180);
    const schemaSuggestions = toStringArray(entityPack.schema_suggestions, 10, 180);
    if (checklist.length > 0 || schemaSuggestions.length > 0) {
      packs.entity_local_pack = {
        trust_elements_checklist: checklist,
        schema_suggestions: schemaSuggestions,
      };
    }
  }

  const cannibalization = Array.isArray(root.cannibalization_flags)
    ? root.cannibalization_flags
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          pageA: typeof item.pageA === "string" ? item.pageA : "",
          pageB: typeof item.pageB === "string" ? item.pageB : "",
          differentiationApproach: trimText(typeof item.differentiationApproach === "string" ? item.differentiationApproach : "", 220),
        }))
        .filter((item) => item.pageA.length > 0 && item.pageB.length > 0)
        .slice(0, 10)
    : [];
  if (cannibalization.length > 0) {
    packs.cannibalization_flags = cannibalization;
  }

  return Object.keys(packs).length > 0 ? packs : undefined;
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

  const prioritizedActions = toActionArray(record.prioritized_actions, input.limits, validIssueIds);
  const prioritizedActionsAlt =
    prioritizedActions.length > 0 ? prioritizedActions : toActionArray(record.prioritizedActions, input.limits, validIssueIds);
  const prioritizedActionsFinal =
    prioritizedActionsAlt.length > 0 ? prioritizedActionsAlt : toActionArray(record.global_actions, input.limits, validIssueIds);
  const proposedPacks = toProposedPacks({ value: record.proposed_packs, report: input.report });

  return {
    proposed_fixes: proposedFixesFinal,
    prioritized_actions: prioritizedActionsFinal,
    proposed_packs: proposedPacks,
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
    "- Every prioritized_actions item must include issue_ids with at least one valid issue id from payload. Example: [\"excessive_nav_only_inlinks\"].",
    "- Include structured packs in proposed_packs when evidence is sufficient.",
    "- For proposed_packs.internal_link_plan: do not propose source URLs that already have a non-nav internal link to the focus URL.",
    "- For proposed_packs.internal_link_plan: if only nav links exist, do not repeat an already-used anchor.",
    "- Do not fabricate metrics or claim fixed Google length requirements.",
    "- Keep schema suggestions consistent with visible page content only.",
    "",
    ...focusRules,
    "",
    "OUTPUT_CONTRACT (must match):",
    "{",
    '  "proposed_fixes": [',
    '    { "issue_id": "string", "page_url": "string", "proposal": "string", "rationale": "string" }',
    "  ],",
    '  "proposed_packs": {',
    '    "focus_serp_pack": {',
    '      "titles": [{ "title": "string", "rationale": "string", "nonNegotiableWords": ["string"] }],',
    '      "meta_descriptions": [{ "tone": "informational|sales|neutral", "text": "string" }],',
    '      "suggested_snippet_fallbacks": ["string"]',
    "    },",
    '    "focus_outline_pack": {',
    '      "outline": ["string"],',
    '      "intent_coverage_mapping": { "question": "answer-intent mapping" },',
    '      "faq_questions": ["string"]',
    "    },",
    '    "internal_link_plan": [{ "sourceUrl": "string", "suggestedAnchor": "string", "suggestedSentenceContext": "string" }],',
    '    "entity_local_pack": { "trust_elements_checklist": ["string"], "schema_suggestions": ["string"] },',
    '    "cannibalization_flags": [{ "pageA": "string", "pageB": "string", "differentiationApproach": "string" }]',
    "  },",
    '  "prioritized_actions": [',
    '    { "title": "string", "impact": "high|medium|low", "effort": "high|medium|low", "rationale": "string", "issue_ids": ["string"] }',
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
    '  "proposed_packs": {',
    '    "focus_serp_pack": { "titles": [], "meta_descriptions": [], "suggested_snippet_fallbacks": [] },',
    '    "focus_outline_pack": { "outline": [], "intent_coverage_mapping": {}, "faq_questions": [] },',
    '    "internal_link_plan": [],',
    '    "entity_local_pack": { "trust_elements_checklist": [], "schema_suggestions": [] },',
    '    "cannibalization_flags": []',
    "  },",
    '  "prioritized_actions": [',
    '    { "title": "string", "impact": "high|medium|low", "effort": "high|medium|low", "rationale": "string", "issue_ids": ["string"] }',
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
