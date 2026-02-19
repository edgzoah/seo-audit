"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ScoreDeltaDatum = {
  category: string;
  delta: number;
};

interface ScoreDeltaChartProps {
  data: ScoreDeltaDatum[];
}

export function ScoreDeltaChart({ data }: ScoreDeltaChartProps) {
  if (data.length === 0) {
    return <p className="muted">No category deltas available.</p>;
  }

  return (
    <div className="score-chart-shell">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
          <CartesianGrid stroke="#e2ebf8" strokeDasharray="3 3" />
          <XAxis dataKey="category" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={64} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value: number | undefined) => {
              if (typeof value !== "number") {
                return "n/a";
              }

              return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
            }}
          />
          <Bar dataKey="delta" radius={[6, 6, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.category} fill={entry.delta >= 0 ? "#18a070" : "#d6534c"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
