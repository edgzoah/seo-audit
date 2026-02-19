import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import type { DiffReport } from "../../lib/audits/types";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

export function CompareSummary({ diff }: { diff: DiffReport }) {
  const icon =
    diff.score_total_delta > 0 ? (
      <ArrowUpRight className="h-4 w-4" />
    ) : diff.score_total_delta < 0 ? (
      <ArrowDownRight className="h-4 w-4" />
    ) : (
      <Minus className="h-4 w-4" />
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparison Summary</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-md border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Score Delta</p>
          <p className="mt-1 flex items-center gap-1 text-xl font-semibold">
            {icon}
            {diff.score_total_delta > 0 ? `+${diff.score_total_delta.toFixed(1)}` : diff.score_total_delta.toFixed(1)}
          </p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Resolved</p>
          <p className="mt-1 text-xl font-semibold">{diff.resolved_issues.length}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">New</p>
          <p className="mt-1 text-xl font-semibold">{diff.new_issues.length}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Regressed</p>
          <p className="mt-1 text-xl font-semibold">{diff.regressed_issues.length}</p>
        </div>
      </CardContent>
    </Card>
  );
}
