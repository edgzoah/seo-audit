"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../ui/chart";
import type { CategoryDeltaDatum } from "./types";

interface CategoryDeltaChartProps {
  data: CategoryDeltaDatum[];
}

const chartConfig = {
  delta: {
    label: "Delta",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

function signed(value: number): string {
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

export function CategoryDeltaChart({ data }: CategoryDeltaChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No category deltas available.</p>;
  }

  const maxAbs = Math.max(1, ...data.map((item) => Math.abs(item.delta)));
  const domainLimit = Math.ceil(maxAbs * 1.15);

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 12, left: 12, bottom: 8 }}
      >
        <CartesianGrid horizontal={false} />
        <ReferenceLine x={0} stroke="hsl(var(--border))" />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          domain={[-domainLimit, domainLimit]}
          tickFormatter={signed}
        />
        <YAxis
          type="category"
          dataKey="category"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={128}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(_, __, item) => {
                const payload = item.payload as CategoryDeltaDatum;
                return (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="text-muted-foreground">Delta</span>
                    <span className="font-mono font-medium tabular-nums">{signed(payload.delta)}</span>
                  </div>
                );
              }}
            />
          }
        />
        <Bar dataKey="delta" radius={4}>
          {data.map((item) => (
            <Cell
              key={item.category}
              fill={item.delta > 0 ? "hsl(142 71% 45%)" : item.delta < 0 ? "hsl(0 72% 51%)" : "hsl(var(--muted-foreground))"}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
