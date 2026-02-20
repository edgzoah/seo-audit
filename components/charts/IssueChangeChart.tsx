"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../ui/chart";
import type { IssueChangeDatum } from "./types";

interface IssueChangeChartProps {
  data: IssueChangeDatum[];
}

const chartConfig = {
  resolved: {
    label: "Resolved",
    color: "hsl(142 71% 45%)",
  },
  new: {
    label: "New",
    color: "hsl(35 92% 50%)",
  },
  regressed: {
    label: "Regressed",
    color: "hsl(0 72% 51%)",
  },
} satisfies ChartConfig;

function colorForKey(key: IssueChangeDatum["key"]): string {
  if (key === "resolved") return "hsl(142 71% 45%)";
  if (key === "new") return "hsl(35 92% 50%)";
  return "hsl(0 72% 51%)";
}

export function IssueChangeChart({ data }: IssueChangeChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No issue change data available.</p>;
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tickMargin={8} width={88} />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="value" radius={4}>
          {data.map((item) => (
            <Cell key={item.key} fill={colorForKey(item.key)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
