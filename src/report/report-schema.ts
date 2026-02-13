export type TargetType = "url" | "local_path";

export type CoverageMode = "quick" | "surface" | "full";

export type RenderingMode = "static_html" | "headless";

export type ReportFormat = "json" | "md" | "llm";

export type IssueSeverity = "error" | "warning" | "notice";

export interface FocusCurrentPosition {
  query: string;
  position: number | null;
  page: number | null;
}

export interface AuditFocus {
  primary_url: string | null;
  primary_keyword: string | null;
  goal: string | null;
  current_position: FocusCurrentPosition | null;
  secondary_urls: string[];
}

export interface BriefWeightingOverrides {
  boost_rules: string[];
  boost_categories: string[];
}

export interface AuditBrief {
  text: string;
  focus: AuditFocus;
  constraints: string[];
  weighting_overrides: BriefWeightingOverrides;
}

export interface AuditInputs {
  target_type: TargetType;
  target: string;
  coverage: CoverageMode;
  max_pages: number;
  crawl_depth: number;
  include_patterns: string[];
  exclude_patterns: string[];
  allowed_domains: string[];
  respect_robots: boolean;
  rendering_mode: RenderingMode;
  user_agent: string;
  timeout_ms: number;
  locale: {
    language: string;
    country: string;
  };
  report_format: ReportFormat;
  llm_enabled: boolean;
  baseline_run_id: string | null;
  brief: AuditBrief;
}

export interface HeadingOutlineItem {
  level: number;
  text: string;
  order: number;
}

export interface PageLinks {
  internal_count: number;
  external_count: number;
  internal_targets: string[];
  external_targets: string[];
}

export interface PageImages {
  count: number;
  missing_alt_count: number;
  large_image_candidates: string[];
}

export interface PageSchema {
  jsonld_blocks: string[];
  detected_schema_types: string[];
  json_parse_failures: string[];
}

export interface PageSecurity {
  is_https: boolean;
  mixed_content_candidates: string[];
  security_headers_present: string[];
  security_headers_missing: string[];
}

export interface PageExtract {
  url: string;
  final_url: string;
  status: number;
  title: string | null;
  meta_description: string | null;
  meta_robots: string | null;
  canonical: string | null;
  hreflang_links: string[];
  headings_outline: HeadingOutlineItem[];
  links: PageLinks;
  images: PageImages;
  schema: PageSchema;
  security: PageSecurity;
}

export interface Evidence {
  type: "page" | "link" | "http" | "content" | "schema" | "security" | "other";
  message: string;
  url?: string;
  source_url?: string;
  target_url?: string;
  anchor_text?: string;
  status?: number;
  details?: Record<string, unknown>;
}

export interface Issue {
  id: string;
  category: string;
  severity: IssueSeverity;
  rank: number;
  title: string;
  description: string;
  affected_urls: string[];
  evidence: Evidence[];
  recommendation: string;
  tags: string[];
}

export interface Action {
  title: string;
  impact: "high" | "medium" | "low";
  effort: "high" | "medium" | "low";
  rationale: string;
}

export interface ProposedFix {
  issue_id: string;
  page_url: string;
  proposal: string;
  rationale: string;
}

export interface FocusSummary {
  primary_url: string;
  focus_score: number;
  focus_top_issues: string[];
  recommended_next_actions: Action[];
}

export interface Summary {
  score_total: number;
  score_by_category: Record<string, number>;
  pages_crawled: number;
  errors: number;
  warnings: number;
  notices: number;
  focus?: FocusSummary;
}

export interface PageSummary {
  url: string;
  final_url: string;
  status: number;
  title: string | null;
  canonical: string | null;
}

export interface Report {
  run_id: string;
  started_at: string;
  finished_at: string;
  inputs: AuditInputs;
  summary: Summary;
  issues: Issue[];
  proposed_fixes?: ProposedFix[];
  prioritized_actions?: Action[];
  pages: PageSummary[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateReport(report: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(report)) {
    return { valid: false, errors: ["Report must be an object."] };
  }

  if (typeof report.run_id !== "string" || report.run_id.length === 0) {
    errors.push("run_id must be a non-empty string.");
  }

  if (typeof report.started_at !== "string" || report.started_at.length === 0) {
    errors.push("started_at must be a non-empty string.");
  }

  if (typeof report.finished_at !== "string" || report.finished_at.length === 0) {
    errors.push("finished_at must be a non-empty string.");
  }

  if (!isRecord(report.inputs)) {
    errors.push("inputs must be an object.");
  }

  if (!isRecord(report.summary)) {
    errors.push("summary must be an object.");
  }

  if (!Array.isArray(report.issues)) {
    errors.push("issues must be an array.");
  }

  if (!Array.isArray(report.pages)) {
    errors.push("pages must be an array.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function assertValidReport(report: unknown): asserts report is Report {
  const validation = validateReport(report);

  if (!validation.valid) {
    throw new Error(`Invalid report schema: ${validation.errors.join(" ")}`);
  }
}
