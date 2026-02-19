"use client";

import { useMemo, useState } from "react";
import type { Issue } from "../../lib/audits/types";
import { compactUrl, humanize } from "../../app/lib/format";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

function severityVariant(severity: Issue["severity"]): "danger" | "warning" | "secondary" {
  if (severity === "error") return "danger";
  if (severity === "warning") return "warning";
  return "secondary";
}

export function IssueTable({ issues }: { issues: Issue[] }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const activeIssue = useMemo(() => {
    if (!activeKey) return null;
    const index = Number.parseInt(activeKey.split("-").at(-1) ?? "", 10);
    if (!Number.isInteger(index) || index < 0 || index >= issues.length) return null;
    return issues[index] ?? null;
  }, [issues, activeKey]);

  function toggleExpanded(rowKey: string): void {
    setExpandedRows((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
  }

  function expandAll(): void {
    const next: Record<string, boolean> = {};
    issues.forEach((issue, index) => {
      next[`${issue.id}-${index}`] = true;
    });
    setExpandedRows(next);
  }

  function collapseAll(): void {
    setExpandedRows({});
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={expandAll}>
          Show all affected URLs
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={collapseAll}>
          Hide all affected URLs
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Issue</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Affected</TableHead>
            <TableHead className="w-[160px]">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue, issueIndex) => {
            const rowKey = `${issue.id}-${issueIndex}`;
            const isExpanded = expandedRows[rowKey] === true;
            const visibleUrls = isExpanded ? issue.affected_urls : issue.affected_urls.slice(0, 2);
            const hiddenCount = Math.max(0, issue.affected_urls.length - 2);
            return (
            <TableRow key={rowKey}>
              <TableCell>
                <p className="font-medium">{issue.title}</p>
                <p className="text-sm text-muted-foreground">{issue.description}</p>
              </TableCell>
              <TableCell>{humanize(issue.category)}</TableCell>
              <TableCell>
                <Badge variant={severityVariant(issue.severity)}>{issue.severity}</Badge>
              </TableCell>
              <TableCell>
                <div className="max-h-36 space-y-1 overflow-auto pr-1 text-xs">
                  {visibleUrls.map((url, urlIndex) => (
                    <p key={`${url}-${urlIndex}`} className="rounded bg-muted px-2 py-1">
                      {compactUrl(url)}
                    </p>
                  ))}
                  {hiddenCount > 0 ? (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => toggleExpanded(rowKey)}>
                      {isExpanded ? "Show less" : `Show all (${hiddenCount} more pages)`}
                    </Button>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="inline-flex w-10 justify-center tabular-nums">
                    {issue.evidence.length}
                  </Badge>
                  <Button variant="secondary" size="sm" onClick={() => setActiveKey(rowKey)}>
                    View details
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
          })}
        </TableBody>
      </Table>

      <Dialog open={Boolean(activeIssue)} onOpenChange={(open) => (!open ? setActiveKey(null) : null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Details</DialogTitle>
            <DialogDescription>{activeIssue?.title ?? ""}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-2 overflow-auto pr-1">
            {activeIssue?.evidence.map((item, index) => (
              <div key={`${activeIssue.id}-${index}`} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{humanize(item.type)}</p>
                  {typeof item.status === "number" ? <Badge variant="outline">HTTP {item.status}</Badge> : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.message}</p>
                {item.url ? <p className="mt-2 text-xs text-muted-foreground">URL: {compactUrl(item.url)}</p> : null}
                {item.source_url ? <p className="mt-1 text-xs text-muted-foreground">Source: {compactUrl(item.source_url)}</p> : null}
                {item.target_url ? <p className="mt-1 text-xs text-muted-foreground">Target: {compactUrl(item.target_url)}</p> : null}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
