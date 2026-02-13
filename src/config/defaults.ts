import type { CoverageMode, RenderingMode, ReportFormat } from "../report/report-schema.js";

export interface ConfigDefaults {
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
}

export interface SeoAuditConfig {
  config_version: number;
  defaults: ConfigDefaults;
}

export const DEFAULT_CONFIG: SeoAuditConfig = {
  config_version: 1,
  defaults: {
    coverage: "surface",
    max_pages: 100,
    crawl_depth: 3,
    include_patterns: [],
    exclude_patterns: [],
    allowed_domains: [],
    respect_robots: true,
    rendering_mode: "static_html",
    user_agent: "seo-audit-cli/0.1",
    timeout_ms: 10000,
    locale: {
      language: "en",
      country: "US",
    },
    report_format: "md",
    llm_enabled: false,
  },
};
