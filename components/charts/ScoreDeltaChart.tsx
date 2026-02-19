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

  const maxAbs = Math.max(...data.map((item) => Math.abs(item.delta)), 1);

  return (
    <div className="score-delta-chart">
      {data.map((item) => {
        const width = Math.max(2, Math.round((Math.abs(item.delta) / maxAbs) * 100));
        const positive = item.delta >= 0;

        return (
          <div key={item.category} className="score-delta-row">
            <span>{item.category}</span>
            <div className="score-delta-track">
              <div
                className={`score-delta-bar ${positive ? "is-positive" : "is-negative"}`}
                style={{ width: `${width}%` }}
              />
            </div>
            <strong>{item.delta > 0 ? `+${item.delta.toFixed(1)}` : item.delta.toFixed(1)}</strong>
          </div>
        );
      })}
    </div>
  );
}
