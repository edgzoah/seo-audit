import type { PageExtract, Report } from "./report-schema.js";

function findFocusPage(report: Report): PageExtract | null {
  const focusUrl = report.summary.focus?.primary_url;
  if (!focusUrl || !report.page_extracts) {
    return null;
  }
  return report.page_extracts.find((page) => page.final_url === focusUrl || page.url === focusUrl) ?? null;
}

export function renderReportLlm(report: Report): string {
  const categories = Array.from(new Set(report.issues.map((issue) => issue.category))).sort((a, b) =>
    a.localeCompare(b, "en"),
  );

  const lines: string[] = [];
  const focusPage = findFocusPage(report);

  lines.push("[HEADER]");
  lines.push(`run_id=${report.run_id}`);
  lines.push(`target=${report.inputs.target}`);
  lines.push(`coverage=${report.inputs.coverage}`);
  lines.push(`pages=${report.summary.pages_crawled}`);
  lines.push(`score_total=${report.summary.score_total}`);
  lines.push("");

  lines.push("[FOCUS_DEEP_DIVE]");
  if (!report.summary.focus || !focusPage) {
    lines.push("status=unavailable");
  } else {
    const h1 = focusPage.headings_outline.find((item) => item.level === 1)?.text ?? "";
    lines.push(`focus_url=${report.summary.focus.primary_url}`);
    lines.push(`title=${focusPage.titleText || ""}`);
    lines.push(`h1=${h1}`);
    lines.push(`word_count_main=${focusPage.wordCountMain}`);
    lines.push(`inlinks_count=${report.summary.focus.focusInlinksCount ?? 0}`);
    lines.push(
      `top_inlink_sources=${(report.summary.focus.topInlinkSourcesToFocus ?? []).slice(0, 10).join(" | ") || "none"}`,
    );
    lines.push(
      `top_anchors=${(report.summary.focus.focusAnchorQuality?.topAnchors ?? [])
        .slice(0, 10)
        .map((item) => `${item.anchor || "(empty)"}:${item.count}`)
        .join(" | ") || "none"}`,
    );
    lines.push(`heading_outline_top5=${focusPage.headings_outline.slice(0, 5).map((item) => item.text).join(" | ") || "none"}`);
  }
  lines.push("");

  lines.push("[INTERNAL_LINK_GRAPH]");
  if (!report.summary.internal_links) {
    lines.push("status=unavailable");
  } else {
    lines.push(`orphan_pages=${report.summary.internal_links.orphanPagesCount}`);
    lines.push(`near_orphan_pages=${report.summary.internal_links.nearOrphanPagesCount}`);
    lines.push(`nav_likely_percent=${report.summary.internal_links.navLikelyInlinksPercent}`);
    lines.push(`generic_anchor_percent=${report.summary.internal_links.percentGenericAnchors}`);
    lines.push(`empty_anchor_percent=${report.summary.internal_links.percentEmptyAnchors}`);
  }
  lines.push("");

  lines.push("[SERP_QUALITY]");
  lines.push(`title_h1_mismatch=${report.issues.filter((item) => item.id === "title_h1_mismatch").length}`);
  lines.push(`meta_description_missing=${report.issues.filter((item) => item.id === "meta_description_missing").length}`);
  lines.push(`meta_description_duplicate=${report.issues.filter((item) => item.id === "meta_description_duplicate").length}`);
  lines.push(`meta_description_spammy=${report.issues.filter((item) => item.id === "meta_description_spammy").length}`);
  lines.push("");

  lines.push("[SCHEMA_QUALITY]");
  lines.push(`breadcrumb_schema_invalid=${report.issues.filter((item) => item.id === "breadcrumb_schema_invalid").length}`);
  lines.push(`org_schema_incomplete=${report.issues.filter((item) => item.id === "org_schema_incomplete").length}`);
  lines.push("");

  lines.push("[PERFORMANCE]");
  if (!report.summary.performanceFocus && !report.summary.performanceHome) {
    lines.push("status=not_measured");
  } else {
    if (report.summary.performanceFocus) {
      lines.push(`focus_status=${report.summary.performanceFocus.status}`);
      lines.push(`focus_lcp_ms=${report.summary.performanceFocus.lcpMs ?? "n/a"}`);
      lines.push(`focus_inp_ms=${report.summary.performanceFocus.inpMs ?? "n/a"}`);
      lines.push(`focus_cls=${report.summary.performanceFocus.cls ?? "n/a"}`);
      lines.push(`focus_score_perf=${report.summary.performanceFocus.scorePerf ?? "n/a"}`);
    }
    if (report.summary.performanceHome) {
      lines.push(`home_status=${report.summary.performanceHome.status}`);
      lines.push(`home_lcp_ms=${report.summary.performanceHome.lcpMs ?? "n/a"}`);
      lines.push(`home_inp_ms=${report.summary.performanceHome.inpMs ?? "n/a"}`);
      lines.push(`home_cls=${report.summary.performanceHome.cls ?? "n/a"}`);
      lines.push(`home_score_perf=${report.summary.performanceHome.scorePerf ?? "n/a"}`);
    }
  }
  lines.push("");

  lines.push("[SCORES]");
  if (Object.keys(report.summary.score_by_category).length === 0) {
    lines.push("(placeholder)");
  } else {
    for (const [category, score] of Object.entries(report.summary.score_by_category)) {
      lines.push(`${category}=${score}`);
    }
  }
  lines.push("");

  lines.push("[ISSUES_BY_CATEGORY]");
  if (report.issues.length === 0) {
    lines.push("none");
    return lines.join("\n");
  }

  for (const category of categories) {
    lines.push(`category=${category}`);
    for (const issue of report.issues.filter((current) => current.category === category)) {
      lines.push(`- id=${issue.id} severity=${issue.severity} rank=${issue.rank} affected=${issue.affected_urls.length}`);
      if (issue.evidence[0]) {
        lines.push(`  evidence=${issue.evidence[0].message}`);
      }
      lines.push(`  recommendation=${issue.recommendation}`);
    }
  }

  return lines.join("\n");
}
