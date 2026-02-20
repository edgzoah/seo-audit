"use client";

import { Cell, Pie, PieChart } from "recharts";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../ui/chart";
import type { IssueSeverityMixDatum } from "./types";

interface IssueSeverityMixChartProps {
  data: IssueSeverityMixDatum[];
}

const chartConfig = {
  error: {
    label: "Error",
    color: "hsl(0 72% 51%)",
  },
  warning: {
    label: "Warning",
    color: "hsl(35 92% 50%)",
  },
  notice: {
    label: "Notice",
    color: "hsl(211 85% 56%)",
  },
} satisfies ChartConfig;

function colorForSeverity(severity: IssueSeverityMixDatum["severity"]): string {
  if (severity === "error") return "hsl(0 72% 51%)";
  if (severity === "warning") return "hsl(35 92% 50%)";
  return "hsl(211 85% 56%)";
}

export function IssueSeverityMixChart({ data }: IssueSeverityMixChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No regressed issues to display severity mix.</p>;
  }

  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_160px] lg:items-center">
      <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
        <PieChart accessibilityLayer>
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, name) => {
                  const count = Number(value) || 0;
                  const percent = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-muted-foreground">{name}</span>
                      <span className="font-mono font-medium tabular-nums">{count} ({percent.toFixed(0)}%)</span>
                    </div>
                  );
                }}
              />
            }
          />
          <Pie
            data={data}
            dataKey="count"
            nameKey="severity"
            innerRadius={54}
            outerRadius={86}
            strokeWidth={2}
          >
            {data.map((entry) => (
              <Cell key={entry.severity} fill={colorForSeverity(entry.severity)} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>

      <div className="grid gap-2 text-sm">
        {data.map((item) => {
          const pct = total > 0 ? (item.count / total) * 100 : 0;
          return (
            <div key={item.severity} className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorForSeverity(item.severity) }} aria-hidden />
                <span className="capitalize">{item.severity}</span>
              </span>
              <span className="font-mono tabular-nums text-muted-foreground">{item.count} ({pct.toFixed(0)}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
