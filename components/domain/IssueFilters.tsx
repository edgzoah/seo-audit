"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface IssueFiltersProps {
  defaults: {
    category: string;
    severity: string;
  };
  categories: string[];
}

export function IssueFilters({ defaults, categories }: IssueFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentParams = useSearchParams();
  const [category, setCategory] = useState(defaults.category);
  const [severity, setSeverity] = useState(defaults.severity);

  function apply(): void {
    const params = new URLSearchParams(currentParams.toString());
    params.set("category", category);
    params.set("severity", severity);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger>
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((item) => (
            <SelectItem key={item} value={item}>
              {item.replaceAll("_", " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={severity} onValueChange={setSeverity}>
        <SelectTrigger>
          <SelectValue placeholder="Severity" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All severity</SelectItem>
          <SelectItem value="error">Errors</SelectItem>
          <SelectItem value="warning">Warnings</SelectItem>
          <SelectItem value="notice">Notices</SelectItem>
        </SelectContent>
      </Select>
      <Button onClick={apply}>Apply</Button>
    </div>
  );
}
