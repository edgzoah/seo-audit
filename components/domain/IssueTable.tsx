"use client";

import { useMemo, useState } from "react";
import type { Issue } from "../../lib/audits/types";
import { compactUrl, humanize } from "../../app/lib/format";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { IssueUrlActions } from "../IssueUrlActions";

function severityVariant(severity: Issue["severity"]): "danger" | "warning" | "secondary" {
  if (severity === "error") return "danger";
  if (severity === "warning") return "warning";
  return "secondary";
}

export function IssueTable({ issues }: { issues: Issue[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeIssue = useMemo(() => issues.find((item) => item.id === activeId) ?? null, [issues, activeId]);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Issue</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Affected</TableHead>
            <TableHead className="w-[160px]">Evidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue) => (
            <TableRow key={issue.id}>
              <TableCell>
                <p className="font-medium">{issue.title}</p>
                <p className="text-sm text-muted-foreground">{issue.description}</p>
              </TableCell>
              <TableCell>{humanize(issue.category)}</TableCell>
              <TableCell>
                <Badge variant={severityVariant(issue.severity)}>{issue.severity}</Badge>
              </TableCell>
              <TableCell>
                <div className="space-y-1 text-xs">
                  {issue.affected_urls.slice(0, 2).map((url) => (
                    <p key={url} className="rounded bg-muted px-2 py-1">
                      {compactUrl(url)}
                    </p>
                  ))}
                  {issue.affected_urls.length > 2 ? <p className="text-muted-foreground">+{issue.affected_urls.length - 2} more</p> : null}
                  {issue.affected_urls[0] ? <IssueUrlActions url={issue.affected_urls[0]} /> : null}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">Preview</Button>
                    </PopoverTrigger>
                    <PopoverContent>
                      <p className="text-sm">{issue.evidence[0]?.message ?? "No evidence"}</p>
                    </PopoverContent>
                  </Popover>
                  <Button variant="secondary" size="sm" onClick={() => setActiveId(issue.id)}>
                    Open
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={Boolean(activeIssue)} onOpenChange={(open) => (!open ? setActiveId(null) : null)}>
        <DialogTrigger asChild>
          <span />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeIssue?.title ?? "Evidence"}</DialogTitle>
            <DialogDescription>{activeIssue?.description ?? ""}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-auto">
            {activeIssue?.evidence.map((item, index) => (
              <div key={`${activeIssue.id}-${index}`} className="rounded-md border p-3">
                <p className="text-sm font-medium">{humanize(item.type)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
