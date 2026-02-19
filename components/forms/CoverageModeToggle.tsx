"use client";

type CoverageMode = "quick" | "surface" | "full";

interface CoverageModeToggleProps {
  value: CoverageMode;
  onChange: (value: CoverageMode) => void;
  onBlur?: () => void;
}

const OPTIONS: Array<{ value: CoverageMode; label: string; copy: string }> = [
  { value: "quick", label: "Quick", copy: "Small sample, fastest run." },
  { value: "surface", label: "Surface", copy: "Template-based discovery, balanced." },
  { value: "full", label: "Full", copy: "Maximum crawl depth and coverage." },
];

export function CoverageModeToggle({ value, onChange, onBlur }: CoverageModeToggleProps) {
  return (
    <div className="coverage-toggle" onBlur={onBlur}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`coverage-toggle-btn ${value === option.value ? "is-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          <strong>{option.label}</strong>
          <span>{option.copy}</span>
        </button>
      ))}
    </div>
  );
}
