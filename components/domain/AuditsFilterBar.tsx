"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown } from "lucide-react";

import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

type SortFilter = "newest" | "oldest" | "score_desc" | "score_asc" | "pages_desc" | "warnings_desc";

interface AuditsFilterBarProps {
  defaults: {
    status: string;
    severity: string;
    coverage: string;
    domain: string;
    sort: SortFilter;
  };
  domains: string[];
}

export function AuditsFilterBar({ defaults, domains }: AuditsFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentParams = useSearchParams();

  const [status, setStatus] = useState(defaults.status);
  const [severity, setSeverity] = useState(defaults.severity);
  const [coverage, setCoverage] = useState(defaults.coverage);
  const [domain, setDomain] = useState(defaults.domain === "all" ? "" : defaults.domain);
  const [sort, setSort] = useState<SortFilter>(defaults.sort);

  const sortLabel = useMemo(() => {
    const labels: Record<SortFilter, string> = {
      newest: "Newest",
      oldest: "Oldest",
      score_desc: "Score Desc",
      score_asc: "Score Asc",
      pages_desc: "Pages Desc",
      warnings_desc: "Warnings Desc",
    };

    return labels[sort];
  }, [sort]);

  function apply(): void {
    const params = new URLSearchParams(currentParams.toString());
    params.set("status", status);
    params.set("severity", severity);
    params.set("coverage", coverage);
    params.set("sort", sort);
    if (domain.trim().length > 0) {
      params.set("domain", domain.trim());
    } else {
      params.delete("domain");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_220px_auto_auto]">
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger>
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All status</SelectItem>
          <SelectItem value="healthy">Healthy</SelectItem>
          <SelectItem value="watch">Watch</SelectItem>
          <SelectItem value="critical">Critical</SelectItem>
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

      <Select value={coverage} onValueChange={setCoverage}>
        <SelectTrigger>
          <SelectValue placeholder="Coverage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All coverage</SelectItem>
          <SelectItem value="quick">Quick</SelectItem>
          <SelectItem value="surface">Surface</SelectItem>
          <SelectItem value="full">Full</SelectItem>
        </SelectContent>
      </Select>

      <Input list="domain-options" placeholder="Filter domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
      <datalist id="domain-options">
        {domains.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="justify-between">
            <span className="truncate">{sortLabel}</span>
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setSort("newest")}>Newest</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSort("oldest")}>Oldest</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSort("score_desc")}>Score Desc</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSort("score_asc")}>Score Asc</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSort("pages_desc")}>Pages Desc</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSort("warnings_desc")}>Warnings Desc</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button onClick={apply}>Apply Filters</Button>
    </div>
  );
}
