import Link from "next/link";
import { notFound } from "next/navigation";

import { AuditPanel } from "../../../components/AuditPanel";
import { IssueFilters } from "../../../components/domain/IssueFilters";
import { IssueTable } from "../../../components/domain/IssueTable";
import { RunNameEditor } from "../../../components/domain/RunNameEditor";
import { RunKpiCards } from "../../../components/domain/RunKpiCards";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { getRunById, getRunDisplayName } from "../../../lib/audits/repo";
import { requireUser } from "../../../lib/auth/session";
import { compactUrl } from "../../lib/format";

export const dynamic = "force-dynamic";

type SeverityRank = "error" | "warning" | "notice";

interface AuditDetailPageProps {
  params: Promise<{ runId: string }>;
  searchParams?: Promise<{ category?: string; severity?: string }>;
}

function normalizeSeverity(value: string | undefined): SeverityRank | "all" {
  if (value === "error" || value === "warning" || value === "notice") return value;
  return "all";
}

export default async function AuditDetailPage({ params, searchParams }: AuditDetailPageProps) {
  const user = await requireUser();
  const { runId } = await params;
  const query = searchParams ? await searchParams : undefined;
  const [report, displayName] = await Promise.all([
    getRunById(user.userId, runId),
    getRunDisplayName(user.userId, runId),
  ]);

  if (!report) notFound();

  const categoryFilter = query?.category ?? "all";
  const severityFilter = normalizeSeverity(query?.severity);
  const categories = Array.from(new Set(report.issues.map((issue) => issue.category))).sort((a, b) => a.localeCompare(b));

  const filteredIssues = report.issues.filter((issue) => {
    if (categoryFilter !== "all" && issue.category !== categoryFilter) return false;
    if (severityFilter !== "all" && issue.severity !== severityFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <Card className="grid-bg">
        <CardHeader>
          <div className="space-y-1">
            <CardTitle className="text-2xl">{displayName ?? compactUrl(report.inputs.target)}</CardTitle>
            <CardDescription>
              Run ID: {report.run_id} • Coverage: {report.inputs.coverage} • Started {new Date(report.started_at).toLocaleString()}
            </CardDescription>
          </div>
          <Badge variant="outline">{report.issues.length} total issues</Badge>
          <RunNameEditor runId={report.run_id} initialName={displayName} />
        </CardHeader>
      </Card>

      <RunKpiCards summary={report.summary} />

      <AuditPanel.Root>
        <AuditPanel.Header title="Filters" />
        <AuditPanel.Body>
          <div className="space-y-3">
            <IssueFilters defaults={{ category: categoryFilter, severity: severityFilter }} categories={categories} />
            <Button asChild variant="ghost" size="sm">
              <Link href="/audits">Back to audits</Link>
            </Button>
          </div>
        </AuditPanel.Body>
      </AuditPanel.Root>

      <AuditPanel.Root>
        <AuditPanel.Header title={`Issues (${filteredIssues.length})`} />
        <AuditPanel.Body>
          <IssueTable issues={filteredIssues} />
        </AuditPanel.Body>
      </AuditPanel.Root>
    </div>
  );
}
