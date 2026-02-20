import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import type { DiffReport } from "../../lib/audits/types";
import { cn } from "../../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

function formatSigned(value: number): string {
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

export function CompareSummary({ diff }: { diff: DiffReport }) {
  const scoreTone =
    diff.score_total_delta > 0
      ? "text-emerald-600"
      : diff.score_total_delta < 0
        ? "text-rose-600"
        : "text-muted-foreground";

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
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Score Delta</p>
          <p className={cn("mt-1 flex items-center gap-1 text-2xl font-semibold tabular-nums", scoreTone)}>
            {icon}
            {formatSigned(diff.score_total_delta)}
          </p>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Resolved Issues</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600">{diff.resolved_issues.length}</p>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">New Issues</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-600">{diff.new_issues.length}</p>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Regressed Issues</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-rose-600">{diff.regressed_issues.length}</p>
        </div>
      </CardContent>
    </Card>
  );
}
