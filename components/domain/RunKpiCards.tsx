import { AlertTriangle, FileWarning, Gauge, Globe } from "lucide-react";

import { Card, CardContent } from "../ui/card";

interface RunSummaryLike {
  score_total: number;
  pages_crawled: number;
  errors: number;
  warnings: number;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function RunKpiCards({ summary }: { summary: RunSummaryLike }) {
  const items = [
    { label: "Total Score", value: formatPercent(summary.score_total), icon: Gauge },
    { label: "Pages Crawled", value: String(summary.pages_crawled), icon: Globe },
    { label: "Errors", value: String(summary.errors), icon: AlertTriangle },
    { label: "Warnings", value: String(summary.warnings), icon: FileWarning },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="subtle-enter hover:-translate-y-0.5">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold">{item.value}</p>
              </div>
              <Icon className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
