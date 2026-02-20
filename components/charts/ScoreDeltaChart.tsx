"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "../ui/chart"

type ScoreDeltaDatum = {
  category: string
  baseline: number
  current: number
}

type ChartDatum = {
  category: string
  baseline: number
  current: number
}

interface ScoreDeltaChartProps {
  data: ScoreDeltaDatum[]
}

const chartConfig = {
  baseline: {
    label: "Baseline",
    color: "var(--chart-1)",
  },
  current: {
    label: "Current",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function ScoreDeltaChart({ data }: ScoreDeltaChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No category deltas available.</p>
  }

  const chartData: ChartDatum[] = data.map((row) => ({
    category: row.category,
    baseline: row.baseline,
    current: row.current,
  }))

  return (
    <ChartContainer config={chartConfig} className="min-h-[320px] w-full">
      <BarChart
        accessibilityLayer
        layout="vertical"
        data={chartData}
        margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          type="category"
          dataKey="category"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          width={120}
        />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="baseline"
          stackId="a"
          fill="var(--color-baseline)"
          radius={[0, 0, 4, 4]}
        />
        <Bar
          dataKey="current"
          stackId="a"
          fill="var(--color-current)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  )
}
