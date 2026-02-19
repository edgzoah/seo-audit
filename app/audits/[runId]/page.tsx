import Link from "next/link";
import { notFound } from "next/navigation";

import { AuditPanel } from "../../../components/AuditPanel";
import { IssueFilters } from "../../../components/domain/IssueFilters";
import { IssueTable } from "../../../components/domain/IssueTable";
import { RunKpiCards } from "../../../components/domain/RunKpiCards";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { getRunById } from "../../../lib/audits/repo";
import { compactUrl, humanize } from "../../lib/format";

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
  const { runId } = await params;
  const query = searchParams ? await searchParams : undefined;
  const report = await getRunById(runId);

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
            <CardTitle className="text-2xl">{compactUrl(report.inputs.target)}</CardTitle>
            <CardDescription>
              Run ID: {report.run_id} • Coverage: {report.inputs.coverage} • Started {new Date(report.started_at).toLocaleString()}
            </CardDescription>
          </div>
          <Badge variant="outline">{report.issues.length} total issues</Badge>
        </CardHeader>
      </Card>

      <RunKpiCards summary={report.summary} />

      <Tabs defaultValue="issues" className="space-y-4">
        <TabsList>
          <TabsTrigger value="issues">Issue Browser</TabsTrigger>
          <TabsTrigger value="focus">Focus</TabsTrigger>
        </TabsList>

        <TabsContent value="issues" className="space-y-4">
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
        </TabsContent>

        <TabsContent value="focus" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Focus Context</CardTitle>
            </CardHeader>
            <CardContent>
              {report.summary.focus ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Primary URL</p>
                    <p className="mt-1 text-sm">{compactUrl(report.summary.focus.primary_url)}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Focus Score</p>
                    <p className="mt-1 text-sm">{report.summary.focus.focus_score.toFixed(1)}%</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No focus object in this run.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
