"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface CompareRunMenuProps {
  label: "Baseline" | "Current";
  runIds: string[];
  value: string;
}

export function CompareRunMenu({ label, runIds, value }: CompareRunMenuProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(nextValue: string): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set(label.toLowerCase(), nextValue);
    router.push(`/compare?${params.toString()}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="page-btn">
          {label}: {value}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          {runIds.map((runId) => (
            <DropdownMenuItem key={`${label}-${runId}`} onSelect={() => setParam(runId)}>
              {runId}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
