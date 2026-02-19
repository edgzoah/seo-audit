"use client";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

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
    <div className="grid gap-2 md:grid-cols-3" onBlur={onBlur}>
      {OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={value === option.value ? "default" : "outline"}
          className={cn("h-auto flex-col items-start px-3 py-2 text-left", value === option.value && "ring-2 ring-primary/30")}
          onClick={() => onChange(option.value)}
        >
          <span>{option.label}</span>
          <span className="text-xs opacity-80">{option.copy}</span>
        </Button>
      ))}
    </div>
  );
}
